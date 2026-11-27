import { useEffect, useState, type FormEvent } from 'react';
import type { Doctor, PromptTemplate, Settings, Topic } from '../../../shared/contracts.js';
import { api, errorMessage } from '../api.js';

type Mutation = (label: string, work: () => Promise<void>) => void;
type Weighted = { name: string; weight: number };
const levels = ['easy', 'medium', 'hard'] as const;
const sections = [['connection', 'Connection'], ['model-parameters', 'Model parameters'], ['topics', 'Topics'], ['defaults', 'Practice defaults'], ['prompts', 'Prompt templates']];

function TopicFields({ value, label, submit, remove, disabled }: {
  value?: Weighted; label: string; submit: (value: Weighted) => void; remove?: () => void; disabled: boolean;
}) {
  const [name, setName] = useState(value?.name ?? '');
  const [weight, setWeight] = useState(value?.weight ?? 1);
  function save(event: FormEvent) {
    event.preventDefault();
    submit({ name, weight });
  }
  return <form className="action-row settings-topic" onSubmit={save}>
    <label className="field">{label}<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label className="field">Weight<input type="number" min={0} max={100} step="any" required value={Number.isNaN(weight) ? '' : weight} onChange={(event) => setWeight(event.target.valueAsNumber)} /></label>
    <button disabled={disabled || !name.trim()}>{value ? 'Save' : 'Add'}</button>
    {remove && <button type="button" disabled={disabled} onClick={remove}>Archive</button>}
  </form>;
}

function TopicEditor({ topics, run, reload, disabled }: { topics: Topic[]; run: Mutation; reload: () => Promise<void>; disabled: boolean }) {
  const [newTopic, setNewTopic] = useState(0);
  const [newChild, setNewChild] = useState<Record<string, number>>({});
  function change(path: string, method: string, body?: Weighted, after?: () => void) {
    run('Topics saved.', async () => { await api(path, method, body); await reload(); after?.(); });
  }
  return <section id="topics" className="panel stack">
    <h2>Topics</h2>
    <p className="muted">Archived topics are removed from new practice. Past attempts keep their topic context.</p>
    {!topics.length && <p>No topics yet. Add your first topic below.</p>}
    <TopicFields key={newTopic} label="New topic" disabled={disabled} submit={(body) => change('/topics', 'POST', body, () => setNewTopic((count) => count + 1))} />
    {topics.map((topic) => <details key={topic.id} className="settings-topic-group"><summary>{topic.name} · {topic.subtopics.length} subtopics</summary>
      <div className="stack page-section">
        <TopicFields key={`${topic.name}-${topic.weight}`} value={topic} label="Topic name" disabled={disabled} submit={(body) => change(`/topics/${topic.id}`, 'PATCH', body)}
          remove={() => change(`/topics/${topic.id}`, 'DELETE')} />
        {topic.subtopics.map((child) => <TopicFields key={`${child.id}-${child.name}-${child.weight}`} value={child} label="Subtopic name" disabled={disabled}
          submit={(body) => change(`/subtopics/${child.id}`, 'PATCH', body)} remove={() => change(`/subtopics/${child.id}`, 'DELETE')} />)}
        <TopicFields key={newChild[topic.id] ?? 0} label="New subtopic" disabled={disabled} submit={(body) => change(`/topics/${topic.id}/subtopics`, 'POST', body,
          () => setNewChild((counts) => ({ ...counts, [topic.id]: (counts[topic.id] ?? 0) + 1 })))} />
      </div>
    </details>)}
  </section>;
}

function PromptEditor({ prompts, run, reload, disabled }: { prompts: PromptTemplate[]; run: Mutation; reload: () => Promise<void>; disabled: boolean }) {
  const [key, select] = useState('');
  const selected = prompts.find((item) => item.key === key) ?? prompts[0];
  return <section id="prompts" className="panel stack">
    <h2>Prompt templates</h2>
    <label className="field">Template<select value={selected?.key ?? ''} onChange={(event) => select(event.target.value)}>
      {prompts.map((item) => <option value={item.key} key={item.key}>{item.key}</option>)}
    </select></label>
    {selected && <PromptForm key={`${selected.key}-${selected.template}`} prompt={selected} run={run} reload={reload} disabled={disabled} />}
  </section>;
}

