import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test as base } from '@playwright/test';
import { buildApp } from '../../backend/src/app.js';
import { seedDatabase } from '../../backend/src/seed.js';

const test = base.extend<{ forge: { app: Awaited<ReturnType<typeof buildApp>>; origin: string } }>({
  forge: async ({ baseURL: _baseURL }, use) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'forge-gates-e2e-'));
    const app = await buildApp({ dataDir });
    try {
      seedDatabase(app.db);
      await use({ app, origin: await app.listen({ host: '127.0.0.1', port: 0 }) });
    } finally {
      await app.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  },
});

test('History announces both ranges and allows keyboard paging', async ({ page, forge }, result) => {
  const insert = forge.app.db.prepare("INSERT INTO sessions (id, kind, status, config_json, started_at) VALUES (?, 'design', 'ended', ?, ?)");
  forge.app.db.transaction(() => {
    for (let i = 0; i <= 100; i++) insert.run(`design-${i}`, JSON.stringify({ title: `Design session ${i}` }), '2020-01-01T00:00:00.000Z');
  })();

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${forge.origin}/dashboard`);
  const nav = page.getByRole('navigation', { name: 'History pages' });
  const previous = nav.getByRole('button', { name: 'Previous page' });
  const next = nav.getByRole('button', { name: 'Next page' });
  const range = nav.getByRole('status');
  await expect(range).toHaveText('Attempts: 0 of 0. Sessions: 1–100 of 101.');
  await expect(previous).toBeDisabled();
  await next.press('Enter');
  await expect(range).toHaveText('Attempts: 0 of 0. Sessions: 101–101 of 101.');
  await expect(page.getByRole('link', { name: 'Design session 0', exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();
  await nav.screenshot({ path: result.outputPath('history-page-2-mobile.png') });

  await previous.press('Enter');
  await expect(range).toContainText('Sessions: 1–100 of 101');
  await expect(previous).toBeDisabled();
  await next.press('Enter');
  await expect(range).toContainText('Sessions: 101–101 of 101');
  await page.getByLabel('From', { exact: true }).fill('2020-01-01');
  await page.getByRole('button', { name: 'Filter history' }).click();
  await expect(range).toContainText('Sessions: 1–100 of 101');
  await expect(previous).toBeDisabled();
});

for (const reason of ['ending', 'expiry'] as const) {
  test(`Mock report distinguishes ${reason} with a draft from an explicit skip`, async ({ page, forge }, result) => {
    const setup = { durationMinutes: 15, topicWeights: { 'js-fundamentals': 100 }, difficulty: { easy: 100, medium: 0, hard: 0 } };
    const now = Date.now();
    const startedAt = new Date(now).toISOString();
    forge.app.db.prepare("INSERT INTO sessions VALUES ('mock-fixture', 'mock', 'active', ?, ?, ?, NULL)")
      .run(JSON.stringify(setup), startedAt, new Date(now + 60_000).toISOString());
    const insert = forge.app.db.prepare("INSERT INTO session_items (id, session_id, question_id, position, status, started_at) VALUES (?, 'mock-fixture', 'sample-closures', ?, ?, ?)");
    insert.run('skipped-fixture', 0, 'skipped', startedAt);
    insert.run('open-fixture', 1, 'active', startedAt);

    await page.setViewportSize({ width: reason === 'expiry' ? 390 : 1440, height: 900 });
    await page.clock.install({ time: now });
    await page.goto(`${forge.origin}/mock?session=mock-fixture`);
    await page.getByRole('textbox', { name: 'Your answer' }).fill('This draft has not been submitted.');
    if (reason === 'expiry') {
      forge.app.db.prepare("UPDATE sessions SET deadline_at = ? WHERE id = 'mock-fixture'").run(startedAt);
      await page.clock.fastForward(60_000);
    } else {
      await page.getByRole('button', { name: 'End interview' }).click();
    }
    await expect(page.getByRole('heading', { name: 'Mock interview report' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Question 1 · Skipped' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Question 2 · Ungraded' })).toBeVisible();
    await expect(page.getByText('No scored answers.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Question 2 · Ungraded' })).toBeVisible();
    await page.screenshot({ path: result.outputPath(`mock-${reason}.png`), fullPage: true });
  });
}
