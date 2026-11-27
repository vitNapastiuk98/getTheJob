import { z } from 'zod';
export declare const QuestionTypeSchema: z.ZodEnum<{
    conceptual: "conceptual";
    coding: "coding";
    debugging: "debugging";
    "code-review": "code-review";
    "system-design": "system-design";
    behavioral: "behavioral";
}>;
export declare const DifficultySchema: z.ZodEnum<{
    easy: "easy";
    medium: "medium";
    hard: "hard";
}>;
export declare const IdSchema: z.ZodString;
export declare const TextSchema: z.ZodString;
export declare const DifficultyMixSchema: z.ZodObject<{
    easy: z.ZodNumber;
    medium: z.ZodNumber;
    hard: z.ZodNumber;
}, z.core.$strip>;
export declare const SettingsSchema: z.ZodObject<{
    baseUrl: z.ZodString;
    model: z.ZodString;
    temperature: z.ZodNumber;
    numCtx: z.ZodUnion<readonly [z.ZodLiteral<16384>, z.ZodLiteral<32768>]>;
    seed: z.ZodNullable<z.ZodNumber>;
    systemPrompt: z.ZodString;
    difficulty: z.ZodObject<{
        easy: z.ZodNumber;
        medium: z.ZodNumber;
        hard: z.ZodNumber;
    }, z.core.$strip>;
    hintPolicy: z.ZodObject<{
        enabled: z.ZodBoolean;
        penalty: z.ZodNumber;
        maxHints: z.ZodNumber;
    }, z.core.$strip>;
    timerMinutes: z.ZodUnion<readonly [z.ZodLiteral<15>, z.ZodLiteral<30>, z.ZodLiteral<60>]>;
}, z.core.$strict>;
export type Settings = z.infer<typeof SettingsSchema>;
export declare const DEFAULT_SETTINGS: Settings;
export declare const TopicInputSchema: z.ZodObject<{
    name: z.ZodString;
    weight: z.ZodNumber;
}, z.core.$strict>;
export type TopicInput = z.infer<typeof TopicInputSchema>;
export interface Subtopic extends TopicInput {
    id: string;
    topicId: string;
}
export interface Topic extends TopicInput {
    id: string;
    subtopics: Subtopic[];
}
export declare const KeyPointSchema: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    weight: z.ZodNumber;
}, z.core.$strip>;
export declare const ExerciseSchema: z.ZodObject<{
    runtime: z.ZodEnum<{
        js: "js";
        dom: "dom";
        react: "react";
    }>;
    starterCode: z.ZodString;
    entryPoint: z.ZodString;
    fixture: z.ZodString;
    tests: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        code: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const GeneratedQuestionSchema: z.ZodObject<{
    prompt: z.ZodString;
    expectedKeyPoints: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        weight: z.ZodNumber;
    }, z.core.$strip>>;
    answer: z.ZodString;
    hints: z.ZodArray<z.ZodString>;
    followUp: z.ZodString;
    exercise: z.ZodNullable<z.ZodObject<{
        runtime: z.ZodEnum<{
            js: "js";
            dom: "dom";
            react: "react";
        }>;
        starterCode: z.ZodString;
        entryPoint: z.ZodString;
        fixture: z.ZodString;
        tests: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            code: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;
export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export interface Question extends GeneratedQuestion {
    id: string;
    type: QuestionType;
    difficulty: Difficulty;
    topicId: string;
    topicSnapshot: {
        name: string;
        subtopics: string[];
        model: string;
    };
    createdAt: string;
}
export declare const GenerateInputSchema: z.ZodObject<{
    type: z.ZodEnum<{
        conceptual: "conceptual";
        coding: "coding";
        debugging: "debugging";
        "code-review": "code-review";
        "system-design": "system-design";
        behavioral: "behavioral";
    }>;
    topicId: z.ZodString;
    subtopicIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    difficulty: z.ZodEnum<{
        easy: "easy";
        medium: "medium";
        hard: "hard";
    }>;
    count: z.ZodNumber;
}, z.core.$strict>;
export type GenerateInput = z.infer<typeof GenerateInputSchema>;
export declare const EvaluateInputSchema: z.ZodObject<{
    answer: z.ZodString;
    requestId: z.ZodString;
    hintCount: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
export type EvaluateInput = z.infer<typeof EvaluateInputSchema>;
export declare const GradeSchema: z.ZodObject<{
    points: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        status: z.ZodEnum<{
            met: "met";
            partial: "partial";
            missing: "missing";
        }>;
        evidence: z.ZodString;
        explanation: z.ZodString;
    }, z.core.$strip>>;
    followUp: z.ZodString;
    seniorAddition: z.ZodString;
}, z.core.$strip>;
export type Grade = z.infer<typeof GradeSchema>;
export interface Feedback extends Grade {
    score: number;
    missingKeyPoints: string[];
}
export interface Attempt {
    id: string;
    questionId: string;
    sessionId: string | null;
    kind: string;
    answer: string;
    feedback: Feedback | CodeReview;
    score: number;
    hintCount: number;
    createdAt: string;
}
export declare const CodeReviewSchema: z.ZodObject<{
    quality: z.ZodString;
    complexity: z.ZodString;
    naming: z.ZodString;
    comments: z.ZodArray<z.ZodObject<{
        line: z.ZodNumber;
        message: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CodeReview = z.infer<typeof CodeReviewSchema>;
export declare const DesignFeedbackSchema: z.ZodObject<{
    clarification: z.ZodString;
    components: z.ZodString;
    dataFlow: z.ZodString;
    state: z.ZodString;
    performance: z.ZodString;
    tradeoffs: z.ZodString;
    staffPushback: z.ZodString;
    followUp: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type DesignFeedback = z.infer<typeof DesignFeedbackSchema>;
export interface DesignMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    feedback: DesignFeedback | null;
    status: 'complete' | 'pending' | 'failed';
    createdAt: string;
}
export interface DesignSession {
    id: string;
    scenario: string;
    createdAt: string;
    messages: DesignMessage[];
}
export declare const MockSetupSchema: z.ZodObject<{
    durationMinutes: z.ZodUnion<readonly [z.ZodLiteral<15>, z.ZodLiteral<30>, z.ZodLiteral<60>]>;
    topicWeights: z.ZodRecord<z.ZodString, z.ZodNumber>;
    difficulty: z.ZodObject<{
        easy: z.ZodNumber;
        medium: z.ZodNumber;
        hard: z.ZodNumber;
    }, z.core.$strip>;
    companyName: z.ZodDefault<z.ZodString>;
    jobRole: z.ZodDefault<z.ZodString>;
    companyInfo: z.ZodDefault<z.ZodString>;
    cvFileName: z.ZodDefault<z.ZodString>;
    cvText: z.ZodDefault<z.ZodString>;
    cvSituational: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export type MockSetup = z.infer<typeof MockSetupSchema>;
export interface MockItem {
    id: string;
    question: Question;
    status: 'active' | 'answered' | 'skipped' | 'ungraded';
    startedAt: string;
    hintCount: number;
    answer: string;
    attempt: Attempt | null;
}
export interface MockSession {
    id: string;
    status: 'active' | 'ended';
    config: MockSetup;
    startedAt: string;
    deadlineAt: string;
    endedAt: string | null;
    items: MockItem[];
}
export interface MockReport {
    session: MockSession;
    categories: {
        topic: string;
        score: number;
        attempts: number;
    }[];
    weakestAreas: string[];
    suggestedFocus: string[];
}
export interface Mastery {
    topicId: string;
    topic: string;
    attempts: number;
    average: number;
    lastScore: number;
    trend: 'up' | 'down' | 'steady';
}
export interface HistoryAttempt {
    id: string;
    questionId: string;
    topic: string;
    type: QuestionType;
    prompt: string;
    kind: string;
    score: number | null;
    createdAt: string;
}
export interface HistorySession {
    id: string;
    kind: 'mock' | 'design';
    title: string;
    status: string;
    createdAt: string;
}
export interface HistoryPage {
    readonly attempts: readonly HistoryAttempt[];
    readonly sessions: readonly HistorySession[];
    readonly page: number;
    readonly pageSize: number;
    readonly attemptTotal: number;
    readonly sessionTotal: number;
}
export interface ReviewCard {
    questionId: string;
    topic: string;
    prompt: string;
    score: number;
    dueAt: string;
    box: number;
}
export interface PromptTemplate {
    key: string;
    template: string;
    defaultTemplate: string;
    slots: string[];
}
export interface Doctor {
    reachable: boolean;
    modelInstalled: boolean;
    model: string;
    models: {
        name: string;
    }[];
    installCommand: string;
    error?: string;
}
export type LlmEvent = {
    type: 'status' | 'token' | 'retry' | 'result' | 'warning' | 'error' | 'done';
    requestId: string;
    attempt: number;
    payload: unknown;
};
export type LlmResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    raw: string;
    warning: string;
};
export declare const ApplicationSchema: z.ZodObject<{
    id: z.ZodString;
    jobTitle: z.ZodString;
    company: z.ZodString;
    jobDescription: z.ZodString;
    userInput: z.ZodDefault<z.ZodString>;
    coverLetter: z.ZodDefault<z.ZodString>;
    successful: z.ZodDefault<z.ZodBoolean>;
    feedback: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodISODateTime;
    updatedAt: z.ZodISODateTime;
}, z.core.$strip>;
export type Application = z.infer<typeof ApplicationSchema>;
export declare const ApplicationInputSchema: z.ZodObject<{
    jobTitle: z.ZodString;
    company: z.ZodString;
    jobDescription: z.ZodString;
    userInput: z.ZodDefault<z.ZodString>;
}, z.core.$strict>;
export type ApplicationInput = z.infer<typeof ApplicationInputSchema>;
