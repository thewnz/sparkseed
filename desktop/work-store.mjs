import { createHash, randomUUID } from 'node:crypto';
import { attentionOf, canRetryWork, researchWorkStage } from './work-stage.mjs';

const safeJson = (value, fallback) => {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch { return fallback; }
};

export function createWorkStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS research_work (
      id TEXT PRIMARY KEY, idea_id TEXT NOT NULL, kind TEXT NOT NULL, revision TEXT NOT NULL,
      provider TEXT NOT NULL, status TEXT NOT NULL, input TEXT NOT NULL, progress TEXT NOT NULL,
      error TEXT, created TEXT NOT NULL, requested_at TEXT, origin_event_id TEXT, mandate TEXT,
      policy_notice TEXT, UNIQUE(idea_id, kind, revision)
    );
    CREATE TABLE IF NOT EXISTS work_event (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL,
      kind TEXT NOT NULL, actor TEXT NOT NULL, payload TEXT NOT NULL, disposition TEXT NOT NULL, created TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS work_event_subject ON work_event(subject_type, subject_id, created);
    CREATE TABLE IF NOT EXISTS work_effect (
      kind TEXT NOT NULL, key TEXT NOT NULL, payload TEXT NOT NULL, seq INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, due INTEGER NOT NULL, error TEXT NOT NULL DEFAULT '',
      since TEXT NOT NULL, PRIMARY KEY(kind, key)
    );
    CREATE TABLE IF NOT EXISTS work_receipt (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, updated TEXT NOT NULL
    );
    UPDATE research_work SET status = 'queued' WHERE status = 'running';
    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY, text TEXT NOT NULL, reason TEXT NOT NULL, idea_id TEXT NOT NULL,
      status TEXT NOT NULL, created TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS idea_relations (
      first_id TEXT NOT NULL, second_id TEXT NOT NULL, kind TEXT NOT NULL, reason TEXT NOT NULL,
      status TEXT NOT NULL, PRIMARY KEY(first_id, second_id, kind)
    );
    CREATE TABLE IF NOT EXISTS learned_research (
      idea_id TEXT PRIMARY KEY, observations TEXT NOT NULL, updated TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_suggestions (
      id TEXT PRIMARY KEY, text TEXT NOT NULL, kind TEXT NOT NULL,
      evidence TEXT NOT NULL DEFAULT '', idea_id TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending',
      created TEXT NOT NULL, updated TEXT NOT NULL
    );
    INSERT OR IGNORE INTO memory_entries (id, text, reason, idea_id, status, created)
      SELECT id, json_extract(progress, '$.result.memory.text'),
        coalesce(json_extract(progress, '$.result.memory.reason'), ''), idea_id, 'active', created
      FROM research_work
      WHERE json_valid(progress) AND json_extract(progress, '$.result.memory.decision') = 'accept'
        AND json_type(progress, '$.result.memory.text') = 'text';
  `);
  const workExisting = new Set(db.prepare('PRAGMA table_info(research_work)').all().map(column => column.name));
  for (const [name, definition] of [['requested_at', 'TEXT'], ['origin_event_id', 'TEXT'], ['mandate', 'TEXT'], ['policy_notice', 'TEXT']]) {
    if (!workExisting.has(name)) db.exec(`ALTER TABLE research_work ADD COLUMN ${name} ${definition}`);
  }
  const memoryColumns = [
    ['kind', "TEXT NOT NULL DEFAULT 'fact'"], ['strength', 'REAL NOT NULL DEFAULT 1'],
    ['hits', 'INTEGER NOT NULL DEFAULT 1'], ['last_seen', 'TEXT'],
    ['pinned', 'INTEGER NOT NULL DEFAULT 0'], ['merged_from', "TEXT NOT NULL DEFAULT '[]'"],
  ];
  const memoryExisting = new Set(db.prepare('PRAGMA table_info(memory_entries)').all().map(column => column.name));
  for (const [name, definition] of memoryColumns) {
    if (!memoryExisting.has(name)) db.exec(`ALTER TABLE memory_entries ADD COLUMN ${name} ${definition}`);
  }
  db.exec("UPDATE memory_entries SET last_seen = created WHERE last_seen IS NULL");
  const unpack = row => row && { ...row, input: safeJson(row.input, {}), progress: safeJson(row.progress, {}),
    mandate: safeJson(row.mandate, null), policyNotice: safeJson(row.policy_notice, null) };
  const get = id => unpack(db.prepare("SELECT * FROM research_work WHERE id = ? AND status <> 'deleted'").get(id));
  return {
    get,
    list: ideaId => db.prepare("SELECT * FROM research_work WHERE idea_id = ? AND status <> 'deleted' ORDER BY rowid DESC").all(ideaId).map(unpack),
    next: () => unpack(db.prepare(`SELECT * FROM research_work WHERE status = 'queued'
      ORDER BY requested_at IS NULL, requested_at, rowid LIMIT 1`).get()),
    /**
     * Next queued task for a worker slot. `manual` holds the extra slot for work a person requested;
     * `auto` prefers recorded work and only uses an explicitly requested task when nothing else is queued.
     */
    nextForSlot(slot, exclude = []) {
      const skip = exclude.length ? ` AND id NOT IN (${exclude.map(() => '?').join(',')})` : '';
      const only = slot === 'manual' ? ' AND requested_at IS NOT NULL' : '';
      const order = slot === 'manual'
        ? 'ORDER BY requested_at, rowid'
        : 'ORDER BY requested_at IS NOT NULL, requested_at, rowid';
      return unpack(db.prepare(`SELECT * FROM research_work WHERE status = 'queued'${only}${skip} ${order} LIMIT 1`)
        .get(...exclude));
    },
    latestSummary(ideaId) {
      const row = db.prepare("SELECT progress FROM research_work WHERE idea_id = ? AND kind = 'synthesis' AND status = 'ready' ORDER BY rowid DESC LIMIT 1").get(ideaId);
      return row ? safeJson(row.progress, {}).result?.summary : undefined;
    },
    /**
     * Records one immutable source event. Repeating the same event returns the stored record,
     * so a retried source or a restarted scheduler produces one work item, not two.
     */
    recordEvent({ source = 'local', subjectType = 'idea', subjectId = '', kind = '', actor = 'system', payload = {}, disposition = 'accepted' } = {}) {
      const id = 'evt-' + createHash('sha256')
        .update(JSON.stringify({ source, subjectType, subjectId, kind, actor, payload })).digest('hex').slice(0, 40);
      const existing = db.prepare('SELECT * FROM work_event WHERE id = ?').get(id);
      if (existing) return { ...existing, payload: safeJson(existing.payload, {}), duplicate: true };
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO work_event (id, source, subject_type, subject_id, kind, actor, payload, disposition, created)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, source, subjectType, subjectId, kind, actor, JSON.stringify(payload), disposition, now);
      return { id, source, subjectType, subjectId, kind, actor, payload, disposition, created: now, duplicate: false };
    },
    events: (limit = 50) => db.prepare('SELECT * FROM work_event ORDER BY created DESC LIMIT ?').all(limit)
      .map(row => ({ ...row, payload: safeJson(row.payload, {}) })),
    setPolicyNotice(id, notice) {
      db.prepare('UPDATE research_work SET policy_notice = ? WHERE id = ? AND status <> \'deleted\'')
        .run(notice ? JSON.stringify(notice) : null, id);
    },
    enqueue({ ideaId, kind, revision, provider, input, manual = false, mandate = null, originEventId = '' }) {
      const now = new Date().toISOString();
      // Keep the revision to prevent automatic scheduling from restoring a deleted task.
      // An explicit request for the same revision starts a fresh task with a new ID.
      const inserted = db.prepare(`INSERT INTO research_work
        (id, idea_id, kind, revision, provider, status, input, progress, error, created, requested_at, origin_event_id, mandate, policy_notice)
        VALUES (?, ?, ?, ?, ?, 'queued', ?, '{}', NULL, ? ,?, ?, ?, NULL)
        ON CONFLICT(idea_id,kind,revision) DO UPDATE SET
          rowid = (SELECT max(rowid) + 1 FROM research_work),
          id = excluded.id, status = excluded.status, provider = excluded.provider, input = excluded.input,
          progress = excluded.progress, error = NULL, created = excluded.created, requested_at = excluded.requested_at,
          origin_event_id = excluded.origin_event_id, mandate = excluded.mandate, policy_notice = NULL
        WHERE research_work.status = 'deleted' AND excluded.requested_at IS NOT NULL`).run(randomUUID(), ideaId, kind, revision, provider,
        JSON.stringify(input), now, manual ? now : null, originEventId || null, mandate ? JSON.stringify(mandate) : null);
      const job = unpack(db.prepare('SELECT * FROM research_work WHERE idea_id = ? AND kind = ? AND revision = ?').get(ideaId, kind, revision));
      if (job.status === 'deleted') return undefined;
      if (inserted.changes && kind === 'synthesis') db.prepare(`UPDATE research_work SET status = 'superseded'
        WHERE kind = ? AND idea_id = ? AND id <> ? AND status = 'queued' AND requested_at IS NULL`)
        .run(kind, ideaId, job.id);
      if (inserted.changes && kind === 'initial') db.prepare(`UPDATE research_work SET status = 'superseded'
        WHERE kind = 'initial' AND idea_id = ? AND id <> ? AND status IN ('queued', 'waiting')`)
        .run(ideaId, job.id);
      if (!inserted.changes && manual && job.status === 'queued' && !job.requested_at) {
        db.prepare('UPDATE research_work SET requested_at = ? WHERE id = ?').run(now, job.id);
        job.requested_at = now;
      }
      return job;
    },
    update(id, status, progress, error = null) {
      db.prepare("UPDATE research_work SET status = ?, progress = ?, error = ? WHERE id = ? AND status <> 'deleted'")
        .run(status, JSON.stringify(progress), error, id);
    },
    remove(id) {
      const job = get(id);
      if (!job) return undefined;
      db.exec('BEGIN');
      try {
        const latest = job.kind === 'synthesis' && job.status === 'ready' && db.prepare(`SELECT id FROM research_work
          WHERE idea_id = ? AND kind = 'synthesis' AND status = 'ready' ORDER BY rowid DESC LIMIT 1`).get(job.idea_id);
        db.prepare(`UPDATE research_work SET status = 'deleted', input = '{}', progress = '{}', error = NULL, requested_at = NULL
          WHERE id = ?`).run(job.id);
        this.effects.complete('launch', job.id);
        this.effects.complete('deliver', job.id);
        if (latest?.id === job.id) {
          const previous = this.list(job.idea_id).find(row => row.kind === 'synthesis' && row.status === 'ready');
          const observations = previous?.progress.result?.observations;
          if (Array.isArray(observations)) this.learn(previous, observations);
          else db.prepare('DELETE FROM learned_research WHERE idea_id = ?').run(job.idea_id);
        }
        db.exec('COMMIT');
        return job;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    retry(id, provider) {
      db.prepare(`UPDATE research_work SET provider = ?, status = 'queued', error = NULL, requested_at = ?
        WHERE id = ? AND status IN ('paused','failed')`).run(provider, new Date().toISOString(), id);
      const job = get(id);
      if (job?.status === 'queued') this.effects.enqueue('launch', id, { jobId: id, ideaId: job.idea_id });
    },
    memories: () => db.prepare('SELECT * FROM memory_entries ORDER BY pinned DESC, rowid DESC').all()
      .map(row => ({ ...row, merged_from: safeJson(row.merged_from, []) })),
    learned: () => db.prepare('SELECT * FROM learned_research ORDER BY updated DESC').all()
      .map(row => ({ ...row, observations: safeJson(row.observations, []) })),
    learn(job, observations) {
      const latest = db.prepare(`SELECT id FROM research_work WHERE idea_id = ? AND kind = 'synthesis'
        AND status = 'ready' ORDER BY rowid DESC LIMIT 1`).get(job.idea_id);
      if (latest?.id !== job.id) return;
      db.prepare(`INSERT INTO learned_research VALUES (?, ?, ?)
        ON CONFLICT(idea_id) DO UPDATE SET observations=excluded.observations, updated=excluded.updated`)
        .run(job.idea_id, JSON.stringify(observations), new Date().toISOString());
    },
    setMemoryStatus(id, status) {
      db.prepare('UPDATE memory_entries SET status = ? WHERE id = ?').run(status, id);
    },
    editMemory(id, text) {
      const previous = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(id);
      if (!previous) throw new Error('这条记忆已不存在。');
      if (!text?.trim() || text.length > 1000) throw new Error('记忆内容须为 1–1000 字符。');
      if (previous.text === text.trim()) return;
      db.exec('BEGIN');
      try {
        db.prepare("UPDATE memory_entries SET status = 'withdrawn' WHERE id = ?").run(id);
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO memory_entries
          (id, text, reason, idea_id, status, created, kind, strength, hits, last_seen, pinned, merged_from)
          VALUES (?, ?, ?, ?, 'active', ?, ?, ?, 1, ?, ?, '[]')`)
          .run(randomUUID(), text.trim(), '用户编辑记忆；旧条目已撤回', previous.idea_id, now,
            previous.kind || 'fact', Math.max(1, previous.strength || 1), now, previous.pinned ? 1 : 0);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    addMemory(job, proposal) {
      const text = typeof proposal.text === 'string' ? proposal.text.trim() : '';
      if (!text) return;
      const existing = db.prepare('SELECT * FROM memory_entries WHERE text = ? ORDER BY rowid DESC LIMIT 1').get(text);
      if (existing) {
        if (existing.status !== 'active') return null;
        this.reinforceMemory(existing.id, 0.2);
        return existing.id;
      }
      const similar = this.findSimilarMemory(text);
      if (similar) {
        this.reinforceMemory(similar.id, 0.15);
        return similar.id;
      }
      const id = job.id || randomUUID();
      const now = new Date().toISOString();
      db.prepare(`INSERT OR IGNORE INTO memory_entries
        (id, text, reason, idea_id, status, created, kind, strength, hits, last_seen, pinned, merged_from)
        VALUES (?, ?, ?, ?, 'active', ?, ?, 1, 1, ?, 0, '[]')`)
        .run(id, text, proposal.reason || '', job.idea_id || '', now, proposal.kind || 'fact', now);
      return id;
    },
    reinforceMemory(id, amount = 0.2) {
      const now = new Date().toISOString();
      db.prepare(`UPDATE memory_entries SET strength = min(2.5, coalesce(strength, 1) + ?),
        hits = coalesce(hits, 1) + 1, last_seen = ? WHERE id = ?`).run(amount, now, id);
    },
    findSimilarMemory(text) {
      const target = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!target) return null;
      const rows = db.prepare("SELECT * FROM memory_entries WHERE status = 'active'").all();
      return rows.find(row => {
        const value = row.text.replace(/\s+/g, ' ').trim().toLowerCase();
        if (value === target) return true;
        const shorter = Math.min(value.length, target.length);
        const longer = Math.max(value.length, target.length);
        return shorter >= 8 && shorter / longer >= 0.8 && (value.includes(target) || target.includes(value));
      }) || null;
    },
    pinMemory(id, pinned) {
      if (!db.prepare('SELECT id FROM memory_entries WHERE id = ?').get(id)) throw new Error('记忆条目不存在。');
      db.prepare('UPDATE memory_entries SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
    },
    decayMemories(days = 45) {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      db.prepare(`UPDATE memory_entries SET strength = max(0.2, coalesce(strength, 1) * 0.85)
        WHERE status = 'active' AND pinned = 0 AND (last_seen IS NULL OR last_seen < ?)`).run(cutoff);
    },
    consolidateMemory(groups, reason = 'Agent 整理：合并重复记忆') {
      const now = new Date().toISOString();
      const used = new Set();
      db.exec('BEGIN');
      try {
        for (const group of Array.isArray(groups) ? groups : []) {
          const ids = Array.isArray(group?.ids) ? group.ids.filter(id => typeof id === 'string') : [];
          const text = typeof group?.text === 'string' ? group.text.trim().slice(0, 1000) : '';
          if (ids.length < 2 || !text || ids.some(id => used.has(id))) continue;
          const rows = ids.map(id => db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(id)).filter(Boolean);
          if (rows.length < 2 || rows.some(row => row.status !== 'active')) continue;
          ids.forEach(id => used.add(id));
          const strength = Math.min(2.5, Math.max(...rows.map(row => row.strength || 1)) + 0.2);
          const hits = rows.reduce((total, row) => total + (row.hits || 1), 0);
          const previousMerged = rows.flatMap(row => safeJson(row.merged_from, []));
          const mergedFrom = [...new Set([...ids, ...previousMerged])];
          db.prepare(`UPDATE memory_entries SET status = 'withdrawn', reason = ?, merged_from = ? WHERE id IN (${ids.map(() => '?').join(',')})`)
            .run(reason, JSON.stringify(mergedFrom), ...ids);
          db.prepare(`INSERT INTO memory_entries
            (id, text, reason, idea_id, status, created, kind, strength, hits, last_seen, pinned, merged_from)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 0, ?)`)
            .run(randomUUID(), text, reason, rows[0].idea_id || '', now, group.kind || rows[0].kind || 'fact',
              strength, hits, now, JSON.stringify(mergedFrom));
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return this.memories();
    },
    addManualMemory(text) {
      const clean = String(text || '').trim();
      const existing = db.prepare('SELECT * FROM memory_entries WHERE text = ? ORDER BY rowid DESC LIMIT 1').get(clean);
      if (existing) {
        this.setMemoryStatus(existing.id, 'active');
        this.reinforceMemory(existing.id, 0.2);
        return;
      }
      db.prepare(`INSERT INTO memory_entries
        (id, text, reason, idea_id, status, created, kind, strength, hits, last_seen, pinned, merged_from)
        VALUES (?, ?, '用户在 Memory 手动添加', '', 'active', ?, 'fact', 1, 1, ?, 0, '[]')`)
        .run(randomUUID(), clean, new Date().toISOString(), new Date().toISOString());
    },
    suggestions: () => db.prepare(`SELECT * FROM memory_suggestions ORDER BY
      CASE status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, updated DESC`).all(),
    addSuggestion(item) {
      const text = typeof item?.text === 'string' ? item.text.trim().slice(0, 500) : '';
      if (!text) return null;
      const id = item.id || 'suggestion-' + randomUUID();
      db.prepare(`INSERT OR IGNORE INTO memory_suggestions
        (id, text, kind, evidence, idea_id, confidence, status, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, text, item.kind || 'direction', String(item.evidence || '').slice(0, 600),
          item.idea_id || '', Number(item.confidence) || 0, item.status || 'pending',
          new Date().toISOString(), new Date().toISOString());
      return this.suggestion(id);
    },
    suggestion: id => db.prepare('SELECT * FROM memory_suggestions WHERE id = ?').get(id),
    hasSuggestion: text => db.prepare('SELECT id FROM memory_suggestions WHERE text = ?').get(text),
    decideSuggestion(id, status) {
      if (!db.prepare('SELECT id FROM memory_suggestions WHERE id = ?').get(id)) throw new Error('记忆建议不存在。');
      if (!['pending', 'accepted', 'ignored'].includes(status)) throw new Error('未知的记忆建议状态。');
      db.prepare('UPDATE memory_suggestions SET status = ?, updated = ? WHERE id = ?')
        .run(status, new Date().toISOString(), id);
      return this.suggestion(id);
    },
    relations: () => db.prepare('SELECT * FROM idea_relations').all(),
    decideRelation(idea, other, kind, reason, status) {
      const [first, second] = [idea, other].sort();
      db.prepare(`INSERT INTO idea_relations VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(first_id, second_id, kind) DO UPDATE SET status=excluded.status, reason=excluded.reason`)
        .run(first, second, kind, reason, status);
    },
    resolveMemory(job, decision, saveMemory) {
      db.exec('BEGIN');
      try {
        saveMemory();
        job.progress.result.memory.decision = decision;
        this.update(job.id, job.status, job.progress, job.error);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    pauseProvider(provider) {
      db.prepare("UPDATE research_work SET status = 'paused', error = ? WHERE provider = ? AND status = 'queued'")
        .run('Agent 连接已更改，请确认后继续。', provider);
    },
    public(ideaId) {
      return this.list(ideaId).map(({ input, progress, ...job }) => {
        const view = {
          ...job,
          question: input.question,
          manual: Boolean(job.requested_at),
          progress: {
            plan: progress.plan, result: progress.result, stage: progress.stage,
            attention: progress.attention || null,
            paperCount: progress.found?.papers?.length ?? null,
          },
        };
        return { ...view, workStage: researchWorkStage(view), attention: attentionOf(view, 'research'),
          canRetry: canRetryWork(view, 'research') };
      });
    },
    dashboard() {
      const rows = db.prepare(`
        SELECT w.id, w.idea_id, w.kind, w.status, w.provider, w.error, w.created, w.requested_at,
          w.origin_event_id, w.mandate, w.policy_notice,
          CASE WHEN json_valid(w.input) THEN json_extract(w.input, '$.question') END AS question,
          CASE WHEN json_valid(w.progress) THEN json_extract(w.progress, '$.stage') END AS stage,
          CASE WHEN json_valid(w.progress) THEN json_extract(w.progress, '$.attention') END AS attention_json,
          CASE WHEN json_valid(w.progress) THEN json_extract(w.progress, '$.result.questions[0]') END AS first_question,
          CASE WHEN json_valid(w.progress) THEN json_array_length(w.progress, '$.found.papers') END AS paper_count
        FROM research_work w JOIN ideas i ON i.id = w.idea_id
        WHERE w.status NOT IN ('superseded', 'deleted')
        ORDER BY CASE
          WHEN w.status IN ('waiting', 'failed', 'paused') THEN 0
          WHEN w.status IN ('running', 'queued') THEN 1 ELSE 2 END,
          w.rowid DESC
      `).all();
      return rows.map(row => {
        const attention = safeJson(row.attention_json, null) ||
          (row.status === 'waiting' && row.first_question
            ? { kind: 'question', question: row.first_question, options: [] } : null);
        const { attention_json, first_question, mandate, policy_notice, ...rest } = row;
        const view = { ...rest, attention, manual: Boolean(row.requested_at),
          mandate: safeJson(mandate, null), policyNotice: safeJson(policy_notice, null) };
        return { ...view, workStage: researchWorkStage(view), canRetry: canRetryWork(view, 'research') };
      });
    },
    effects: {
      enqueue(kind, key, payload = {}) {
        const now = Date.now();
        const seq = Number(db.prepare('SELECT IFNULL(MAX(seq), 0) + 1 AS next FROM work_effect').get().next);
        db.prepare(`INSERT INTO work_effect (kind, key, payload, seq, attempts, due, error, since)
          VALUES (?, ?, ?, ?, 0, ?, '', ?)
          ON CONFLICT(kind, key) DO UPDATE SET payload = excluded.payload, attempts = 0, error = '', due = excluded.due`)
          .run(kind, key, JSON.stringify(payload), seq, now, new Date(now).toISOString());
      },
      due(kind, limit = 8) {
        return db.prepare('SELECT * FROM work_effect WHERE kind = ? AND due <= ? ORDER BY seq LIMIT ?')
          .all(kind, Date.now(), limit).map(row => ({ ...row, payload: safeJson(row.payload, {}) }));
      },
      complete(kind, key) {
        db.prepare('DELETE FROM work_effect WHERE kind = ? AND key = ?').run(kind, key);
      },
      fail(kind, key, error, due) {
        db.prepare('UPDATE work_effect SET attempts = attempts + 1, error = ?, due = ? WHERE kind = ? AND key = ?')
          .run(String(error || '').slice(0, 1000), due, kind, key);
      },
      reschedule(kind, key, due) {
        db.prepare('UPDATE work_effect SET due = ? WHERE kind = ? AND key = ?').run(due, kind, key);
      },
      pending(kind) {
        return Number(db.prepare('SELECT COUNT(*) AS total FROM work_effect WHERE kind = ?').get(kind).total);
      },
      health() {
        return db.prepare(`SELECT kind, COUNT(*) AS pending, MAX(attempts) AS attempts,
          (SELECT error FROM work_effect e2 WHERE e2.kind = e1.kind AND e2.attempts > 0 ORDER BY seq DESC LIMIT 1) AS error
          FROM work_effect e1 GROUP BY kind ORDER BY kind`).all()
          .map(row => ({ ...row, state: row.attempts >= 3 ? 'error' : 'ready' }));
      },
    },
    receipts: {
      has: id => Boolean(db.prepare('SELECT 1 FROM work_receipt WHERE id = ?').get(id)),
      add(id, kind, status = 'sent', detail = '') {
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO work_receipt (id, kind, status, detail, created, updated)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, detail = excluded.detail, updated = excluded.updated`)
          .run(id, kind, status, detail, now, now);
      },
      list: (limit = 50) => db.prepare('SELECT * FROM work_receipt ORDER BY created DESC LIMIT ?').all(limit),
    },
  };
}
