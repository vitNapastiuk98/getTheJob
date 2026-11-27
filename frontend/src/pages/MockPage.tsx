import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DEFAULT_SETTINGS, type LlmEvent, type MockItem, type MockReport, type MockSession, type MockSetup, type Settings, type Topic } from '../../../shared/contracts.js';
import { api, errorMessage, stream } from '../api.js';
import { extractCv } from '../cv.js';

const sessions = '/mock/sessions';
const itemStatus = { active: 'Active', answered: 'Answered', skipped: 'Skipped', ungraded: 'Ungraded' } as const satisfies Record<MockItem['status'], string>;
const initial: MockSetup = {
  durationMinutes: 30, difficulty: DEFAULT_SETTINGS.difficulty, topicWeights: {},
  companyName: '', jobRole: '', companyInfo: '', cvFileName: '', cvText: '', cvSituational: true,
};

function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function MockPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [setup, setSetup] = useState(initial);
  const [session, setSession] = useState<MockSession>();
  const [report, setReport] = useState<MockReport>();
  const [answer, setAnswer] = useState('');
  const [hint, setHint] = useState('');
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState('');
  const [cvError, setCvError] = useState('');
  const [cvBusy, setCvBusy] = useState(false);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<{ warning: string; raw: string }>();
  const operation = useRef<AbortController | undefined>(undefined);
  const cvVersion = useRef(0);
  const base = session ? `${sessions}/${session.id}` : sessions;
  const item = session?.items.at(-1);
  const remaining = session ? Date.parse(session.deadlineAt) - now : 0;
  const expired = remaining <= 0;

  useEffect(() => {
    const controller = new AbortController();
    const id = new URLSearchParams(location.search).get('session');
    const read = id ? api<MockSession>(`${sessions}/${encodeURIComponent(id)}`, 'GET', undefined, controller.signal)
      .then(async (current) => {
        setSession(current);
        if (current.status === 'ended') setReport(await api<MockReport>(`${sessions}/${current.id}/report`, 'GET', undefined, controller.signal));
      }) : Promise.all([api<Topic[]>('/topics', 'GET', undefined, controller.signal), api<Settings>('/settings', 'GET', undefined, controller.signal)])
      .then(([list, settings]) => {
        setTopics(list);
        setSetup((draft) => ({ ...draft, durationMinutes: settings.timerMinutes, difficulty: settings.difficulty,
          topicWeights: Object.fromEntries(list.map(({ id: topicId, weight }) => [topicId, weight])) }));
      });
    void read.catch((failure: unknown) => { if (!controller.signal.aborted) setError(errorMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); operation.current?.abort(); cvVersion.current++; };
  }, []);

  useEffect(() => {
    if (session?.status !== 'active') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.status]);

  useEffect(() => {
    if (!session || session.status !== 'active' || !expired) return;
    const controller = new AbortController();
    void api<MockReport>(`${sessions}/${session.id}/report`, 'GET', undefined, controller.signal).then((value) => {
      setReport(value);
      setSession(value.session);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(errorMessage(failure)); });
    return () => controller.abort();
  }, [expired, session]);

  function update<K extends keyof MockSetup>(key: K, value: MockSetup[K]) {
    setSetup((draft) => ({ ...draft, [key]: value }));
  }

  async function selectCv(file: File | undefined) {
    const version = ++cvVersion.current;
    setCvError('');
    setCvBusy(Boolean(file));
    if (!file) {
      setSetup((draft) => ({ ...draft, cvFileName: '', cvText: '' }));
      return;
    }
    try {
      const extracted = await extractCv(file);
      if (version === cvVersion.current) setSetup((draft) => ({ ...draft, cvFileName: extracted.name, cvText: extracted.text }));
    } catch (failure) {
      if (version === cvVersion.current) {
        setSetup((draft) => ({ ...draft, cvFileName: '', cvText: '' }));
        setCvError(errorMessage(failure));
      }
    } finally { if (version === cvVersion.current) setCvBusy(false); }
  }

  async function run(label: string, work: (signal: AbortSignal, events: (event: LlmEvent) => void) => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(label);
    setNow(Date.now());
    setWarning(undefined);
    setError('');
    try {
      await work(controller.signal, (event) => {
        if (event.type === 'warning') setWarning(event.payload as { warning: string; raw: string });
        if (event.type === 'retry') setBusy('Retrying local model');
      });
    } catch (failure) { setError(controller.signal.aborted ? 'Canceled. Your draft is still here.' : errorMessage(failure)); }
    finally { operation.current = undefined; setBusy(''); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run('Generating first question', async (signal, events) => {
      const next = await stream<MockSession>(sessions, setup, signal, events);
      history.replaceState(null, '', `/mock?session=${encodeURIComponent(next.id)}`);
      setNow(Date.now());
      setSession(next);
    });
  }

  function next() {
    void run('Generating next question', async (signal, events) => {
      setSession(await stream<MockSession>(`${base}/next`, {}, signal, events)); setAnswer(''); setHint('');
    });
  }

  function finish() {
    void run('Loading report', async (signal) => {
      setSession(await api<MockSession>(`${base}/end`, 'POST', {}, signal));
      setReport(await api<MockReport>(`${base}/report`, 'GET', undefined, signal));
    });
  }

  return <>
    <h1>Mock interview</h1>
    <p className="lede">Rehearse under a timer. Add company notes or a CV to tailor your questions.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {warning && <details className="notice"><summary>{warning.warning}</summary><pre>{warning.raw.slice(0, 8_000)}</pre></details>}
    {busy && <div className="notice action-row"><span role="status">{busy}…</span><button type="button" onClick={() => operation.current?.abort()}>Cancel</button></div>}
    {loading && <p role="status">Loading interview…</p>}
    {!loading && !session && <form onSubmit={submit} className="stack">
      <div className="field short"><label htmlFor="duration">Duration</label>
        <select id="duration" value={setup.durationMinutes} onChange={(event) => update('durationMinutes', Number(event.target.value) as MockSetup['durationMinutes'])}>
          <option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes</option>
        </select>
      </div>
      {!topics.length && <p>No topics available. <a href="/settings">Add topics in Settings</a> or run <code>pnpm seed</code>.</p>}
      <details className="panel"><summary>Customize topic weights and difficulty</summary><div className="stack mock-tuning">
      {topics.length > 0 && <fieldset><legend>Topic weights</legend>
        <div className="weight-grid">{topics.map(({ id, name }) => <label key={id}>{name}<input type="range" min={0} max={100} value={setup.topicWeights[id] ?? 0}
          onChange={(event) => update('topicWeights', { ...setup.topicWeights, [id]: Number(event.target.value) })} /><span>{setup.topicWeights[id] ?? 0}</span></label>)}</div>
      </fieldset>}
      <fieldset><legend>Difficulty mix</legend><div className="weight-grid">
        {(['easy', 'medium', 'hard'] as const).map((level) => <label key={level}>{level}<input type="range" min={0} max={100} value={setup.difficulty[level]}
          onChange={(event) => update('difficulty', { ...setup.difficulty, [level]: Number(event.target.value) })} /><span>{setup.difficulty[level]}</span></label>)}
      </div></fieldset></div></details>
      <fieldset><legend>Company context (optional)</legend><div className="field-grid">
        <div className="field"><label htmlFor="company-name">Company name</label><input id="company-name" autoComplete="organization" maxLength={100} value={setup.companyName} onChange={(event) => update('companyName', event.target.value)} /></div>
        <div className="field"><label htmlFor="job-role">Job role</label><input id="job-role" autoComplete="organization-title" maxLength={100} value={setup.jobRole} onChange={(event) => update('jobRole', event.target.value)} /></div>
      </div><div className="field"><label htmlFor="company-info">Company info</label><textarea id="company-info" rows={4} maxLength={8_000} value={setup.companyInfo} onChange={(event) => update('companyInfo', event.target.value)} /></div>
      <p className="muted">Paste a job description, interview notes, or technologies to focus on.</p></fieldset>
      <fieldset><legend>CV context (optional)</legend><div className="field"><label htmlFor="cv-pdf">CV PDF</label>
        <input id="cv-pdf" type="file" accept=".pdf,application/pdf" onChange={(event) => void selectCv(event.target.files?.[0])} />
      </div>
        <p className="muted">The PDF is read in this browser. Extracted text is saved with the session and sent to your local model. Local model logs can contain this text.</p>
        {cvBusy && <p role="status">Reading PDF…</p>}
        {cvError && <p role="alert" className="error">{cvError}</p>}
        {setup.cvText && <p role="status">{setup.cvFileName}: {setup.cvText.length} characters extracted.</p>}
        <label className="check"><input id="cv-situational" type="checkbox" checked={setup.cvSituational} disabled={!setup.cvText} onChange={(event) => update('cvSituational', event.target.checked)} /> Ask situational questions about my CV</label>
        {cvError && <button type="button" onClick={() => { const input = document.querySelector<HTMLInputElement>('#cv-pdf'); if (input) input.value = ''; void selectCv(undefined); }}>Continue without a CV</button>}
      </fieldset>
      <div><button className="primary" disabled={Boolean(busy || cvBusy || cvError) || !Object.values(setup.topicWeights).some(Boolean) || !Object.values(setup.difficulty).some(Boolean)}>Start mock interview</button></div>
    </form>}
    {session?.status === 'active' && <section className="stack">
      <div className="action-row"><span>Time remaining <strong>{clock(Math.max(0, remaining + 999))}</strong></span>
        {item?.status === 'active' && <span>Question time <strong>{clock(now - Date.parse(item.startedAt))}</strong></span>}
        <button type="button" onClick={finish} disabled={Boolean(busy)}>End interview</button></div>
      {session.config.companyName && <p className="muted">Preparing for {session.config.companyName}{session.config.jobRole ? ` · ${session.config.jobRole}` : ''}</p>}
      {item && <article className="panel stack">
        <h2>Question {session.items.length}</h2><p>{item.question.prompt}</p>
        {item.status === 'active' && <form className="stack" onSubmit={(event) => {
          event.preventDefault();
          void run('Evaluating answer', async (signal, events) => {
            setSession(await stream<MockSession>(`${base}/answer`, { itemId: item.id, answer, requestId: crypto.randomUUID() }, signal, events));
          });
        }}>
          <div className="field"><label htmlFor="mock-answer">Your answer</label><textarea id="mock-answer" required rows={6} value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !busy) event.currentTarget.form?.requestSubmit();
          }} /></div>
          {hint && <p className="notice">{hint}</p>}
          <div className="action-row">
            <button className="primary" disabled={Boolean(busy) || !answer.trim() || remaining <= 0}>Submit answer</button>
            <button type="button" disabled={Boolean(busy) || item.hintCount >= 3 || remaining <= 0} onClick={() => void run('Loading hint', async (signal) => {
              const result = await api<{ hint: string; hintCount: number }>(`${base}/hint`, 'POST', { itemId: item.id }, signal);
              setHint(result.hint);
              setSession({ ...session, items: [...session.items.slice(0, -1), { ...item, hintCount: result.hintCount }] });
            })}>Get hint (costs points)</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void run('Skipping question', async (signal) => {
              setSession(await api<MockSession>(`${base}/skip`, 'POST', { itemId: item.id }, signal));
            })}>Skip question</button>
          </div>
        </form>}
        {item.status !== 'active' && <div className="action-row"><p>{item.attempt ? `Score: ${item.attempt.score} / 10` : itemStatus[item.status]}</p><button className="primary" disabled={Boolean(busy)} onClick={next}>Next question</button></div>}
      </article>}
    </section>}
    {session?.status === 'ended' && !report && <button onClick={finish} disabled={Boolean(busy)}>Load report</button>}
    {report && <section className="stack">
      <h2>Mock interview report{report.session.config.companyName ? ` · ${report.session.config.companyName}` : ''}</h2>
      {report.session.config.jobRole && <p>{report.session.config.jobRole}</p>}
      {report.session.config.companyInfo && <details><summary>Company notes</summary><p>{report.session.config.companyInfo}</p></details>}
      {report.session.config.cvFileName && <p>CV: {report.session.config.cvFileName}</p>}
      <div className="stack"><h3>Scores by topic</h3>
        {report.categories.length ? report.categories.map(({ topic, score, attempts }) => <label key={topic} className="score-line">{topic} · {score} / 10 · {attempts} answered <progress value={score} max={10} /></label>) : <p>No scored answers.</p>}
      </div>
      <h3>Suggested focus</h3><ul>{report.suggestedFocus.map((text) => <li key={text}>{text}</li>)}</ul>
      <h3>Transcript</h3>
      {report.session.items.map((entry, index) => <article className="panel stack" key={entry.id}><h4>Question {index + 1} · {itemStatus[entry.status]}</h4><p>{entry.question.prompt}</p>
        {entry.answer && <p>{entry.answer}</p>}<p className="muted">Hints used: {entry.hintCount}{entry.attempt ? ` · ${entry.attempt.score} / 10` : ''}</p></article>)}
      <p><a href="/mock">Start another interview</a></p>
    </section>}
  </>;
}
