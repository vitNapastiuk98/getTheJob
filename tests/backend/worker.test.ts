import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

async function execute(code: string, mode: 'run' | 'tests', tests: { code: string }[] = [], entryPoint = 'double') {
  const events: unknown[] = [];
  const source = readFileSync(new URL('../../frontend/src/sandbox/worker.js', import.meta.url), 'utf8');
  let handler: ((event: unknown) => Promise<void>) | undefined;
  runInNewContext(`${source.replaceAll('export function ', 'function ')}\nregisterWorker();`, { console: {}, addEventListener: (_name: string, callback: typeof handler) => { handler = callback; } });
  if (!handler) throw new Error('Worker did not register handler');
  await handler({ data: { entryPoint, fixture: '4', code, mode, tests }, ports: [{ postMessage: (event: unknown) => events.push(event) }] });
  return events;
}

it('runs a solution with the fixture and serializes console output safely', async () => {
  expect(await execute('function double(n) { const a = {}; a.a = a; console.warn(2n, a); return n * 2; }', 'run')).toEqual([
    { type: 'log', level: 'warn', text: '"2n" {"a":"[Circular]"}' },
    { type: 'result', text: '8' },
  ]);
});

it('runs free-form answer code without an entry point and reports console output', async () => {
  expect(await execute('console.log("sum", 2 + 2);', 'run', [], '')).toEqual([
    { type: 'log', level: 'log', text: 'sum 4' },
    { type: 'result', text: 'undefined' },
  ]);
});

it('runs tests against shared solution definitions and reports pass and failure independently', async () => {
  const tests = [{ code: 'assertEqual(double(fixture), 8);' }, { code: 'assertEqual(double(1), 7, "wrong result");' }];
  expect(await execute('function double(n) { return n * 2; }', 'tests', tests)).toEqual([
    { type: 'test', index: 0, passed: true, text: '' },
    { type: 'test', index: 1, passed: false, text: 'Error: wrong result' },
    { type: 'result', text: 'Tests finished' },
  ]);
});
