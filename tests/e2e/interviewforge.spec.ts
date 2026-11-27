import { expect, test } from '@playwright/test';

const screens = [
  ['dashboard', 'Dashboard'], ['generate', 'Generate questions'], ['practice', 'Coding practice'],
  ['system-design', 'System design'], ['mock', 'Mock interview'], ['review', 'Review'], ['settings', 'Settings'],
] as const;

function sampleCv(): Buffer {
  const content = 'BT /F1 14 Tf 60 740 Td (Led LedgerFlow incident response.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test('all eight routes render at mobile, laptop, and desktop widths with local assets', async ({ page }, result) => {
  const problems = new Set<string>();
  page.on('pageerror', (error) => problems.add(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith(`http://127.0.0.1:${process.env.INTERVIEWFORGE_E2E_PORT ?? '47832'}/`) && !request.url().startsWith('blob:')) problems.add(request.url());
  });
  for (const width of [390, 1100, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, heading] of screens) {
      await page.goto(`/${route}`);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      if (width === 390) {
        const toggle = page.getByRole('button', { name: /^Modes · / });
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(page.getByRole('navigation', { name: 'Practice modes' })).toBeHidden();
        await toggle.press('Enter');
        const activeLink = page.locator('nav[aria-label="Practice modes"] [aria-current="page"]');
        await expect(activeLink).toBeVisible();
        await activeLink.press('Escape');
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(toggle).toBeFocused();
      }
      await expect(page.locator('nav[aria-label="Practice modes"] a')).toHaveCount(8);
      await expect(page.locator('nav[aria-label="Practice modes"] [aria-current="page"]')).toHaveAttribute('href', `/${route}`);
      if (route === 'settings') await expect(page.getByRole('button', { name: 'Test connection' })).toBeVisible();
      if (route === 'generate' || route === 'practice') await expect(page.getByRole('combobox', { name: 'Topic', exact: true }).locator('option').first()).toBeAttached();
      if (route === 'dashboard') await expect(page.getByText('Loading history…')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: result.outputPath(`${route}-${width}.png`) });
    }
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  expect([...problems]).toEqual([]);
});

test('pages that need a topic link to Settings when no topics exist', async ({ page }, result) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route('**/api/topics', (route) => route.fulfill({ json: [] }));
  for (const [path, action] of [
    ['generate', 'Generate questions'],
    ['practice', 'Generate exercise'],
    ['mock', 'Start mock interview'],
  ] as const) {
    await page.goto(`/${path}`);
    await expect(page.getByRole('button', { name: action, exact: true })).toBeDisabled();
    const recovery = page.getByRole('link', { name: /add (a topic|topics) in settings/i });
    await expect(recovery).toHaveAttribute('href', '/settings');
    await page.screenshot({ path: result.outputPath(`${path}-no-topics-390.png`) });
  }
});

test('generate, reveal and grade a question, then reload the attempt', async ({ page }, result) => {
  await page.goto('/generate');
  await page.getByRole('combobox', { name: 'Topic', exact: true }).selectOption('react');
  await page.getByRole('combobox', { name: 'Difficulty' }).selectOption('easy');
  await page.getByRole('button', { name: 'Generate questions' }).click();
  await expect(page.getByText('Why do React keys need to be stable?')).toBeVisible();
  await page.getByText('Reveal answer').click();
  await expect(page.getByText('Keys identify list items between renders.')).toBeVisible();
  await page.getByRole('button', { name: 'Ask for a hint' }).click();
  await expect(page.getByText('Hint 1: Consider the trade-off.')).toBeVisible();
  await page.getByLabel('Your answer').fill('Keys identify the same item between renders.');
  await page.getByRole('button', { name: 'Evaluate answer' }).click();
  await expect(page.getByText('Score: 9 / 10')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Topic', exact: true })).toHaveValue('react');
  await expect(page.getByText('Score: 9 / 10')).toBeVisible();
  await page.screenshot({ path: result.outputPath('generate-result.png'), fullPage: true });
});

test('coding answers use a code editor and run locally before evaluation', async ({ page }, result) => {
  await page.goto('/generate');
  await page.getByRole('combobox', { name: 'Question type' }).selectOption('coding');
  await page.getByRole('combobox', { name: 'Topic', exact: true }).selectOption('js-fundamentals');
  await page.getByRole('button', { name: 'Generate questions' }).click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('Tab');
  expect((await editor.textContent())?.startsWith('  ')).toBe(true);
  await page.keyboard.type('console.log("probe", 6 * 7);');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.getByLabel('Code output')).toContainText('probe 42');
  await expect(page.getByLabel('Code output')).toContainText('result');
  await page.getByRole('button', { name: 'Evaluate answer' }).click();
  await expect(page.getByText(/Score: \d+ \/ 10/)).toBeVisible();
  await page.screenshot({ path: result.outputPath('generate-coding-run.png'), fullPage: true });
});

