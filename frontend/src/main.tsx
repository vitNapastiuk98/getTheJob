import { createRoot } from 'react-dom/client';
import { lazy, Suspense, useRef, useState } from 'react';
import { MockPage } from './pages/MockPage.js';
import { GeneratePage } from './pages/GeneratePage.js';
import { DashboardPage, ReviewPage } from './pages/ProgressPages.js';
import './styles.css';

const PracticePage = lazy(() => import('./pages/PracticePage.js').then(({ PracticePage: Page }) => ({ default: Page })));
const DesignPage = lazy(() => import('./pages/DesignPage.js').then(({ DesignPage: Page }) => ({ default: Page })));
const SettingsPage = lazy(() => import('./pages/SettingsPage.js').then(({ SettingsPage: Page }) => ({ default: Page })));
const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage.js').then(({ ApplicationsPage: Page }) => ({ default: Page })));
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
const pages = [
  { path: '/dashboard', label: 'Dashboard', Page: DashboardPage },
  { path: '/generate', label: 'Generate', Page: GeneratePage },
  { path: '/practice', label: 'Coding practice', Page: PracticePage },
  { path: '/system-design', label: 'System design', Page: DesignPage },
  { path: '/mock', label: 'Mock interview', Page: MockPage },
  { path: '/applications', label: 'Applications', Page: ApplicationsPage },
  { path: '/review', label: 'Review', Page: ReviewPage },
  { path: '/settings', label: 'Settings', Page: SettingsPage },
];
const active = pages.find(({ path }) => path === location.pathname) ?? pages[0];
function Navigation() {
  const [expanded, setExpanded] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return <header className="rail" onKeyDown={(event) => {
    if (event.key === 'Escape' && expanded && toggle.current?.getClientRects().length) {
      setExpanded(false);
      toggle.current.focus();
    }
  }}>
    <a className="brand" href="/">InterviewForge</a>
    <button className="nav-toggle" type="button" ref={toggle} aria-controls="practice-modes"
      aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>Modes · {active.label}</button>
    <nav id="practice-modes" aria-label="Practice modes">{pages.map(({ path, label }) => <a key={path} href={path} aria-current={active.path === path ? 'page' : undefined}>{label}</a>)}</nav>
    <p className="muted rail-status">Local practice</p>
  </header>;
}

createRoot(root).render(
  <>
    <a className="skip-link" href="#content">Skip to content</a>
    <Navigation />
    <main id="content"><Suspense fallback={<p role="status">Loading practice…</p>}><active.Page /></Suspense></main>
  </>,
);
