import type { LlmEvent } from '../../shared/contracts.js';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}

async function request(path: string, method: string, body: unknown, signal: AbortSignal | undefined): Promise<Response> {
  const response = await fetch(`/api${path}`, {
    method, signal,
    ...(method !== 'GET' ? { headers: { 'content-type': 'application/json', 'x-interviewforge': '1' }, body: JSON.stringify(body ?? {}) } : {}),
  });
  if (!response.ok) {
    const failure = await response.json() as { error?: string };
    throw new Error(failure.error ?? `Request failed (${response.status})`);
  }
  return response;
}

export async function api<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await request(path, method, body, signal);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export async function stream<T>(path: string, body: unknown, signal: AbortSignal, onEvent: (event: LlmEvent) => void): Promise<T> {
  const response = await request(path, 'POST', body, signal);
  const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
  if (!reader) throw new Error('No response stream');
  let buffer = '';
  let result: T | undefined;
  let complete = false;
  try {
    while (!complete) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += chunk.value;
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const line = buffer.slice(0, end).split('\n').find((item) => item.startsWith('data: '));
        buffer = buffer.slice(end + 2);
        if (!line) continue;
        const event = JSON.parse(line.slice(6)) as LlmEvent;
        onEvent(event);
        if (event.type === 'error') throw new Error((event.payload as { error: string }).error);
        if (event.type === 'result') result = event.payload as T;
        if (event.type === 'done') complete = true;
      }
    }
    if (!complete || result === undefined) throw new Error('No valid result was saved. See the model-response warning for the raw output.');
    return result;
  } finally { await reader.cancel().catch(() => undefined); }
}
