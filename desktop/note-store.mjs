import { randomUUID } from 'node:crypto';

const safeJson = (value, fallback) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(fallback) ? (Array.isArray(parsed) ? parsed : fallback) : parsed;
  } catch { return fallback; }
};
const cleanText = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const titleFrom = (title, text) => cleanText(title, 120).trim() ||
  cleanText(text, 4000).trim().split('\n')[0].trim().slice(0, 80) || '未命名笔记';
const sourceTypes = new Set(['manual', 'idea']);

export function createNoteStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_id TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created TEXT NOT NULL,
      updated TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_source ON notes(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated DESC);
  `);
  function decode(row) {
    if (!row) return row;
    const { source_type, source_id, ...rest } = row;
    return { ...rest, sourceType: source_type, sourceId: source_id, tags: safeJson(row.tags, []) };
  }
  function selectAll() {
    return db.prepare('SELECT * FROM notes WHERE archived = 0 ORDER BY pinned DESC, updated DESC').all().map(decode);
  }
  return {
    list({ sourceType = '', query = '', tag = '' } = {}) {
      const text = cleanText(query, 100).trim().toLowerCase();
      return selectAll().filter(note => {
        if (sourceType && note.sourceType !== sourceType) return false;
        if (tag && !note.tags.includes(tag)) return false;
        if (!text) return true;
        return (note.title + '\n' + note.text).toLowerCase().includes(text);
      });
    },
    get(id) {
      return decode(db.prepare('SELECT * FROM notes WHERE id = ?').get(id));
    },
    save(input = {}) {
      const title = titleFrom(input.title, input.text);
      const html = cleanText(input.html, 100_000);
      const text = cleanText(input.text, 32_000);
      const sourceType = sourceTypes.has(input.sourceType) ? input.sourceType : 'manual';
      const sourceId = cleanText(input.sourceId, 80);
      const tags = [...new Set((Array.isArray(input.tags) ? input.tags : [])
        .map(tag => String(tag).trim().slice(0, 30)).filter(Boolean))].slice(0, 12);
      const now = new Date().toISOString();
      if (input.id) {
        if (!db.prepare('SELECT id FROM notes WHERE id = ?').get(input.id)) throw new Error('笔记不存在。');
        db.prepare(`UPDATE notes SET title = ?, html = ?, text = ?, source_type = ?, source_id = ?,
          tags = ?, updated = ? WHERE id = ?`)
          .run(title, html, text, sourceType, sourceId, JSON.stringify(tags), now, input.id);
        return this.get(input.id);
      }
      const id = randomUUID();
      db.prepare(`INSERT INTO notes (id, title, html, text, source_type, source_id, tags, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, title, html, text, sourceType, sourceId, JSON.stringify(tags), now, now);
      return this.get(id);
    },
    remove(id) {
      if (!db.prepare('SELECT id FROM notes WHERE id = ?').get(id)) throw new Error('笔记不存在。');
      db.prepare('DELETE FROM notes WHERE id = ?').run(id);
      return true;
    },
    pin(id, pinned) {
      if (!db.prepare('SELECT id FROM notes WHERE id = ?').get(id)) throw new Error('笔记不存在。');
      db.prepare('UPDATE notes SET pinned = ?, updated = ? WHERE id = ?').run(pinned ? 1 : 0, new Date().toISOString(), id);
    },
    forIdea(ideaId) {
      return decode(db.prepare("SELECT * FROM notes WHERE source_type = 'idea' AND source_id = ? AND archived = 0").get(ideaId));
    },
    ensureIdea(ideaId, title = '') {
      const existing = this.forIdea(ideaId);
      if (existing) {
        if (title && existing.title !== title && /^(讨论记录本|未命名笔记)$/.test(existing.title)) {
          return this.save({ ...existing, title });
        }
        return existing;
      }
      return this.save({ title: title || '讨论记录本', sourceType: 'idea', sourceId: ideaId });
    },
    migrateLegacy(value) {
      if (!value || (!value.html && !value.text)) return false;
      if (db.prepare('SELECT COUNT(*) AS total FROM notes').get().total > 0) return false;
      this.save({ title: '讨论记录本（旧）', html: value.html, text: value.text, sourceType: 'manual' });
      return true;
    },
  };
}
