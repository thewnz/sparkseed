import { normalizeText } from './paper-search.mjs';

const OPENALEX = 'https://api.openalex.org/works';
const SEMANTIC = 'https://api.semanticscholar.org/graph/v1/paper';
const S2_FIELDS = 'title,abstract,year,venue,authors,externalIds,openAccessPdf,citationCount,url';
const USER_AGENT = 'Sparkseed/0.1 (research workspace)';

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const codePoint = (value, radix) => {
  const number = parseInt(value, radix);
  return Number.isFinite(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ' ';
};
const plain = value => normalizeText(String(value ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => codePoint(hex, 16))
  .replace(/&#(\d+);/g, (_, number) => codePoint(number, 10))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, name) => entities[name.toLowerCase()]));
const doiOf = value => {
  const text = normalizeText(value);
  const match = /^https?:\/\/(?:dx\.)?doi\.org\/(.+)$/i.exec(text);
  const doi = match ? match[1] : text;
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi.toLowerCase() : '';
};
const arxivOf = value => {
  const text = normalizeText(value);
  if (/^\d{4}\.\d{4,5}(?:v\d+)?$/.test(text)) return text.toLowerCase();
  const match = /arxiv\.org\/(?:abs|pdf)\/([^?#]+?)(?:\.pdf)?$/i.exec(text);
  return match ? match[1].toLowerCase() : '';
};
const urlOf = value => {
  const text = normalizeText(value);
  return /^https?:\/\//i.test(text) ? text : '';
};
const yearOf = value => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1800 && year <= 2200 ? year : null;
};
const shortId = value => {
  const match = /\/(W\d+)$/.exec(normalizeText(value));
  return match ? match[1] : normalizeText(value).replace(/^W/, 'W');
};
const header = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
const requestOptions = (signal, extra = {}) => ({ signal, redirect: 'error', headers: header, ...extra });
const clamp = (value, max) => normalizeText(value).slice(0, max);

export function workKey(input = {}) {
  const doi = doiOf(input.doi || input.DOI || '');
  if (doi) return 'doi:' + doi;
  const arxiv = arxivOf(input.arxiv || input.arxiv_id || input.ArXiv || '');
  if (arxiv) return 'arxiv:' + arxiv.replace(/v\d+$/, '');
  const title = plain(input.title || '').replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 100);
  return title ? 'title:' + title.toLowerCase() : '';
}

export function rankCoCitations(sets = []) {
  // mth
  const byKey = new Map();
  for (const set of sets) {
    const seen = new Set();
    for (const item of Array.isArray(set?.references) ? set.references : []) {
      const key = item?.key || workKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const existing = byKey.get(key);
      if (existing) {
        existing.sharedBy += 1;
        existing.paperIds.push(set.paperId);
        if (!existing.abstract && item.abstract) existing.abstract = item.abstract;
        existing.citationCount = Math.max(existing.citationCount ?? -1, item.citationCount ?? -1);
        continue;
      }
      byKey.set(key, {
        ...item, key, sharedBy: 1, paperIds: set.paperId ? [set.paperId] : [],
        citationCount: Number.isFinite(item?.citationCount) ? item.citationCount : null,
      });
    }
  }
  return [...byKey.values()]
    .filter(item => item.sharedBy > 1)
    .sort((first, second) => second.sharedBy - first.sharedBy ||
      (second.citationCount ?? -1) - (first.citationCount ?? -1) ||
      (second.year ?? 0) - (first.year ?? 0));
}

function invertedAbstract(index) {
  if (!index || typeof index !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of Array.isArray(positions) ? positions : []) words[position] = word;
  }
  return plain(words.filter(Boolean).join(' ')).slice(0, 2400);
}

function openAlexWork(row) {
  if (!row || typeof row !== 'object') return null;
  const title = plain(row.title || row.display_name);
  if (!title) return null;
  const doi = doiOf(row.doi);
  const pdfUrl = urlOf(row.best_oa_location?.pdf_url) || urlOf(row.open_access?.oa_url) ||
    urlOf(row.primary_location?.pdf_url);
  return {
    key: workKey({ doi, title }), title: claim(title, 500),
    author: (row.authorships || []).map(item => plain(item?.author?.display_name)).filter(Boolean).slice(0, 8).join(', '),
    year: yearOf(row.publication_year),
    venue: claim(plain(row.primary_location?.source?.display_name), 300),
    doi, arxiv: '',
    url: doi ? 'https://doi.org/' + encodeURI(doi) : urlOf(row.id),
    pdfUrl,
    abstract: invertedAbstract(row.abstract_inverted_index).slice(0, 4000),
    citationCount: Number.isFinite(row.cited_by_count) ? row.cited_by_count : null,
    openalexId: shortId(row.id), source: 'OpenAlex',
  };
}

function semanticWork(row) {
  if (!row || typeof row !== 'object') return null;
  const title = plain(row.title);
  if (!title) return null;
  const doi = doiOf(row.externalIds?.DOI);
  const arxiv = arxivOf(row.externalIds?.ArXiv);
  const pdfUrl = urlOf(row.openAccessPdf?.url);
  return {
    key: workKey({ doi, arxiv, title }), title: claim(title, 500),
    author: (row.authors || []).map(author => plain(author?.name)).filter(Boolean).slice(0, 8).join(', '),
    year: yearOf(row.year), venue: claim(plain(row.venue), 300),
    doi, arxiv,
    url: urlOf(row.url) || (row.paperId ? 'https://www.semanticscholar.org/paper/' + row.paperId : ''),
    pdfUrl, abstract: plain(row.abstract).slice(0, 4000),
    citationCount: Number.isFinite(row.citationCount) ? row.citationCount : null,
    openalexId: '', source: 'Semantic Scholar',
  };
}

function claim(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function dedupe(rows, limit) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row?.title) continue;
    const key = row.key || workKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...row, key });
    if (out.length >= limit) break;
  }
  return out;
}