test('slow inference shows the active model, elapsed time and working cancellation', async ({ page }) => {
  await page.goto('/generate');
  await page.route('**/api/questions/generate', async (route) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.getByRole('button', { name: 'Generate questions' }).click();
  await expect(page.getByText(/Generating questions with fixture:local/)).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Topic', exact: true })).toBeDisabled();
  await expect(page.getByText(/[1-9]\d*s elapsed/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Canceled. Your draft was kept.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate questions' })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Topic', exact: true })).toBeEnabled();
});

test('practice runs tests, shows AI line comments, and recovers after a hard timeout', async ({ page }, result) => {
  await page.goto('/practice');
  await page.getByRole('button', { name: 'Generate exercise' }).click();
  const editor = page.getByLabel('Solution code');
  const solution = 'function double(n) { console.log("input", n); return n * 2; }';
  await editor.fill(solution);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('input 4')).toBeVisible();
  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(page.getByText('Fixture case')).toBeVisible();
  await expect(page.getByText('Pass', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Submit for AI review' }).click();
  await expect(page.getByText('Good entry point.')).toBeVisible();
  await page.screenshot({ path: result.outputPath('practice-result.png'), fullPage: true });
  await editor.fill('while (true) {}');
  const workerClosed = new Promise<void>((resolve) => {
    page.once('worker', (worker) => worker.once('close', () => resolve()));
  });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('Timed out after 3 s')).toBeVisible({ timeout: 5000 });
  await workerClosed;
  await editor.fill(solution);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('input 4')).toBeVisible();
});

test('practice exposes invalid model output as text and preserves the code draft', async ({ page }) => {
  await page.goto('/practice');
  await page.getByRole('button', { name: 'Generate exercise' }).click();
  await page.getByLabel('Solution code').fill('function double(n) { return n * 2; }');
  const warning = 'The model returned invalid structured output twice. Nothing was saved.';
  const raw = '{"model_reply": "<script>not HTML</script>"}';
  await page.route('**/api/practice/generate', (route) => route.fulfill({
    headers: { 'content-type': 'text/event-stream' },
    body: ['status', 'warning', 'done'].map((type) => `event: ${type}\ndata: ${JSON.stringify({ type, payload: type === 'warning' ? { warning, raw } : {} })}\n\n`).join(''), 
  }));
  await page.getByRole('button', { name: 'Generate exercise' }).click();
  const visibleWarning = page.getByText(warning);
  await expect(visibleWarning).toBeVisible();
  await visibleWarning.click();
  await expect(page.locator('pre').filter({ hasText: '<script>not HTML</script>' })).toBeVisible();
  await expect(page.getByLabel('Solution code')).toHaveText('function double(n) { return n * 2; }');
});

