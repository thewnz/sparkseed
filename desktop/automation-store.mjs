import { randomUUID } from 'node:crypto';

const safeJson = (value, fallback) => {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : fallback;
  } catch { return fallback; }
};

export function createAutomationStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS automation_jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      stage TEXT NOT NULL DEFAULT '排队中',
      mode TEXT NOT NULL DEFAULT 'record',
      attempts INTEGER NOT NULL DEFAULT 0,
      requires_attention INTEGER NOT NULL DEFAULT 0,
      result TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      checkpoint TEXT NOT NULL DEFAULT '{}',
      origin_event_id TEXT,
      mandate TEXT,
      policy_notice TEXT,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE(kind, subject_type, subject_id)
    );
    UPDATE automation_jobs SET status = 'queued', stage = '排队中' WHERE status = 'running';
  `);
  const automationExisting = new Set(db.prepare('PRAGMA table_info(automation_jobs)').all().map(column => column.name));
  for (const [name, definition] of [['origin_event_id', 'TEXT'], ['mandate', 'TEXT'], ['policy_notice', 'TEXT']]) {
    if (!automationExisting.has(name)) db.exec(`ALTER TABLE automation_jobs ADD COLUMN ${name} ${definition}`);
  }
  const decode = row => row && ({ ...row, result: safeJson(row.result, {}),
    checkpoint: safeJson(row.checkpoint, {}),
    mandate: safeJson(row.mandate, null), policyNotice: safeJson(row.policy_notice, null),
    requires_attention: Boolean(row.requires_attention) });
  return {
    list: () => db.prepare(`SELECT * FROM automation_jobs ORDER BY requires_attention DESC, created DESC`).all().map(decode),
    get: id => decode(db.prepare('SELECT * FROM automation_jobs WHERE id = ?').get(id)),
    enqueue({ kind, subjectType, subjectId, title, mode = 'record', mandate = null, originEventId = '' }) {
      const existing = db.prepare(`SELECT * FROM automation_jobs WHERE kind = ? AND subject_type = ? AND subject_id = ?`)
        .get(kind, subjectType, subjectId);
      if (existing) return decode(existing);
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO automation_jobs
        (id, kind, subject_type, subject_id, title, status, stage, mode, created, updated, origin_event_id, mandate)
        VALUES (?, ?, ?, ?, ?, 'queued', '排队中', ?, ?, ?, ?, ?)`)
        .run(id, kind, subjectType, subjectId, title, mode, now, now, originEventId || null,
          mandate ? JSON.stringify(mandate) : null);
      return this.get(id);
    },
    next: () => decode(db.prepare(`SELECT * FROM automation_jobs WHERE status = 'queued'
      ORDER BY created LIMIT 1`).get()),
    update(id, patch = {}) {
      const fields = ['status', 'stage', 'mode', 'attempts', 'requires_attention', 'result', 'error', 'checkpoint'];
      const sets = [];
      const values = [];
      for (const field of fields) {
        if (patch[field] === undefined) continue;
        sets.push(field + ' = ?');
        const value = ['result', 'checkpoint'].includes(field) ? JSON.stringify(patch[field]) : patch[field];
        values.push(field === 'requires_attention' ? (patch[field] ? 1 : 0) : value);
      }
      if (!sets.length) return this.get(id);
      sets.push('updated = ?');
      values.push(new Date().toISOString(), id);
      db.prepare(`UPDATE automation_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      return this.get(id);
    },
    approve(id) {
      const job = this.get(id);
      if (!job) throw new Error('自动化任务不存在。');
      if (!['waiting', 'failed'].includes(job.status)) throw new Error('任务状态已变化，请刷新后重试。');
      return this.update(id, { status: 'queued', stage: '已批准，等待执行', mode: 'act', requires_attention: false, error: null });
    },
    retry(id) {
      const job = this.get(id);
      if (!job) throw new Error('自动化任务不存在。');
      if (!['failed', 'waiting'].includes(job.status)) throw new Error('只有失败或待确认的任务可以重试。');
      return this.update(id, { status: 'queued', stage: '等待重试', requires_attention: false, error: null });
    },
    dismiss(id) {
      const job = this.get(id);
      if (!job) throw new Error('自动化任务不存在。');
      return this.update(id, { status: 'ended', stage: '已忽略', requires_attention: false, result: { dismissed: true } });
    },
    setPolicyNotice(id, notice) {
      db.prepare('UPDATE automation_jobs SET policy_notice = ?, updated = ? WHERE id = ?')
        .run(notice ? JSON.stringify(notice) : null, new Date().toISOString(), id);
    },
    attention: () => db.prepare(`SELECT COUNT(*) AS total FROM automation_jobs
      WHERE requires_attention = 1 AND status IN ('waiting', 'failed')`).get().total,
    downgradeAct() {
      db.prepare(`UPDATE automation_jobs SET status = 'waiting', stage = '已切换为只记录，等待确认',
        requires_attention = 1, updated = ? WHERE status = 'queued' AND mode = 'act'`)
        .run(new Date().toISOString());
    },
  };
}