async function readJson(response, label) {
  if (response.status === 429) throw new Error(label + '请求过于频繁，请稍后再试。');
  if (!response.ok) throw new Error(label + '返回 HTTP ' + response.status);
  return response.json();
}

async function openAlexSeed(paper, { request, signal, openalexKey }) {
  const params = new URLSearchParams({ 'per-page': '1' });
  if (openalexKey) params.set('api_key', openalexKey);
  let url;
  const doi = doiOf(paper.doi);
  if (doi) {
    params.set('filter', 'doi:' + doi);
    url = new URL(OPENALEX + '?' + params);
  } else {
    params.set('search', normalizeText(paper.title));
    url = new URL(OPENALEX + '?' + params);
  }
  const response = await request(url, requestOptions(signal));
  const data = await readJson(response, 'OpenAlex');
  const row = (data.results || [])[0];
  if (!row) return null;
  return { row, id: shortId(row.id), references: row.referenced_works || [],
    citationCount: Number.isFinite(row.cited_by_count) ? row.cited_by_count : null };
}

async function openAlexDetails(ids, { request, signal, openalexKey, select }) {
  const params = new URLSearchParams({ filter: 'openalex:' + ids.join('|'), 'per-page': String(Math.min(50, ids.length)) });
  if (openalexKey) params.set('api_key', openalexKey);
  if (select) params.set('select', select);
  const url = new URL(OPENALEX + '?' + params);
  const response = await request(url, requestOptions(signal));
  const data = await readJson(response, 'OpenAlex');
  return (data.results || []).map(openAlexWork).filter(Boolean);
}

async function openAlexSupport(seed, { request, signal, openalexKey, limit }) {
  const referenceIds = [...new Set(seed.references.map(shortId).filter(id => /^W\d+$/.test(id)))].slice(0, 50);
  const select = 'id,doi,title,publication_year,cited_by_count,abstract_inverted_index,authorships,primary_location,best_oa_location,open_access';
  const [references, citations] = await Promise.allSettled([
    referenceIds.length
      ? openAlexDetails(referenceIds, { request, signal, openalexKey, select })
      : Promise.resolve([]),
    (async () => {
      const params = new URLSearchParams({ filter: 'cites:' + seed.id, 'per-page': String(limit), sort: 'cited_by_count:desc' });
      if (openalexKey) params.set('api_key', openalexKey);
      params.set('select', select);
      const response = await request(new URL(OPENALEX + '?' + params), requestOptions(signal));
      const data = await readJson(response, 'OpenAlex');
      return (data.results || []).map(openAlexWork).filter(Boolean);
    })(),
  ]);
  const errors = [];
  if (references.status === 'rejected') errors.push('参考文脉：' + references.reason.message);
  if (citations.status === 'rejected') errors.push('被引脉络：' + citations.reason.message);
  return {
    references: references.status === 'fulfilled' ? references.value : [],
    citations: citations.status === 'fulfilled' ? citations.value : [],
    errors,
  };
}

