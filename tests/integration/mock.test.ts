import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { MockReport, MockSession } from '../../shared/contracts.js';
import { buildApp } from '../../backend/src/app.js';
import { seedDatabase } from '../../backend/src/seed.js';

it('uses company and CV context for questions, keeps it out of grading, and reloads a finished report', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-mock-'));
  const question = { prompt: 'How did you handle a LedgerFlow outage?', answer: 'Explain the trade-off', expectedKeyPoints: [{ id: 'tradeoff', text: 'Explain the trade-off', weight: 1 }],
    hints: ['Name a trade-off'], followUp: 'What changed?', exercise: null };
  const grade = { points: [{ id: 'tradeoff', status: 'met', evidence: 'I chose clear alerts', explanation: 'Explained a trade-off.' }], followUp: 'What changed?', seniorAddition: 'Measure response time.' };
  const outputs = [[question], grade, [question], [question]];
  const sent: string[] = [];
  const app = await buildApp({ dataDir, fetch: async (_url, init) => {
    sent.push(String(init?.body));
    const output = outputs.shift();
    if (!output) throw new Error('Unexpected model call');
    return new Response(`${JSON.stringify({ message: { content: JSON.stringify(output) }, done: true })}\n`);
  } });
  try {
    seedDatabase(app.db);
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const root = `${origin}/api/mock/sessions`;
    const post = async (suffix: string, input: unknown) => {
      const response = await fetch(root + suffix, { method: 'POST', headers: { 'content-type': 'application/json', 'x-interviewforge': '1' }, body: JSON.stringify(input) });
      expect(response.status).toBe(200);
      if (!response.headers.get('content-type')?.includes('text/event-stream')) return response.json();
      const events = (await response.text()).split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)));
      expect(events.map(({ type }) => type)).not.toContain('error');
      return events.find(({ type }) => type === 'result').payload;
    };
    const config = { durationMinutes: 15, topicWeights: { react: 100 }, difficulty: { easy: 0, medium: 100, hard: 0 },
      companyName: 'Sipwise', jobRole: 'Frontend Developer', companyInfo: 'Accessible telecom dashboards',
      cvFileName: 'candidate.pdf', cvText: 'Led LedgerFlow incident response.', cvSituational: true };
    const session: MockSession = await post('', config);
    expect(session.items[0].question).toMatchObject({ prompt: question.prompt, type: 'behavioral', difficulty: 'medium', topicId: 'react' });
    for (const text of ['Sipwise', 'Frontend Developer', 'Accessible telecom dashboards', 'Led LedgerFlow incident response.', 'never invent employment history']) expect(sent[0]).toContain(text);
    const suffix = `/${session.id}`;
    const { id: itemId } = session.items[0];
    expect(await post(`${suffix}/hint`, { itemId })).toMatchObject({ hintCount: 1, hint: 'Name a trade-off' });
    const input = { itemId, answer: 'I chose clear alerts.', requestId: randomUUID() };
    const answered: MockSession = await post(`${suffix}/answer`, input);
    expect(answered.items[0].attempt).toMatchObject({ score: 9, hintCount: 1 });
    expect(sent[1]).not.toMatch(/Sipwise|Led LedgerFlow incident response\./);
    expect(await post(`${suffix}/answer`, input)).toEqual(answered);
    const next: MockSession = await post(`${suffix}/next`, {});
    expect(next.items).toHaveLength(2);
    await post(`${suffix}/skip`, { itemId: next.items[1].id });
    await post(`${suffix}/next`, {});
    const ended: MockSession = await post(`${suffix}/end`, {});
    expect(ended.items.at(-1)).toMatchObject({ status: 'ungraded', attempt: null, answer: '' });
    const report: MockReport = await fetch(`${root}${suffix}/report`).then((response) => response.json());
    expect(report.session).toMatchObject({ status: 'ended', config });
    expect(report.session.items.map(({ status }) => status)).toEqual(['answered', 'skipped', 'ungraded']);
    expect(report.categories).toEqual([{ topic: 'React', score: 9, attempts: 1 }]);
    expect(sent).toHaveLength(4);
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

it('persists expiry without grading the open item and still loads older setup JSON', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-mock-expiry-'));
  const app = await buildApp({ dataDir });
  try {
    seedDatabase(app.db);
    const startedAt = '2020-01-01T00:00:00.000Z';
    const deadlineAt = '2020-01-01T00:15:00.000Z';
    const setup = { durationMinutes: 15, topicWeights: { 'js-fundamentals': 100 }, difficulty: { easy: 100, medium: 0, hard: 0 } };
    app.db.prepare("INSERT INTO sessions VALUES ('legacy', 'mock', 'active', ?, ?, ?, NULL)").run(JSON.stringify(setup), startedAt, deadlineAt);
    const insertItem = app.db.prepare("INSERT INTO session_items (id, session_id, question_id, position, status, started_at) VALUES (?, 'legacy', 'sample-closures', ?, ?, ?)");
    insertItem.run('legacy-skip', 0, 'skipped', startedAt);
    insertItem.run('legacy-open', 1, 'active', startedAt);
    const url = '/api/mock/sessions/legacy';

    const result = await app.inject(`${url}/report`);
    expect(result.statusCode).toBe(200);
    const report = result.json<MockReport>();
    expect(report.session).toMatchObject({ status: 'ended', endedAt: deadlineAt, config: { ...setup, companyName: '', cvText: '' } });
    expect(report.session.items.map(({ status, attempt }) => ({ status, attempt }))).toEqual([
      { status: 'skipped', attempt: null }, { status: 'ungraded', attempt: null },
    ]);
    expect(report.categories).toEqual([]);
    expect((await app.inject(url)).json()).toEqual(report.session);
    expect(app.db.prepare("SELECT status FROM session_items WHERE id = 'legacy-open'").get()).toEqual({ status: 'ungraded' });
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
