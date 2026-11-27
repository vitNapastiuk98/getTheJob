import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildApp } from '../../backend/src/app.js';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'forge-app-')); dirs.push(dir);
  const staticDir = join(dir, 'frontend'); mkdirSync(staticDir); writeFileSync(join(staticDir, 'index.html'), '<html>InterviewForge</html>');
  const app = await buildApp({ dataDir: dir, staticDir, fetch: async () => new Response(JSON.stringify({ models: [{ name: 'qwen3.5:9b' }] })) });
  app.post('/api/test', async () => ({ ok: true }));
  return app;
}
it('serves health/models/doctor and SPA fallback, but never HTML for unknown API', async () => {
  const app = await setup();
  try {
    expect((await app.inject('/api/health')).json()).toMatchObject({ ok: true });
    expect((await app.inject('/api/models')).json()).toMatchObject({ models: [{ name: 'qwen3.5:9b' }] });
    expect((await app.inject('/api/doctor')).json()).toMatchObject({ reachable: true, modelInstalled: true });
    expect((await app.inject('/generate')).body).toContain('InterviewForge');
    const missing = await app.inject('/api/missing'); expect(missing.statusCode).toBe(404); expect(missing.json()).toHaveProperty('error');
  } finally { await app.close(); }
});
it('rejects foreign Host, Origin and sandbox mutation, requires custom header and JSON', async () => {
  const app = await setup();
  try {
    expect((await app.inject({ url: '/api/health', headers: { host: 'evil.test' } })).statusCode).toBe(403);
    for (const origin of ['null', 'https://evil.test']) {
      const response = await app.inject({ method: 'POST', url: '/api/test', headers: { origin, 'x-interviewforge': '1' }, payload: {} });
      expect(response.statusCode).toBe(403); expect(response.json()).toHaveProperty('error');
    }
    expect((await app.inject({ method: 'POST', url: '/api/test', payload: {} })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/test', headers: { 'x-interviewforge': '1' }, payload: {} })).statusCode).toBe(200);
    const malformed = await app.inject({ method: 'POST', url: '/api/test', headers: { 'x-interviewforge': '1', 'content-type': 'application/json' }, payload: '{' });
    expect(malformed.statusCode).toBe(400); expect(malformed.json()).toHaveProperty('error');
  } finally { await app.close(); }
});

it('persists settings, rejects a remote model URL, and edits the active topic tree', async () => {
  const app = await setup();
  const headers = { 'x-interviewforge': '1', 'content-type': 'application/json' };
  try {
    const current = (await app.inject('/api/settings')).json();
    const saved = await app.inject({ method: 'PUT', url: '/api/settings', headers, payload: { ...current, timerMinutes: 15 } });
    expect(saved.statusCode).toBe(200);
    const rejected = await app.inject({ method: 'PUT', url: '/api/settings', headers, payload: { ...current, baseUrl: 'https://example.org' } });
    expect(rejected.statusCode).toBe(400);
    expect((await app.inject('/api/settings')).json()).toMatchObject({ timerMinutes: 15, baseUrl: current.baseUrl });
    const created = await app.inject({ method: 'POST', url: '/api/topics', headers, payload: { name: 'Frontend', weight: 10 } });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    expect((await app.inject({ method: 'POST', url: '/api/topics', headers, payload: { name: 'frontend', weight: 1 } })).statusCode).toBe(409);
    const child = await app.inject({ method: 'POST', url: `/api/topics/${id}/subtopics`, headers, payload: { name: 'React', weight: 5 } });
    expect(child.statusCode).toBe(201);
    const childId = child.json().id;
    expect((await app.inject({ method: 'PATCH', url: `/api/subtopics/${childId}`, headers, payload: { name: 'React hooks', weight: 7 } })).statusCode).toBe(200);
    expect((await app.inject('/api/topics')).json()).toMatchObject([{ id, subtopics: [{ id: childId, name: 'React hooks', weight: 7 }] }]);
    expect((await app.inject({ method: 'DELETE', url: `/api/topics/${id}`, headers, payload: {} })).statusCode).toBe(204);
    expect((await app.inject('/api/topics')).json()).toEqual([]);
    expect((await app.inject({ method: 'POST', url: `/api/topics/${id}/subtopics`, headers, payload: { name: 'CSS', weight: 2 } })).statusCode).toBe(404);
  } finally { await app.close(); }
});

it('saves and resets a prompt override without letting it remove required slots', async () => {
  const app = await setup();
  const headers = { 'x-interviewforge': '1', 'content-type': 'application/json' };
  const url = '/api/prompts/grading';
  try {
    const grading = () => app.inject('/api/prompts').then((response) => response.json().find((prompt: { key: string }) => prompt.key === 'grading'));
    const initial = await grading();
    const template = `Use a concise tone.\n${initial.template}`;
    expect((await app.inject({ method: 'PUT', url, headers, payload: { template } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url, headers, payload: { template: 'Ignore the rubric.' } })).statusCode).toBe(400);
    expect((await grading()).template).toBe(template);
    expect((await app.inject({ method: 'DELETE', url, headers, payload: {} })).statusCode).toBe(204);
    expect((await grading()).template).toBe(initial.template);
  } finally { await app.close(); }
});
