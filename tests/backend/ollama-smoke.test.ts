import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildApp } from '../../backend/src/app.js';
import { getSettings, saveSettings } from '../../backend/src/db.js';
import { seedDatabase } from '../../backend/src/seed.js';

it.skipIf(process.env.SKIP_OLLAMA_SMOKE === '1')('streams a question from real local Ollama and reads it back', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-real-ollama-'));
  const app = await buildApp({ dataDir });
  try {
    const settings = getSettings(app.db);
    const models = await app.ollama.models(settings);
    const model = process.env.OLLAMA_SMOKE_MODEL ?? settings.model;
    if (!models.some(({ name }) => name === model)) throw new Error(`Local model ${model} is missing; pull it or set OLLAMA_SMOKE_MODEL to an installed model.`);
    saveSettings(app.db, { ...settings, model, temperature: 0 });
    seedDatabase(app.db);
    const result = await app.inject({ method: 'POST', url: '/api/questions/generate', headers: { 'x-interviewforge': '1' },
      payload: { type: 'conceptual', topicId: 'js-fundamentals', difficulty: 'easy', count: 1 } });
    expect(result.statusCode).toBe(200);
    const events = result.body.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)));
    const event = events.find((entry) => entry.type === 'result');
    expect(event, result.body.slice(-3000)).toBeDefined();
    const [{ id, prompt }] = event.payload;
    expect(prompt).toBeTruthy();
    const persisted = await app.inject(`/api/questions/${id}`);
    expect(persisted.statusCode).toBe(200);
    expect(persisted.json()).toMatchObject({ id, prompt, topicId: 'js-fundamentals' });
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}, 370_000);
