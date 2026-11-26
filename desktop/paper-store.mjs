import { randomUUID } from 'node:crypto';

const safeJson = (value, fallback) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(fallback) ? (Array.isArray(parsed) ? parsed : fallback) : parsed;
  } catch { return fallback; }
};
const clamp01 = value => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
};
const cleanText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const annotationKinds = new Set(['highlight', 'underline', 'note', 'question', 'bookmark']);

export function createPaperStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY, sha256 TEXT NOT NULL UNIQUE, filename TEXT NOT NULL,
      title TEXT NOT NULL, author TEXT NOT NULL DEFAULT '', page_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued', error TEXT, imported TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS paper_pages (
      paper_id TEXT NOT NULL, page INTEGER NOT NULL, text TEXT NOT NULL,
      PRIMARY KEY (paper_id, page)
    );
    CREATE TABLE IF NOT EXISTS paper_translations (
      paper_id TEXT NOT NULL, page INTEGER NOT NULL, source_key TEXT NOT NULL, text TEXT NOT NULL,
      PRIMARY KEY (paper_id, page, source_key)
    );
    CREATE TABLE IF NOT EXISTS paper_categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT,
      color TEXT NOT NULL DEFAULT '', created TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS paper_category_links (
      paper_id TEXT NOT NULL, category_id TEXT NOT NULL,
      PRIMARY KEY (paper_id, category_id)
    );
    CREATE TABLE IF NOT EXISTS paper_annotations (
      id TEXT PRIMARY KEY, paper_id TEXT NOT NULL, kind TEXT NOT NULL, page INTEGER NOT NULL,
      color TEXT NOT NULL DEFAULT '', quote TEXT NOT NULL DEFAULT '',
      prefix TEXT NOT NULL DEFAULT '', suffix TEXT NOT NULL DEFAULT '',
      rects TEXT NOT NULL DEFAULT '[]', note TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
      created TEXT NOT NULL, updated TEXT NOT NULL, deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_paper_annotations ON paper_annotations(paper_id, page);
    CREATE TABLE IF NOT EXISTS paper_notes (
      paper_id TEXT PRIMARY KEY, html TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '', updated TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS paper_triage (
      paper_id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT '', context TEXT NOT NULL DEFAULT '',
      correctness TEXT NOT NULL DEFAULT '', contributions TEXT NOT NULL DEFAULT '',
      clarity TEXT NOT NULL DEFAULT '', decision TEXT NOT NULL DEFAULT '',
      seconds INTEGER NOT NULL DEFAULT 0, updated TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS glossary_terms (
      id TEXT PRIMARY KEY, paper_id TEXT NOT NULL DEFAULT '', term TEXT NOT NULL,
      definition TEXT NOT NULL, page INTEGER NOT NULL DEFAULT 1, quote TEXT NOT NULL DEFAULT '',
      created TEXT NOT NULL, updated TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS paper_insights (
      paper_id TEXT NOT NULL, page INTEGER NOT NULL, kind TEXT NOT NULL,
      text TEXT NOT NULL, citations TEXT NOT NULL DEFAULT '[]',
      supported INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL,
      PRIMARY KEY (paper_id, page, kind)
    );
    CREATE TABLE IF NOT EXISTS review_cards (
      id TEXT PRIMARY KEY, paper_id TEXT NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL,
      source_page INTEGER NOT NULL DEFAULT 1, source_quote TEXT NOT NULL DEFAULT '',
      due TEXT NOT NULL, interval INTEGER NOT NULL DEFAULT 0, ease REAL NOT NULL DEFAULT 2.5,
      reviews INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS citation_edges (
      paper_id TEXT NOT NULL, direction TEXT NOT NULL, work_key TEXT NOT NULL,
      title TEXT NOT NULL, author TEXT NOT NULL DEFAULT '', year INTEGER,
      venue TEXT NOT NULL DEFAULT '', doi TEXT NOT NULL DEFAULT '', arxiv_id TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '', pdf_url TEXT NOT NULL DEFAULT '', abstract TEXT NOT NULL DEFAULT '',
      citation_count INTEGER, source TEXT NOT NULL DEFAULT '', fetched TEXT NOT NULL,
      PRIMARY KEY (paper_id, direction, work_key)
    );
    CREATE INDEX IF NOT EXISTS idx_citation_edges_key ON citation_edges(work_key, direction);
    CREATE TABLE IF NOT EXISTS citation_meta (
      paper_id TEXT PRIMARY KEY, reference_at TEXT, citation_at TEXT,
      reference_source TEXT NOT NULL DEFAULT '', citation_source TEXT NOT NULL DEFAULT '',
      reference_error TEXT NOT NULL DEFAULT '', citation_error TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS paper_comparisons (
      paper_ids TEXT PRIMARY KEY, rows TEXT NOT NULL, generated INTEGER NOT NULL DEFAULT 0,
      model TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, updated TEXT NOT NULL
    );
    UPDATE papers SET status = 'queued' WHERE status = 'running';
  `);
  const columns = [
    ['doi', "TEXT NOT NULL DEFAULT ''"], ['arxiv_id', "TEXT NOT NULL DEFAULT ''"],
    ['year', 'INTEGER'], ['venue', "TEXT NOT NULL DEFAULT ''"],
    ['abstract', "TEXT NOT NULL DEFAULT ''"], ['source_url', "TEXT NOT NULL DEFAULT ''"],
    ['pdf_url', "TEXT NOT NULL DEFAULT ''"], ['favorite', 'INTEGER NOT NULL DEFAULT 0'],
    ['rating', 'INTEGER'], ['read_status', "TEXT NOT NULL DEFAULT 'unread'"],
    ['journal_rating', "TEXT NOT NULL DEFAULT ''"], ['journal_rating_at', 'TEXT'],
    ['citation_count', 'INTEGER'],
  ];
  const existing = new Set(db.prepare('PRAGMA table_info(papers)').all().map(column => column.name));
  for (const [name, definition] of columns) {
    if (!existing.has(name)) db.exec(`ALTER TABLE papers ADD COLUMN ${name} ${definition}`);
  }
  const selectList = `SELECT id, filename, title, author, page_count, status, error, imported,
    doi, arxiv_id, year, venue, abstract, source_url, pdf_url,
    favorite, rating, read_status, journal_rating, journal_rating_at, citation_count FROM papers`;
  const linkQuery = db.prepare('SELECT paper_id, category_id FROM paper_category_links');
  function withCategories(rows) {
    const links = linkQuery.all();
    const byPaper = new Map();
    for (const link of links) {
      if (!byPaper.has(link.paper_id)) byPaper.set(link.paper_id, []);
      byPaper.get(link.paper_id).push(link.category_id);
    }
    return rows.map(row => ({ ...row, categoryIds: byPaper.get(row.id) || [] }));
  }
  return {
    get(id) {
      const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(id);
      return row ? { ...row, categoryIds: withCategories([row])[0].categoryIds } : row;
    },
    byHash: hash => db.prepare('SELECT id FROM papers WHERE sha256 = ?').get(hash),
    byDoi: doi => /^10\.\d{4,9}\/\S+$/.test(doi || '')
      ? db.prepare('SELECT * FROM papers WHERE lower(doi) = lower(?)').get(doi) : undefined,
    list: () => withCategories(db.prepare(selectList + ' ORDER BY imported DESC, rowid DESC').all()),
    next: () => db.prepare("SELECT id FROM papers WHERE status = 'queued' ORDER BY imported, rowid LIMIT 1").get(),
    create({ id, hash, filename, title }) {
      db.prepare('INSERT INTO papers (id, sha256, filename, title, imported) VALUES (?, ?, ?, ?, ?)')
        .run(id, hash, filename, title, new Date().toISOString());
    },
    createLinked({ id, title, author = '', doi = '', arxivId = '', year = null, venue = '', abstract = '', sourceUrl = '', pdfUrl = '', citationCount = null }) {
      db.prepare(`INSERT INTO papers (id, sha256, filename, title, author, status, imported,
        doi, arxiv_id, year, venue, abstract, source_url, pdf_url, citation_count)
        VALUES (?, ?, '', ?, ?, 'linked', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, 'link:' + id, title, author, new Date().toISOString(),
          doi, arxivId, year, venue, abstract, sourceUrl, pdfUrl, citationCount);
    },
    updateMeta(id, meta = {}) {
      const fields = { doi: 'doi', arxivId: 'arxiv_id', year: 'year', venue: 'venue',
        abstract: 'abstract', sourceUrl: 'source_url', pdfUrl: 'pdf_url', citationCount: 'citation_count' };
      const sets = [];
      const values = [];
      for (const [key, column] of Object.entries(fields)) {
        if (meta[key] === undefined) continue;
        sets.push(column + ' = ?');
        values.push(meta[key]);
      }
      if (!sets.length) return;
      values.push(id);
      db.prepare(`UPDATE papers SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    },
    upgradeLinked(id, { hash, filename }) {
      const paper = this.get(id);
      if (!paper) throw new Error('论文不存在。');
      if (paper.status !== 'linked') return false;
      db.prepare(`UPDATE papers SET sha256 = ?, filename = ?, status = 'queued',
        error = NULL, page_count = 0 WHERE id = ?`).run(hash, filename, id);
      return true;
    },
    setFavorite(id, value) {
      if (!this.get(id)) throw new Error('论文不存在。');
      db.prepare('UPDATE papers SET favorite = ? WHERE id = ?').run(value ? 1 : 0, id);
    },
    setRating(id, value) {
      if (!this.get(id)) throw new Error('论文不存在。');
      if (value !== null && (!Number.isInteger(value) || value < 1 || value > 5)) throw new Error('评分需为 1 到 5 分。');
      db.prepare('UPDATE papers SET rating = ? WHERE id = ?').run(value, id);
    },
    setReadStatus(id, value) {
      if (!this.get(id)) throw new Error('论文不存在。');
      if (!['unread', 'reading', 'done'].includes(value)) throw new Error('未知的阅读状态。');
      db.prepare('UPDATE papers SET read_status = ? WHERE id = ?').run(value, id);
    },
    saveJournalRating(id, value) {
      if (!this.get(id)) throw new Error('论文不存在。');
      db.prepare('UPDATE papers SET journal_rating = ?, journal_rating_at = ? WHERE id = ?')
        .run(JSON.stringify(value).slice(0, 12000), new Date().toISOString(), id);
    },
    categories: {
      list() {
        return db.prepare(`SELECT c.id, c.name, c.parent_id, c.color,
          (SELECT COUNT(*) FROM paper_category_links l WHERE l.category_id = c.id) AS count
          FROM paper_categories c ORDER BY c.name COLLATE NOCASE`).all()
          .map(row => ({ id: row.id, name: row.name, parentId: row.parent_id, color: row.color, count: row.count }));
      },
      save({ id, name, parentId = null, color = '' } = {}) {
        const title = typeof name === 'string' ? name.trim().slice(0, 60) : '';
        if (!title) throw new Error('请填写分类名称。');
        const parent = parentId ? db.prepare('SELECT id, parent_id FROM paper_categories WHERE id = ?').get(parentId) : null;
        if (parentId && !parent) throw new Error('上级分类不存在。');
        if (parentId === id) throw new Error('分类不能成为自己的上级。');
        if (id) {
          if (!db.prepare('SELECT id FROM paper_categories WHERE id = ?').get(id)) throw new Error('分类不存在。');
          let walk = parent;
          while (walk) {
            if (walk.id === id) throw new Error('不能移动到自己的子分类。');
            walk = walk.parent_id ? db.prepare('SELECT id, parent_id FROM paper_categories WHERE id = ?').get(walk.parent_id) : null;
          }
        }
        const duplicate = db.prepare(`SELECT id FROM paper_categories
          WHERE lower(name) = lower(?) AND ifnull(parent_id, '') = ifnull(?, '') AND id <> ?`)
          .get(title, parentId || '', id || '');
        if (duplicate) throw new Error('同一层级已有同名分类。');
        if (id) {
          db.prepare('UPDATE paper_categories SET name = ?, parent_id = ?, color = ? WHERE id = ?')
            .run(title, parentId || null, color, id);
        } else {
          db.prepare('INSERT INTO paper_categories (id, name, parent_id, color, created) VALUES (?, ?, ?, ?, ?)')
            .run(randomUUID(), title, parentId || null, color, new Date().toISOString());
        }
        return this.list();
      },
      remove(id) {
        const all = this.list();
        if (!all.some(row => row.id === id)) throw new Error('分类不存在。');
        const ids = [id];
        let grew = true;
        while (grew) {
          grew = false;
          for (const row of all) {
            if (row.parentId && ids.includes(row.parentId) && !ids.includes(row.id)) { ids.push(row.id); grew = true; }
          }
        }
        const marks = ids.map(() => '?').join(',');
        db.exec('BEGIN');
        try {
          db.prepare(`DELETE FROM paper_category_links WHERE category_id IN (${marks})`).run(...ids);
          db.prepare(`DELETE FROM paper_categories WHERE id IN (${marks})`).run(...ids);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        return this.list();
      },
      assign(paperId, categoryId, assigned) {
        if (!db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId)) throw new Error('论文不存在。');
        if (!db.prepare('SELECT id FROM paper_categories WHERE id = ?').get(categoryId)) throw new Error('分类不存在。');
        if (assigned) db.prepare('INSERT INTO paper_category_links VALUES (?, ?) ON CONFLICT DO NOTHING').run(paperId, categoryId);
        else db.prepare('DELETE FROM paper_category_links WHERE paper_id = ? AND category_id = ?').run(paperId, categoryId);
      },
      forPaper(paperId) {
        return db.prepare('SELECT category_id FROM paper_category_links WHERE paper_id = ?').all(paperId)
          .map(row => row.category_id);
      },
    },
    annotations: {
      list(paperId) {
        return db.prepare(`SELECT * FROM paper_annotations
          WHERE paper_id = ? AND deleted_at IS NULL ORDER BY page, created`).all(paperId).map(row => ({
            id: row.id, paperId: row.paper_id, kind: row.kind, page: row.page, color: row.color,
            quote: row.quote, prefix: row.prefix, suffix: row.suffix,
            rects: safeJson(row.rects, []), note: row.note, tags: safeJson(row.tags, []),
            created: row.created, updated: row.updated,
          }));
      },
      save(input = {}) {
        const paperId = typeof input.paperId === 'string' ? input.paperId : '';
        if (!db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId)) throw new Error('论文不存在。');
        const kind = annotationKinds.has(input.kind) ? input.kind : '';
        const page = Number(input.page);
        if (!kind || !Number.isInteger(page) || page < 1) throw new Error('批注内容不完整。');
        const quote = typeof input.quote === 'string' ? input.quote.trim().slice(0, 4000) : '';
        if (!quote && kind !== 'bookmark') throw new Error('请先选择要标记的文字。');
        const rects = (Array.isArray(input.rects) ? input.rects : []).slice(0, 120).flatMap(rect => {
          const normalized = { x: clamp01(rect?.x), y: clamp01(rect?.y), w: clamp01(rect?.w), h: clamp01(rect?.h) };
          return normalized.w > 0 && normalized.h > 0 ? [normalized] : [];
        });
        const note = typeof input.note === 'string' ? input.note.slice(0, 6000) : '';
        const tags = [...new Set((Array.isArray(input.tags) ? input.tags : [])
          .map(tag => String(tag).trim().slice(0, 30)).filter(Boolean))].slice(0, 8);
        const color = /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '';
        const prefix = String(input.prefix || '').slice(0, 120);
        const suffix = String(input.suffix || '').slice(0, 120);
        const now = new Date().toISOString();
        let savedId = input.id;
        if (savedId) {
          if (!db.prepare('SELECT id FROM paper_annotations WHERE id = ? AND paper_id = ?').get(savedId, paperId)) {
            throw new Error('批注不存在。');
          }
          db.prepare(`UPDATE paper_annotations SET kind = ?, page = ?, color = ?, quote = ?, prefix = ?,
            suffix = ?, rects = ?, note = ?, tags = ?, updated = ? WHERE id = ?`)
            .run(kind, page, color, quote || '第 ' + page + ' 页', prefix, suffix,
              JSON.stringify(rects), note, JSON.stringify(tags), now, savedId);
        } else {
          savedId = randomUUID();
          db.prepare(`INSERT INTO paper_annotations
            (id, paper_id, kind, page, color, quote, prefix, suffix, rects, note, tags, created, updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(savedId, paperId, kind, page, color, quote || '第 ' + page + ' 页', prefix, suffix,
              JSON.stringify(rects), note, JSON.stringify(tags), now, now);
        }
        return this.list(paperId).find(row => row.id === savedId);
      },
      remove(id) {
        const row = typeof id === 'string'
          ? db.prepare('SELECT paper_id FROM paper_annotations WHERE id = ? AND deleted_at IS NULL').get(id) : null;
        if (!row) throw new Error('批注不存在。');
        const now = new Date().toISOString();
        db.prepare('UPDATE paper_annotations SET deleted_at = ?, updated = ? WHERE id = ?').run(now, now, id);
        return row.paper_id;
      },
    },
    notes: {
      get(paperId) {
        const row = db.prepare('SELECT * FROM paper_notes WHERE paper_id = ?').get(paperId);
        return { html: row?.html || '', text: row?.text || '', updated: row?.updated || null };
      },
      save(paperId, value = {}) {
        if (!db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId)) throw new Error('论文不存在。');
        const html = typeof value.html === 'string' ? value.html.slice(0, 100_000) : '';
        const text = typeof value.text === 'string' ? value.text.slice(0, 32_000) : '';
        db.prepare(`INSERT INTO paper_notes (paper_id, html, text, updated) VALUES (?, ?, ?, ?)
          ON CONFLICT(paper_id) DO UPDATE SET html = excluded.html, text = excluded.text, updated = excluded.updated`)
          .run(paperId, html, text, new Date().toISOString());
        return this.get(paperId);
      },
    },
    triage: {
      get(paperId) {
        const row = db.prepare('SELECT * FROM paper_triage WHERE paper_id = ?').get(paperId);
        return { type: row?.type || '', context: row?.context || '', correctness: row?.correctness || '',
          contributions: row?.contributions || '', clarity: row?.clarity || '', decision: row?.decision || '',
          seconds: row?.seconds || 0, updated: row?.updated || null };
      },
      save(paperId, value = {}) {
        if (!db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId)) throw new Error('论文不存在。');
        const fields = {
          type: cleanText(value.type, 600), context: cleanText(value.context, 600),
          correctness: cleanText(value.correctness, 600), contributions: cleanText(value.contributions, 600),
          clarity: cleanText(value.clarity, 600),
          decision: ['continue', 'pause', 'skip'].includes(value.decision) ? value.decision : '',
          seconds: Number.isFinite(Number(value.seconds)) ? Math.max(0, Math.round(Number(value.seconds))) : 0,
        };
        db.prepare(`INSERT INTO paper_triage (paper_id, type, context, correctness, contributions, clarity, decision, seconds, updated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(paper_id) DO UPDATE SET type=excluded.type, context=excluded.context,
            correctness=excluded.correctness, contributions=excluded.contributions, clarity=excluded.clarity,
            decision=excluded.decision, seconds=excluded.seconds, updated=excluded.updated`)
          .run(paperId, fields.type, fields.context, fields.correctness, fields.contributions,
            fields.clarity, fields.decision, fields.seconds, new Date().toISOString());
        return this.get(paperId);
      },
    },
    glossary: {
      list(paperId) {
        return db.prepare(`SELECT * FROM glossary_terms WHERE paper_id = ? OR paper_id = ''
          ORDER BY created DESC`).all(paperId);
      },
      save(input = {}) {
        const paperId = typeof input.paperId === 'string' ? input.paperId : '';
        if (!db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId)) throw new Error('论文不存在。');
        const term = cleanText(input.term, 120).trim();
        const definition = cleanText(input.definition, 1600).trim();
        if (!term || !definition) throw new Error('术语与释义不能为空。');
        const page = Number(input.page) >= 1 ? Math.round(Number(input.page)) : 1;
        const quote = cleanText(input.quote, 600).trim();
        const now = new Date().toISOString();
        const existing = db.prepare('SELECT id FROM glossary_terms WHERE paper_id = ? AND lower(term) = lower(?)').get(paperId, term);
        const id = input.id || existing?.id || randomUUID();
        db.prepare(`INSERT INTO glossary_terms (id, paper_id, term, definition, page, quote, created, updated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET definition=excluded.definition, page=excluded.page,
            quote=excluded.quote, updated=excluded.updated`)
          .run(id, paperId, term, definition, page, quote, now, now);
        return db.prepare('SELECT * FROM glossary_terms WHERE id = ?').get(id);
      },
      remove(id) {
        const row = db.prepare('SELECT id FROM glossary_terms WHERE id = ?').get(id);
        if (!row) throw new Error('术语不存在。');
        db.prepare('DELETE FROM glossary_terms WHERE id = ?').run(id);
        return true;
      },
    },
    insights: {
      get(paperId, page, kind) {
        const row = db.prepare('SELECT * FROM paper_insights WHERE paper_id = ? AND page = ? AND kind = ?')
          .get(paperId, page, kind);
        return row ? { ...row, citations: safeJson(row.citations, []), supported: Boolean(row.supported) } : null;
      },
      save(input = {}) {
        const paperId = typeof input.paperId === 'string' ? input.paperId : '';
        if (!db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId)) throw new Error('论文不存在。');
        const page = Number(input.page) >= 1 ? Math.round(Number(input.page)) : 1;
        const kind = cleanText(input.kind, 30) || 'plain';
        const text = cleanText(input.text, 12000);
        const citations = Array.isArray(input.citations) ? input.citations.slice(0, 8).map(item => ({
          page: Number(item?.page) || page, quote: cleanText(item?.quote, 600) })) : [];
        db.prepare(`INSERT INTO paper_insights (paper_id, page, kind, text, citations, supported, created)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(paper_id, page, kind) DO UPDATE SET text=excluded.text,
            citations=excluded.citations, supported=excluded.supported, created=excluded.created`)
          .run(paperId, page, kind, text, JSON.stringify(citations), input.supported ? 1 : 0,
            new Date().toISOString());
        return this.get(paperId, page, kind);
      },
    },
    review: {
      list(paperId) {
        return db.prepare(paperId
          ? 'SELECT * FROM review_cards WHERE paper_id = ? ORDER BY due, created'
          : 'SELECT * FROM review_cards ORDER BY due, created').all(...(paperId ? [paperId] : []));
      },
      due(paperId) {
        const now = new Date().toISOString();
        return db.prepare(paperId
          ? 'SELECT * FROM review_cards WHERE paper_id = ? AND due <= ? ORDER BY due'
          : 'SELECT * FROM review_cards WHERE due <= ? ORDER BY due').all(...(paperId ? [paperId, now] : [now]));
      },
      save(input = {}) {
        const paperId = typeof input.paperId === 'string' ? input.paperId : '';
        if (!db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId)) throw new Error('论文不存在。');
        const question = cleanText(input.question, 500).trim();
        const answer = cleanText(input.answer, 1200).trim();
        if (!question || !answer) throw new Error('自测题与答案不能为空。');
        const id = input.id || randomUUID();
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO review_cards (id, paper_id, question, answer, source_page, source_quote,
          due, interval, ease, reviews, created, updated)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, 2.5, 0, ?, ?)
          ON CONFLICT(id) DO UPDATE SET question=excluded.question, answer=excluded.answer,
            source_page=excluded.source_page, source_quote=excluded.source_quote, updated=excluded.updated`)
          .run(id, paperId, question, answer, Number(input.sourcePage) || 1,
            cleanText(input.sourceQuote, 600), now, now, now);
        return db.prepare('SELECT * FROM review_cards WHERE id = ?').get(id);
      },
      review(id, rating) {
        const card = db.prepare('SELECT * FROM review_cards WHERE id = ?').get(id);
        if (!card) throw new Error('自测卡片不存在。');
        if (!['again', 'hard', 'good', 'easy'].includes(rating)) throw new Error('未知的复习评分。');
        let interval = card.interval || 0;
        let ease = card.ease || 2.5;
        if (rating === 'again') { interval = 0; ease = Math.max(1.3, ease - 0.2); }
        else if (rating === 'hard') { interval = Math.max(1, Math.round((interval || 1) * 1.2)); ease = Math.max(1.3, ease - 0.05); }
        else if (rating === 'easy') { interval = Math.max(2, Math.round((interval || 1) * 2.2)); ease = Math.min(3.4, ease + 0.15); }
        else { interval = Math.max(1, Math.round((interval || 1) * ease)); }
        const steps = [1, 3, 7, 16, 35, 70, 140];
        if (interval > 0) interval = steps.find(step => step >= interval) || 140;
        const due = interval === 0
          ? new Date(Date.now() + 10 * 60000).toISOString()
          : new Date(Date.now() + interval * 86400000).toISOString();
        db.prepare('UPDATE review_cards SET interval = ?, ease = ?, due = ?, reviews = reviews + 1, updated = ? WHERE id = ?')
          .run(interval, ease, due, new Date().toISOString(), id);
        return db.prepare('SELECT * FROM review_cards WHERE id = ?').get(id);
      },
    },
    citation: {
      get(paperId) {
        const meta = db.prepare('SELECT * FROM citation_meta WHERE paper_id = ?').get(paperId);
        const rows = db.prepare('SELECT * FROM citation_edges WHERE paper_id = ? ORDER BY rowid').all(paperId);
        const map = row => ({
          key: row.work_key, title: row.title, author: row.author, year: row.year, venue: row.venue,
          doi: row.doi, arxiv: row.arxiv_id, url: row.url, pdfUrl: row.pdf_url, abstract: row.abstract,
          citationCount: row.citation_count, source: row.source,
        });
        return {
          references: rows.filter(row => row.direction === 'references').map(map),
          citations: rows.filter(row => row.direction === 'citations').map(map),
          meta: {
            referenceAt: meta?.reference_at || null, citationAt: meta?.citation_at || null,
            referenceSource: meta?.reference_source || '', citationSource: meta?.citation_source || '',
            referenceError: meta?.reference_error || '', citationError: meta?.citation_error || '',
          },
        };
      },
      save(paperId, graph = {}) {
        if (!db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId)) throw new Error('论文不存在。');
        const now = graph.fetchedAt || new Date().toISOString();
        const insert = db.prepare(`INSERT OR REPLACE INTO citation_edges
          (paper_id, direction, work_key, title, author, year, venue, doi, arxiv_id, url, pdf_url,
           abstract, citation_count, source, fetched)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const write = list => {
          for (const row of Array.isArray(list) ? list.slice(0, 60) : []) {
            if (!row?.key || !row.title) continue;
            insert.run(paperId, row.direction, row.key, cleanText(row.title, 500), cleanText(row.author, 600),
              Number.isInteger(row.year) ? row.year : null, cleanText(row.venue, 300),
              cleanText(row.doi, 200), cleanText(row.arxiv, 80), cleanText(row.url, 1000),
              cleanText(row.pdfUrl, 1000), cleanText(row.abstract, 4000),
              Number.isFinite(row.citationCount) ? row.citationCount : null,
              cleanText(row.source, 60), now);
          }
        };
        const errors = (Array.isArray(graph.errors) ? graph.errors : []).join('\n').slice(0, 2000);
        db.exec('BEGIN');
        try {
          db.prepare('DELETE FROM citation_edges WHERE paper_id = ?').run(paperId);
          write((graph.references || []).map(row => ({ ...row, direction: 'references' })));
          write((graph.citations || []).map(row => ({ ...row, direction: 'citations' })));
          db.prepare(`INSERT INTO citation_meta
            (paper_id, reference_at, citation_at, reference_source, citation_source, reference_error, citation_error)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(paper_id) DO UPDATE SET reference_at=excluded.reference_at,
              citation_at=excluded.citation_at, reference_source=excluded.reference_source,
              citation_source=excluded.citation_source, reference_error=excluded.reference_error,
              citation_error=excluded.citation_error`)
            .run(paperId, now, now, cleanText(graph.referenceSource, 60), cleanText(graph.citationSource, 60),
              errors, errors);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        return this.get(paperId);
      },
      coCited() {
        return db.prepare(`SELECT work_key, title, author, year, venue, doi, arxiv_id, url, pdf_url,
          abstract, MAX(citation_count) AS citation_count, COUNT(DISTINCT paper_id) AS shared,
          GROUP_CONCAT(DISTINCT paper_id) AS paper_ids
          FROM citation_edges WHERE direction = 'reference' GROUP BY work_key
          HAVING COUNT(DISTINCT paper_id) > 1 ORDER BY shared DESC, citation_count DESC LIMIT 100`).all()
          .map(row => ({
            key: row.work_key, title: row.title, author: row.author, year: row.year, venue: row.venue,
            doi: row.doi, arxiv: row.arxiv_id, url: row.url, pdfUrl: row.pdf_url, abstract: row.abstract,
            citationCount: row.citation_count, sharedBy: row.shared, paperIds: row.paper_ids.split(','),
          }));
      },
    },
    comparison: {
      get(key) {
        const row = db.prepare('SELECT * FROM paper_comparisons WHERE paper_ids = ?').get(key);
        if (!row) return null;
        return { paperIds: row.paper_ids.split('|'), rows: safeJson(row.rows, []),
          generated: Boolean(row.generated), model: row.model, updated: row.updated };
      },
      save(key, paperIds, rows, { generated = false, model = '' } = {}) {
        if (!key) throw new Error('请先选择要比较的论文。');
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO paper_comparisons (paper_ids, rows, generated, model, created, updated)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(paper_ids) DO UPDATE SET rows=excluded.rows,
            generated=excluded.generated, model=excluded.model, updated=excluded.updated`)
          .run(key, JSON.stringify(Array.isArray(rows) ? rows : []),
            generated ? 1 : 0, cleanText(model, 120), now, now);
        return this.get(key);
      },
    },
    begin(id) {
      db.prepare('DELETE FROM paper_pages WHERE paper_id = ?').run(id);
      db.prepare("UPDATE papers SET status = 'running', error = NULL WHERE id = ?").run(id);
    },
    metadata(id, metadata) {
      db.prepare("UPDATE papers SET title = COALESCE(NULLIF(?, ''), title), author = ?, page_count = ? WHERE id = ?")
        .run(metadata.title, metadata.author, metadata.pages, id);
    },
    addPage(id, page, text) {
      db.prepare('INSERT INTO paper_pages (paper_id, page, text) VALUES (?, ?, ?)').run(id, page, text);
    },
    page: (id, page) => db.prepare('SELECT page, text FROM paper_pages WHERE paper_id = ? AND page = ?').get(id, page),
    translation: (id, page, key) => db.prepare('SELECT text FROM paper_translations WHERE paper_id = ? AND page = ? AND source_key = ?').get(id, page, key)?.text,
    saveTranslation(id, page, key, text) {
      db.prepare('INSERT INTO paper_translations (paper_id, page, source_key, text) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING')
        .run(id, page, key, text);
    },
    search(id, query) {
      return db.prepare(`
        SELECT page, substr(text, max(1, instr(lower(text), lower(?)) - 36), 150) AS preview
        FROM paper_pages WHERE paper_id = ? AND instr(lower(text), lower(?)) > 0
        ORDER BY page LIMIT 40
      `).all(query, id, query);
    },
    finish(id, status, error = null) {
      db.prepare('UPDATE papers SET status = ?, error = ? WHERE id = ?').run(status, error, id);
    },
  };
}
