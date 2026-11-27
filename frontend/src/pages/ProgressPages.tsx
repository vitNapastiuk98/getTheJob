import { useEffect, useState, type FormEvent } from 'react';
import type { HistoryPage, Mastery, ReviewCard, Topic } from '../../../shared/contracts.js';
import { api, errorMessage } from '../api.js';

const date = (text: string) => new Date(text).toLocaleDateString();
const practiceLink = (id: string) => `/generate?question=${encodeURIComponent(id)}`;
const trend = { up: '↑ Improving', down: '↓ Lower', steady: '— Steady' };
const kinds = ['conceptual', 'coding', 'debugging', 'code-review', 'system-design', 'behavioral'];
function range(offset: number, count: number, total: number): string {
  return count ? `${offset + 1}–${offset + count} of ${total}` : `0 of ${total}`;
}

export function DashboardPage() {
  const [mastery, setMastery] = useState<Mastery[]>([]);
  const [due, setDue] = useState(0);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [history, setHistory] = useState<HistoryPage>();
  const [request, setRequest] = useState({ filters: '', page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      api<{ mastery: Mastery[]; due: number }>('/dashboard', 'GET', undefined, controller.signal),
      api<Topic[]>('/topics', 'GET', undefined, controller.signal),
    ]).then(([current, list]) => {
      setMastery(current.mastery); setDue(current.due); setTopics(list);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(errorMessage(failure)); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(request.filters);
    params.set('page', String(request.page));
    void api<HistoryPage>(`/history?${params}`, 'GET', undefined, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setHistory(value); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setHistoryError(errorMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request]);

  function loadPage(filters: string, page: number) {
    if (filters !== request.filters) setHistory(undefined);
    setHistoryError('');
    setLoading(true);
    setRequest({ filters, page });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const [key, value] of data) if (typeof value === 'string' && value) query.set(key, value);
    loadPage(query.toString(), 1);
  }
  const offset = history ? (history.page - 1) * history.pageSize : 0;
  const hasPrevious = !loading && history !== undefined && history.page > 1;
  const hasNext = !loading && history !== undefined && offset + history.pageSize < Math.max(history.attemptTotal, history.sessionTotal);
  return <>
    <h1>Dashboard</h1><p className="lede">Follow your scores and revisit questions that need practice.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <section className="panel stack"><h2>Topic mastery</h2>
      {mastery.length ? <><p className="scroll-hint muted">Scroll the table to see latest scores and trends.</p><div className="table-scroll" tabIndex={0} role="region" aria-label="Topic mastery table">
        <table><thead><tr><th scope="col">Topic</th><th scope="col">Attempts</th><th scope="col">Average</th><th scope="col">Latest score</th><th scope="col">Trend</th></tr></thead>
          <tbody>{mastery.map((item) => <tr key={item.topicId}><th scope="row">{item.topic}</th><td>{item.attempts}</td><td>{item.average} / 10</td><td>{item.lastScore} / 10</td><td>{trend[item.trend]}</td></tr>)}</tbody></table>
      </div></> : <p>No scored attempts yet. <a href="/generate">Practice a question</a> to start tracking progress.</p>}
      <p><a href="/review">Review questions</a>{due ? ` · ${due} due` : ''}</p>
    </section>
    <section className="panel stack page-section"><h2>History</h2>
      <form className="stack" onSubmit={submit}>
        <div className="field-grid">
          <label className="field">Topic<select name="topicId"><option value="">All topics</option>{topics.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="field">Question type<select name="type"><option value="">All types</option>{kinds.map((kind) => <option key={kind} value={kind}>{kind.replaceAll('-', ' ')}</option>)}</select></label>
          <label className="field">From<input name="from" type="date" /></label>
          <label className="field">To<input name="to" type="date" /></label>
        </div>
        <div className="action-row"><button className="primary" disabled={loading}>Filter history</button>
          <button type="reset" disabled={loading} onClick={() => loadPage('', 1)}>Clear filters</button></div>
      </form>
      {historyError && <p role="alert" className="error">{historyError}</p>}
      <nav aria-label="History pages" className="stack">
        <p role="status" aria-atomic="true" className="muted">{loading ? 'Loading history…' : history
          ? `Attempts: ${range(offset, history.attempts.length, history.attemptTotal)}. Sessions: ${range(offset, history.sessions.length, history.sessionTotal)}.`
          : ''}</p>
        <div className="action-row">
          <button type="button" disabled={!hasPrevious} onClick={() => { if (hasPrevious) loadPage(request.filters, history.page - 1); }}>Previous page</button>
          <button type="button" disabled={!hasNext} onClick={() => { if (hasNext) loadPage(request.filters, history.page + 1); }}>Next page</button>
        </div>
      </nav>
      {!loading && history && <>
        <h3>Attempts</h3>
        {history.attempts.length ? <ul className="history-list">{history.attempts.map((attempt) => <li key={attempt.id}>
          <a href={practiceLink(attempt.questionId)}>{attempt.prompt}</a>
          <p className="muted">{attempt.topic} · {attempt.score === null ? 'Code review' : `${attempt.score} / 10`} · {date(attempt.createdAt)}</p>
        </li>)}</ul> : <p>{history.attemptTotal ? 'No attempts on this page.' : 'No attempts match these filters.'}</p>}
        <h3>Sessions</h3>
        {history.sessions.length ? <ul className="history-list">{history.sessions.map((session) => <li key={session.id}>
          <a href={`${session.kind === 'mock' ? '/mock' : '/system-design'}?session=${encodeURIComponent(session.id)}`}>{session.title}</a>
          <p className="muted">{session.kind === 'mock' ? 'Mock interview' : 'System design'} · {date(session.createdAt)}</p>
        </li>)}</ul> : <p>{history.sessionTotal ? 'No sessions on this page.' : 'No sessions match these filters.'}</p>}
      </>}
    </section>
  </>;
}

export function ReviewPage() {
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api<ReviewCard[]>('/review', 'GET', undefined, controller.signal).then(setCards)
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(errorMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return <>
    <h1>Review</h1><p className="lede">Lower scores come first. A score of 7 or higher moves a question to a longer review interval.</p>
    {loading && <p role="status">Loading review queue…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {!loading && !error && !cards.length && <section className="panel stack"><h2>You’re caught up</h2><p>No questions are due. <a href="/generate">Practice a question</a> to build your review queue.</p></section>}
    {cards.length > 0 && <ol className="review-list stack" aria-label="Due questions">{cards.map((card) => <li className="panel stack" key={card.questionId}>
      <p className="muted">{card.topic} · Last score: {card.score} / 10 · Due {date(card.dueAt)}</p>
      <h2>{card.prompt}</h2><div><a href={practiceLink(card.questionId)}>Review question</a></div>
    </li>)}</ol>}
  </>;
}
