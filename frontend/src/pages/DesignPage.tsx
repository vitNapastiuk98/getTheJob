import { useEffect, useRef, useState, type FormEvent } from 'react';
import DOMPurify from 'dompurify';
import { marked, type Tokens } from 'marked';
import type { DesignFeedback, DesignSession, LlmEvent } from '../../../shared/contracts.js';
import { api, errorMessage, stream } from '../api.js';

type Scenario = { title: string; brief: string };
type SessionLink = { id: string; title: string; createdAt: string };
const base = '/design/sessions';
const sections = [
  ['clarification', 'Clarification'], ['components', 'Components'], ['dataFlow', 'Data flow'], ['state', 'State'],
  ['performance', 'Performance'], ['tradeoffs', 'Trade-offs'], ['staffPushback', 'Staff-level pushback'],
] as const satisfies ReadonlyArray<readonly [keyof DesignFeedback, string]>;

let diagramSequence = 0;
function Diagram({ source }: { source: string }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    async function render() {
      if (source.length > 6000) throw new Error('Diagram is too long to preview.');
      if (/%%\s*\{|^\s*---|@\{|\bclick\b/im.test(source)) throw new Error('Diagram configuration, images, and interactive links are not supported.');
      const { default: mermaid } = await import('mermaid');
      if (!active) return;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: 'dark', fontFamily: 'system-ui', maxTextSize: 6000, maxEdges: 100 });
      const { svg } = await mermaid.render(`design-diagram-${++diagramSequence}`, source);
      if (!active) return;
      const isolatedSvg = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject', 'image', 'a'], FORBID_ATTR: ['href', 'xlink:href'],
      });
      url = URL.createObjectURL(new Blob([isolatedSvg], { type: 'image/svg+xml' }));
      setImage(url);
    }
    void render().catch((failure: unknown) => { if (active) setError(errorMessage(failure)); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [source]);
  return image ? <img className="design-diagram" src={image} alt="Mermaid diagram from your design" /> : <>
    {error && <p className="notice">Diagram preview unavailable: {error}</p>}
    <pre>{source}</pre>
  </>;
}

function Markdown({ text }: { text: string }) {
  const tokens = marked.lexer(text);
  return <div className="markdown stack">{tokens.map((token, index) => {
    if (token.type === 'code' && (token as Tokens.Code).lang === 'mermaid') return <Diagram key={index} source={(token as Tokens.Code).text} />;
    const html = DOMPurify.sanitize(marked.parser([token]), {
      ALLOWED_TAGS: ['p', 'br', 'em', 'strong', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'hr', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'del'],
      ALLOWED_ATTR: [], ALLOW_DATA_ATTR: false,
    });
    return <div key={index} dangerouslySetInnerHTML={{ __html: html }} />;
  })}</div>;
}

