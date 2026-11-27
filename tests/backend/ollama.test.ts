import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { OllamaClient } from '../../backend/src/ollama.js';
import { DEFAULT_SETTINGS, type LlmEvent } from '../../shared/contracts.js';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function setup(fetcher: typeof fetch, timeoutMs = 2000) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-llm-')); dirs.push(dir);
  return { dir, client: new OllamaClient({ dataDir: dir, fetch: fetcher, timeoutMs }) };
}
function response(content: string) {
  const raw = JSON.stringify({ message: { content }, done: false }) + '\n' + JSON.stringify({ done: true }) + '\n';
  const bytes = new TextEncoder().encode(raw);
  return new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } }));
}
const schema = z.object({ answer: z.string() });
const input = { settings: DEFAULT_SETTINGS, messages: [{ role: 'user' as const, content: 'JSON please' }], schema };
it('decodes split UTF8 NDJSON, emits tokens and logs raw request/response', async () => {
  let body: Record<string, unknown> = {};
  const { client, dir } = setup(async (_url, init) => { body = JSON.parse(String(init?.body)); return response('{"answer":"é"}'); });
  const events: LlmEvent[] = []; const result = await client.generate({ ...input, onEvent: (event) => { events.push(event); } });
  expect(result).toEqual({ ok: true, data: { answer: 'é' } });
  expect(body.keep_alive).toBe('30m'); expect(body.options).toMatchObject({ num_ctx: 16384 });
  expect(events.some((event) => event.type === 'token')).toBe(true);
  const logs = readdirSync(join(dir, 'logs')); expect(logs).toHaveLength(1);
  const log = JSON.parse(readFileSync(join(dir, 'logs', logs[0]), 'utf8'));
  expect(log.request.model).toBe(`${DEFAULT_SETTINGS.model}:local`); expect(log.response).toContain('content');
});
it.each(['gpt-oss:120b-cloud', 'gpt-oss:120b:cloud', 'gpt-oss:120b-cloud:local'])('never sends prompt data for cloud model %s', async (model) => {
  const requests: string[] = [];
  const { client } = setup(async (_url, init) => { requests.push(String(init?.body)); return response('{}'); });
  await expect(client.generate({ ...input, settings: { ...input.settings, model } })).rejects.toThrow(/Cloud models are not supported/);
  expect(requests).toEqual([]);
});
it('retries transport before tokens once, but never retries partial output', async () => {
  let calls = 0;
  const { client } = setup(async () => { if (++calls === 1) throw new Error('network'); return response('{"answer":"ok"}'); });
  expect((await client.generate(input)).ok).toBe(true); expect(calls).toBe(2);
  let partialCalls = 0;
  const partial = setup(async () => { partialCalls++; return new Response('{"message":{"content":"hello"}}\n'); });
  await expect(partial.client.generate(input)).rejects.toThrow(/ended|completion/i); expect(partialCalls).toBe(1);
});
it('repairs schema once then returns raw warning, never an invalid result', async () => {
  let calls = 0; const events: LlmEvent[] = [];
  const { client } = setup(async () => { calls++; return response('{"wrong":1}'); });
  const result = await client.generate({ ...input, onEvent: (event) => { events.push(event); } });
  expect(calls).toBe(2); expect(result.ok).toBe(false); expect(events.some((event) => event.type === 'warning')).toBe(true);
});
it('cancels without retry and times out a stalled response', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const { client } = setup(async () => { calls++; return response('{}'); });
  await expect(client.generate({ ...input, signal: controller.signal })).rejects.toThrow(); expect(calls).toBe(0);
  const stalled = setup(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  }), 15);
  await expect(stalled.client.generate(input)).rejects.toThrow(/timed out/i);
});
it('aborts active transport without retry and logs the terminal failure', async () => {
  const abort = new AbortController(); let calls = 0;
  const { client, dir } = setup(async (_url, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      setTimeout(() => abort.abort(new Error('User canceled')), 5);
    });
  });
  await expect(client.generate({ ...input, signal: abort.signal })).rejects.toThrow('User canceled');
  expect(calls).toBe(1); expect(readdirSync(join(dir, 'logs'))).toHaveLength(1);
});
it('does not retry client errors or excessive responses', async () => {
  let calls = 0;
  const { client } = setup(async () => { calls++; return new Response('model missing', { status: 404 }); });
  await expect(client.generate(input)).rejects.toThrow('404'); expect(calls).toBe(1);
  const huge = setup(async () => new Response('x'.repeat(2_097_153)));
  await expect(huge.client.generate(input)).rejects.toThrow(/too large/);
});
