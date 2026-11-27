import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { OllamaService } from '../ollama/ollama.service.js';
import { PromptService } from '../prompt/prompt.service.js';
import { QuestionsService } from '../questions/questions.service.js';
import type { MockSetup, MockSession, MockItem, Attempt, Difficulty, Settings, MockReport } from "../shared/contracts.js";
import { randomUUID } from 'crypto';
import { z } from 'zod';

@Injectable()
export class MockService {
  constructor(
    private databaseService: DatabaseService,
    private ollamaService: OllamaService,
    private promptService: PromptService,
    private questionsService: QuestionsService,
  ) {}

  async *create(config: MockSetup): AsyncGenerator<string> {
    const db = this.databaseService.getDb();
    const settings = this.getSettings();
    const generated = await this.generation(config);
    
    const messages = this.buildMessages(settings, generated.prompt, config);
    const requestId = randomUUID();

    try {
      const result = await this.ollamaService.generate({
        settings,
        messages,
        schema: z.array(z.any()),
      });

      if (result.ok) {
        const id = randomUUID();
        const now = Date.now();
        const startedAt = new Date(now).toISOString();
        const deadlineAt = new Date(now + config.durationMinutes * 60_000).toISOString();

        db.transaction(() => {
          db.prepare("INSERT INTO sessions (id, kind, status, config_json, started_at, deadline_at) VALUES (?, 'mock', 'active', ?, ?, ?)")
            .run(id, JSON.stringify({ setup: config, settings }), startedAt, deadlineAt);
          const question = this.questionsService.saveQuestion(result.data[0], generated.context);
          db.prepare("INSERT INTO session_items (id, session_id, question_id, position, status, started_at) VALUES (?, ?, ?, 0, 'active', ?)")
            .run(randomUUID(), id, question.id, startedAt);
        })();

        const session = this.load(id);
        yield `event: result\ndata: ${JSON.stringify({ type: 'result', requestId, attempt: 1, payload: session })}\n\n`;
      }
    } catch (error) {
      yield `event: error\ndata: ${JSON.stringify({ type: 'error', requestId, attempt: 1, payload: { error: error instanceof Error ? error.message : 'Session creation failed' } })}\n\n`;
    } finally {
      yield `event: done\ndata: ${JSON.stringify({ type: 'done', requestId, attempt: 1, payload: {} })}\n\n`;
    }
  }

  async findOne(id: string): Promise<MockSession> {
    return await this.load(id);
  }

  async *next(id: string): AsyncGenerator<string> {
    const db = this.databaseService.getDb();
    const session = await this.load(id);
    const settings = this.getSettings();
    const open = session.items.at(-1);

    if (session.status === 'ended' || open?.status === 'active') {
      const requestId = randomUUID();
      yield `event: result\ndata: ${JSON.stringify({ type: 'result', requestId, attempt: 1, payload: session })}\n\n`;
      yield `event: done\ndata: ${JSON.stringify({ type: 'done', requestId, attempt: 1, payload: {} })}\n\n`;
      return;
    }

    const generated = await this.generation(session.config);
    const messages = this.buildMessages(settings, generated.prompt, session.config);
    const requestId = randomUUID();

    try {
      const result = await this.ollamaService.generate({
        settings,
        messages,
        schema: z.array(z.any()),
      });

      if (result.ok) {
        const fresh = await this.load(id);
        if (fresh.status === 'ended' || fresh.items.length !== session.items.length) {
          yield `event: result\ndata: ${JSON.stringify({ type: 'result', requestId, attempt: 1, payload: fresh })}\n\n`;
          return;
        }

        db.transaction(() => {
          const question = this.questionsService.saveQuestion(result.data[0], { ...generated.context, topicSnapshot: { ...generated.context.topicSnapshot, model: settings.model } });
          db.prepare("INSERT INTO session_items (id, session_id, question_id, position, status, started_at) VALUES (?, ?, ?, ?, 'active', ?)")
            .run(randomUUID(), id, question.id, fresh.items.length, new Date().toISOString());
        })();

        const updated = await this.load(id);
        yield `event: result\ndata: ${JSON.stringify({ type: 'result', requestId, attempt: 1, payload: updated })}\n\n`;
      }
    } catch (error) {
      yield `event: error\ndata: ${JSON.stringify({ type: 'error', requestId, attempt: 1, payload: { error: error instanceof Error ? error.message : 'Question generation failed' } })}\n\n`;
    } finally {
      yield `event: done\ndata: ${JSON.stringify({ type: 'done', requestId, attempt: 1, payload: {} })}\n\n`;
    }
  }