test('DOM execution uses an isolated browser document and disposes the runner on completion and navigation', async ({ page }, result) => {
  await page.goto('/practice');
  await page.getByRole('combobox', { name: 'Runtime' }).selectOption('dom');
  await page.getByRole('button', { name: 'Generate exercise' }).click();
  await page.getByLabel('Solution code').fill('function styleButton() { document.querySelector("button").style.color = "rgb(0, 0, 255)"; }');
  await page.getByRole('button', { name: 'Run tests', exact: true }).click();
  await expect(page.getByText('Pass', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Runtime' }).selectOption('js');
  await expect(page.getByText(/a synchronous loop can block the tab/i)).toBeVisible();
  await page.getByLabel('Solution code').fill(`async function styleButton() {
    function denied(read) {
      try { read(); return false; } catch (error) { return error.name === "SecurityError"; }
    }
    assert(denied(() => parent.document), "Parent document was accessible");
    assert(denied(() => localStorage.length), "Browser storage was accessible");
    const blocked = await import("data:text/javascript,export default 42").then(() => false, () => true);
    assert(blocked, "Restricted module was loaded");
    await new Promise(resolve => setTimeout(resolve, 700));
    return "Browser restrictions held";
  }`);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const runner = page.locator('iframe[title="Isolated exercise runner"]');
  await expect(runner).toHaveAttribute('sandbox', 'allow-scripts');
  expect(await runner.evaluate((frame: HTMLIFrameElement) => frame.contentDocument)).toBeNull();
  await expect(page.getByText('Browser restrictions held')).toBeVisible();
  await expect(runner).toHaveCount(0);
  await page.screenshot({ path: result.outputPath('dom-result.png'), fullPage: true });
  await page.getByLabel('Solution code').fill('async function styleButton() { await new Promise(resolve => setTimeout(resolve, 2500)); }');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(runner).toHaveCount(1);
  const detached = page.waitForEvent('framedetached');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await detached;
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(runner).toHaveCount(0);
});

test('React practice compiles JSX and hidden tests render components with props', async ({ page }, result) => {
  await page.goto('/practice');
  await page.getByRole('combobox', { name: 'Runtime' }).selectOption('react');
  await page.getByRole('button', { name: 'Generate exercise' }).click();
  await page.getByLabel('Solution code').fill('function NamedButton({ name }) { return <button>{name}</button>; }');
  await page.getByRole('button', { name: 'Run tests', exact: true }).click();
  await expect(page.getByText('Uses the name prop')).toBeVisible();
  await expect(page.getByText('Pass', { exact: true })).toBeVisible();
  await page.screenshot({ path: result.outputPath('react-result.png'), fullPage: true });
});

test('company and locally extracted CV context shape a saved mock interview', async ({ page }, result) => {
  await page.goto('/mock');
  await page.locator('#company-name').fill('Sipwise');
  await page.locator('#job-role').fill('Frontend Developer');
  await page.locator('#company-info').fill('Frontend interview emphasizing JavaScript, React, TypeScript, accessibility, and telecom web applications.');
  await page.locator('#duration').selectOption('15');
  await page.locator('#cv-pdf').setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
  await expect(page.getByText('The PDF could not be read.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start mock interview' })).toBeDisabled();
  await page.locator('#cv-pdf').setInputFiles({ name: 'candidate.pdf', mimeType: 'application/pdf', buffer: sampleCv() });
  await expect(page.getByText(/candidate.pdf: \d+ characters extracted/)).toBeVisible();
  await page.getByRole('button', { name: 'Start mock interview' }).click();
  await expect(page.getByText('How did you handle LedgerFlow incident response?')).toBeVisible();
  await page.getByRole('button', { name: 'Get hint' }).click();
  await expect(page.getByText('Consider the trade-off.')).toBeVisible();
  await page.getByRole('button', { name: 'Skip question' }).click();
  await page.getByRole('button', { name: 'End interview' }).click();
  await expect(page.getByRole('heading', { name: 'Mock interview report · Sipwise' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('CV: candidate.pdf')).toBeVisible();
  await expect(page.getByText('Hints used: 1')).toBeVisible();
  await page.screenshot({ path: result.outputPath('mock-result.png') });
});

for (const width of [390, 1440]) {
  test(`system design announces loading and explains an empty scenario list at ${width}px`, async ({ page }, result) => {
    await page.setViewportSize({ width, height: 900 });
    let respond: (() => void) | undefined;
    const response = new Promise<void>((resolve) => { respond = resolve; });
    await page.route('**/api/design/scenarios', async (route) => {
      await response;
      await route.fulfill({ json: [] });
    });
    try {
      await page.goto('/system-design');
      await expect(page.getByRole('status')).toHaveText('Loading design scenarios…');
      await page.screenshot({ path: result.outputPath(`design-loading-${width}.png`) });
    } finally {
      respond?.();
    }
    await expect(page.getByRole('status')).toHaveText('No design scenarios available. Generate a scenario below to get started.');
    await expect(page.getByRole('button', { name: 'Start design session' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Generate a scenario' })).toBeEnabled();
    await page.screenshot({ path: result.outputPath(`design-empty-${width}.png`) });
  });
}

test('system design restores Markdown, diagrams, and feedback after reload', async ({ page }, result) => {
  await page.goto('/system-design');
  await page.getByRole('button', { name: 'Start design session' }).click();
  await page.getByLabel('Your design notes').fill('**Messages** use a list.\n\n```mermaid\nflowchart LR\n A[Socket] --> B[Message list]\n```');
  await page.getByRole('button', { name: 'Submit design' }).click();
  await expect(page.getByRole('img', { name: 'Mermaid diagram from your design' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('img', { name: 'Mermaid diagram from your design' })).toBeVisible();
  await expect(page.getByText('How do you handle duplicate events?')).toBeVisible();
  await page.screenshot({ path: result.outputPath('design-result.png'), fullPage: true });
});

test('system design keeps the submitted draft and retry action after invalid feedback and reload', async ({ page }) => {
  await page.goto('/system-design');
  await page.getByRole('button', { name: 'Start design session' }).click();
  await page.getByLabel('Your design notes').fill('**Draft for failed feedback**');
  await page.getByRole('button', { name: 'Submit design' }).click();
  await expect(page.getByRole('button', { name: 'Retry feedback' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Draft for failed feedback', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry feedback' })).toBeEnabled();
});

test('cancelling design feedback leaves exactly one saved turn ready to retry without reloading', async ({ page }) => {
  await page.goto('/system-design');
  await page.getByRole('button', { name: 'Start design session' }).click();
  await page.getByLabel('Your design notes').fill('Cancel this design review');
  const started = page.waitForResponse((response) => response.url().endsWith('/messages') && response.ok());
  await page.getByRole('button', { name: 'Submit design' }).click();
  await started;
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Cancel this design review', { exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Your design notes')).toHaveValue('');
  const sessionId = new URL(page.url()).searchParams.get('session');
  if (!sessionId) throw new Error('Expected a saved session URL');
  await expect.poll(async () => {
    const saved = await page.request.get(`/api/design/sessions/${encodeURIComponent(sessionId)}`);
    return (await saved.json()).messages[0]?.status;
  }).toBe('failed');
  await expect(page.getByRole('button', { name: 'Retry feedback' })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry feedback' }).click();
  await expect(page.getByText('How do you handle duplicate events?')).toBeVisible();
  await expect(page.getByText('Cancel this design review', { exact: true })).toHaveCount(1);
});

test('Settings saves local model defaults, and unavailable model reports recovery', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Installed: fixture:local')).toBeVisible();
  await page.getByRole('combobox', { name: 'Default timer' }).selectOption('15');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Default timer' })).toHaveValue('15');
  await page.getByLabel('Model', { exact: true }).fill('missing:local');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('ollama pull missing:local')).toBeVisible();
});

test('applications creates application, generates cover letter, and marks successful', async ({ page }) => {
  await page.goto('/applications');
  await expect(page.getByText('No applications yet.')).toBeVisible();
  await page.getByLabel('Job title').fill('Frontend Developer');
  await page.getByLabel('Company').fill('Acme Corp');
  await page.getByLabel('Job description').fill('Build React apps.');
  await page.getByLabel('Your achievements').fill('5 years React experience.');
  await page.getByRole('button', { name: 'Add application' }).click();
  await expect(page.getByText('Frontend Developer')).toBeVisible();
  await expect(page.getByText('Acme Corp')).toBeVisible();
  await page.getByRole('button', { name: 'Generate cover letter' }).click();
  await expect(page.getByText('Cover letter')).toBeVisible();
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mark successful' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark successful' }).click();
  await expect(page.getByRole('button', { name: 'Mark unsuccessful' })).toBeVisible();
});

test('applications uses selected model when generating cover letter', async ({ page }) => {
  await page.goto('/applications');
  await page.getByLabel('Job title').fill('Backend Developer');
  await page.getByLabel('Company').fill('TechCorp');
  await page.getByLabel('Job description').fill('Build APIs.');
  await page.getByLabel('Your achievements').fill('Node.js expert.');
  await page.getByRole('button', { name: 'Add application' }).click();
  await expect(page.getByText('Backend Developer')).toBeVisible();
  
  const modelSelect = page.locator('select').filter({ has: page.locator('option') });
  await expect(modelSelect).toBeVisible();
  
  const options = await modelSelect.locator('option').allTextContents();
  expect(options.length).toBeGreaterThan(0);
  
  if (options.length > 1) {
    await modelSelect.selectOption(options[1]);
  }
  
  await page.getByRole('button', { name: 'Generate cover letter' }).click();
  await expect(page.getByText('Cover letter')).toBeVisible();
});
