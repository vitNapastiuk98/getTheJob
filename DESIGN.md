# Design

## Source of truth
**Status:** Active · **Date:** 2026-11-20.
Applies to the InterviewForge React frontend. Requirements: `reqs.md`; approved implementation and verification plans: `.omx/plans/prd-interviewforge.md` and `.omx/plans/test-spec-interviewforge.md`.

Inspection found a greenfield repository: no existing frontend, package manifest, components, tokens, images, screenshots, or visual baseline at the time of this contract. React + Vite + TypeScript and plain CSS are planned constraints, not an inspected implementation. This document governs presentation only; the approved plan owns routes, API contracts, data, and security boundaries.

## Brand
A serious, calm practice workbench for developers. Warm charcoal and sand make long answers comfortable to read; restrained emerald signals an available action or confirmed status. Trust comes from visible model identity, local-only operation, saved state, reference answers, and honest failure messages.

Avoid marketing heroes, glowing gradients, decorative statistics, game-like streak pressure, oversized empty cards, terminal cosplay, and claims that AI grades are authoritative. Do not display a green connection indicator until a real backend check succeeds.

## Product goals
- Make generating, answering, and reviewing a question the clearest path through the product.
- Keep settings and topics genuinely editable without hiding them behind configuration files.
- Preserve visible progress during slow local inference and make cancellation easy.
- Make weak areas and due reviews actionable, not merely numeric.
- Non-goals: social features, onboarding tours, cosmetic theme controls, and a separate design-system package.
- Success signals: users can locate every mode, recover from missing models/topics, and distinguish saved results from streaming previews.

## Personas and jobs
Primary user: a developer preparing for an interview on a laptop, often with an editor and local model running alongside the browser. Jobs: targeted practice, timed rehearsal, code execution, architecture discussion, and revisiting weak answers. Default examples use frontend/JavaScript; visible copy must also fit user-created stacks.

## Information architecture
Preserve the approved seven-route navigation, in this order: Dashboard (`/dashboard`), Generate (`/generate`), Coding practice (`/practice`), System design (`/system-design`), Mock interview (`/mock`), Review (`/review`), Settings (`/settings`). Keep history within Dashboard as required; do not invent an eighth route.

Shell: fixed-width left navigation, main content on the right, compact local/model status at the bottom of the navigation. Each page begins with one clear heading, one short purpose sentence if useful, and its primary action. The active navigation item uses a filled tonal background and a visible label, not color alone.

- **Generate:** compact controls above an ordered question list; full-width readable prompt, tags, answer area, and grouped actions. Reveal reference answers and feedback in semantic disclosure sections.
- **Practice:** exercise brief above an editor/results split; keep Run, Run tests, and Submit AI review visually distinct. Show runtime selection and the DOM/React resource-limit warning near Run.
- **System design:** scenario selection above a conversation; structured feedback headings inside the assistant turn. A normal textarea supports Markdown and Mermaid source.
- **Mock:** setup becomes a focused single-question view. Place session countdown and per-question timer beside their explicit labels. End/skip actions remain secondary; report uses labeled horizontal bars plus numeric values and transcript.
- **Dashboard/Review:** prioritize due practice and readable mastery/history tables. Review orders come from the backend; the UI must not fabricate progress or reorder scores independently.
- **Settings:** section navigation or anchor links for Connection, Model parameters, Topics, Practice defaults, and Prompt templates. These are sections, not extra app routes.

## Design principles
1. **The answer is the main surface.** Give questions, code, and feedback more space than chrome.
2. **Density with hierarchy.** Use tables for comparisons and dividers for related settings; do not wrap every field in its own card.
3. **Status must be earned.** Distinguish checking, ready, unavailable, generating, canceled, and saved.
4. **Stable while thinking.** Stream into a bounded preview, preserve controls and user input, and avoid layout jumps.
5. **One visual accent, several semantic states.** Emerald is not a substitute for warning, error, or score labels.

## Visual language
Define these variables once in `frontend/src/styles.css`; page CSS consumes them rather than duplicating hex values.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#171918` | Application canvas |
| `--surface` | `#202421` | Editor, inputs, selected content areas |
| `--surface-raised` | `#292F2A` | Menus and active navigation |
| `--text` | `#EEE9DE` | Main sand-colored text |
| `--muted` | `#B5B9B1` | Secondary labels and metadata |
| `--border` | `#485249` | Structural rules and control boundaries |
| `--accent` | `#82D6AF` | Primary buttons, active markers, focus |
| `--on-accent` | `#14281F` | Text on filled accent buttons |
| `--warning` | `#F1C477` | Caution and invalid-output banners |
| `--danger` | `#FFAAA2` | Errors and destructive action text |

Typography: use locally available `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` for the interface and `ui-monospace, "SFMono-Regular", Consolas, monospace` for code. No remote fonts. Display headings are 30–34px, weight 650–700, with slightly tight tracking; section headings 20px; body 15–16px/1.6; supporting text 13px/1.5. Limit prose to roughly 72 characters; do not constrain editor width to prose measures. Use sentence case, not tracked uppercase labels.

