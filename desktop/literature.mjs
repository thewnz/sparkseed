import { Worker } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';
import { extractArticleFigures } from './flow-style.mjs';

export const normalizeText = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const plain = value => normalizeText(value?.replace(/<[^>]+>/g, ' ').replace(/&(amp|lt|gt|quot|apos);/g,
  (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name]) || '');
const arxivId = value => /^(?:\d{4}\.\d{4,5}|[a-z][a-z.-]+\/\d{7})(?:v\d+)?$/i.test(value || '') ? value : '';
const idFromUrl = url => arxivId(/^(?:https?:\/\/)?(?:www\.)?arxiv\.org\/(?:abs|pdf)\/([^?#]+?)(?:\.pdf)?$/i.exec(url)?.[1]);
let previousArxiv = 0;

async function metadata(url, signal, request) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(16000)]);
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await request(url, { signal: deadline, redirect: 'error' });
    } catch (error) {
      deadline.throwIfAborted();
      if (attempt || !(error instanceof TypeError)) throw error;
    }
    if (response?.ok) return response;
    if (response) {
      if (attempt || ![408, 502, 503, 504].includes(response.status)) throw new Error('HTTP ' + response.status);
      await response.body?.cancel().catch(() => {});
    }
    await delay(300, undefined, { signal: deadline });
  }
}

async function crossref(query, signal, request) {
  const url = new URL('https://api.crossref.org/works');
  url.search = new URLSearchParams({
    'query.bibliographic': query, rows: '6', select: 'DOI,title,abstract,published,type,author,container-title,relation',
    filter: 'type:journal-article,type:proceedings-article,type:posted-content,type:dissertation',
  });
  const data = await (await metadata(url, signal, request)).json();
  return (data.message?.items || []).flatMap(row => {
    const doi = normalizeText(row.DOI);
    const title = plain(row.title?.[0]);
    if (!/^10\.\d{4,9}\/\S+$/.test(doi) || !title || !['journal-article', 'proceedings-article', 'posted-content', 'dissertation'].includes(row.type)) return [];
    const arxiv = arxivId(/^10\.48550\/arxiv\.(.*)$/i.exec(doi)?.[1]);
    const version = arxiv || row.type === 'posted-content' ? '预印本或已发布稿件' : row.type === 'dissertation' ? '学位论文' : '正式发表';
    const related = ['is-preprint-of', 'has-preprint'].flatMap(kind => (row.relation?.[kind] || [])
      .filter(item => item['id-type'] === 'doi' && /^10\.\d{4,9}\/\S+$/.test(item.id)).map(item => ({ kind, doi: item.id })));
    return [{ id: arxiv ? 'arxiv:' + arxiv.toLowerCase() : doi.toLowerCase(), doi, title, year: row.published?.['date-parts']?.[0]?.[0] || null,
      authors: (row.author || []).map(author => author.name || [author.family, author.given].filter(Boolean).join(', ')).filter(Boolean),
      venue: plain(row['container-title']?.[0]), version, type: row.type, related,
      url: 'https://doi.org/' + encodeURI(doi), abstract: plain(row.abstract).slice(0, 1800), arxiv, source: 'Crossref' }];
  });
}

async function arxiv(query, signal, request) {
  await delay(Math.max(0, previousArxiv + 3100 - Date.now()), undefined, { signal });
  previousArxiv = Date.now();
  const url = new URL('https://export.arxiv.org/api/query');
  const keywords = (query.match(/[\p{L}\p{N}-]+/gu) || []).slice(0, 7);
  if (!keywords.length) return [];
  url.search = new URLSearchParams({ search_query: keywords.map(word => 'all:"' + word + '"').join(' AND '), max_results: '6' });
  const xml = await (await metadata(url, signal, request)).text();
  const field = (entry, name) => plain(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>').exec(entry)?.[1]);
  return Array.from(xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g)).flatMap(([, entry]) => {
    const arxiv = idFromUrl(field(entry, 'id'));
    const title = field(entry, 'title');
    if (!arxiv || !title) return [];
    const doi = field(entry, 'arxiv:doi');
    return [{ id: 'arxiv:' + arxiv.toLowerCase(), title, year: Number(field(entry, 'published').slice(0, 4)) || null,
      version: '预印本', authors: Array.from(entry.matchAll(/<author>([\s\S]*?)<\/author>/g), ([, author]) => field(author, 'name')).filter(Boolean),
      related: /^10\.\d{4,9}\/\S+$/.test(doi) ? [{ kind: 'is-preprint-of', doi }] : [],
      url: 'https://arxiv.org/abs/' + arxiv, abstract: field(entry, 'summary').slice(0, 1800), arxiv, source: 'arXiv' }];
  });
}

