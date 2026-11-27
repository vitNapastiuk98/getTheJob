import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import { openDatabase, getSettings, saveSettings } from '../../backend/src/db.js';
import { DEFAULT_SETTINGS } from '../../shared/contracts.js';
const dirs: string[] = [];
function temp() { const dir = mkdtempSync(join(tmpdir(), 'forge-db-')); dirs.push(dir); return dir; }
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
it('migrates a fresh database and preserves settings on restart', () => {
  const dir = temp(); const db = openDatabase(dir);
  expect(getSettings(db).numCtx).toBe(16384);
  saveSettings(db, { ...DEFAULT_SETTINGS, model: 'other:9b' });
  expect(db.prepare('select count(*) as n from schema_migrations').get()).toEqual({ n: 2 });
  db.close(); const reopened = openDatabase(dir);
  expect(getSettings(reopened).model).toBe('other:9b');
  expect(reopened.pragma('foreign_keys', { simple: true })).toBe(1);
  reopened.close();
});
it('rolls back a failing migration without deleting prior data', () => {
  const dir = temp(); const migrations = join(dir, 'migrations'); mkdirSync(migrations);
  writeFileSync(join(migrations, '001_initial.sql'), readFileSync('backend/migrations/001_initial.sql'));
  const db = openDatabase(dir, migrations); saveSettings(db, { ...DEFAULT_SETTINGS, model: 'preserved' }); db.close();
  writeFileSync(join(migrations, '002_invalid.sql'), 'CREATE TABLE should_rollback(id TEXT); INVALID SQL;');
  expect(() => openDatabase(dir, migrations)).toThrow();
  const inspect = new Database(join(dir, 'interviewforge.sqlite'));
  expect(inspect.prepare("SELECT name FROM sqlite_master WHERE name='should_rollback'").get()).toBeUndefined();
  expect(getSettings(inspect).model).toBe('preserved'); inspect.close();
});
