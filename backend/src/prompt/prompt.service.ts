import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PromptService {
  private templates: Map<string, string> = new Map();

  constructor(private databaseService: DatabaseService) {
    this.loadTemplates();
  }

  private loadTemplates() {
    const promptsDir = path.join(process.cwd(), 'backend', 'prompts');
    const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.ts'));
    
    for (const file of files) {
      const name = path.basename(file, '.ts');
      const content = fs.readFileSync(path.join(promptsDir, file), 'utf-8');
      const match = content.match(/export const \w+Prompt = `([\s\S]+?)`;/);
      if (match) {
        this.templates.set(name, match[1]);
      }
    }
  }

  render(name: string, slots: Record<string, any>): string {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template ${name} not found`);
    }

    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return slots[key] ?? '';
    });
  }

  getTemplate(name: string): string | undefined {
    const db = this.databaseService.getDb();
    const row = db.prepare('SELECT template FROM prompt_templates WHERE key = ?').get(name) as any;
    return row?.template;
  }

  saveTemplate(name: string, template: string): void {
    const db = this.databaseService.getDb();
    const existing = db.prepare('SELECT key FROM prompt_templates WHERE key = ?').get(name);
    
    if (existing) {
      db.prepare('UPDATE prompt_templates SET template = ? WHERE key = ?').run(template, name);
    } else {
      db.prepare('INSERT INTO prompt_templates (key, template) VALUES (?, ?)').run(name, template);
    }
    
    this.templates.set(name, template);
  }
}
