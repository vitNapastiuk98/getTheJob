import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Attempt, Difficulty, Feedback, GenerateInput, LlmEvent, Question, QuestionType, Settings, Topic } from '../../../shared/contracts.js';
import { api, errorMessage, stream } from '../api.js';
import { Editor } from '../editor.js';
import { runSnippet, type RunEvent } from '../sandbox/host.js';

const types: [QuestionType, string][] = [
  ['conceptual', 'Conceptual'], ['coding', 'Coding'], ['debugging', 'Debugging'],
  ['code-review', 'Code review'], ['system-design', 'System design'], ['behavioral', 'Behavioral'],
];
const codeTypes = new Set<QuestionType>(['coding', 'debugging', 'code-review']);
type Run = <T>(label: string, path: string, input: unknown, accept: (result: T) => void) => void;
type QuestionEntry = { question: Question; attempt?: Attempt };

function Elapsed({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);
  return <span aria-hidden="true">{elapsed}s elapsed</span>;
}

function QuestionCard({ entry, run, busy, hintLimit, addFollowUp, rememberCurrent }: {
  entry: QuestionEntry; run: Run; busy: boolean; hintLimit: number; addFollowUp: (question: Question) => void; rememberCurrent: () => void;
}) {
  const { question, attempt } = entry;
  const [answer, setAnswer] = useState(attempt?.answer ?? '');
  const [hint, setHint] = useState('');
  const [hintCount, setHintCount] = useState(attempt?.hintCount ?? 0);
  const [latest, setLatest] = useState(attempt);
  const [runEvents, setRunEvents] = useState<RunEvent[]>([]);
  const [runningCode, setRunningCode] = useState(false);
  const runner = useRef<AbortController | undefined>(undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => () => runner.current?.abort(), []);
  const isCode = codeTypes.has(question.type);
  function runAnswer() {
    if (runningCode || busy) return;
    setRunEvents([]); setRunningCode(true);
    const execution = new AbortController();
    runner.current = execution;
    void runSnippet(answer, (event) => {
      setRunEvents((events) => [...events, event]);
      if (event.type === 'result' || event.type === 'error') { runner.current = undefined; setRunningCode(false); }
    }, execution.signal).catch((failure: unknown) => {
      if (execution.signal.aborted) return;
      runner.current = undefined; setRunningCode(false);
      setRunEvents((events) => [...events, { type: 'error', text: errorMessage(failure) }]);
    });
  }
  const feedback: Feedback | undefined = latest && 'points' in latest.feedback ? latest.feedback : undefined;
  const path = `/questions/${question.id}`;
  const answerId = `answer-${question.id}`;
  const [prompt, ...examples] = question.prompt.split(/\n```[^\n]*\n([\s\S]*?)\n```(?=\n|$)/);
  return <article className="panel stack">
    <div className="action-row muted"><span>{question.topicSnapshot.name}</span><span>{question.difficulty}</span><span>{types.find(([key]) => key === question.type)?.[1]}</span></div>
    <h2>{prompt}</h2>
    {examples.map((value, index) => value.trim() && (index % 2 === 0
      ? <pre className="question-code" key={index}><code>{value}</code></pre>
      : <p key={index}>{value.trim()}</p>))}
    <details><summary>Reveal answer</summary><p>{question.answer}</p></details>
    <form className="stack" ref={form} onSubmit={(event) => {
      event.preventDefault();
      run<Attempt>('Evaluating answer', `${path}/evaluate`, { answer, hintCount, requestId: crypto.randomUUID() }, (value) => { setLatest(value); rememberCurrent(); });
    }}>
      {isCode ? <div className="field"><span>Your answer</span>
        <Editor initial={attempt?.answer ?? ''} jsx={false} label="Your answer" onChange={setAnswer}
          onSubmit={() => { if (!busy && answer.trim()) form.current?.requestSubmit(); }} />
      </div> : <label className="field" htmlFor={answerId}>Your answer
        <textarea id={answerId} rows={4} required value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !busy) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }} />
      </label>}
      {isCode && <>
        <div className="action-row">
          <button type="button" disabled={busy || runningCode || !answer.trim()} onClick={runAnswer}>Run code</button>
          {runningCode && <span role="status" className="muted">Running in an isolated worker…</span>}
        </div>
        {runEvents.length > 0 && <ul className="results" aria-label="Code output">{runEvents.map((event, index) =>
          <li key={index} className={event.type === 'error' ? 'error' : undefined}>
            <strong>{event.type === 'log' ? event.level : event.type}</strong><pre>{event.text}</pre>
          </li>)}
        </ul>}
      </>}
      {hint && <p className="notice" role="status">Hint {hintCount}: {hint}</p>}
      <div className="action-row">
        <button className="primary" disabled={busy || !answer.trim()}>Evaluate answer</button>
        <button type="button" disabled={busy || hintCount >= hintLimit} onClick={() => run<{ hint: string; hintCount: number }>('Getting hint', `${path}/hint`, { hintCount }, (next) => { setHint(next.hint); setHintCount(next.hintCount); })}>Ask for a hint</button>
        <button type="button" disabled={busy} onClick={() => run<Question>('Generating follow-up', `${path}/follow-up`, {}, addFollowUp)}>Generate follow-up</button>
      </div>
    </form>
    {feedback && <section className="stack" aria-label="Evaluation feedback">
      <h3>Score: {feedback.score} / 10</h3>
      <p className="muted">AI assessment — check against the reference answer.</p>
      <details open><summary>Rubric feedback</summary><ul>{feedback.points.map((point) => <li key={point.id}><strong>{point.status}:</strong> {point.explanation}{point.evidence && <q>{point.evidence}</q>}</li>)}</ul></details>
      {feedback.missingKeyPoints.length > 0 && <details><summary>Missing key points</summary><ul>{feedback.missingKeyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul></details>}
      <details><summary>What a senior engineer would add</summary><p>{feedback.seniorAddition}</p></details>
      <details><summary>Suggested follow-up</summary><p>{feedback.followUp}</p></details>
    </section>}
  </article>;
}

