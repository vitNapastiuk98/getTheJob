import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { LlmEvent, LlmResult, Settings } from "../shared/contracts.js";
import { localModelReference, localOllamaUrl } from '../config/config.utils.js';
import { extractJson, MAX_RESPONSE_BYTES } from '../utils/json.js';

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
interface GenerateOptions<T> {
  settings: Settings; messages: ChatMessage[]; schema: z.ZodType<T>; signal?: AbortSignal;
  requestId?: string; onEvent?: (event: LlmEvent) => void; model?: string;
}

@Injectable()
export class OllamaService {
  private dataDir: string;
  private readonly timeoutMs = 120_000;

  constructor(private configService: ConfigService) {
    this.dataDir = this.configService.get<string>('DATA_DIR', join(process.cwd(), 'data'));
  }

  private async request(settings: Settings, path: string, body: unknown, requestId: string, attempt: number,
    signal?: AbortSignal, onToken?: (content: string) => void): Promise<string> {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason ?? new Error('Canceled'));
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('Ollama request timed out')), this.timeoutMs);
    let raw = ''; let content = ''; let emitted = false; let outcome = 'error'; let failure: string | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const started = Date.now(); const url = new URL(path, localOllamaUrl(settings.baseUrl));
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
    try {
      const response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, redirect: 'error',
      });
      if (!response.body) throw new Error('Ollama response body is empty');
      reader = response.body.getReader();
      const decoder = new TextDecoder(); let buffered = ''; let done = false; let bytes = 0;
      const parseLine = (line: string) => {
        if (!line.trim()) return;
        const value: unknown = JSON.parse(line);
        if (typeof value !== 'object' || !value) throw new Error('Invalid Ollama stream event');
        const item = value as { error?: string; done?: boolean; message?: { content?: string } };
        if (item.error) throw new Error(`Ollama: ${item.error}`);
        if (typeof item.message?.content === 'string' && item.message.content) {
          emitted = true; content += item.message.content; onToken?.(item.message.content);
        }
        if (item.done === true) done = true;
      };
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new Error('Ollama response is too large');
        const part = decoder.decode(chunk.value, { stream: true }); raw += part;
        if (onToken && response.ok) {
          buffered += part;
          let newline: number;
          while ((newline = buffered.indexOf('\n')) >= 0) { parseLine(buffered.slice(0, newline)); buffered = buffered.slice(newline + 1); }
          if (done) break;
        }
      }
      const tail = decoder.decode(); raw += tail; buffered += tail;
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${raw.slice(0, 500)}`);
      if (onToken) {
        if (buffered.trim() && !done) parseLine(buffered);
        if (!done) throw new Error('Ollama stream ended without completion');
      }
      controller.signal.throwIfAborted(); outcome = 'complete'; return onToken ? content : raw;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      if (signal?.aborted) throw signal.reason ?? new Error('Canceled');
      throw error;
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      await reader?.cancel().catch(() => {});
      const logs = join(this.dataDir, 'logs'); await mkdir(logs, { recursive: true, mode: 0o700 });
      await writeFile(join(logs, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({
        requestId, attempt, url: url.href, request: body ?? { method: 'GET' }, response: raw,
        outcome, error: failure, elapsedMs: Date.now() - started,
      }), { mode: 0o600, flag: 'wx' });
    }
  }

  async models(settings: Settings, signal?: AbortSignal): Promise<{ name: string }[]> {
    const requestId = randomUUID();
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await this.request(settings, '/api/tags', undefined, requestId, attempt, signal);
        const { models } = z.object({
          models: z.array(z.object({
            name: z.string(), remote_host: z.string().optional(), remote_model: z.string().optional(),
          })).max(500),
        }).parse(JSON.parse(text));
        return models.filter(({ remote_host, remote_model }) => !remote_host && !remote_model).map(({ name }) => ({ name }));
      } catch (error) {
        if (signal?.aborted || attempt >= 2) throw error;
      }
    }
    return [];
  }

  async generate<T>(input: GenerateOptions<T>): Promise<LlmResult<T>> {
    const model = localModelReference(input.model ?? input.settings.model);
    const requestId = input.requestId ?? randomUUID(); let attempt = 0; let repaired = false;
    let messages = input.messages;
    while (true) {
      input.signal?.throwIfAborted(); attempt++;
      const emit = (type: LlmEvent['type'], payload: unknown) => input.onEvent?.({ type, requestId, attempt, payload });
      emit('status', { message: repaired ? 'Repairing model output…' : 'Waiting for local model…' });
      const body = {
        model, messages, stream: true, think: false, format: z.toJSONSchema(input.schema), keep_alive: '30m',
        options: { temperature: input.settings.temperature, num_ctx: input.settings.numCtx, ...(input.settings.seed === null ? {} : { seed: input.settings.seed }) },
      };
      let raw: string;
      try {
        raw = await this.request(input.settings, '/api/chat', body, requestId, attempt, input.signal, (token) => emit('token', { text: token }));
      } catch (error) {
        if (input.signal?.aborted) throw error;
        throw error;
      }
      try {
        const data = input.schema.parse(extractJson(raw)); input.signal?.throwIfAborted(); return { ok: true, data };
      } catch (error) {
        if (input.signal?.aborted) throw error;
        if (repaired) {
          const warning = 'The model returned invalid structured output twice. Nothing was saved.';
          emit('warning', { warning, raw }); return { ok: false, raw, warning };
        }
        repaired = true; emit('retry', { reason: 'schema', reset: true });
        const errorMsg = error instanceof Error ? error.message : String(error);
        messages = [...input.messages, { role: 'assistant', content: raw }, { role: 'user', content: `Return only JSON matching the required schema. Fix this validation error: ${errorMsg.slice(0, 2000)}` }];
      }
    }
  }
}