  async hint(id: string, itemId: string): Promise<{ hintCount: number; hint: string }> {
    const db = this.databaseService.getDb();
    const session = await this.load(id);
    const settings = this.getSettings();
    const item = session.items.at(-1);

    if (session.status !== 'active' || !item || item.id !== itemId || item.status !== 'active') {
      throw new ConflictException('Question is not active');
    }

    if (!settings.hintPolicy.enabled || item.hintCount >= settings.hintPolicy.maxHints) {
      throw new ConflictException('No more hints available');
    }

    db.prepare('UPDATE session_items SET hint_count = hint_count + 1 WHERE id = ?').run(item.id);
    const newHintCount = item.hintCount + 1;
    const hint = newHintCount === 2 ? item.question.answer : item.question.hints[newHintCount - 1] ?? item.question.answer;

    return { hintCount: newHintCount, hint };
  }

  async skip(id: string, itemId: string): Promise<MockSession> {
    const db = this.databaseService.getDb();
    const session = await this.load(id);
    const item = session.items.find(({ id: current }) => current === itemId);

    if (!item) {
      throw new NotFoundException('Question is not in this interview');
    }

    if (session.status === 'active' && item.status === 'active') {
      db.prepare("UPDATE session_items SET status = 'skipped' WHERE id = ?").run(item.id);
    }

    return await this.load(id);
  }

  async *answer(id: string, input: { itemId: string; answer: string; requestId: string }): AsyncGenerator<string> {
    const db = this.databaseService.getDb();
    const session = await this.load(id);
    const settings = this.getSettings();
    const item = session.items.find(({ id: current }) => current === input.itemId);

    if (!item) {
      throw new NotFoundException('Question is not in this interview');
    }

    const requestId = randomUUID();

    if (item.status === 'answered') {
      yield `event: result\ndata: ${JSON.stringify({ type: 'result', requestId, attempt: 1, payload: session })}\n\n`;
      yield `event: done\ndata: ${JSON.stringify({ type: 'done', requestId, attempt: 1, payload: {} })}\n\n`;
      return;
    }

    if (item.status !== 'active' || session.status !== 'active') {
      throw new ConflictException('Question is not active');
    }

    try {
      const feedback = await this.questionsService.gradeAnswer(item.question, input.answer, item.hintCount, settings);
      
      if (feedback) {
        const fresh = await this.load(id);
        const latest = fresh.items.find(({ id: current }) => current === item.id);

        if (fresh.status !== 'active' || latest?.status !== 'active') {
          yield `event: result\ndata: ${JSON.stringify({ type: 'result', requestId, attempt: 1, payload: fresh })}\n\n`;
          return;
        }

        if (latest.hintCount !== item.hintCount) {
          throw new ConflictException('Hint count changed; submit the answer again');
        }

        db.transaction(() => {
          const exists = db.prepare('SELECT 1 FROM attempts WHERE request_id = ?').get(input.requestId);
          if (exists) throw new ConflictException('Request ID already used for another answer');
          
          const attempt = this.questionsService.saveGradedAttempt({ ...input, hintCount: item.hintCount }, item.question.id, feedback, id);
          db.prepare("UPDATE session_items SET status = 'answered', answer = ?, attempt_id = ? WHERE id = ?").run(input.answer, attempt.id, item.id);
        })();

        const updated = this.load(id);
        yield `event: result\ndata: ${JSON.stringify({ type: 'result', requestId, attempt: 1, payload: updated })}\n\n`;
      }
    } catch (error) {
      yield `event: error\ndata: ${JSON.stringify({ type: 'error', requestId, attempt: 1, payload: { error: error instanceof Error ? error.message : 'Answer grading failed' } })}\n\n`;
    } finally {
      yield `event: done\ndata: ${JSON.stringify({ type: 'done', requestId, attempt: 1, payload: {} })}\n\n`;
    }
  }

  async end(id: string): Promise<MockSession> {
    const db = this.databaseService.getDb();
    const session = await this.load(id);

    if (session.status === 'active') {
      db.transaction(() => {
        db.prepare("UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ? AND status = 'active'").run(new Date().toISOString(), id);
        db.prepare("UPDATE session_items SET status = 'ungraded' WHERE session_id = ? AND status = 'active'").run(id);
      })();
    }

    return await this.load(id);
  }

  async report(id: string): Promise<MockReport> {
    const session = await this.load(id);
    const topics = new Map<string, number[]>();

    for (const { question, attempt } of session.items) {
      if (!attempt) continue;
      const scores = topics.get(question.topicSnapshot.name) ?? [];
      scores.push(attempt.score);
      topics.set(question.topicSnapshot.name, scores);
    }

    const categories = [...topics].map(([topic, scores]) => ({
      topic,
      score: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 10) / 10,
      attempts: scores.length,
    })).sort((left, right) => left.score - right.score || left.topic.localeCompare(right.topic));

    const weakestAreas = categories.filter(({ score }) => score < 7).slice(0, 3).map(({ topic }) => topic);