export function GeneratePage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [hintLimit, setHintLimit] = useState(0);
  const [input, setInput] = useState<GenerateInput>({ type: 'conceptual', topicId: '', subtopicIds: [], difficulty: 'medium', count: 1 });
  const [entries, setEntries] = useState<QuestionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [model, setModel] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [warning, setWarning] = useState<{ warning: string; raw: string }>();
  const operation = useRef<AbortController | undefined>(undefined);
  const previous = useRef<string[]>([]);
  const selected = topics.find(({ id }) => id === input.topicId);

  useEffect(() => {
    const controller = new AbortController();
    const get = <T,>(path: string) => api<T>(path, 'GET', undefined, controller.signal);
    const requested = new URLSearchParams(location.search).getAll('question').filter((id) => /^[a-zA-Z0-9_-]{1,100}$/.test(id)).slice(0, 10);
    void Promise.all([get<Topic[]>('/topics'), get<Settings>('/settings'), requested.length
      ? Promise.all(requested.map(async (id) => {
        const [question, attempts] = await Promise.all([get<Question>(`/questions/${id}`), get<Attempt[]>(`/questions/${id}/attempts`)]);
        return { question, attempt: attempts[0] };
      }))
      : get<Question[]>('/questions').then((list) => list.filter(({ topicSnapshot }) => topicSnapshot.model === 'seed').map((question) => ({ question }))),
    ]).then(([all, settings, saved]) => {
      setTopics(all);
      setHintLimit(settings.hintPolicy.enabled ? settings.hintPolicy.maxHints : 0);
      setModel(settings.model);
      setInput((draft) => {
        const restored = requested.length ? saved[0]?.question : undefined;
        const liveTopic = all.find(({ id }) => id === restored?.topicId);
        return { ...draft, topicId: liveTopic?.id ?? all[0]?.id ?? '',
          type: restored?.type ?? draft.type, difficulty: restored?.difficulty ?? draft.difficulty,
          count: restored ? saved.length : draft.count,
          subtopicIds: liveTopic?.subtopics.filter(({ name }) => restored?.topicSnapshot.subtopics.includes(name)).map(({ id }) => id) ?? [],
        };
      });
      previous.current = saved.map(({ question }) => question.id);
      setEntries(saved);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(errorMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); operation.current?.abort(); };
  }, []);

  function remember(ids: string[]) {
    previous.current = ids.slice(-10);
    const query = new URLSearchParams();
    previous.current.forEach((id) => query.append('question', id));
    history.replaceState(null, '', `/generate?${query}`);
  }

  function run<T>(label: string, path: string, body: unknown, accept: (result: T) => void) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(label); setStartedAt(Date.now()); setPreview(''); setError(''); setWarning(undefined);
    const onEvent = ({ type, payload }: LlmEvent) => {
      if (type === 'token') setPreview((text) => (text + (payload as { text: string }).text).slice(-1200));
      if (type === 'retry') { setPreview(''); setBusy('Retrying local model'); }
      if (type === 'warning') setWarning(payload as { warning: string; raw: string });
    };
    void stream<T>(path, body, controller.signal, onEvent).then(accept)
      .catch((failure: unknown) => setError(controller.signal.aborted ? 'Canceled. Your draft was kept.' : errorMessage(failure)))
      .finally(() => { operation.current = undefined; setBusy(''); setPreview(''); });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    run<Question[]>('Generating questions', '/questions/generate', input, (questions) => {
      remember(questions.map(({ id }) => id));
      setEntries(questions.map((question) => ({ question })));
    });
  }
  function followUp(question: Question) {
    remember([...previous.current, question.id]);
    setEntries((list) => [...list, { question }].slice(-10));
  }
  return <>
    <h1>Generate questions</h1>
    <p className="lede">Pick a topic and practice with questions from your local model.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {warning && <details className="notice"><summary>{warning.warning}</summary><pre>{warning.raw.slice(0, 8000)}</pre></details>}
    {loading && <p role="status">Loading questions…</p>}
    <form className="panel stack" onSubmit={submit}>
      <div className="field-grid">
        <label className="field">Question type<select disabled={Boolean(busy)} value={input.type} onChange={(event) => setInput({ ...input, type: event.target.value as QuestionType })}>{types.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="field">Topic<select disabled={Boolean(busy)} value={input.topicId} onChange={(event) => setInput({ ...input, topicId: event.target.value, subtopicIds: [] })}>{topics.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="field">Difficulty<select disabled={Boolean(busy)} value={input.difficulty} onChange={(event) => setInput({ ...input, difficulty: event.target.value as Difficulty })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
        <label className="field">Number of questions<input disabled={Boolean(busy)} type="number" min={1} max={10} required value={Number.isNaN(input.count) ? '' : input.count} onChange={(event) => setInput({ ...input, count: event.target.valueAsNumber })} /></label>
      </div>
      {!!selected?.subtopics.length && <details><summary>Subtopics (optional){input.subtopicIds.length > 0 ? ` · ${input.subtopicIds.length} selected` : ''}</summary><div className="field-grid">{selected.subtopics.map(({ id, name }) => <label className="check" key={id}><input type="checkbox" disabled={Boolean(busy)} checked={input.subtopicIds.includes(id)} onChange={(event) => setInput({ ...input, subtopicIds: event.target.checked ? [...input.subtopicIds, id] : input.subtopicIds.filter((value) => value !== id) })} />{name}</label>)}</div></details>}
      {!loading && !topics.length && <p>No topics yet. <a href="/settings">Add a topic in Settings</a> or run <code>pnpm seed</code>.</p>}
      <div className="action-row"><button className="primary" disabled={!input.topicId || Boolean(busy)}>Generate questions</button>
        {entries.length > 0 && <button disabled={!input.topicId || Boolean(busy)}>Regenerate</button>}
      </div>
    </form>
    {busy && <div className="notice"><div className="action-row"><span role="status">{busy} with {model}… <Elapsed startedAt={startedAt} /></span><button onClick={() => operation.current?.abort()}>Cancel</button></div>
      {preview && <details><summary>Streaming preview</summary><pre>{preview}</pre></details>}
    </div>}
    <div className="stack page-section">{entries.map((entry) => <QuestionCard key={entry.question.id} entry={entry} run={run} busy={Boolean(busy)} hintLimit={hintLimit} addFollowUp={followUp} rememberCurrent={() => remember(previous.current)} />)}</div>
  </>;
}
