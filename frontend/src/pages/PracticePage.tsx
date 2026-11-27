import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CodeReview, Question, Topic } from '../../../shared/contracts.js';
import { api, errorMessage, stream } from '../api.js';
import { Editor } from '../editor.js';
import { runExercise, type Exercise, type RunEvent } from '../sandbox/host.js';

export function PracticePage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [runtime, setRuntime] = useState<Exercise['runtime']>('js');
  const [question, setQuestion] = useState<Question>();
  const [code, setCode] = useState('');
  const [runEvents, setRunEvents] = useState<RunEvent[]>([]);
  const [review, setReview] = useState<CodeReview>();
  const [error, setError] = useState('');
  const [warning, setWarning] = useState<{ warning: string; raw: string }>();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [inference, setInference] = useState('');
  const runner = useRef<AbortController | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    const fetchTopics = new AbortController();
    void api<Topic[]>('/topics', 'GET', undefined, fetchTopics.signal).then((all) => {
      setTopics(all); setTopic(all[0]?.id ?? '');
    }).catch((failure: unknown) => { if (!fetchTopics.signal.aborted) setError(errorMessage(failure)); })
      .finally(() => { if (!fetchTopics.signal.aborted) setLoading(false); });
    return () => { fetchTopics.abort(); controller.current?.abort(); runner.current?.abort(); };
  }, []);
  const exercise = question?.exercise;
  function execute(mode: 'run' | 'tests') {
    if (!exercise || running) return;
    setRunEvents([]);
    setRunning(true);
    const execution = new AbortController();
    runner.current = execution;
    void runExercise(exercise, code, mode, (event) => {
        setRunEvents((events) => [...events, event]);
        if (event.type === 'result' || event.type === 'error') {
          runner.current = undefined; setRunning(false);
        }
    }, execution.signal).catch((failure: unknown) => {
      if (!execution.signal.aborted) { runner.current = undefined; setError(errorMessage(failure)); setRunning(false); }
    });
  }
  async function infer<T>(label: string, path: string, body: unknown, accept: (value: T) => void) {
    if (controller.current) return;
    const next = new AbortController();
    controller.current = next;
    setInference(label); setError(''); setWarning(undefined);
    try {
      accept(await stream<T>(path, body, next.signal, (event) => {
        if (event.type === 'retry') setInference('Retrying local model');
        if (event.type === 'warning') setWarning(event.payload as { warning: string; raw: string });
      }));
    } catch (failure) { setError(next.signal.aborted ? 'Canceled. Your code was kept.' : errorMessage(failure)); }
    finally { controller.current = undefined; setInference(''); }
  }
  function generate(event: FormEvent) {
    event.preventDefault();
    void infer<Question>('Generating exercise', '/practice/generate', { topicId, difficulty, runtime }, (next) => {
      setQuestion(next); setCode(next.exercise?.starterCode ?? ''); setRunEvents([]); setReview(undefined);
    });
  }
  return <>
    <h1>Coding practice</h1>
    <p className="lede">Practice JavaScript, DOM, or React. Run your solution locally or ask your local model for feedback.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {warning && <details className="notice"><summary>{warning.warning}</summary><pre>{warning.raw.slice(0, 8000)}</pre></details>}
    {loading && <p role="status">Loading topics…</p>}
    {inference && <div className="notice action-row"><span role="status">{inference}…</span><button onClick={() => controller.current?.abort()}>Cancel</button></div>}
    <form className="panel stack" onSubmit={generate}>
      <div className="field-grid"><label className="field">Topic<select value={topicId} onChange={(event) => setTopic(event.target.value)}>
        {topics.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <label className="field">Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label></div>
      <label className="field short">Runtime<select value={runtime} onChange={(event) => setRuntime(event.target.value as Exercise['runtime'])}>
        <option value="js">JavaScript</option><option value="dom">DOM</option><option value="react">React</option>
      </select></label>
      {!loading && !error && !topics.length && <p>No topics yet. <a href="/settings">Add a topic in Settings</a> or run <code>pnpm seed</code>.</p>}
      <div><button className="primary" disabled={!topicId || Boolean(inference) || running}>Generate exercise</button></div>
    </form>
    {question && exercise && <section className="practice-workspace stack">
      <div className="stack"><h2>Exercise</h2><p>{question.prompt}</p><p className="muted">Entry point: <code>{exercise.entryPoint}</code></p>
      <Editor key={question.id} initial={exercise.starterCode} jsx={exercise.runtime === 'react'} label="Solution code" onChange={setCode} />
      {exercise.runtime !== 'js' && <p className="notice">DOM and React run in a hidden sandboxed iframe. A synchronous loop can block the tab. Cancellation is best effort; run only code you trust.</p>}
      <div className="action-row">
        <button className="primary" disabled={running || Boolean(inference)} onClick={() => execute('run')}>Run</button>
        <button disabled={running || Boolean(inference)} onClick={() => execute('tests')}>Run tests</button>
        <button disabled={running || Boolean(inference) || !code.trim()} onClick={() => void infer<CodeReview>('Reviewing code', `/practice/${question.id}/review`, { code }, setReview)}>Submit for AI review</button>
      </div></div>
      <section className="panel stack" aria-label="Execution results">
        <h3>Execution results</h3>
        <div role="status">{running ? `Running in an isolated ${exercise.runtime === 'js' ? 'worker' : 'iframe'}…` : !runEvents.length ? 'Run the code or its tests to see results here.' : null}</div>
        <ul className="results">{runEvents.map((event, index) => <li key={index} className={event.type === 'error' ? 'error' : undefined}>
          {event.type === 'test' ? <><strong>{event.passed ? 'Pass' : 'Fail'}</strong> · {exercise.tests[event.index]?.name}{event.text && <pre>{event.text}</pre>}</>
            : <><strong>{event.type === 'log' ? event.level : event.type}</strong><pre>{event.text}</pre></>}
        </li>)}</ul>
      </section>
      {review && <section className="panel stack"><h3>AI review</h3><p><strong>Quality:</strong> {review.quality}</p><p><strong>Complexity:</strong> {review.complexity}</p><p><strong>Naming:</strong> {review.naming}</p>
        {!!review.comments.length && <ol>{review.comments.map(({ line, message }, index) => <li key={index}><strong>Line {line}:</strong> {message}</li>)}</ol>}</section>}
    </section>}
  </>;
}
