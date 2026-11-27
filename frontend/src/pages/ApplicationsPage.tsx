import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Application, ApplicationInput } from '../../../shared/contracts.js';
import { api, errorMessage, stream } from '../api.js';

function ApplicationCard({ app, onUpdate, busy, selectedModel }: { 
  app: Application; 
  onUpdate: () => void; 
  busy: boolean;
  selectedModel: string;
}) {
  const [feedback, setFeedback] = useState(app.feedback);
  const [generating, setGenerating] = useState(false);
  const [tokenBuffer, setTokenBuffer] = useState('');
  const controller = useRef<AbortController | null>(null);

  async function generate() {
    if (generating || busy) return;
    setGenerating(true);
    setTokenBuffer('');
    const signal = new AbortController();
    controller.current = signal;
    try {
      await stream<string>(`/applications/${app.id}/generate`, { model: selectedModel }, signal.signal, (event) => {
        if (event.type === 'token' && typeof event.payload === 'string') {
          setTokenBuffer((prev) => prev + event.payload);
        }
      });
      onUpdate();
    } catch (error) {
      if (!signal.signal.aborted) {
        alert(errorMessage(error));
      }
    } finally {
      setGenerating(false);
      controller.current = null;
    }
  }

  async function markSuccessful() {
    if (busy) return;
    try {
      await api(`/applications/${app.id}`, 'PATCH', { successful: !app.successful, feedback });
      onUpdate();
    } catch (error) {
      alert(errorMessage(error));
    }
  }

  return <article className="panel stack">
    <div className="action-row muted">
      <span>{app.company}</span>
      <span>{new Date(app.createdAt).toLocaleDateString()}</span>
    </div>
    <h2>{app.jobTitle}</h2>
    <details>
      <summary>Job description</summary>
      <p>{app.jobDescription}</p>
    </details>
    {app.userInput && <details>
      <summary>Your input</summary>
      <p>{app.userInput}</p>
    </details>}
    {app.coverLetter ? <div className="stack">
      <h3>Cover letter</h3>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{app.coverLetter}</pre>
    </div> : generating ? <div className="stack">
      <h3>Generating...</h3>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{tokenBuffer}</pre>
    </div> : null}
    <form className="stack" onSubmit={(event) => {
      event.preventDefault();
      markSuccessful();
    }}>
      <label className="field" htmlFor={`feedback-${app.id}`}>
        Feedback (what worked?)
        <textarea
          id={`feedback-${app.id}`}
          rows={2}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="Tell us what made this cover letter successful"
        />
      </label>
      <div className="action-row">
        <button type="button" disabled={busy || generating} onClick={generate}>
          {generating ? 'Generating...' : app.coverLetter ? 'Regenerate' : 'Generate cover letter'}
        </button>
        {app.coverLetter && <button type="submit" disabled={busy || generating}>
          {app.successful ? 'Mark unsuccessful' : 'Mark successful'}
        </button>}
      </div>
    </form>
  </article>;
}

export function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [form, setForm] = useState<ApplicationInput>({
    jobTitle: '',
    company: '',
    jobDescription: '',
    userInput: '',
  });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    load();
    loadModels();
    return () => controller.current?.abort();
  }, []);

  async function loadModels() {
    try {
      const response = await api<{ models: { name: string }[] }>('/models');
      const modelNames = response.models.map(m => m.name);
      setModels(modelNames);
      if (modelNames.length > 0 && !selectedModel) {
        setSelectedModel(modelNames[0]);
      }
    } catch (error) {
      alert(errorMessage(error));
    }
  }

  async function load() {
    setLoading(true);
    try {
      const data = await api<Application[]>('/applications');
      setApplications(data);
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    const signal = new AbortController();
    controller.current = signal;
    try {
      await api('/applications', 'POST', form, signal.signal);
      setForm({ jobTitle: '', company: '', jobDescription: '', userInput: '' });
      await load();
    } catch (error) {
      if (!signal.signal.aborted) {
        alert(errorMessage(error));
      }
    } finally {
      setCreating(false);
      controller.current = null;
    }
  }

  const busy = creating;

  return <div className="stack">
    <form className="panel stack" onSubmit={create}>
      <h2>New application</h2>
      <label className="field" htmlFor="jobTitle">Job title
        <input id="jobTitle" type="text" required value={form.jobTitle}
          onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} />
      </label>
      <label className="field" htmlFor="company">Company
        <input id="company" type="text" required value={form.company}
          onChange={(event) => setForm({ ...form, company: event.target.value })} />
      </label>
      <label className="field" htmlFor="jobDescription">Job description
        <textarea id="jobDescription" rows={6} required value={form.jobDescription}
          onChange={(event) => setForm({ ...form, jobDescription: event.target.value })} />
      </label>
      <label className="field" htmlFor="userInput">Your achievements (from CV)
        <textarea id="userInput" rows={4} value={form.userInput}
          onChange={(event) => setForm({ ...form, userInput: event.target.value })}
          placeholder="Paste relevant achievements from your CV" />
      </label>
      <label className="field" htmlFor="userInput">Your achievements (from CV)
        <textarea id="userInput" rows={4} value={form.userInput}
          onChange={(event) => setForm({ ...form, userInput: event.target.value })}
          placeholder="Paste relevant achievements from your CV" />
      </label>
      {models.length > 0 && <label className="field" htmlFor="model">Model
        <select id="model" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
          {models.map(model => <option key={model} value={model}>{model}</option>)}
        </select>
      </label>}
      <button type="submit" disabled={busy}>{creating ? 'Saving...' : 'Add application'}</button>
    </form>
    {loading ? <p>Loading...</p> : applications.length === 0 ? <p>No applications yet. Create one above.</p> :
      <div className="stack">
        <h2>Applications</h2>
        {applications.map((app) =>
          <ApplicationCard key={app.id} app={app} onUpdate={load} busy={busy} selectedModel={selectedModel} />
        )}
      </div>}
  </div>;
}
