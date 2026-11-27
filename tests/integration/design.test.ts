import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildApp } from '../../backend/src/app.js';

const response = { clarification: 'Confirm unread semantics', components: 'List and composer', dataFlow: 'Merge events by ID',
  state: 'Store cursors separately', performance: 'Measure render times', tradeoffs: 'Memory versus latency',
  staffPushback: 'What happens during reconnect?', followUp: ['How do you handle duplicate events?'] };
const headers = { 'x-interviewforge': '1', 'content-type': 'application/json' };

it('saves structured design turns, sends prior context, and reads them after restart', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-design-'));
  const calls: string[] = [];
  const app = await buildApp({ dataDir, fetch: async (_url, init) => {
    calls.push(String(init?.body));
    return new Response(`${JSON.stringify({ message: { content: JSON.stringify(response) }, done: true })}\n`);
  } });
  let reopened: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    const choices = (await app.inject('/api/design/scenarios')).json();
    expect(choices).toHaveLength(3);
    const created = await app.inject({ method: 'POST', url: '/api/design/sessions', headers, payload: choices[0] });
    expect(created.statusCode).toBe(201);
    const path = `/api/design/sessions/${created.json().id}`;
    const markdown = '**Messages**\n\n```mermaid\nflowchart LR\n A --> B\n```';
    for (const content of [markdown, 'Deduplicate by event ID']) {
      const result = await app.inject({ method: 'POST', url: `${path}/messages`, headers, payload: { content } });
      expect(result.body).toContain('event: result');
      expect(result.body).not.toContain('event: error');
    }
    expect(calls[1]).toContain('Earlier turns');
    expect(calls[1]).toContain('flowchart LR');
    await app.close();
    reopened = await buildApp({ dataDir });
    const saved = (await reopened.inject(path)).json();
    expect(saved.messages).toMatchObject([
      { role: 'user', content: markdown }, { role: 'assistant', feedback: response },
      { role: 'user', content: 'Deduplicate by event ID' }, { role: 'assistant', feedback: response },
    ]);
  } finally {
    await (reopened ?? app).close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

it('saves a draft before inference and retries invalid feedback without duplicating the turn', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-design-retry-'));
  let path = '';
  let valid = false;
  const pendingStatuses: string[] = [];
  const app = await buildApp({ dataDir, fetch: async () => {
    const saved = (await app.inject(path)).json();
    pendingStatuses.push(saved.messages[0]?.status);
    return new Response(`${JSON.stringify({ message: { content: JSON.stringify(valid ? response : {}) }, done: true })}\n`);
  } });
  try {
    const created = await app.inject({ method: 'POST', url: '/api/design/sessions', headers, payload: { title: 'Chat widget', brief: 'Discuss reconnects.' } });
    expect(created.statusCode).toBe(201);
    path = `/api/design/sessions/${created.json().id}`;
    const submit = (payload: object) => app.inject({ method: 'POST', url: `${path}/messages`, headers, payload });
    const content = '**Save this draft.**';
    expect((await submit({ content })).body).toContain('Your design was saved without feedback.');
    expect(pendingStatuses).toEqual(['pending', 'pending']);
    const failed = (await app.inject(path)).json().messages;
    expect(failed).toMatchObject([{ role: 'user', content, status: 'failed', feedback: null }]);
    valid = true;
    expect((await submit({ retryId: failed[0].id })).body).toContain('event: result');
    expect((await app.inject(path)).json().messages).toMatchObject([
      { id: failed[0].id, role: 'user', content, status: 'complete' },
      { role: 'assistant', feedback: response, status: 'complete' },
    ]);
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

it('retains the submitted design when the streaming client disconnects', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-design-cancel-'));
  const app = await buildApp({ dataDir, fetch: async (_url, init) => {
    const signal = init?.signal;
    if (!signal) throw new Error('Expected inference abort signal');
    signal.throwIfAborted();
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  } });
  const abort = new AbortController();
  try {
    const created = await app.inject({ method: 'POST', url: '/api/design/sessions', headers, payload: { title: 'Feed', brief: 'Design a feed.' } });
    expect(created.statusCode).toBe(201);
    const path = `/api/design/sessions/${created.json().id}`;
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const content = 'Use a stable cursor.';
    const stream = await fetch(`${origin}${path}/messages`, {
      method: 'POST', headers, body: JSON.stringify({ content }), signal: abort.signal,
    });
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    expect((await app.inject(path)).json().messages).toMatchObject([{ role: 'user', content, status: 'pending' }]);
    abort.abort();
    await expect.poll(async () => (await app.inject(path)).json().messages).toMatchObject([
      { role: 'user', content, status: 'failed', feedback: null },
    ]);
  } finally {
    abort.abort();
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