const europeBase = 'https://www.ebi.ac.uk/europepmc/webservices/rest/';

async function europePmc(query, signal, request) {
  const url = new URL('search', europeBase);
  url.search = new URLSearchParams({ query: '(' + query.replace(/[^\p{L}\p{N}\s-]/gu, ' ') + ') AND OPEN_ACCESS:Y',
    format: 'json', resultType: 'core', pageSize: '5' });
  const data = await (await metadata(url, signal, request)).json();
  return (data.resultList?.result || []).filter(row => /^PMC\d+$/.test(row.pmcid) && row.title).map(row => {
    const doi = /^10\.\d{4,9}\/\S+$/.test(row.doi) ? row.doi : '';
    const version = row.source === 'PPR' || row.pubTypeList?.pubType?.some(type => /preprint/i.test(type)) ? '预印本' :
      row.authorManuscript === 'Y' ? '作者稿' : '正式发表（存档）';
    return { id: row.pmcid, doi, pmcid: row.pmcid, title: plain(row.title), version,
      year: Number(row.pubYear) || null, venue: plain(row.journalTitle || row.journalInfo?.journal?.title),
      authors: (row.authorList?.author || []).map(author => author.fullName).filter(Boolean),
      url: 'https://europepmc.org/articles/' + row.pmcid, abstract: plain(row.abstractText).slice(0, 1800), source: 'Europe PMC' };
  });
}

async function readEuropePmc(paper, query, signal, request, illustrations) {
  const response = await metadata(new URL(paper.pmcid + '/fullTextXML', europeBase), signal, request);
  let xml = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    xml += decoder.decode(chunk, { stream: true });
    if (xml.length > 3_000_000) throw new Error('正文超出读取上限。');
  }
  xml += decoder.decode();
  if (illustrations) {
    paper.figures = await extractArticleFigures(xml, paper, signal, request).catch(() => []);
  }
  const body = /<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/.exec(xml)?.[1] || '';
  const candidates = Array.from(body.matchAll(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>([\s\S]*?)(?=<title(?:\s[^>]*)?>|$)/g),
    (match, index) => {
      const [, title, content] = match;
      const tag = /<sec\b([^>]*)>\s*$/.exec(body.slice(Math.max(0, match.index - 300), match.index))?.[1] || '';
      const anchor = /\sid=["']([a-z0-9_.:-]+)["']/i.exec(tag)?.[1] || '';
      return { page: index + 1, section: plain(title).slice(0, 130) + ' [' + (index + 1) + ']', anchor,
        text: Array.from(content.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g), ([, paragraph]) => plain(paragraph)).join(' ') };
    });
  if (!candidates.length && body) candidates.push({ page: 1, section: '正文 [1]', text: plain(body) });
  return relevantPages(candidates, query).map(row => ({ section: candidates[row.page - 1].section,
    anchor: candidates[row.page - 1].anchor, text: row.text }));
}

function relevantPages(rows, query) {
  const words = [...new Set(query.toLowerCase().match(/[a-z0-9-]{4,}|[\p{Script=Han}]{2,}/gu) || [])].slice(0, 16);
  return rows.map(row => ({ ...row, score: words.filter(word => row.text.toLowerCase().includes(word)).length }))
    .sort((a, b) => b.score - a.score || a.page - b.page).slice(0, 3)
    .map(({ page, text }) => {
      const normalized = normalizeText(text);
      const match = words.map(word => normalized.toLowerCase().indexOf(word)).filter(index => index >= 0).sort((a, b) => a - b)[0];
      const start = Math.max(0, (match ?? 0) - 230);
      return { page, text: normalized.slice(start, start + 1500) };
    }).filter(row => row.text);
}

