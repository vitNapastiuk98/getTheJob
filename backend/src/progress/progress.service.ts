import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { HistoryAttempt, HistoryPage, HistorySession, Mastery, ReviewCard } from "../shared/contracts.js";

@Injectable()
export class ProgressService {
  constructor(private databaseService: DatabaseService) {}

  getDashboard(): { mastery: Mastery[]; due: number } {
    const db = this.databaseService.getDb();
    
    const mastery = db.prepare(`
      WITH recent AS (
        SELECT 
          question.topic_id AS topicId, 
          COALESCE(topic.name, json_extract(question.topic_snapshot_json, '$.name')) AS topic,
          attempt.score, 
          ROW_NUMBER() OVER (PARTITION BY question.topic_id ORDER BY attempt.created_at DESC, attempt.rowid DESC) AS position
        FROM attempts AS attempt 
        JOIN questions AS question ON question.id = attempt.question_id
        LEFT JOIN topics AS topic ON topic.id = question.topic_id 
        WHERE attempt.kind IN ('question', 'mock')
      ), 
      results AS (
        SELECT 
          topicId, 
          topic, 
          COUNT(*) AS attempts, 
          ROUND(AVG(score), 1) AS average,
          MAX(CASE WHEN position = 1 THEN score END) AS lastScore,
          MAX(CASE WHEN position = 2 THEN score END) AS priorScore
        FROM recent 
        GROUP BY topicId, topic
      )
      SELECT 
        topicId, 
        topic, 
        attempts, 
        average, 
        lastScore,
        CASE 
          WHEN lastScore > priorScore THEN 'up' 
          WHEN lastScore < priorScore THEN 'down' 
          ELSE 'steady' 
        END AS trend
      FROM results 
      ORDER BY topic, topicId
    `).all() as Mastery[];

    const dueRow = db.prepare('SELECT COUNT(*) AS count FROM review_cards WHERE due_at <= ?').get(new Date().toISOString()) as { count: number };
    
    return { mastery, due: dueRow.count };
  }

  getHistory(filters: {
    topicId?: string;
    type?: string;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
  }): HistoryPage {
    const db = this.databaseService.getDb();
    const { topicId = null, type = null, from = null, to = null, page, pageSize } = filters;

    if (from && to && from > to) {
      throw new Error('Start date must not be after end date');
    }

    const attemptMatches = `
      FROM attempts AS a 
      JOIN questions AS q ON q.id = a.question_id
      WHERE (@topicId IS NULL OR q.topic_id = @topicId) 
        AND (@type IS NULL OR q.type = @type)
        AND (@from IS NULL OR substr(a.created_at, 1, 10) >= @from) 
        AND (@to IS NULL OR substr(a.created_at, 1, 10) <= @to)
    `;

    const sessionMatches = `
      FROM sessions AS s 
      WHERE s.kind IN ('mock', 'design')
        AND (@from IS NULL OR substr(s.started_at, 1, 10) >= @from) 
        AND (@to IS NULL OR substr(s.started_at, 1, 10) <= @to)
        AND (
          (@topicId IS NULL AND @type IS NULL) 
          OR EXISTS (
            SELECT 1 
            FROM session_items AS item 
            JOIN questions AS q ON q.id = item.question_id
            WHERE item.session_id = s.id 
              AND (@topicId IS NULL OR q.topic_id = @topicId) 
              AND (@type IS NULL OR q.type = @type)
          )
        )
    `;

    const params = { topicId, type, from, to, pageSize, offset: (page - 1) * pageSize };

    const attemptTotalRow = db.prepare(`SELECT COUNT(*) AS count ${attemptMatches}`).get(params) as { count: number };
    const sessionTotalRow = db.prepare(`SELECT COUNT(*) AS count ${sessionMatches}`).get(params) as { count: number };

    const attempts = db.prepare(`
      SELECT 
        a.id, 
        a.question_id AS questionId, 
        json_extract(q.topic_snapshot_json, '$.name') AS topic,
        q.type, 
        q.prompt, 
        a.kind, 
        CASE WHEN a.kind = 'practice-review' THEN NULL ELSE a.score END AS score, 
        a.created_at AS createdAt
      ${attemptMatches} 
      ORDER BY a.created_at DESC, a.rowid DESC 
      LIMIT @pageSize OFFSET @offset
    `).all(params) as HistoryAttempt[];

    const sessions = db.prepare(`
      SELECT 
        s.id, 
        s.kind, 
        s.status, 
        s.started_at AS createdAt,
        CASE 
          WHEN s.kind = 'design' THEN json_extract(s.config_json, '$.title')
          ELSE COALESCE(
            NULLIF(json_extract(s.config_json, '$.setup.companyName'), ''), 
            NULLIF(json_extract(s.config_json, '$.companyName'), ''), 
            'Mock interview'
          ) 
        END AS title
      ${sessionMatches} 
      ORDER BY s.started_at DESC, s.rowid DESC 
      LIMIT @pageSize OFFSET @offset
    `).all(params) as HistorySession[];

    return {
      attempts,
      sessions,
      page,
      pageSize,
      attemptTotal: attemptTotalRow.count,
      sessionTotal: sessionTotalRow.count,
    };
  }

  getReview(): ReviewCard[] {
    const db = this.databaseService.getDb();
    
    const rows = db.prepare(`
      SELECT 
        q.id AS questionId, 
        q.prompt, 
        json_extract(q.topic_snapshot_json, '$.name') AS topic,
        r.due_at AS dueAt, 
        r.box, 
        a.score 
      FROM review_cards AS r 
      JOIN questions AS q ON q.id = r.question_id
      JOIN attempts AS a ON a.id = r.last_attempt_id 
      WHERE r.due_at <= ?
      ORDER BY 
        CASE WHEN a.score < 7 THEN 0 ELSE 1 END, 
        CASE WHEN a.score < 7 THEN a.score END, 
        r.due_at, 
        q.id 
      LIMIT 100
    `).all(new Date().toISOString()) as ReviewCard[];

    return rows;
  }
}
