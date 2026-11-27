import { z } from 'zod';

export const QuestionTypeSchema = z.enum(['conceptual', 'coding', 'debugging', 'code-review', 'system-design', 'behavioral']);
export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);
export const IdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const TextSchema = z.string().min(1).max(65_536);
const WeightSchema = z.number().finite().min(0).max(100);
export const DifficultyMixSchema = z.object({ easy: WeightSchema, medium: WeightSchema, hard: WeightSchema }).refine((mix) => mix.easy + mix.medium + mix.hard > 0, 'At least one difficulty weight must be positive');
export const SettingsSchema = z.object({
  baseUrl: z.string().url().max(300),
  model: z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9._:/-]+$/),
  temperature: z.number().finite().min(0).max(2),
  numCtx: z.union([z.literal(16384), z.literal(32768)]),
  seed: z.number().int().min(0).max(2_147_483_647).nullable(),
  systemPrompt: z.string().max(16_384),
  difficulty: DifficultyMixSchema,
  hintPolicy: z.object({ enabled: z.boolean(), penalty: z.number().min(0).max(5), maxHints: z.number().int().min(1).max(3) }),
  timerMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
}).strict();
export type Settings = z.infer<typeof SettingsSchema>;
export const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'http://localhost:11434', model: 'qwen3.5:9b', temperature: 0.4, numCtx: 16384, seed: null, systemPrompt: '',
  difficulty: { easy: 25, medium: 50, hard: 25 }, hintPolicy: { enabled: true, penalty: 1, maxHints: 3 }, timerMinutes: 30,
};
export const TopicInputSchema = z.object({ name: z.string().trim().min(1).max(100), weight: WeightSchema }).strict();
export type TopicInput = z.infer<typeof TopicInputSchema>;
export interface Subtopic extends TopicInput { id: string; topicId: string }
export interface Topic extends TopicInput { id: string; subtopics: Subtopic[] }
export const KeyPointSchema = z.object({ id: IdSchema, text: TextSchema, weight: z.number().positive().max(100) });
export const ExerciseSchema = z.object({
  runtime: z.enum(['js', 'dom', 'react']), starterCode: z.string().max(65_536), entryPoint: z.string().max(100),
  fixture: z.string().max(65_536), tests: z.array(z.object({ name: z.string().min(1).max(300), code: TextSchema })).min(1).max(20),
});
export const GeneratedQuestionSchema = z.object({
  prompt: TextSchema, expectedKeyPoints: z.array(KeyPointSchema).min(1).max(20), answer: TextSchema,
  hints: z.array(TextSchema).min(1).max(3), followUp: TextSchema, exercise: ExerciseSchema.nullable(),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;
export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export interface Question extends GeneratedQuestion {
  id: string; type: QuestionType; difficulty: Difficulty; topicId: string;
  topicSnapshot: { name: string; subtopics: string[]; model: string }; createdAt: string;
}
export const GenerateInputSchema = z.object({ type: QuestionTypeSchema, topicId: IdSchema, subtopicIds: z.array(IdSchema).max(30).default([]), difficulty: DifficultySchema, count: z.number().int().min(1).max(10) }).strict();
export type GenerateInput = z.infer<typeof GenerateInputSchema>;
export const EvaluateInputSchema = z.object({ answer: TextSchema, requestId: z.string().uuid(), hintCount: z.number().int().min(0).max(3).default(0) }).strict();
export type EvaluateInput = z.infer<typeof EvaluateInputSchema>;
export const GradeSchema = z.object({
  points: z.array(z.object({ id: IdSchema, status: z.enum(['met', 'partial', 'missing']), evidence: z.string().max(65_536), explanation: TextSchema })).min(1).max(20),
  followUp: TextSchema, seniorAddition: TextSchema,
});
export type Grade = z.infer<typeof GradeSchema>;
export interface Feedback extends Grade { score: number; missingKeyPoints: string[] }
export interface Attempt { id: string; questionId: string; sessionId: string | null; kind: string; answer: string; feedback: Feedback | CodeReview; score: number; hintCount: number; createdAt: string }
export const CodeReviewSchema = z.object({ quality: TextSchema, complexity: TextSchema, naming: TextSchema, comments: z.array(z.object({ line: z.number().int().positive(), message: TextSchema })).max(30) });
export type CodeReview = z.infer<typeof CodeReviewSchema>;
export const DesignFeedbackSchema = z.object({ clarification: TextSchema, components: TextSchema, dataFlow: TextSchema, state: TextSchema, performance: TextSchema, tradeoffs: TextSchema, staffPushback: TextSchema, followUp: z.array(TextSchema).min(1).max(5) });
export type DesignFeedback = z.infer<typeof DesignFeedbackSchema>;
export interface DesignMessage { id: string; role: 'user' | 'assistant'; content: string; feedback: DesignFeedback | null; status: 'complete' | 'pending' | 'failed'; createdAt: string }
export interface DesignSession { id: string; scenario: string; createdAt: string; messages: DesignMessage[] }
export const MockSetupSchema = z.object({ durationMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]), topicWeights: z.record(IdSchema, WeightSchema).refine((value) => Object.values(value).some((weight) => weight > 0), 'Select a topic'), difficulty: DifficultyMixSchema,
  companyName: z.string().trim().max(100).default(''), jobRole: z.string().trim().max(100).default(''), companyInfo: z.string().max(8_000).default(''),
  cvFileName: z.string().trim().max(255).default(''), cvText: z.string().trim().max(30_000).default(''), cvSituational: z.boolean().default(true),
}).strict();
export type MockSetup = z.infer<typeof MockSetupSchema>;
export interface MockItem { id: string; question: Question; status: 'active' | 'answered' | 'skipped' | 'ungraded'; startedAt: string; hintCount: number; answer: string; attempt: Attempt | null }
export interface MockSession { id: string; status: 'active' | 'ended'; config: MockSetup; startedAt: string; deadlineAt: string; endedAt: string | null; items: MockItem[] }
export interface MockReport { session: MockSession; categories: { topic: string; score: number; attempts: number }[]; weakestAreas: string[]; suggestedFocus: string[] }
export interface Mastery { topicId: string; topic: string; attempts: number; average: number; lastScore: number; trend: 'up' | 'down' | 'steady' }
export interface HistoryAttempt { id: string; questionId: string; topic: string; type: QuestionType; prompt: string; kind: string; score: number | null; createdAt: string }
export interface HistorySession { id: string; kind: 'mock' | 'design'; title: string; status: string; createdAt: string }
export interface HistoryPage {
  readonly attempts: readonly HistoryAttempt[];
  readonly sessions: readonly HistorySession[];
  readonly page: number;
  readonly pageSize: number;
  readonly attemptTotal: number;
  readonly sessionTotal: number;
}
export interface ReviewCard { questionId: string; topic: string; prompt: string; score: number; dueAt: string; box: number }
export interface PromptTemplate { key: string; template: string; defaultTemplate: string; slots: string[] }
export interface Doctor { reachable: boolean; modelInstalled: boolean; model: string; models: { name: string }[]; installCommand: string; error?: string }
export type LlmEvent = { type: 'status' | 'token' | 'retry' | 'result' | 'warning' | 'error' | 'done'; requestId: string; attempt: number; payload: unknown };
export type LlmResult<T> = { ok: true; data: T } | { ok: false; raw: string; warning: string };

export const ApplicationSchema = z.object({
  id: IdSchema,
  jobTitle: TextSchema,
  company: TextSchema,
  jobDescription: TextSchema,
  userInput: z.string().max(65_536).default(''),
  coverLetter: z.string().max(65_536).default(''),
  successful: z.boolean().default(false),
  feedback: z.string().max(65_536).default(''),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Application = z.infer<typeof ApplicationSchema>;

export const ApplicationInputSchema = z.object({
  jobTitle: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  jobDescription: z.string().trim().min(1).max(65_536),
  userInput: z.string().max(65_536).default(''),
}).strict();
export type ApplicationInput = z.infer<typeof ApplicationInputSchema>;
