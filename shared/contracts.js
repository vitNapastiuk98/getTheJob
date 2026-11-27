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
export const DEFAULT_SETTINGS = {
    baseUrl: 'http://localhost:11434', model: 'qwen3.5:9b', temperature: 0.4, numCtx: 16384, seed: null, systemPrompt: '',
    difficulty: { easy: 25, medium: 50, hard: 25 }, hintPolicy: { enabled: true, penalty: 1, maxHints: 3 }, timerMinutes: 30,
};
export const TopicInputSchema = z.object({ name: z.string().trim().min(1).max(100), weight: WeightSchema }).strict();
export const KeyPointSchema = z.object({ id: IdSchema, text: TextSchema, weight: z.number().positive().max(100) });
export const ExerciseSchema = z.object({
    runtime: z.enum(['js', 'dom', 'react']), starterCode: z.string().max(65_536), entryPoint: z.string().max(100),
    fixture: z.string().max(65_536), tests: z.array(z.object({ name: z.string().min(1).max(300), code: TextSchema })).min(1).max(20),
});
export const GeneratedQuestionSchema = z.object({
    prompt: TextSchema, expectedKeyPoints: z.array(KeyPointSchema).min(1).max(20), answer: TextSchema,
    hints: z.array(TextSchema).min(1).max(3), followUp: TextSchema, exercise: ExerciseSchema.nullable(),
});
export const GenerateInputSchema = z.object({ type: QuestionTypeSchema, topicId: IdSchema, subtopicIds: z.array(IdSchema).max(30).default([]), difficulty: DifficultySchema, count: z.number().int().min(1).max(10) }).strict();
export const EvaluateInputSchema = z.object({ answer: TextSchema, requestId: z.string().uuid(), hintCount: z.number().int().min(0).max(3).default(0) }).strict();
export const GradeSchema = z.object({
    points: z.array(z.object({ id: IdSchema, status: z.enum(['met', 'partial', 'missing']), evidence: z.string().max(65_536), explanation: TextSchema })).min(1).max(20),
    followUp: TextSchema, seniorAddition: TextSchema,
});
export const CodeReviewSchema = z.object({ quality: TextSchema, complexity: TextSchema, naming: TextSchema, comments: z.array(z.object({ line: z.number().int().positive(), message: TextSchema })).max(30) });
export const DesignFeedbackSchema = z.object({ clarification: TextSchema, components: TextSchema, dataFlow: TextSchema, state: TextSchema, performance: TextSchema, tradeoffs: TextSchema, staffPushback: TextSchema, followUp: z.array(TextSchema).min(1).max(5) });
export const MockSetupSchema = z.object({ durationMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]), topicWeights: z.record(IdSchema, WeightSchema).refine((value) => Object.values(value).some((weight) => weight > 0), 'Select a topic'), difficulty: DifficultyMixSchema,
    companyName: z.string().trim().max(100).default(''), jobRole: z.string().trim().max(100).default(''), companyInfo: z.string().max(8_000).default(''),
    cvFileName: z.string().trim().max(255).default(''), cvText: z.string().trim().max(30_000).default(''), cvSituational: z.boolean().default(true),
}).strict();
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
export const ApplicationInputSchema = z.object({
    jobTitle: z.string().trim().min(1).max(200),
    company: z.string().trim().min(1).max(200),
    jobDescription: z.string().trim().min(1).max(65_536),
    userInput: z.string().max(65_536).default(''),
}).strict();
//# sourceMappingURL=contracts.js.map