async function semanticSeedId(paper, { request, signal, semanticKey }) {
  const doi = doiOf(paper.doi);
  if (doi) return 'DOI:' + doi;
  const arxiv = arxivOf(paper.arxiv_id || paper.arxiv);
  if (arxiv) return 'ARXIV:' + arxiv;
  const url = new URL(SEMANTIC + '/search');
  url.search = new URLSearchParams({ query: normalizeText(paper.title), limit: '1', fields: 'paperId' });
  const headers = { ...header };
  if (semanticKey) headers['x-api-key'] = semanticKey;
  const response = await request(url, { signal, redirect: 'error', headers });
  const data = await readJson(response, 'Semantic Scholar');
  return data.data?.[0]?.paperId || '';
}

async function semanticSupport(paper, { request, signal, semanticKey, limit }) {
  const id = await semanticSeedId(paper, { request, signal, semanticKey });
  if (!id) throw new Error('Semantic Scholar 没有找到这篇论文。');
  const headers = { ...header };
  if (semanticKey) headers['x-api-key'] = semanticKey;
  const fetchList = async (kind, max) => {
    const url = new URL(SEMANTIC + '/' + id + '/' + kind);
    url.search = new URLSearchParams({ limit: String(max), fields: S2_FIELDS });
    const response = await request(url, { signal, redirect: 'error', headers });
    const data = await readJson(response, 'Semantic Scholar');
    return (data.data || []).map(item => semanticWork(kind === 'references' ? item.citedPaper : item.citingPaper)).filter(Boolean);
  };
  const [references, citations] = await Promise.allSettled([fetchList('references', 50), fetchList('citations', limit)]);
  const errors = [];
  if (references.status === 'rejected') errors.push('参考文脉：' + references.reason.message);
  if (citations.status === 'rejected') errors.push('被引脉络：' + citations.reason.message);
  return {
    references: references.status === 'fulfilled' ? references.value : [],
    citations: citations.status === 'fulfilled' ? citations.value : [],
    errors,
  };
}

export async function fetchCitationGraph(paper = {}, {
  request = fetch, signal, openalexKey = '', semanticKey = '', limit = 30,
} = {}) {
  if (!normalizeText(paper.title)) throw new Error('这篇论文还没有题名，无法查询引文。');
  const errors = [];
  let references = [];
  let citations = [];
  let referenceSource = '';
  let citationSource = '';
  let seedCitationCount = null;
  try {
    const seed = await openAlexSeed(paper, { request, signal, openalexKey });
    if (seed) {
      seedCitationCount = seed.citationCount;
      const support = await openAlexSupport(seed, { request, signal, openalexKey, limit });
      references = support.references;
      citations = support.citations;
      errors.push(...support.errors);
      if (references.length) referenceSource = 'OpenAlex';
      if (citations.length) citationSource = 'OpenAlex';
    } else {
      errors.push('OpenAlex 没有收录这篇论文。');
    }
  } catch (error) {
    errors.push('OpenAlex：' + error.message);
  }
  if (!references.length || !citations.length) {
    try {
      const support = await semanticSupport(paper, { request, signal, semanticKey, limit });
      if (!references.length && support.references.length) {
        references = support.references; referenceSource = 'Semantic Scholar';
      }
      if (!citations.length && support.citations.length) {
        citations = support.citations; citationSource = 'Semantic Scholar';
      }
      errors.push(...support.errors.filter(message => !errors.includes(message)));
    } catch (error) {
      errors.push('Semantic Scholar：' + error.message);
    }
  }
  return {
    references: dedupe(references, 50),
    citations: dedupe(citations, limit),
    referenceSource, citationSource, errors,
    seedCitationCount,
    fetchedAt: new Date().toISOString(),
  };
}