export async function fetchArxivPdf(id, signal, request = fetch) {
  if (!arxivId(id)) throw new Error('arXiv 论文编号无效。');
  const url = new URL('https://arxiv.org/pdf/' + id);
  const response = await request(url, { signal, redirect: 'error' });
  if (!response.ok || Number(response.headers.get('content-length')) > 12 * 1024 * 1024) throw new Error('开放 PDF 无法读取。');
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 12 * 1024 * 1024) throw new Error('开放 PDF 超过读取上限。');
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  if (!data.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('下载内容不是 PDF。');
  return data;
}

export async function readArxiv(paper, query, signal, request = fetch, illustrations = false) {
  if (!arxivId(paper.arxiv)) return [];
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(23000)]);
  const data = await fetchArxivPdf(paper.arxiv, deadline, request);
  return readPaperPdf(data, paper, query, deadline, illustrations);
}

export async function readPaperPdf(data, paper, query, deadline, illustrations) {
  deadline.throwIfAborted();
  const worker = new Worker(process.env.SPARKSEED_PDF_WORKER || new URL('./pdf-worker.mjs', import.meta.url),
    { execArgv: [], workerData: { data, maxPages: 32, illustrations } });
  const rows = [];
  try {
    return await new Promise((resolve, reject) => {
      const stop = () => reject(deadline.reason);
      deadline.addEventListener('abort', stop, { once: true });
      worker.on('message', message => {
        if (message.type === 'page') rows.push(message);
        if (message.type === 'figure') paper.figures = [{
          paper: paper.title, paperId: paper.paperId, label: 'PDF 第 ' + message.page + ' 页 · 图区截取', caption: message.caption,
          url: paper.arxiv ? 'https://arxiv.org/pdf/' + paper.arxiv + '#page=' + message.page : '',
          mime: 'image/png', bytes: Buffer.from(message.bytes),
        }];
        if (message.type === 'result') resolve(relevantPages(rows, query));
        if (message.type === 'error') reject(new Error(message.message));
      });
      worker.once('error', reject);
      worker.once('exit', () => { deadline.removeEventListener('abort', stop); reject(new Error('PDF 读取中断。')); });
    });
  } finally {
    void worker.terminate();
  }
}

export async function collectLiterature(queries, { signal, localPapers, scholar, web, onStage, prior, request = fetch, illustrations = false, localPdf }) {
  if (prior?.pendingRead) return readLiterature(prior, queries, { signal, onStage, request, illustrations, localPdf });
  const checkpoint = prior?.pendingSearch ? prior : null;
  const found = new Map((checkpoint?.papers || []).map(paper => [paper.id, paper]));
  const searches = [...(checkpoint?.searches || [])];
  const commentary = new Map((checkpoint?.commentary || []).map(row => [row.url, row]));
  function add(row) {
    const key = row.id;
    if (!key) return;
    const previous = found.get(key);
    if (!previous) found.set(key, row);
    else found.set(key, { ...previous, ...row, abstract: row.abstract || previous.abstract,
      pages: row.pages || previous.pages, authors: row.authors?.length ? row.authors : previous.authors,
      related: [...(previous.related || []), ...(row.related || [])] });
  }
  for (let index = checkpoint?.nextQuery || 0; index < queries.length; index++) {
    const query = queries[index];
    signal.throwIfAborted();
    const sources = [['Crossref', () => crossref(query, signal, request)], ['arXiv', () => arxiv(query, signal, request)],
      ['Europe PMC', () => europePmc(query, signal, request)]];
    if (scholar) sources.push(['学术 MCP', async () => (await scholar(query, signal)).entries.map(row => ({
      ...row, id: idFromUrl(row.url) ? 'arxiv:' + idFromUrl(row.url).toLowerCase() : row.url || row.title,
      abstract: '', lead: row.description, arxiv: idFromUrl(row.url), source: '学术 MCP',
    }))]);
    const results = await Promise.allSettled(sources.map(([, run]) => run()));
    signal.throwIfAborted();
    for (const [index, result] of results.entries()) {
      searches.push({ query, source: sources[index][0], count: result.status === 'fulfilled' ? result.value.length : null,
        ...(result.status === 'rejected' ? { error: normalizeText(result.reason?.message).slice(0, 160) || '连接失败' } : {}) });
      if (result.status === 'fulfilled') result.value.forEach(add);
    }
    const local = localPapers(query);
    searches.push({ query, source: '本地论文库', count: local.length });
    local.forEach(add);
    if (web) {
      try {
        const rows = (await web(query + ' peer review discussion critique', signal)).entries;
        for (const row of rows.slice(0, 6)) if (row.url && row.description) commentary.set(row.url, row);
        searches.push({ query, source: '网页评论 MCP', count: rows.length });
      } catch {
        signal.throwIfAborted();
        searches.push({ query, source: '网页评论 MCP', error: '检索未完成。' });
      }
    }
    onStage?.('search', { papers: [...found.values()], searches: [...searches], commentary: [...commentary.values()],
      pendingSearch: true, nextQuery: index + 1 });
  }
  const papers = [...found.values()].sort((a, b) => Number(Boolean(b.pages?.length || b.abstract || b.arxiv || b.pmcid)) -
    Number(Boolean(a.pages?.length || a.abstract || a.arxiv || a.pmcid))).slice(0, 18);
  const snapshot = { papers, searches, commentary: [...commentary.values()].slice(0, 10), searchedAt: new Date().toISOString(), pendingRead: true };
  return readLiterature(snapshot, queries, { signal, onStage, request, illustrations, localPdf });
}