Spacing rhythm: 4, 8, 12, 16, 24, 32, 48px. Use 8px control radii and 12px for the few containing panels. Prefer a border over a shadow; reserve a soft shadow for floating menus/dialogs. Icons are optional inline SVG with accessible labels, not external assets. No decorative imagery is needed.

## Components
Use ordinary React components and semantic HTML; no new component-library dependency. Share only repeated behavior:
- `AppShell`: navigation, skip link, page landmark, local/model status.
- Labeled form controls: input, select, textarea, checkbox group, range with its current numeric value.
- Button variants: primary filled accent, secondary bordered, quiet text, destructive. Disabled state retains legibility.
- `QuestionCard`: question metadata, reference disclosure, answer form, hint progression, feedback disclosures.
- `AsyncStatus`: spinner/status text/cancel, retry message, raw-response warning with bounded preformatted disclosure.
- Score badge: `7 / 10` text and contextual label; color supplements the number.
- Empty state: short explanation plus one next action; compact rather than a full-screen illustration.
- Tables: real header cells, aligned numeric columns, text trend labels with optional arrows.
- Code editor, results/log panel, and review comments with line references and readable text.

Use native `<details>` for feedback/reference sections and native controls where possible. Dialogs need explicit labels, focus management, Escape dismissal, and focus return. Do not introduce a modal if inline editing solves the same task.

## Accessibility
Target WCAG 2.2 AA; this is a target, not a verified compliance claim. Use landmarks, one page `h1`, logical heading levels, real buttons/links, associated labels, and field-level validation. Provide a visible 2px accent focus outline with offset. Controls should have at least a 40px interaction height where practical.

Do not encode connection, grades, or test results through color alone. A status region announces inference state transitions, not every streamed token; timers must not announce every second. Errors use an alert only when newly actionable. Enter submits short forms; Ctrl/Cmd+Enter submits multiline answers/design input, with the shortcut shown; editor Enter remains newline. Respect `prefers-reduced-motion`; no pulsing status, entrance choreography, or flashing countdowns. Verify contrast in rendered control states before release.

## Responsive behavior
At 1280px and above: 216px sidebar, 32px main gutters, content capped around 1440px. At 1100–1279px: 192px sidebar and 24px gutters; form controls wrap deliberately, and editor/results may stack if either would become unusable. At narrower widths, use a compact labeled navigation disclosure and one-column content as a graceful fallback. Do not hide required actions or rely on hover. Tables may scroll inside a labeled region; the entire page should not scroll horizontally at 1100px.

## Interaction states
- **First run:** show seeded samples as samples, not user achievements. No attempt data means “No attempts yet” and a Generate action, not invented charts.
- **No topics:** “Add a topic in Settings” with a working link; disable generation with the reason beside it.
- **Model unavailable:** preserve all local data/views; show Test connection and the backend-provided installation command. Never pull a model silently.
- **Slow inference:** show “Generating with [model]…” plus elapsed time, spinner, and Cancel. Keep answer/code drafts intact. A retry clearly resets the preview.
- **Invalid model output:** warning banner says the response could not be validated; reveal raw text as text, not HTML. Do not style it as a saved result.
- **Canceled/error:** stop busy indicators; identify whether anything was saved and allow retry without losing the draft.
- **Settings:** show saving, saved, and failed states next to the changed section; never imply an unsaved edit is active. Warn that 32768 context uses more memory and raw logs contain answers/code.
- **Practice:** distinguish idle, running, timed out, passed/failed tests, and AI review. Disclose iframe infinite-loop risk before DOM/React execution; do not label its timer a guaranteed hard limit.
- **Mock:** keep remaining time visible and distinguish skipped, answered, and ungraded items in reports.

## Content voice
Direct, specific, and calm. Actions: “Generate questions,” “Evaluate answer,” “Run tests,” “Save settings,” “Reset template.” Avoid “unlock,” “level up,” and generic “Something went wrong.” AI feedback includes “AI assessment — check against the reference answer.” Local status says “Model ready” only after a successful check; no blanket “secure” badge.

## Implementation constraints
Use React/Vite/TypeScript with plain CSS and locally bundled CodeMirror, Markdown, and Mermaid dependencies from the approved plan. Browser requests go through the backend; no CDN fonts, scripts, images, or analytics. Do not change security/API behavior to achieve visual polish. Sanitize generated rich content through the owning implementation rather than injecting raw HTML.

Verify each shipped surface in a real browser: loading, empty, error, success, keyboard focus, and 1100px layout. Capture real Dashboard, Generate, Practice, and Settings screenshots for README after functional implementation. Check console errors and network requests; document anything not runnable. This contract itself does not establish visual, runtime, or accessibility test success.

## Open questions
No blocking design questions. System-font rendering differs by platform; use actual local browser screenshots as the implementation baseline, without introducing a font download. The frontend owner should update this contract only if implementation evidence exposes a material contradiction.
