import { expect, it } from 'vitest';
import { SettingsSchema, DEFAULT_SETTINGS } from '../../shared/contracts.js';
import { localOllamaUrl } from '../../backend/src/config.js';
it('validates local-only URLs and rejects credentials, redirects-to-host paths and remote hosts', () => {
  expect(localOllamaUrl('http://localhost:11434/')).toBe('http://localhost:11434');
  expect(localOllamaUrl('http://[::1]:11434')).toBe('http://[::1]:11434');
  for (const url of ['https://evil.test', 'http://127.0.0.1.evil.test', 'file:///tmp/a', 'http://user:pass@localhost', 'http://localhost/path', 'http://localhost?x=1']) expect(() => localOllamaUrl(url)).toThrow();
});
it('enforces finite bounded settings and nonempty difficulty mix', () => {
  expect(SettingsSchema.parse(DEFAULT_SETTINGS).numCtx).toBe(16384);
  for (const patch of [{ numCtx: 2 }, { temperature: 8 }, { difficulty: { easy: 0, medium: 0, hard: 0 } }, { model: '' }]) expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...patch }).success).toBe(false);
});