async function readLiterature(snapshot, queries, { signal, onStage, request, illustrations, localPdf }) {
  const papers = snapshot.papers.map(paper => ({ ...paper }));
  const progress = { ...snapshot, papers };
  onStage?.('read', progress);
  const arxivPapers = papers.filter(paper => paper.arxiv && !paper.paperId).slice(0, 2);
  const europePapers = papers.filter(paper => paper.pmcid).slice(0, 2);
  const local = illustrations && localPdf ? papers.filter(paper => paper.paperId).slice(0, 1) : [];
  await Promise.all([...arxivPapers, ...europePapers, ...local].map(async paper => {
    if (paper.readAttempted) return;
    try {
      if (europePapers.includes(paper)) paper.sections = await readEuropePmc(paper, queries.join(' '), signal, request, illustrations);
      else if (paper.paperId) {
        const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
        const data = await localPdf(paper.paperId, deadline);
        if (data) await readPaperPdf(data, paper, queries.join(' '), deadline, true);
      } else paper.pages = await readArxiv(paper, queries.join(' '), signal, request, illustrations);
    }
    catch {
      if (signal.aborted) return;
      paper.readError = '开放正文暂未取回，可从论文来源查看。';
    }
    if (!signal.aborted) {
      paper.readAttempted = true;
      onStage?.('read', progress);
    }
  }));
  signal.throwIfAborted();
  return { ...progress, pendingRead: false };
}

export function localLiterature(papers, query, citedTitle = '') {
  const words = [...new Set(query.match(/[a-z0-9-]{4,}|[\p{Script=Han}]{2,}/giu) || [])].slice(0, 10);
  return papers.list().filter(paper => paper.status === 'ready').slice(0, 100).map(paper => {
    const exact = citedTitle && normalizeText(paper.title).toLowerCase() === normalizeText(citedTitle).toLowerCase();
    const hits = words.flatMap(word => papers.search(paper.id, word).slice(0, 3));
    const numbers = [...new Set(hits.map(hit => hit.page))].slice(0, 8);
    if (exact && !numbers.includes(1)) numbers.push(1);
    const rows = numbers.map(page => papers.page(paper.id, page)).filter(Boolean);
    return { id: 'local:' + paper.id, paperId: paper.id, title: paper.title, source: '本地论文库',
      pages: relevantPages(rows, query), matched: Boolean(exact) };
  }).filter(paper => paper.pages.length).sort((a, b) => Number(b.matched) - Number(a.matched)).slice(0, 5);
}
