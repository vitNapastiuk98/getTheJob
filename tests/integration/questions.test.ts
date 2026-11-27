import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildApp } from '../../backend/src/app.js';
import { seedDatabase } from '../../backend/src/seed.js';

it('generates and grades over HTTP, repairs wrong rubric IDs, and persists one attempt', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-questions-'));
  const question = { prompt: 'Explain closures', answer: 'A function captures scope', expectedKeyPoints: [{ id: 'capture', text: 'Captures scope', weight: 1 }],
    hints: ['Think about scope'], followUp: 'What outlives a call?', exercise: null };
  const grade = { points: [{ id: 'capture', status: 'met', evidence: 'fabricated quotation', explanation: 'Points to the scope.' }], followUp: 'What outlives a call?', seniorAddition: 'Discuss retained memory.' };
  const outputs = [[question], { ...grade, points: [{ ...grade.points[0], id: 'invented' }] }, grade];
  const requests: string[] = [];
  const app = await buildApp({ dataDir, fetch: async (url, init) => {
    expect(new URL(String(url)).pathname).toBe('/api/chat');
    requests.push(String(init?.body));
    const output = outputs.shift();
    if (!output) throw new Error('Unexpected model call');
    return new Response(`${JSON.stringify({ message: { content: JSON.stringify(output) }, done: true })}\n`);
  } });
  try {
    seedDatabase(app.db);
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const post = async (path: string, payload: unknown) => {
      const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-interviewforge': '1' }, body: JSON.stringify(payload) });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      return (await response.text()).split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)));
    };
    const generate = await post('/api/questions/generate', { type: 'conceptual', topicId: 'js-fundamentals', difficulty: 'easy', count: 1 });
    expect(generate.map(({ type }) => type)).toEqual(['status', 'token', 'result', 'done']);
    const [{ id }] = generate.find(({ type }) => type === 'result').payload;
    expect(await fetch(`${origin}/api/questions/${id}`).then((response) => response.json())).toMatchObject(question);
    const hint = await post(`/api/questions/${id}/hint`, { hintCount: 0 });
    expect(hint[0].payload).toEqual({ hintCount: 1, hint: 'Think about scope' });
    const answer = { requestId: randomUUID(), answer: 'My answer is about scope.' };
    const evaluated = await post(`/api/questions/${id}/evaluate`, answer);
    expect(evaluated.map(({ type }) => type)).toContain('retry');
    const attempt = evaluated.find(({ type }) => type === 'result').payload;
    expect(attempt).toMatchObject({ score: 1, feedback: { missingKeyPoints: ['Captures scope'] } });
    expect((await post(`/api/questions/${id}/evaluate`, answer))[0].payload).toEqual(attempt);
    expect(await fetch(`${origin}/api/questions/${id}/attempts`).then((response) => response.json())).toEqual([attempt]);
    expect(requests).toHaveLength(3);
    expect(JSON.parse(requests[0]).format.items.properties.exercise).toMatchObject({ type: 'null' });
    expect(requests[1]).toContain('Captures scope');
    expect(app.db.prepare('SELECT box FROM review_cards WHERE question_id = ?').get(id)).toEqual({ box: 0 });
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
