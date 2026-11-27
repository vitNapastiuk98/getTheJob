import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { openDatabase } from '../../backend/src/db.js';
import { seedDatabase } from '../../backend/src/seed.js';

const dirs: string[] = [];
function temp() { const dir = mkdtempSync(join(tmpdir(), 'forge-seed-')); dirs.push(dir); return dir; }
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const expectedTree: Record<string, string[]> = {
  'JS fundamentals': ['closures', 'prototypes', 'event loop', 'coercion', 'generators'],
  'Async': ['promises', 'fetch', 'AbortController', 'concurrency patterns'],
  'DOM & browser': ['rendering pipeline', 'reflow/repaint', 'storage', 'Web APIs'],
  'React': ['hooks', 'rendering', 'reconciliation', 'state management', 'SSR'],
  'TypeScript': ['generics', 'narrowing'],
  'CSS & layout': ['specificity', 'flexbox/grid', 'CWV-adjacent rendering topics'],
  'Performance': ['Core Web Vitals', 'bundle size', 'lazy loading', 'caching'],
  'Accessibility & testing': ['jest/vitest', 'RTL', 'a11y audits'],
  'Angular': ['components & templates', 'dependency injection', 'change detection', 'signals', 'routing & forms'],
  'RxJS': ['observables & subscriptions', 'operators', 'subjects', 'switchMap/mergeMap/concatMap', 'error handling & leaks'],
  'Vue': ['reactivity (ref/reactive)', 'composition API', 'components, props & emits', 'Pinia state management', 'router & lifecycle'],
};

interface TopicRow { id: string; name: string; weight: number; archived_at: string | null }
interface SubtopicRow { id: string; topic_id: string; name: string; weight: number; archived_at: string | null }
interface QuestionRow {
  id: string; type: string; difficulty: string; topic_id: string; topic_snapshot_json: string; prompt: string;
  expected_key_points_json: string; answer: string; hints_json: string; follow_up: string; exercise_json: string | null; created_at: string;
}

function topicsOf(db: ReturnType<typeof openDatabase>): TopicRow[] {
  return db.prepare('SELECT id, name, weight, archived_at FROM topics').all() as TopicRow[];
}
function subtopicsOf(db: ReturnType<typeof openDatabase>): SubtopicRow[] {
  return db.prepare('SELECT id, topic_id, name, weight, archived_at FROM subtopics').all() as SubtopicRow[];
}
function questionsOf(db: ReturnType<typeof openDatabase>): QuestionRow[] {
  return db.prepare('SELECT * FROM questions').all() as QuestionRow[];
}

it('seeds the exact eleven-topic tree and rubric-bearing samples on a fresh database', () => {
  const db = openDatabase(temp());
  expect(seedDatabase(db)).toEqual({ topics: 11, subtopics: 45, questions: 2 });
  const topics = topicsOf(db);
  expect(topics.map((topic) => topic.name).sort()).toEqual(Object.keys(expectedTree).sort());
  expect(topics.every((topic) => topic.weight > 0 && topic.archived_at === null)).toBe(true);
  for (const topic of topics) {
    const names = subtopicsOf(db).filter((subtopic) => subtopic.topic_id === topic.id).map((subtopic) => subtopic.name);
    expect(names.sort()).toEqual([...expectedTree[topic.name]].sort());
  }
  const questions = questionsOf(db);
  expect(questions.map((question) => question.id).sort()).toEqual(['sample-await', 'sample-closures']);
  for (const question of questions) {
    const points = JSON.parse(question.expected_key_points_json) as { id: string; text: string; weight: number }[];
    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      expect(point.id).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(point.text.length).toBeGreaterThan(0);
      expect(point.weight).toBeGreaterThan(0);
    }
    expect(JSON.parse(question.hints_json)).toHaveLength(3);
    expect(question.exercise_json).toBeNull();
    expect(JSON.parse(question.topic_snapshot_json)).toMatchObject({ name: expect.any(String), subtopics: expect.any(Array), model: 'seed' });
  }
  db.close();
});

it('re-seeding a fresh database changes no counts and duplicates no rows', () => {
  const db = openDatabase(temp());
  const first = seedDatabase(db);
  const second = seedDatabase(db);
  expect(second).toEqual(first);
  expect(topicsOf(db)).toHaveLength(11);
  expect(subtopicsOf(db)).toHaveLength(45);
  expect(questionsOf(db)).toHaveLength(2);
  for (const table of ['topics', 'subtopics', 'questions']) {
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    const distinct = db.prepare(`SELECT COUNT(DISTINCT id) AS n FROM ${table}`).get() as { n: number };
    expect(rows.n).toBe(distinct.n);
  }
  db.close();
});

it('re-seeding preserves user edits, archives and added history', () => {
  const db = openDatabase(temp());
  seedDatabase(db);
  db.prepare("UPDATE topics SET name = 'React 19' WHERE id = 'react'").run();
  db.prepare("UPDATE topics SET archived_at = '2026-11-20T01:00:00.000Z' WHERE id = 'css-layout'").run();
  db.prepare("UPDATE subtopics SET archived_at = '2026-11-20T01:00:00.000Z' WHERE id = 'react:ssr'").run();
  db.prepare("UPDATE questions SET prompt = 'edited prompt' WHERE id = 'sample-closures'").run();
  db.prepare(`INSERT INTO questions VALUES ('user-q1', 'conceptual', 'easy', 'js-fundamentals', '{}',
    'user question', '[{"id":"kp1","text":"point","weight":1}]', 'answer', '["hint"]', 'follow-up', NULL, '2026-11-20T02:00:00.000Z')`).run();
  const summary = seedDatabase(db);
  expect(summary).toEqual({ topics: 11, subtopics: 45, questions: 3 });
  expect(topicsOf(db).find((topic) => topic.id === 'react')?.name).toBe('React 19');
  expect(topicsOf(db).find((topic) => topic.id === 'css-layout')?.archived_at).toBe('2026-11-20T01:00:00.000Z');
  expect(subtopicsOf(db).find((subtopic) => subtopic.id === 'react:ssr')?.archived_at).toBe('2026-11-20T01:00:00.000Z');
  expect(questionsOf(db).find((question) => question.id === 'sample-closures')?.prompt).toBe('edited prompt');
  expect(questionsOf(db).find((question) => question.id === 'user-q1')).toMatchObject({ type: 'conceptual', topic_id: 'js-fundamentals' });
  expect(questionsOf(db).filter((question) => question.id === 'sample-closures')).toHaveLength(1);
  db.close();
});