export function DesignPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [picked, setPicked] = useState(0);
  const [focus, setFocus] = useState('');
  const [links, setLinks] = useState<SessionLink[]>([]);
  const [session, setSession] = useState<DesignSession>();
  const [draft, setDraft] = useState('');
  const [initialLoad, setInitialLoad] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState<{ warning: string; raw: string }>();
  const operation = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    const signal = new AbortController();
    const id = new URLSearchParams(location.search).get('session');
    const read = <T,>(path: string) => api<T>(path, 'GET', undefined, signal.signal);
    void Promise.all([read<Scenario[]>('/design/scenarios'), read<SessionLink[]>(base),
      id ? read<DesignSession>(`${base}/${encodeURIComponent(id)}`) : undefined,
    ]).then(([options, saved, current]) => {
      setScenarios(options); setLinks(saved); setSession(current); setInitialLoad('ready');
    }).catch((failure: unknown) => {
      if (signal.signal.aborted) return;
      setError(errorMessage(failure)); setInitialLoad('failed');
    });
    return () => { signal.abort(); operation.current?.abort(); };
  }, []);

  function run(label: string, work: (signal: AbortSignal, onEvent: (event: LlmEvent) => void) => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(label); setError(''); setWarning(undefined);
    void work(controller.signal, (event) => {
      if (event.type === 'warning') setWarning(event.payload as { warning: string; raw: string });
      if (event.type === 'retry') setBusy('Retrying local model');
    }).catch((failure: unknown) => setError(controller.signal.aborted ? 'Canceled. Your draft was kept.' : errorMessage(failure)))
      .finally(() => { operation.current = undefined; setBusy(''); });
  }
  function start(event: FormEvent) {
    event.preventDefault();
    const scenario = scenarios[picked];
    if (!scenario) return;
    run('Starting design session', async (signal) => {
      const created = await api<DesignSession>(base, 'POST', scenario, signal);
      history.replaceState(null, '', `/system-design?session=${encodeURIComponent(created.id)}`);
      setSession(created);
    });
  }
  function reviewTurn(input: { content: string } | { retryId: string }) {
    if (!session) return;
    const path = `${base}/${session.id}`;
    run('content' in input ? 'Saving your design' : 'Reviewing your design', async (signal, onEvent) => {
      let retryId: string;
      if ('content' in input) {
        const saved = await api<{ turnId: string; session: DesignSession }>(`${path}/drafts`, 'POST', input, signal);
        setSession(saved.session);
        setDraft('');
        setBusy('Reviewing your design');
        retryId = saved.turnId;
      } else {
        retryId = input.retryId;
      }
      setSession(await stream<DesignSession>(`${path}/messages`, { retryId }, signal, onEvent));
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim()) reviewTurn({ content: draft });
  }
  return <>
    <h1>System design</h1>
    <p className="lede">Describe a design, then iterate on trade-offs with your local model.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {warning && <details className="notice"><summary>{warning.warning}</summary><pre>{warning.raw.slice(0, 8000)}</pre></details>}
    {busy && <div className="notice action-row"><span role="status">{busy}…</span>{busy !== 'Saving your design' && <button type="button" onClick={() => operation.current?.abort()}>Cancel</button>}</div>}
    {initialLoad === 'loading' ? <p role="status">Loading design scenarios…</p> : !session ? <div className="stack">
      <form className="panel stack" onSubmit={start}>
        <label className="field">Scenario<select value={picked} onChange={(event) => setPicked(Number(event.target.value))}>
          {scenarios.map(({ title }, index) => <option key={`${index}-${title}`} value={index}>{title}</option>)}
        </select></label>
        {scenarios[picked] && <p>{scenarios[picked].brief}</p>}
        {!scenarios.length && initialLoad === 'ready' && <p role="status">No design scenarios available. Generate a scenario below to get started.</p>}
        <div><button className="primary" disabled={!scenarios.length || Boolean(busy)}>Start design session</button></div>
      </form>
      <form className="panel stack" onSubmit={(event) => {
        event.preventDefault();
        run('Generating scenario', async (signal, onEvent) => {
          const value = await stream<Scenario>('/design/scenarios/generate', { focus }, signal, onEvent);
          setPicked(scenarios.length); setScenarios([...scenarios, value]);
        });
      }}>
        <label className="field">Scenario focus (optional)<input value={focus} maxLength={500} onChange={(event) => setFocus(event.target.value)} /></label>
        <div><button disabled={Boolean(busy)}>Generate a scenario</button></div>
      </form>
      {links.length > 0 && <section><h2>Saved sessions</h2><ul>{links.map(({ id, title }) => <li key={id}><a href={`/system-design?session=${encodeURIComponent(id)}`}>{title}</a></li>)}</ul></section>}
    </div> : <section className="stack">
      <div><a href="/system-design">Choose another scenario</a></div>
      <article className="panel stack"><h2>{session.scenario.split('\n\n')[0]}</h2><p>{session.scenario.split('\n\n').slice(1).join('\n\n')}</p></article>
      {session.messages.map(({ id, content, feedback, status }) => <article key={id} className="panel stack">
        <h3>{feedback ? 'Design feedback' : 'Your design'}</h3>
        {feedback ? <>
          {sections.map(([key, label]) => <div key={key}><h4>{label}</h4><p>{feedback[key]}</p></div>)}
          <div><h4>Follow-up questions</h4><ul>{feedback.followUp.map((question, index) => <li key={index}>{question}</li>)}</ul></div>
        </> : <>
          <Markdown text={content} />
          {status === 'pending' && <p className="muted">Saved. Feedback is pending.</p>}
          {status === 'failed' && <div className="action-row"><span className="muted">Saved without feedback.</span>
            <button type="button" disabled={Boolean(busy)} onClick={() => reviewTurn({ retryId: id })}>Retry feedback</button>
          </div>}
        </>}
      </article>)}
      <form className="panel stack" onSubmit={submit}>
        <label className="field" htmlFor="design-draft">Your design notes
          <textarea id="design-draft" rows={8} required maxLength={65_536} readOnly={Boolean(busy)} value={draft} onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !busy) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        </label>
        <p className="muted">Markdown and fenced Mermaid diagrams are supported. Ctrl/⌘ + Enter submits.</p>
        <div><button className="primary" disabled={Boolean(busy) || !draft.trim()}>Submit design</button></div>
      </form>
    </section>}
  </>;
}