function PromptForm({ prompt, run, reload, disabled }: { prompt: PromptTemplate; run: Mutation; reload: () => Promise<void>; disabled: boolean }) {
  const [template, setTemplate] = useState(prompt.template);
  const endpoint = `/prompts/${prompt.key}`;
  return <form className="stack" onSubmit={(event) => {
    event.preventDefault();
    run('Template saved.', async () => { await api(endpoint, 'PUT', { template }); await reload(); });
  }}>
    <label className="field">Template text<textarea rows={9} required maxLength={32768} value={template} onChange={(event) => setTemplate(event.target.value)} /></label>
    <p className="muted">Keep required slots: {prompt.slots.map((slot) => <code key={slot}>{`{{${slot}}} `}</code>)}</p>
    <div className="action-row"><button className="primary" disabled={disabled || template === prompt.template}>Save template</button>
      <button type="button" disabled={disabled || (template === prompt.defaultTemplate && prompt.template === prompt.defaultTemplate)} onClick={() => run('Default template restored.', async () => {
        await api(endpoint, 'DELETE'); await reload(); setTemplate(prompt.defaultTemplate);
      })}>Reset to default</button></div>
  </form>;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [doctor, setDoctor] = useState<Doctor>();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const get = <T,>(path: string) => api<T>(path, 'GET', undefined, controller.signal);
    void Promise.all([get<Settings>('/settings'), get<Topic[]>('/topics'), get<PromptTemplate[]>('/prompts')]).then(([current, topics, prompts]) => {
      setSettings(current); setTopics(topics); setPrompts(prompts);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(errorMessage(failure)); });
    return () => controller.abort();
  }, []);

  const run: Mutation = (message, work) => {
    if (busy) return;
    setBusy(true); setStatus('Working…'); setError('');
    void work().then(() => setStatus(message)).catch((failure: unknown) => {
      setError(errorMessage(failure)); setStatus('');
    }).finally(() => setBusy(false));
  };
  function update<K extends keyof Settings>(name: K, value: Settings[K]) {
    setSettings((current) => current ? { ...current, [name]: value } : current);
  }
  function save(event: FormEvent) {
    event.preventDefault();
    run('Settings saved.', async () => { setSettings(await api<Settings>('/settings', 'PUT', settings)); setDoctor(undefined); });
  }
  return <>
    <h1>Settings</h1>
    <p className="lede">Manage your local model, interview defaults, and practice content.</p>
    <nav className="action-row" aria-label="Settings sections">{sections.map(([id, title]) => <a key={id} href={`#${id}`}>{title}</a>)}</nav>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="settings-status" role="status">{status}</p>
    {!settings && !error && <p role="status">Loading settings…</p>}
    {settings && <div className="stack page-section">
      <form className="stack" onSubmit={save}>
        <section id="connection" className="panel stack">
          <h2>Connection</h2>
          <label className="field">Ollama base URL<input type="url" required value={settings.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} /></label>
          <label className="field">Model<input list="local-models" required maxLength={200} value={settings.model} onChange={(event) => update('model', event.target.value)} /></label>
          <datalist id="local-models">{doctor?.models.map(({ name }) => <option key={name} value={name} />)}</datalist>
          <div className="action-row">
            <button type="button" disabled={busy} onClick={() => run('Connection check finished.', async () => { setDoctor(await api<Doctor>('/doctor')); })}>Test connection</button>
            <span className="muted">Use Save settings below before testing changes. Only loopback model URLs are allowed.</span>
          </div>
          {doctor && <div className="stack"><p>{doctor.reachable ? 'Ollama is reachable.' : `Cannot reach Ollama: ${doctor.error ?? 'Check that it is running.'}`}</p>
            {doctor.modelInstalled ? <p>Installed: {doctor.model}</p> : <p>Install the saved model: <code>{doctor.installCommand}</code></p>}
            {doctor.models.length > 0 && <label className="field">Installed models<select value={settings.model} onChange={(event) => update('model', event.target.value)}>
              {!doctor.models.some(({ name }) => name === settings.model) && <option value={settings.model}>{settings.model} (not installed)</option>}
              {doctor.models.map(({ name }) => <option key={name} value={name}>{name}</option>)}
            </select></label>}
          </div>}
        </section>
        <section id="model-parameters" className="panel stack">
          <h2>Model parameters</h2>
          <div className="field-grid">
            <label className="field">Temperature<input type="number" min={0} max={2} step="any" required value={Number.isNaN(settings.temperature) ? '' : settings.temperature} onChange={(event) => update('temperature', event.target.valueAsNumber)} /></label>
            <label className="field">Context window<select value={settings.numCtx} onChange={(event) => update('numCtx', event.target.value === '32768' ? 32768 : 16384)}><option value="16384">16,384 tokens</option><option value="32768">32,768 tokens</option></select></label>
          </div>
          <p className="muted">Larger context windows use more memory.</p>
          <label className="field">Random seed (optional)<input type="number" min={0} max={2147483647} value={settings.seed ?? ''} onChange={(event) => update('seed', event.target.value === '' ? null : event.target.valueAsNumber)} /></label>
          <label className="field">System instructions (optional)<textarea rows={5} maxLength={16384} value={settings.systemPrompt} onChange={(event) => update('systemPrompt', event.target.value)} /></label>
        </section>
        <section id="defaults" className="panel stack">
          <h2>Practice defaults</h2>
          <label className="field short">Default timer<select value={settings.timerMinutes} onChange={(event) => update('timerMinutes', Number(event.target.value) as Settings['timerMinutes'])}>
            <option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes</option>
          </select></label>
          <fieldset><legend>Difficulty weights</legend><div className="field-grid">{levels.map((level) => <label key={level} className="field">{level}
            <input type="number" min={0} max={100} step="any" required value={Number.isNaN(settings.difficulty[level]) ? '' : settings.difficulty[level]} onChange={(event) => update('difficulty', { ...settings.difficulty, [level]: event.target.valueAsNumber })} />
          </label>)}</div></fieldset>
          <label className="check"><input type="checkbox" checked={settings.hintPolicy.enabled} onChange={(event) => update('hintPolicy', { ...settings.hintPolicy, enabled: event.target.checked })} /> Enable hints</label>
          <div className="field-grid">
            <label className="field">Maximum hints<input type="number" min={1} max={3} required value={Number.isNaN(settings.hintPolicy.maxHints) ? '' : settings.hintPolicy.maxHints} onChange={(event) => update('hintPolicy', { ...settings.hintPolicy, maxHints: event.target.valueAsNumber })} /></label>
            <label className="field">Points per hint<input type="number" min={0} max={5} step="any" required value={Number.isNaN(settings.hintPolicy.penalty) ? '' : settings.hintPolicy.penalty} onChange={(event) => update('hintPolicy', { ...settings.hintPolicy, penalty: event.target.valueAsNumber })} /></label>
          </div>
          <div><button className="primary" disabled={busy}>Save settings</button></div>
        </section>
      </form>
      <TopicEditor topics={topics} run={run} reload={async () => setTopics(await api<Topic[]>('/topics'))} disabled={busy} />
      <PromptEditor prompts={prompts} run={run} reload={async () => setPrompts(await api<PromptTemplate[]>('/prompts'))} disabled={busy} />
      <p className="muted">Raw local model logs can contain answers, code, company notes, and extracted CV text.</p>
    </div>}
  </>;
}
