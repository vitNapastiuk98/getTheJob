import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../../backend/src/app.js';
import { getSettings, saveSettings } from '../../backend/src/db.js';
import { seedDatabase } from '../../backend/src/seed.js';
import { saveGradedAttempt } from '../../backend/src/routes/questions.js';

const base = {
  answer: 'Explain the engineering trade-off.', expectedKeyPoints: [{ id: 'core', text: 'Explain the reasoning', weight: 1 }],
  hints: ['Consider the trade-off.'], followUp: 'How would you measure it?', exercise: null,
};
const conceptual = { ...base, prompt: 'Why do React keys need to be stable?', answer: 'Keys identify list items between renders.' };
const coding = { ...base, prompt: 'Implement double(n).', exercise: {
  runtime: 'js', entryPoint: 'double', starterCode: 'function double(n) { return 0; }', fixture: '4',
  tests: [{ name: 'Fixture case', code: 'assertEqual(double(fixture), 8);' }],
} };
const domExercise = { ...coding, prompt: 'Style the button.', exercise: {
  runtime: 'dom', entryPoint: 'styleButton', starterCode: 'function styleButton() {}', fixture: '<button>Save</button>',
  tests: [{ name: 'Uses the browser document', code: 'styleButton(fixture); assertEqual(window.getComputedStyle(document.querySelector("button")).color, "rgb(0, 0, 255)");' }],
} };
const reactExercise = { ...coding, prompt: 'Render a named button.', exercise: {
  runtime: 'react', entryPoint: 'NamedButton', starterCode: 'function NamedButton() { return null; }', fixture: '<div id="root"></div>',
  tests: [{ name: 'Uses the name prop', code: 'const target = render(NamedButton, { name: "LedgerFlow" }); assertEqual(target.querySelector("button")?.textContent, "LedgerFlow");' }],
} };
const grade = { points: [{ id: 'core', status: 'met', evidence: 'Keys identify the same item', explanation: 'Explains stable identity.' }],
  followUp: 'What changes with index keys?', seniorAddition: 'Discuss retained component state.' };
const review = { quality: 'Clear entry point', complexity: 'Constant time', naming: 'Descriptive name', comments: [{ line: 1, message: 'Good entry point.' }] };
const design = { clarification: 'Confirm unread semantics', components: 'List and composer', dataFlow: 'Merge events by ID', state: 'Persist cursors',
  performance: 'Measure rendering', tradeoffs: 'Memory versus latency', staffPushback: 'Consider reconnects', followUp: ['How do you handle duplicate events?'] };
const dataDir = await mkdtemp(join(tmpdir(), 'interviewforge-e2e-'));
const app = await buildApp({ dataDir });
let cancelFixtureStarted = false;
const fake = createServer(async (request, reply) => {
  if (request.url === '/api/tags') { reply.end(JSON.stringify({ models: [{ name: 'fixture:local' }] })); return; }
  let body = '';
  for await (const chunk of request) body += String(chunk);
  if (body.includes('Cancel this design review') && !cancelFixtureStarted) {
    cancelFixtureStarted = true;
    reply.writeHead(200, { 'content-type': 'application/x-ndjson' });
    reply.write(`${JSON.stringify({ message: { content: '{' }, done: false })}\n`);
    return;
  }
  let value: unknown = [conceptual];
  if (body.includes('Review the candidate')) value = review;
  else if (body.includes('Target runtime: js')) value = [coding];
  else if (body.includes('Target runtime: dom')) value = [domExercise];
  else if (body.includes('Target runtime: react')) value = [reactExercise];
  else if (body.includes('Grade the candidate')) value = grade;
  else if (body.includes('current design')) value = body.includes('Draft for failed feedback') ? {} : design;
  else if (body.includes('Sipwise') && body.includes('Frontend Developer') && body.includes('telecom web applications') && body.includes('LedgerFlow')) {
    value = [{ ...base, prompt: 'How did you handle LedgerFlow incident response?' }];
  }
  else if (body.includes('cover letter') || body.includes('Cover letter')) {
    value = 'Dear Hiring Manager, I am excited about the Frontend Developer role at Acme Corp. My experience with React and TypeScript aligns perfectly with your requirements. Best regards, Candidate';
  }
  reply.setHeader('content-type', 'application/x-ndjson');
  reply.end(`${JSON.stringify({ message: { content: JSON.stringify(value) }, done: true })}\n`);
});
function stopModel() {
  return new Promise<void>((resolve, reject) => fake.close((error) => error ? reject(error) : resolve()));
}
try {
  await new Promise<void>((resolve, reject) => { fake.once('error', reject); fake.listen(0, '127.0.0.1', resolve); });
  const address = fake.address();
  if (!address || typeof address === 'string') throw new Error('Fixture model did not bind');
  saveSettings(app.db, { ...getSettings(app.db), baseUrl: `http://127.0.0.1:${address.port}`, model: 'fixture:local' });
  seedDatabase(app.db);
  if (process.env.INTERVIEWFORGE_E2E_SEED_SCORES === '1') {
    saveGradedAttempt(app.db, { requestId: randomUUID(), answer: 'Fixture answer', hintCount: 0 }, 'sample-closures',
      { score: 3, points: [], missingKeyPoints: [], followUp: 'How would you fix it?', seniorAddition: 'Consider scope.' }, null);
  }
  await app.listen({ host: '127.0.0.1', port: Number(process.env.INTERVIEWFORGE_E2E_PORT ?? 47832) });
} catch (error) {
  await app.close();
  if (fake.listening) await stopModel();
  await rm(dataDir, { recursive: true, force: true });
  throw error;
}
async function close() {
  await app.close();
  await stopModel();
  await rm(dataDir, { recursive: true, force: true });
  console.log('Fixture app, model, and temporary data removed.');
}
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
