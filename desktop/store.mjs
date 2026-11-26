import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createPaperStore } from './paper-store.mjs';
import { createWorkStore } from './work-store.mjs';
import { createStudioProjects } from './studio-projects.mjs';
import { createNoteStore } from './note-store.mjs';
import { createAutomationStore } from './automation-store.mjs';
import { createEvidenceStore } from './evidence-store.mjs';

const safeJson = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS ideas (
      id TEXT PRIMARY KEY, body TEXT NOT NULL, excerpt TEXT NOT NULL,
      paper TEXT NOT NULL, page TEXT NOT NULL, created TEXT NOT NULL,
      discussion TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'idle',
      error TEXT, provider TEXT, pinned_at TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS idea_ratings (
      idea_id TEXT PRIMARY KEY, importance INTEGER CHECK(importance BETWEEN 1 AND 5),
      research_value INTEGER CHECK(research_value BETWEEN 1 AND 5),
      usability INTEGER CHECK(usability BETWEEN 1 AND 5)
    );
    CREATE TABLE IF NOT EXISTS idea_origins (
      idea_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, other_id TEXT NOT NULL, primary_id TEXT NOT NULL,
      UNIQUE(job_id, other_id)
    );
    UPDATE ideas SET status = 'queued' WHERE status = 'running';
  `);
  if (!db.prepare('PRAGMA table_info(idea_ratings)').all().some(column => column.name === 'usability')) {
    db.exec('ALTER TABLE idea_ratings ADD COLUMN usability INTEGER CHECK(usability BETWEEN 1 AND 5)');
  }
  if (!db.prepare('PRAGMA table_info(ideas)').all().some(column => column.name === 'pinned_at')) {
    db.exec('ALTER TABLE ideas ADD COLUMN pinned_at TEXT');
  }
  const noteStore = createNoteStore(db);
  const paperStore = createPaperStore(db);
  const evidence = createEvidenceStore(db);
  const legacyNotebook = db.prepare("SELECT value FROM settings WHERE key = 'notebook'").get();
  if (legacyNotebook) {
    try {
      if (noteStore.migrateLegacy(JSON.parse(legacyNotebook.value))) {
        db.prepare("DELETE FROM settings WHERE key = 'notebook'").run();
      }
    } catch { /* A damaged legacy note can be ignored. */ }
  }

  function decode(row) {
    if (row) {
      const { analysis_json, synthesis_status, ...record } = row;
      return { ...record, discussion: safeJson(row.discussion, []),
      analysis: safeJson(analysis_json, null), synthesisStatus: synthesis_status,
      origins: row.primary_id ? [row.primary_id, row.other_id] : [] };
    }
  }

  function get(id) {
    return decode(db.prepare(selectIdeas + ' WHERE ideas.id = ?').get(id));
  }

  const selectIdeas = `SELECT ideas.*, r.importance, r.research_value, r.usability, o.primary_id, o.other_id,
    (SELECT json_extract(w.progress, '$.result.summary') FROM research_work w
      WHERE w.idea_id = ideas.id AND w.kind = 'synthesis' AND w.status = 'ready' AND json_valid(w.progress)
      ORDER BY w.rowid DESC LIMIT 1) AS analysis_json,
    (SELECT w.status FROM research_work w WHERE w.idea_id = ideas.id AND w.kind = 'synthesis' AND w.status NOT IN ('superseded', 'deleted')
      ORDER BY w.rowid DESC LIMIT 1) AS synthesis_status
    FROM ideas
    LEFT JOIN idea_ratings r ON r.idea_id = ideas.id LEFT JOIN idea_origins o ON o.idea_id = ideas.id`;

  function set(key, value) {
    db.prepare('INSERT INTO settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  return {
    papers: paperStore,
    evidence,
    work: createWorkStore(db),
    studio: createStudioProjects(db, set),
    notes: noteStore,
    automation: createAutomationStore(db),
    get,
    list: () => db.prepare(selectIdeas + ' ORDER BY ideas.pinned_at DESC, ideas.created DESC, ideas.rowid DESC').all().map(decode),
    queued: () => db.prepare("SELECT id FROM ideas WHERE status = 'queued' ORDER BY created, rowid").all(),
    create(input, provider) {
      const { body, excerpt, paper, page, artifact } = input;
      const id = randomUUID();
      db.prepare(`
        INSERT INTO ideas (id, body, excerpt, paper, page, created, status, provider, discussion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, body, excerpt, paper, page, new Date().toISOString(), provider ? 'queued' : 'idle', provider || null,
        JSON.stringify(artifact ? [{ message: '', artifact }] : []));
      return get(id);
    },
    combine(job, candidate, body) {
      const existing = db.prepare('SELECT idea_id FROM idea_origins WHERE job_id = ? AND other_id = ?').get(job.id, candidate);
      if (existing) return existing.idea_id;
      db.exec('BEGIN');
      try {
        const idea = this.create({ body, excerpt: '', paper: '', page: '' });
        db.prepare('INSERT INTO idea_origins VALUES (?, ?, ?, ?)').run(idea.id, job.id, candidate, job.idea_id);
        db.exec('COMMIT');
        return idea.id;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    update(id, status, provider, error = null, discussion = get(id)?.discussion || []) {
      if (!get(id)) throw new Error('这条讨论已不存在。');
      db.prepare('UPDATE ideas SET status = ?, provider = ?, error = ?, discussion = ? WHERE id = ?')
        .run(status, provider || null, error, JSON.stringify(discussion), id);
    },
    setting(key) {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row ? safeJson(row.value, null) : undefined;
    },
    set,
    rateIdea(id, field, rating) {
      const columns = { importance: 'importance', researchValue: 'research_value', usability: 'usability' };
      const column = Object.hasOwn(columns, field) ? columns[field] : '';
      if (!column || !get(id)) throw new Error('无法为这条 Idea 评分。');
      if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new Error('请选择 1 到 5 分。');
      db.prepare(`INSERT INTO idea_ratings (idea_id, ${column}) VALUES (?, ?)
        ON CONFLICT(idea_id) DO UPDATE SET ${column} = excluded.${column}`).run(id, rating);
    },
    pinIdea(id, pinned) {
      if (!get(id) || typeof pinned !== 'boolean') throw new Error('找不到要置顶的 Idea。');
      db.prepare('UPDATE ideas SET pinned_at = ? WHERE id = ?').run(pinned ? new Date().toISOString() : null, id);
    },
    removeIdea(id) {
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM idea_ratings WHERE idea_id = ?').run(id);
        db.prepare('DELETE FROM idea_origins WHERE idea_id = ?').run(id);
        db.prepare('DELETE FROM research_work WHERE idea_id = ?').run(id);
        db.prepare('DELETE FROM learned_research WHERE idea_id = ?').run(id);
        db.prepare('DELETE FROM memory_suggestions WHERE idea_id = ?').run(id);
        db.prepare('DELETE FROM idea_relations WHERE first_id = ? OR second_id = ?').run(id, id);
        db.prepare("UPDATE memory_entries SET idea_id = '', reason = reason || ' · 来源 Idea 已删除' WHERE idea_id = ?").run(id);
        evidence.removeIdea(id);
        db.prepare('DELETE FROM ideas WHERE id = ?').run(id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    saveConnection(provider, config, endpointChanged) {
      db.exec('BEGIN');
      try {
        set(provider, config);
        if (endpointChanged) {
          db.prepare("UPDATE ideas SET status = 'failed', error = ? WHERE status = 'queued' AND provider = ?")
            .run('API 地址已更换，确认新地址后可重试。', provider);
          this.work.pauseProvider(provider);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => db.close(),
  };
}
