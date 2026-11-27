import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { OllamaService } from '../ollama/ollama.service.js';
import { PromptService } from '../prompt/prompt.service.js';
import { QuestionsService } from '../questions/questions.service.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

@Injectable()
export class PracticeService {
  constructor(
    private databaseService: DatabaseService,
    private ollamaService: OllamaService,
    private promptService: PromptService,
    private questionsService: QuestionsService,
  ) {}

  async *generate(body: { topicId: string; subtopicIds: string[]; difficulty: string; runtime: string }): AsyncGenerator<string> {
    const db = this.databaseService.getDb();
    const settings = this.questionsService.getSettings();
    
    const topic = db.prepare('SELECT * FROM topics WHERE id = ?').get(body.topicId) as any;
    if (!topic) throw new BadRequestException('Topic not found');

    const subtopics = db.prepare('SELECT * FROM subtopics WHERE topic_id = ?').all(body.topicId) as any[];
    const selectedSubtopics = subtopics.filter(s => body.subtopicIds.includes(s.id));

    const context = {
      type: 'coding' as const,
      difficulty: body.difficulty as any,
      topicId: topic.id,
      topicSnapshot: {
        name: topic.name,
        subtopics: selectedSubtopics.map(s => s.name),
        model: settings.model,
      },
    };

    const slots = {
      topicName: JSON.stringify(topic.name),
      subtopics: JSON.stringify(context.topicSnapshot.subtopics),
      difficulty: body.difficulty,
      count: '1',
      runtime: body.runtime,
    };

    const prompt = this.promptService.render('coding', slots);
    const messages = [
      { role: 'system' as const, content: `${settings.systemPrompt ? `${settings.systemPrompt}\n\n` : ''}You are an interview coach. Return only JSON matching the supplied schema.` },
      { role: 'user' as const, content: prompt },
    ];

    const requestId = randomUUID();

    try {
      const result = await this.ollamaService.generate({
        settings,
        messages,
        schema: z.array(z.any()),
      });

      if (result.ok) {
        const question = this.questionsService.saveQuestion(result.data[0], context);
        yield `event: result\ndata: ${JSON.stringify({ type: 'result', requestId, attempt: 1, payload: question })}\n\n`;
      }
    } catch (error) {
      yield `event: error\ndata: ${JSON.stringify({ type: 'error', requestId, attempt: 1, payload: { error: error instanceof Error ? error.message : 'Generation failed' } })}\n\n`;
    } finally {
      yield `event: done\ndata: ${JSON.stringify({ type: 'done', requestId, attempt: 1, payload: {} })}\n\n`;
    }
  }

  async *review(id: string, code: string): AsyncGenerator<string> {
    const question = await this.questionsService.findOne(id);
    
    if (!question.exercise) {
      throw new BadRequestException('This question is not a coding exercise');
    }

    const db = this.databaseService.getDb();
    const settings = this.questionsService.getSettings();
    
    const prompt = this.promptService.render('practice-review', {
      exercise: JSON.stringify(question.prompt),
      runtime: question.exercise.runtime,
      code: JSON.stringify(code),
    });

    const messages = [
      { role: 'system' as const, content: `${settings.systemPrompt ? `${settings.systemPrompt}\n\n` : ''}You are a code reviewer. Return only JSON matching the supplied schema.` },
      { role: 'user' as const, content: prompt },
    ];

    const requestId = randomUUID();

    try {
      const result = await this.ollamaService.generate({
        settings,
        messages,
        schema: z.any(),
      });

      if (result.ok) {
        const lines = code.split(/\r?\n/).length;
        const data = { ...result.data as any, comments: (result.data as any).comments.filter(({ line }: any) => line <= lines) };
        
        db.prepare(`
          INSERT INTO attempts (id, request_id, question_id, kind, answer_or_code, feedback_json, score, created_at)
          VALUES (?, ?, ?, 'practice-review', ?, ?, 1, ?)
        `).run(randomUUID(), requestId, question.id, code, JSON.stringify(data), new Date().toISOString());

        yield `event: result\ndata: ${JSON.stringify({ type: 'result', requestId, attempt: 1, payload: data })}\n\n`;
      }
    } catch (error) {
      yield `event: error\ndata: ${JSON.stringify({ type: 'error', requestId, attempt: 1, payload: { error: error instanceof Error ? error.message : 'Review failed' } })}\n\n`;
    } finally {
      yield `event: done\ndata: ${JSON.stringify({ type: 'done', requestId, attempt: 1, payload: {} })}\n\n`;
    }
  }
}
