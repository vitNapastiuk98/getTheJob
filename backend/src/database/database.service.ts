import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { ConfigService } from '@nestjs/config';
import { mkdirSync, chmodSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db: Database.Database;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const dataDir = this.configService.get<string>('DATA_DIR', resolve('data'));
    const migrationsDir = resolve('backend/migrations');
    this.db = this.openDatabase(dataDir, migrationsDir);
  }

  onModuleDestroy() {
    if (this.db) {
      this.db.close();
    }
  }

  private openDatabase(dataDir: string, migrationsDir: string): Database.Database {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const filename = join(dataDir, 'interviewforge.sqlite');
    const db = new Database(filename);
    
    try {
      chmodSync(filename, 0o600);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      
      db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
      
      for (const file of readdirSync(migrationsDir).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
        if (db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(file)) continue;
        db.transaction(() => {
          db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
          db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(file, new Date().toISOString());
        })();
      }
      
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  getDb(): Database.Database {
    return this.db;
  }
}