    return {
      session,
      categories,
      weakestAreas,
      suggestedFocus: weakestAreas.length
        ? weakestAreas.map((topic) => `Practice ${topic} and review missed rubric points.`)
        : ['Try a different topic or difficulty in your next interview.'],
    };
  }

  private async load(id: string): Promise<MockSession> {
    const db = this.databaseService.getDb();
    const row = db.prepare("SELECT * FROM sessions WHERE id = ? AND kind = 'mock'").get(id) as any;

    if (!row) {
      throw new NotFoundException('Mock interview not found');
    }

    if (row.status === 'active' && Date.parse(row.deadline_at) <= Date.now()) {
      db.transaction(() => {
        db.prepare("UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ? AND status = 'active'").run(row.deadline_at, id);
        db.prepare("UPDATE session_items SET status = 'ungraded' WHERE session_id = ? AND status = 'active'").run(id);
      })();
      row.status = 'ended';
      row.ended_at = row.deadline_at;
    }

    const snapshot = z.object({ setup: z.any(), settings: z.any() }).safeParse(JSON.parse(row.config_json));
    const config = snapshot.success ? snapshot.data.setup : z.any().parse(JSON.parse(row.config_json));
    const settings = snapshot.success ? snapshot.data.settings : this.getSettings();
    const items = db.prepare('SELECT * FROM session_items WHERE session_id = ? ORDER BY position').all(id) as any[];

    const mappedItems = await Promise.all(items.map(async (item) => {
      const attempt = item.attempt_id ? db.prepare('SELECT * FROM attempts WHERE id = ?').get(item.attempt_id) as any : null;
      return {
        id: item.id,
        question: await this.questionsService.findOne(item.question_id),
        status: item.status,
        startedAt: item.started_at,
        hintCount: item.hint_count,
        answer: item.answer,
        attempt: attempt ? this.questionsService.mapAttempt(attempt) : null,
      };
    }));

    return {
      id,
      config,
      status: row.status,
      startedAt: row.started_at,
      deadlineAt: row.deadline_at,
      endedAt: row.ended_at,
      items: mappedItems,
    };
  }

  private async generation(config: MockSetup) {
    const db = this.databaseService.getDb();
    const topics = db.prepare('SELECT * FROM topics WHERE archived_at IS NULL').all() as any[];
    const topicWeights = topics.map(({ id }) => [id, config.topicWeights[id] ?? 0] as const);
    const topicId = this.choice(topicWeights);
    const difficulty = this.choice([['easy', config.difficulty.easy], ['medium', config.difficulty.medium], ['hard', config.difficulty.hard]] as const) as Difficulty;
    const type = config.cvText && config.cvSituational ? 'behavioral' : 'conceptual';

    const topic = db.prepare('SELECT * FROM topics WHERE id = ?').get(topicId) as any;
    const subtopics = db.prepare('SELECT * FROM subtopics WHERE topic_id = ?').all(topicId) as any[];

    const settings = this.getSettings();
    const context = {
      type,
      difficulty,
      topicId: topic.id,
      topicSnapshot: {
        name: topic.name,
        subtopics: subtopics.map(s => s.name),
        model: settings.model,
      },
    };

    const slots = {
      topicName: JSON.stringify(topic.name),
      subtopics: JSON.stringify(context.topicSnapshot.subtopics),
      difficulty,
      count: '1',
    };

    const prompt = this.promptService.render(type, slots);

    return { context, prompt };
  }

  private buildMessages(settings: Settings, prompt: string, config: MockSetup): any[] {
    const messages: any[] = [
      { role: 'system', content: `${settings.systemPrompt ? `${settings.systemPrompt}\n\n` : ''}You are an interview coach. Return only JSON matching the supplied schema.` },
      { role: 'user', content: prompt },
    ];

    if (config.companyName || config.jobRole || config.companyInfo.trim()) {
      messages.push({
        role: 'user',
        content: this.promptService.render('mock-company-context', {
          companyName: JSON.stringify(config.companyName),
          jobRole: JSON.stringify(config.jobRole),
          companyInfo: JSON.stringify(config.companyInfo),
        }),
      });
    }

    if (config.cvText) {
      messages.push({
        role: 'user',
        content: this.promptService.render('mock-cv-context', {
          cvFileName: JSON.stringify(config.cvFileName),
          cvText: JSON.stringify(config.cvText),
          cvSituational: String(config.cvSituational),
        }),
      });
    }

    return messages;
  }

  private choice<T>(entries: readonly (readonly [T, number])[]): T {
    const positive = entries.filter(([, weight]) => weight > 0);
    if (positive.length === 0) {
      throw new ConflictException('No eligible topics or difficulty levels remain');
    }

    let cursor = Math.random() * positive.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [value, weight] of positive) {
      cursor -= weight;
      if (cursor < 0) return value;
    }

    return positive[0][0];
  }

  private getSettings(): Settings {
    const db = this.databaseService.getDb();
    const row = db.prepare('SELECT value_json FROM settings WHERE id = 1').get() as any;
    return JSON.parse(row.value_json);
  }
}
