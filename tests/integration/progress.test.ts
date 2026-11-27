import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { HistoryPage } from '../../shared/contracts.js';
import { buildApp } from '../../backend/src/app.js';
import { saveGradedAttempt } from '../../backend/src/routes/questions.js';
import { seedDatabase } from '../../backend/src/seed.js';

it('shows score trends, filters history, and puts due weak questions before strong ones', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-progress-'));
  const app = await buildApp({ dataDir });
  try {
    seedDatabase(app.db);
    function answer(questionId: string, score: number) {
      return saveGradedAttempt(app.db, { requestId: randomUUID(), answer: 'Fixture answer', hintCount: 0 }, questionId,
        { score, missingKeyPoints: [], points: [], followUp: 'Next?', seniorAddition: 'Measure it.' }, null);
    }
    const first = answer('sample-closures', 1);
    app.db.prepare('UPDATE attempts SET created_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', first.id);
    answer('sample-closures', 4);
    answer('sample-await', 9);
    const dashboard = (await app.inject('/api/dashboard')).json();
    expect(dashboard.due).toBe(1);
    expect(dashboard.mastery).toContainEqual({ topicId: 'js-fundamentals', topic: 'JS fundamentals', attempts: 2, average: 2.5, lastScore: 4, trend: 'up' });
    const due = (await app.inject('/api/review')).json();
    expect(due.map((card: { questionId: string }) => card.questionId)).toEqual(['sample-closures']);
    app.db.prepare("UPDATE review_cards SET due_at = '2020-01-01T00:00:00.000Z' WHERE question_id = 'sample-await'").run();
    expect((await app.inject('/api/review')).json().map((card: { questionId: string }) => card.questionId)).toEqual(['sample-closures', 'sample-await']);
    const filtered = (await app.inject('/api/history?topicId=js-fundamentals&type=conceptual&from=2020-01-01&to=2020-01-01')).json();
    expect(filtered.attempts).toMatchObject([{ id: first.id, score: 1 }]);
    expect((await app.inject('/api/history?from=2020-02-31')).statusCode).toBe(400);
    expect((await app.inject('/api/history?from=2020-03-01&to=2020-02-01')).statusCode).toBe(400);
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

it('pages matching attempts and sessions without changing newest-first order', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-history-'));
  const app = await buildApp({ dataDir });
  try {
    seedDatabase(app.db);
    const db = app.db;
    const copyQuestion = db.prepare(`INSERT INTO questions
      SELECT ?, ?, difficulty, ?, topic_snapshot_json, prompt, expected_key_points_json, answer, hints_json, follow_up, exercise_json, created_at
      FROM questions WHERE id = 'sample-closures'`);
    copyQuestion.run('wrong-type', 'debugging', 'js-fundamentals');
    copyQuestion.run('wrong-topic', 'conceptual', 'async');
    const addAttempt = db.prepare(`INSERT INTO attempts (id, request_id, question_id, kind, answer_or_code, feedback_json, score, created_at)
      VALUES (?, ?, ?, 'question', '', '{}', 5, ?)`);
    const addSession = db.prepare("INSERT INTO sessions (id, kind, status, config_json, started_at) VALUES (?, 'mock', 'ended', '{}', ?)");
    const addItem = db.prepare("INSERT INTO session_items (id, session_id, question_id, position, status, started_at) VALUES (?, ?, ?, ?, 'skipped', ?)");
    function add(id: string, questionId: string, day: string) {
      addAttempt.run(id, id, questionId, day);
      addSession.run(id, day);
      addItem.run(id, id, questionId, 0, day);
    }
    const ids = Array.from({ length: 100 }, (_, index) => `match-${index}`);
    db.transaction(() => {
      for (const id of ids) add(id, 'sample-closures', '2020-01-02T00:00:00.000Z');
      add('oldest', 'sample-closures', '2020-01-01T00:00:00.000Z');
      add('outside-date', 'sample-closures', '2020-01-03T00:00:00.000Z');
      add('outside-topic', 'wrong-topic', '2020-01-02T00:00:00.000Z');
      add('outside-type', 'wrong-type', '2020-01-02T00:00:00.000Z');
      addItem.run('second-match', 'match-0', 'sample-closures', 1, '2020-01-02T00:00:00.000Z');
      addItem.run('different-type', 'outside-topic', 'wrong-type', 1, '2020-01-02T00:00:00.000Z');
    })();

    const url = '/api/history?topicId=js-fundamentals&type=conceptual&from=2020-01-01&to=2020-01-02';
    for (const [suffix, page, expected] of [
      ['&page=2', 2, ['oldest']], ['', 1, [...ids].reverse()], ['&page=3', 3, []],
    ] as const) {
      const response = await app.inject(url + suffix);
      expect(response.statusCode).toBe(200);
      const body = response.json<HistoryPage>();
      expect(body.attempts.map(({ id }) => id)).toEqual(expected);
      expect(body.sessions.map(({ id }) => id)).toEqual(expected);
      expect(body).toMatchObject({ page, pageSize: 100, attemptTotal: 101, sessionTotal: 101 });
    }
    const sized = await app.inject(`${url}&page=2&pageSize=2`);
    expect(sized.json()).toMatchObject({ page: 2, pageSize: 2, attempts: [{ id: 'match-97' }, { id: 'match-96' }] });
    for (const bad of ['page=0', 'page=-1', 'page=1.5', 'page=1e2', 'page=', 'page=9007199254740992', 'page=1&page=2', 'pageSize=0', 'pageSize=101']) {
      expect((await app.inject(`${url}&${bad}`)).statusCode, bad).toBe(400);
    }
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
