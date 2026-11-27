import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildApp } from '../../backend/src/app.js';
import { streamReply } from '../../backend/src/sse.js';

it('streams result/error/done and aborts upstream when the browser disconnects', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'forge-sse-')); const app = await buildApp({ dataDir: dir });
  let disconnected = false;
  app.post('/api/stream', async (request, reply) => streamReply(request, reply, async (_signal, emit, requestId) => {
    emit({ type: 'token', requestId, attempt: 1, payload: { text: 'test' } }); return { ok: true };
  }));
  app.post('/api/failure', async (request, reply) => streamReply(request, reply, async () => { throw new Error('Test failure'); }));
  app.post('/api/slow', async (request, reply) => streamReply(request, reply, async (signal, emit, requestId) => {
    emit({ type: 'status', requestId, attempt: 1, payload: { message: 'Waiting' } });
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => { disconnected = true; resolve(); }, { once: true }));
  }));
  try {
    const headers = { 'x-interviewforge': '1', 'content-type': 'application/json' };
    const normal = await app.inject({ method: 'POST', url: '/api/stream', headers, payload: {} });
    expect(normal.headers['content-type']).toContain('text/event-stream');
    for (const event of ['token', 'result', 'done']) expect(normal.body).toContain(`event: ${event}`);
    const failure = await app.inject({ method: 'POST', url: '/api/failure', headers, payload: {} });
    expect(failure.body).toContain('event: error'); expect(failure.body).toContain('Test failure'); expect(failure.body).toContain('event: done');
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const controller = new AbortController();
    const response = await fetch(`${origin}/api/slow`, { method: 'POST', headers, body: '{}', signal: controller.signal });
    const reader = response.body!.getReader(); await reader.read(); controller.abort();
    await expect.poll(() => disconnected).toBe(true);
    await reader.cancel().catch(() => {});
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});
