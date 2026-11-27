# TASK: Build "InterviewForge" — a local-AI-powered interview prep web app

## Goal
Create a website that runs 100% locally and uses a locally running LLM via Ollama
(offline, no cloud APIs) to generate and evaluate interview questions, coding
exercises, and system design scenarios — primary focus on Frontend/JS, but fully
configurable for any stack.

## Architecture
- Backend: Node.js 20+ + Fastify (or Express) + TypeScript. Single server does BOTH:
  1. Serves the built frontend (in production) with SPA fallback.
  2. Proxies ALL Ollama calls to localhost:11434 — the browser NEVER talks to
     Ollama directly, so no OLLAMA_ORIGINS/CORS setup is ever required.
     Also add a per-request timeout + retry on the proxy, and stream LLM
     responses (SSE) through to the frontend.
- Frontend: Vite + React + TypeScript. Styling: Tailwind (or plain CSS) — clean,
  dashboard-like, dark-mode default (it's a dev tool).
- Storage: SQLite via better-sqlite3 in ~/.interviewforge/ (sessions, attempts,
  mastery, settings). Migrations folder, run on startup.
- Dev: `pnpm dev` runs Vite dev server + backend with proxy. Prod: backend serves
  `frontend/dist`. One command to start: `pnpm start`.

## Core features (MVP)

### 1. Generator page (`/generate`)
- Controls: question type (conceptual | coding | debugging | code-review |
  system-design | behavioral), topic dropdown, subtopic multi-select, difficulty
  (easy/medium/hard), count (1–10), "regenerate" button.
- Default topic tree (frontend/JS focus):
  - JS fundamentals (closures, prototypes, event loop, coercion, generators)
  - Async (promises, fetch, AbortController, concurrency patterns)
  - DOM & browser (rendering pipeline, reflow/repaint, storage, Web APIs)
  - React (hooks, rendering, reconciliation, state management, SSR)
  - TypeScript (generics, narrowing)
  - CSS & layout (specificity, flexbox/grid, CWV-adjacent rendering topics)
  - Performance (Core Web Vitals, bundle size, lazy loading, caching)
  - Accessibility & testing (jest/vitest, RTL, a11y audits)
- Question card shows: prompt, topic/difficulty tags, "Reveal answer" button,
  "Evaluate my answer" textarea, "Ask for a hint" (progressive hints:
  nudge → bigger nudge → full answer), follow-up question button.

### 2. Evaluation
- "Evaluate my answer" → backend sends (question + expected key points + user
  answer) to Ollama with a strict grading prompt:
  - score 1–10, missing key points, follow-up question, "what a senior would add".
- IMPORTANT: grading is always anchored to the expected key points stored with
  the question at generation time (never free-form), to guard against the local
  model grading wrong answers as correct.
- Display result as score badge + collapsible feedback sections. Save attempt.

### 3. Coding exercises (`/practice`)
- Generated exercises: JS algorithms, DOM manipulation, "fix this broken React
  component", "implement debounce/deepClone/pubsub" style tasks.
- In-browser code editor: CodeMirror 6 (lightweight) or Monaco. User solution
  runs in a sandboxed Web Worker:
  - Capture console.log/warn/error, serialize results back.
  - Hard timeout (e.g. 3s), terminate worker on infinite loops.
  - Hidden tests are generated WITH the exercise and executed against the
    user's code in the same worker; show pass/fail per test.
- Buttons: Run, Run tests, Submit for AI review (LLM comments on code quality,
  complexity, naming — shown as inline-style review comments).

### 4. System design mode (`/system-design`)
- Scenario picker or generator (e.g., "Design a chat widget", "Design an infinite
  scroll feed", "Design a design-system component library").
- Interactive chat-style flow: user describes their design in a textarea (supports
  mermaid diagrams + markdown rendering); agent responds with structured
  feedback: requirements clarification, component breakdown, data flow, state
  management, performance, trade-offs, "what a staff engineer would push back on",
  plus follow-up questions. Multi-turn conversation per scenario, persisted.

### 5. Mock interview mode (`/mock`)
- Setup: duration (15/30/60 min), topic weights (sliders), difficulty mix.
- Timed session UI: one question at a time, countdown, per-question timer,
  "hint" button (costs points), "skip", "end session early".
- End-of-session report: score per category (radar or bar chart), weakest areas,
  suggested focus topics, full session transcript.

### 6. Dashboard & spaced repetition (`/dashboard`)
- Per-topic mastery table: attempts, avg score, last score, trend arrow.
- `/review` page: resurfaced weak questions (wrong/low-score first, then
  Leitner-style intervals).
- History log of all sessions and attempts (filterable by topic/type/date).

### 7. Settings page (`/settings`)
- Ollama connection: base URL, "Test connection" + "doctor" check (reachable?
  model installed? shows install command if missing). Model picker populated
  from Ollama's /api/tags.
- LLM params: temperature, num_ctx, seed, system prompt override.
- Topic editor: full CRUD on topics/subtopics/weights — this replaces YAML
  config files; editing topics changes generation everywhere. Ships with the
  frontend/JS tree above; examples: "Fullstack", "Backend Go".
- Difficulty distribution, hint policy, timer defaults.
- Prompt template viewer/editor: all prompt templates (one per question type +
  grading + follow-up) editable in a textarea with "reset to default" button.
  This is a first-class configurability surface, not an afterthought.

## LLM layer requirements
- All prompts in backend `prompts/` folder as template strings with typed slots,
  zod-validated JSON output demanded; on schema failure retry once, then surface
  raw text with a warning banner (never crash).
- Every LLM call logs raw request/response to ~/.interviewforge/logs/.
- Guard: wrap every endpoint in error middleware returning { error: string } JSON.

## UX / non-functional
- Offline after model pull. No telemetry, no external network calls except the
  Ollama base URL.
- Loading states for all LLM calls (generating can take 30s+ on 7B models —
  show a spinner with cancel button; use streaming where practical).
- Keyboard-friendly (enter submits, Esc closes dialogs).
- Empty states everywhere (no topics → "add a topic in Settings").
- Responsive down to ~1100px; it will mostly be used on a laptop.

## Deliverables
1. Working app: backend + frontend, `pnpm install && pnpm build && pnpm start`,
   open http://localhost:3000.
2. README: Ollama setup, how to change models, settings reference, screenshots.
3. Seed script: `pnpm seed` inserts the default frontend/JS topic tree and a
   couple of sample questions so the app isn't empty on first run.
4. Smoke test: `pnpm test` runs one generated-question round trip against a real
   Ollama instance (skippable with env flag) + unit tests for the JSON extractor
   and worker sandbox.

## Build order (verify each stage before moving on)
1. Backend skeleton: config, SQLite schema+migrations, Ollama proxy (streaming),
   health/doctor endpoints.
2. Settings page + topic editor (CRUD + seed script).
3. Generator page + evaluation flow + attempt persistence.
4. Coding exercises: editor + Web Worker sandbox + test runner.
5. System design chat mode.
6. Mock mode + dashboard + review (spaced repetition).
7. Polish: README, loading/empty/error states, smoke test.