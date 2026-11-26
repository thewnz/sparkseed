import { randomUUID } from 'node:crypto';

const relations = new Set(['pending', 'support', 'counter']);
const clean = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export function createEvidenceStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_claims (
      id TEXT PRIMARY KEY, idea_id TEXT NOT NULL, text TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS evidence_claims_idea ON evidence_claims(idea_id, created);
    CREATE TABLE IF NOT EXISTS evidence_links (
      id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, paper_id TEXT NOT NULL, title TEXT NOT NULL, page INTEGER NOT NULL,
      quote TEXT NOT NULL, prefix TEXT NOT NULL, suffix TEXT NOT NULL, rects TEXT NOT NULL, source_hash TEXT NOT NULL,
      relation TEXT NOT NULL, note TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL,
      UNIQUE(claim_id, paper_id, page, quote, prefix, suffix)
    );
  `);
  const claimFor = db.prepare('SELECT * FROM evidence_claims WHERE idea_id = ? AND id = ?');
  const linksFor = db.prepare('SELECT * FROM evidence_links WHERE claim_id = ? ORDER BY created, rowid');
  const removeLinks = db.prepare('DELETE FROM evidence_links WHERE claim_id = ?');
  const paperFor = db.prepare('SELECT id, title, page_count, status, sha256 FROM papers WHERE id = ?');
  const safeRects = value => {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  };
  const list = ideaId => db.prepare('SELECT * FROM evidence_claims WHERE idea_id = ? ORDER BY created, rowid').all(ideaId)
    .map(claim => ({ ...claim, links: linksFor.all(claim.id).map(link => {
      const paper = paperFor.get(link.paper_id);
      return {
        ...link, rects: safeRects(link.rects), available: Boolean(paper),
        sameSource: Boolean(link.source_hash && link.source_hash === paper?.sha256),
      };
    }) }));

  return {
    list,
    removeIdea(ideaId) {
      db.prepare('DELETE FROM evidence_links WHERE claim_id IN (SELECT id FROM evidence_claims WHERE idea_id = ?)').run(ideaId);
      db.prepare('DELETE FROM evidence_claims WHERE idea_id = ?').run(ideaId);
    },
    change(ideaId, input) {
      if (typeof ideaId !== 'string' || !db.prepare('SELECT id FROM ideas WHERE id = ?').get(ideaId) || !input) {
        throw new Error('找不到讨论。');
      }
      const { action, claimId, linkId } = input;
      const now = new Date().toISOString();
      if (action === 'create') {
        const value = clean(input.text, 2000);
        if (!value) throw new Error('请输入结论。');
        const id = randomUUID();
        db.prepare('INSERT INTO evidence_claims VALUES (?, ?, ?, ?, ?)').run(id, ideaId, value, now, now);
        return { id };
      }
      if (typeof claimId !== 'string' || !claimFor.get(ideaId, claimId)) throw new Error('找不到此讨论中的结论。');
      if (action === 'delete') {
        db.exec('BEGIN');
        try {
          removeLinks.run(claimId);
          db.prepare('DELETE FROM evidence_claims WHERE id = ?').run(claimId);
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      } else if (action === 'rename') {
        const value = clean(input.text, 2000);
        if (!value) throw new Error('请输入结论。');
        db.prepare('UPDATE evidence_claims SET text = ?, updated = ? WHERE id = ?').run(value, now, claimId);
      } else if (action === 'unlink') {
        db.prepare('DELETE FROM evidence_links WHERE claim_id = ? AND id = ?').run(claimId, clean(linkId, 80));
      } else if (action === 'bind' || action === 'edit') {
        const relation = input.relation;
        if (!relations.has(relation)) throw new Error('请选择证据关系。');
        const note = clean(input.note, 2000);
        if (action === 'edit') {
          db.prepare('UPDATE evidence_links SET relation = ?, note = ?, updated = ? WHERE claim_id = ? AND id = ?')
            .run(relation, note, now, claimId, clean(linkId, 80));
        } else {
          const paper = paperFor.get(clean(input.paperId, 100));
          const { page } = input;
          const quote = clean(input.quote, 8000);
          if (!paper || paper.status === 'linked' || !Number.isInteger(page) || page < 1 ||
              (paper.page_count && page > paper.page_count) || !quote) throw new Error('请在本地 PDF 中划选原文。');
          const rects = Array.isArray(input.rects) ? input.rects.slice(0, 200).filter(rect => rect &&
            ['x','y','w','h'].every(key => Number.isFinite(rect[key]) && rect[key] >= 0 && rect[key] <= 1) &&
            rect.w > 0 && rect.h > 0 && rect.x + rect.w <= 1.001 && rect.y + rect.h <= 1.001)
            .map(({ x, y, w, h }) => ({ x, y, w, h })) : [];
          db.prepare(`INSERT INTO evidence_links VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(claim_id, paper_id, page, quote, prefix, suffix) DO NOTHING`)
            .run(randomUUID(), claimId, paper.id, paper.title, page, quote, clean(input.prefix, 160),
              clean(input.suffix, 160), JSON.stringify(rects), paper.sha256 || '', relation, note, now, now);
        }
      } else {
        throw new Error('未知的证据台操作。');
      }
      return { id: claimId };
    },
  };
}
