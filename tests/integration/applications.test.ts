import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildApp } from '../../backend/src/app.js';

const headers = { 'x-interviewforge': '1', 'content-type': 'application/json' };
const coverLetter = 'Dear Hiring Manager,\n\nI am excited about the Frontend Developer role at Acme Corp. My experience with React and TypeScript aligns perfectly with your requirements.\n\nBest regards,\nCandidate';

it('creates an application, generates a cover letter, and retrieves it', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-applications-'));
  const app = await buildApp({ dataDir, fetch: async () => {
    const chunks = [
      JSON.stringify({ message: { content: '"Dear Hiring Manager,\\n\\nI am excited about the Frontend Developer role at Acme Corp. My experience with React and TypeScript aligns perfectly with your requirements.\\n\\nBest regards,\\nCandidate"' }, done: false }) + '\n',
      JSON.stringify({ message: { content: '' }, done: true }) + '\n',
    ];
    return new Response(chunks.join(''));
  } });
  try {
    const list = await app.inject('/api/applications');
    expect(list.json()).toHaveLength(0);

    const created = await app.inject({
      method: 'POST', url: '/api/applications', headers,
      payload: { jobTitle: 'Frontend Developer', company: 'Acme Corp', jobDescription: 'Build React apps.', userInput: '5 years React experience.' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;

    const generate = await app.inject({ method: 'POST', url: `/api/applications/${id}/generate`, headers, payload: {} });
    expect(generate.body).toContain('event: result');
    expect(generate.body).toContain(JSON.stringify(coverLetter));

    const retrieved = await app.inject(`/api/applications/${id}`);
    expect(retrieved.json()).toMatchObject({ id, coverLetter, jobTitle: 'Frontend Developer' });

    const all = await app.inject('/api/applications');
    expect(all.json()).toHaveLength(1);
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

it('retrieves successful examples when generating a new cover letter', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-applications-learning-'));
  const calls: string[] = [];
  const app = await buildApp({ dataDir, fetch: async (_url, init) => {
    calls.push(String(init?.body));
    const chunks = [
      JSON.stringify({ message: { content: JSON.stringify(coverLetter) }, done: false }) + '\n',
      JSON.stringify({ message: { content: '' }, done: true }) + '\n',
    ];
    return new Response(chunks.join(''));
  } });
  try {
    const first = await app.inject({
      method: 'POST', url: '/api/applications', headers,
      payload: { jobTitle: 'React Developer', company: 'TechCo', jobDescription: 'Build UIs.', userInput: 'React expert.' },
    });
    const firstId = first.json().id;
    await app.inject({ method: 'POST', url: `/api/applications/${firstId}/generate`, headers, payload: {} });
    await app.inject({
      method: 'PATCH', url: `/api/applications/${firstId}`, headers,
      payload: { successful: true, feedback: 'Emphasized React hooks experience.' },
    });

    const second = await app.inject({
      method: 'POST', url: '/api/applications', headers,
      payload: { jobTitle: 'TypeScript Developer', company: 'DataCo', jobDescription: 'Build data tools.', userInput: 'TypeScript expert.' },
    });
    const secondId = second.json().id;
    await app.inject({ method: 'POST', url: `/api/applications/${secondId}/generate`, headers, payload: {} });

    expect(calls[1]).toContain('Emphasized React hooks experience.');
    expect(calls[1]).toContain(coverLetter.replace(/\n/g, '\\n'));
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

it('validates required fields when creating an application', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-applications-validation-'));
  const app = await buildApp({ dataDir });
  try {
    const result = await app.inject({
      method: 'POST', url: '/api/applications', headers,
      payload: { jobTitle: '', company: 'Test', jobDescription: 'Test' },
    });
    expect(result.statusCode).toBe(400);
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

it('uses selected model when generating cover letter', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-applications-model-'));
  const models: string[] = [];
  const app = await buildApp({ dataDir, fetch: async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    models.push(body.model);
    return new Response(`${JSON.stringify({ message: { content: JSON.stringify('Test cover letter'), done: true } })}\n`);
  } });
  try {
    const created = await app.inject({
      method: 'POST', url: '/api/applications', headers,
      payload: { jobTitle: 'Developer', company: 'TestCo', jobDescription: 'Code.', userInput: 'Skills.' },
    });
    const id = created.json().id;
    
    await app.inject({
      method: 'POST', url: `/api/applications/${id}/generate`, headers,
      payload: { model: 'custom-model:latest' },
    });
    
    expect(models[0]).toBe('custom-model:latest:local');
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
