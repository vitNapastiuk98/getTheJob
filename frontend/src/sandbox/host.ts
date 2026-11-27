import { z } from 'zod';
import type { GeneratedQuestion } from '../../../shared/contracts.js';
import workerSource from './worker.js?raw';

const Message = z.discriminatedUnion('type', [
  z.object({ type: z.literal('log'), level: z.enum(['log', 'warn', 'error']), text: z.string().max(1200) }),
  z.object({ type: z.literal('test'), index: z.number().int().min(0).max(19), passed: z.boolean(), text: z.string().max(1200) }),
  z.object({ type: z.enum(['result', 'error']), text: z.string().max(1200) }),
]);
export type RunEvent = z.infer<typeof Message>;
export type Exercise = NonNullable<GeneratedQuestion['exercise']>;

const jsSource = `${workerSource.replaceAll('export function ', 'function ')}\nregisterWorker();`;
const broker = (worker: string) => `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<script>
addEventListener('message', (event) => {
  if (event.source !== parent || !event.ports[0]) return;
  const port = event.ports[0];
  const url = URL.createObjectURL(new Blob([${JSON.stringify(worker).replaceAll('<', '\\u003c')}], {type:'text/javascript'}));
  const worker = new Worker(url);
  const channel = new MessageChannel();
  const finish = () => { clearTimeout(timer); channel.port1.close(); worker.terminate(); URL.revokeObjectURL(url); port.close(); };
  const timer = setTimeout(() => { port.postMessage({type:'error', text:'Timed out after 3 s'}); finish(); }, 3000);
  worker.onerror = () => { port.postMessage({type:'error',text:'The isolated worker could not run'}); finish(); };
  channel.port1.onmessage = ({data}) => {
    port.postMessage(data);
    if (data.type === 'result' || data.type === 'error') finish();
  };
  worker.postMessage(event.data, [channel.port2]);
}, {once:true});
</script>`;
const domBroker = (runner: string) => `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<script>
addEventListener('message', (event) => {
  if (event.source !== parent || !event.ports[0]) return;
  const port = event.ports[0];
  try {
    const run = new Function(${JSON.stringify(`${runner}\nreturn globalThis.runDomExercise;`).replaceAll('<', '\\u003c')})();
    run(event);
  } catch (error) {
    port.postMessage({type:'error', text: error instanceof Error ? error.message : 'The isolated runner could not run'});
  }
}, {once:true});
</script>`;

const snippetExercise: Exercise = { runtime: 'js', starterCode: '', entryPoint: '', fixture: '', tests: [] };

/** Runs free-form answer code in the isolated worker, without an entry point or tests. */
export async function runSnippet(code: string, receive: (event: RunEvent) => void, signal: AbortSignal): Promise<void> {
  return runExercise(snippetExercise, code, 'run', receive, signal);
}

export async function runExercise(exercise: Exercise, code: string, mode: 'run' | 'tests', receive: (event: RunEvent) => void, signal: AbortSignal): Promise<void> {
  const source = exercise.runtime === 'js' ? jsSource : (await import('virtual:dom-worker-source')).default;
  signal.throwIfAborted();
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.title = 'Isolated exercise runner';
  frame.hidden = true;
  frame.srcdoc = exercise.runtime === 'js' ? broker(source) : domBroker(source);
  const channel = new MessageChannel();
  const stop = () => { window.clearTimeout(timer); channel.port1.close(); frame.remove(); signal.removeEventListener('abort', stop); };
  const timer = window.setTimeout(() => {
    stop();
    receive({ type: 'error', text: exercise.runtime === 'js' ? 'Timed out after 3 s' : 'Isolated iframe removed. Check code for a blocking loop; timer cancellation is best effort.' });
  }, exercise.runtime === 'js' ? 3000 : 4000);
  channel.port1.onmessage = ({ data }: MessageEvent<unknown>) => {
    const message = Message.safeParse(data);
    if (!message.success || (message.data.type === 'test' && message.data.index >= exercise.tests.length)) return;
    if (message.data.type === 'error' || message.data.type === 'result') stop();
    receive(message.data);
  };
  frame.onload = () => frame.contentWindow?.postMessage({ runtime: exercise.runtime, code, entryPoint: exercise.entryPoint, fixture: exercise.fixture, mode, tests: mode === 'tests' ? exercise.tests : [] }, '*', [channel.port2]);
  signal.addEventListener('abort', stop, { once: true });
  document.body.append(frame);
}
