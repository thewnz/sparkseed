import { isIP } from 'node:net';

const USER_AGENT = 'Sparkseed/0.1 (research workspace)';
const BROWSER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const SOURCE_IDS = ['crossref', 'arxiv', 'openalex', 'semantic', 'europepmc', 'web'];
export const SOURCE_LABELS = {
  crossref: 'Crossref', arxiv: 'arXiv', openalex: 'OpenAlex',
  semantic: 'Semantic Scholar', europepmc: 'Europe PMC', web: '网页',
};
let previousArxiv = 0;

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const codePoint = (value, radix) => {
  const number = parseInt(value, radix);
  return Number.isFinite(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ' ';
};
export const normalizeText = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const plain = value => normalizeText(String(value ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => codePoint(hex, 16))
  .replace(/&#(\d+);/g, (_, number) => codePoint(number, 10))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, name) => entities[name.toLowerCase()]));
const slug = value => normalizeText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 120);
const yearOf = value => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1800 && year <= 2200 ? year : null;
};
const doiOf = value => {
  const text = normalizeText(value);
  const match = /^https?:\/\/(?:dx\.)?doi\.org\/(.+)$/i.exec(text);
  const doi = match ? match[1] : text;
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi.toLowerCase() : '';
};
const arxivOf = value => {
  const text = normalizeText(value);
  if (/^\d{4}\.\d{4,5}(?:v\d+)?$/.test(text)) return text;
  return /arxiv\.org\/(?:abs|pdf)\/([^?#]+?)(?:\.pdf)?$/i.exec(text)?.[1] || '';
};
const urlOf = value => {
  const text = normalizeText(value);
  return /^https?:\/\//i.test(text) ? text : '';
};

export function normalizeQuery(value) {
  const text = normalizeText(value);
  if (!text) throw new Error('请填写检索词。');
  if (text.length > 300) throw new Error('检索词过长，请控制在 300 字以内。');
  return text;
}

function requestOptions(options = {}) {
  return {
    ...options,
    redirect: options.redirect || 'error',
    headers: { 'User-Agent': USER_AGENT, ...(options.headers || {}) },
  };
}

export async function searchCrossref(query, { request = fetch, signal } = {}) {
  const url = new URL('https://api.crossref.org/works');
  url.search = new URLSearchParams({
    'query.bibliographic': query, rows: '12',
    select: 'DOI,title,abstract,published,type,author,container-title,is-referenced-by-count,URL,link',
  });
  const response = await request(url, requestOptions({ signal, headers: { Accept: 'application/json' } }));
  if (!response.ok) throw new Error('Crossref 返回 HTTP ' + response.status);
  const data = await response.json();
  return (data.message?.items || []).flatMap(row => {
    const title = plain(row.title?.[0]);
    if (!title) return [];
    const doi = doiOf(row.DOI);
    const pdf = (row.link || []).find(item => /pdf/i.test(String(item['content-type'] || '')) || /\.pdf(?:$|\?)/i.test(String(item.URL || '')))?.URL;
    return [{
      id: doi ? 'doi:' + doi : 'title:' + slug(title),
      title, authors: (row.author || []).map(author => plain([author.given, author.family].filter(Boolean).join(' ')) || plain(author.name)).filter(Boolean).slice(0, 20),
      year: yearOf(row.published?.['date-parts']?.[0]?.[0]), venue: plain(row['container-title']?.[0]),
      abstract: plain(row.abstract).slice(0, 2400), doi, arxiv: '',
      url: doi ? 'https://doi.org/' + encodeURI(doi) : urlOf(row.URL),
      pdfUrl: urlOf(pdf), source: 'Crossref',
      citationCount: Number.isFinite(row['is-referenced-by-count']) ? row['is-referenced-by-count'] : null,
      openAccess: Boolean(urlOf(pdf)),
    }];
  });
}

export async function searchArxiv(query, { request = fetch, signal } = {}) {
  const words = (query.match(/[\p{L}\p{N}-]+/gu) || []).slice(0, 8);
  if (!words.length) return [];
  const url = new URL('https://export.arxiv.org/api/query');
  url.search = new URLSearchParams({
    search_query: words.map(word => 'all:"' + word + '"').join(' AND '), max_results: '12',
  });
  const response = await (async () => {
    const wait = Math.max(0, previousArxiv + 3100 - Date.now());
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    previousArxiv = Date.now();
    const first = await request(url, requestOptions({ signal, headers: { Accept: 'application/atom+xml' } }));
    if (first.status !== 429) return first;
    await new Promise(resolve => setTimeout(resolve, 1600));
    return request(url, requestOptions({ signal, headers: { Accept: 'application/atom+xml' } }));
  })();
  if (!response.ok) throw new Error(response.status === 429
    ? 'arXiv 限流，请稍后重试。' : 'arXiv 返回 HTTP ' + response.status);
  const xml = await response.text();
  const field = (entry, name) => plain(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>').exec(entry)?.[1]);
  return Array.from(xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g)).flatMap(([, entry]) => {
    const arxiv = arxivOf(field(entry, 'id'));
    const title = field(entry, 'title');
    if (!arxiv || !title) return [];
    return [{
      id: 'arxiv:' + arxiv.toLowerCase(), title,
      authors: Array.from(entry.matchAll(/<author>([\s\S]*?)<\/author>/g), ([, author]) => field(author, 'name')).filter(Boolean),
      year: yearOf(field(entry, 'published').slice(0, 4)), venue: 'arXiv',
      abstract: field(entry, 'summary').slice(0, 2400), doi: doiOf(field(entry, 'arxiv:doi')), arxiv,
      url: 'https://arxiv.org/abs/' + arxiv, pdfUrl: 'https://arxiv.org/pdf/' + arxiv,
      source: 'arXiv', citationCount: null, openAccess: true,
    }];
  });
}

function invertedAbstract(index) {
  if (!index || typeof index !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of Array.isArray(positions) ? positions : []) words[position] = word;
  }
  return plain(words.filter(Boolean).join(' ')).slice(0, 2400);
}

export async function searchOpenAlex(query, { request = fetch, signal, openalexKey = '' } = {}) {
  const url = new URL('https://api.openalex.org/works');
  url.search = new URLSearchParams({ search: query, 'per-page': '12' });
  if (openalexKey) url.searchParams.set('api_key', openalexKey);
  const response = await request(url, requestOptions({ signal, headers: { Accept: 'application/json' } }));
  if (response.status === 429) throw new Error('OpenAlex 匿名额度已用尽，可在检索设置中填写 API Key。');
  if (!response.ok) throw new Error('OpenAlex 返回 HTTP ' + response.status);
  const data = await response.json();
  return (data.results || []).flatMap(row => {
    const title = plain(row.title || row.display_name);
    if (!title) return [];
    const doi = doiOf(row.doi);
    const pdfUrl = urlOf(row.best_oa_location?.pdf_url) || urlOf(row.open_access?.oa_url) ||
      urlOf(row.primary_location?.pdf_url);
    return [{
      id: doi ? 'doi:' + doi : 'openalex:' + String(row.id || '').split('/').pop(),
      title, authors: (row.authorships || []).map(item => plain(item.author?.display_name)).filter(Boolean).slice(0, 20),
      year: yearOf(row.publication_year), venue: plain(row.primary_location?.source?.display_name),
      abstract: invertedAbstract(row.abstract_inverted_index), doi, arxiv: '',
      url: doi ? 'https://doi.org/' + encodeURI(doi) : urlOf(row.id),
      pdfUrl, source: 'OpenAlex',
      citationCount: Number.isFinite(row.cited_by_count) ? row.cited_by_count : null,
      openAccess: Boolean(row.open_access?.is_oa || pdfUrl),
    }];
  });
}

export async function searchSemantic(query, { request = fetch, signal, semanticKey = '' } = {}) {
  const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
  url.search = new URLSearchParams({
    query, limit: '12', fields: 'title,abstract,year,venue,authors,externalIds,openAccessPdf,citationCount,url',
  });
  const headers = { Accept: 'application/json' };
  if (semanticKey) headers['x-api-key'] = semanticKey;
  const response = await request(url, requestOptions({ signal, headers }));
  if (response.status === 429) throw new Error('Semantic Scholar 请求过多，请稍后再试。');
  if (response.status === 403) throw new Error('Semantic Scholar 拒绝访问，可在设置中补充密钥。');
  if (!response.ok) throw new Error('Semantic Scholar 返回 HTTP ' + response.status);
  const data = await response.json();
  return (data.data || []).flatMap(row => {
    const title = plain(row.title);
    if (!title) return [];
    const pdfUrl = urlOf(row.openAccessPdf?.url);
    const doi = doiOf(row.externalIds?.DOI);
    const arxiv = arxivOf(row.externalIds?.ArXiv);
    return [{
      id: doi ? 'doi:' + doi : arxiv ? 'arxiv:' + arxiv.toLowerCase() : 's2:' + row.paperId,
      title, authors: (row.authors || []).map(author => plain(author.name)).filter(Boolean).slice(0, 20),
      year: yearOf(row.year), venue: plain(row.venue), abstract: plain(row.abstract).slice(0, 2400),
      doi, arxiv, url: urlOf(row.url) || (row.paperId ? 'https://www.semanticscholar.org/paper/' + row.paperId : ''),
      pdfUrl, source: 'Semantic Scholar',
      citationCount: Number.isFinite(row.citationCount) ? row.citationCount : null,
      openAccess: Boolean(pdfUrl),
    }];
  });
}

export async function searchEuropePmc(query, { request = fetch, signal } = {}) {
  const cleaned = query.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim();
  if (!cleaned) return [];
  const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  url.search = new URLSearchParams({
    query: '(' + cleaned + ') AND OPEN_ACCESS:Y', format: 'json', resultType: 'core', pageSize: '12',
  });
  const response = await request(url, requestOptions({ signal, headers: { Accept: 'application/json' } }));
  if (!response.ok) throw new Error('Europe PMC 返回 HTTP ' + response.status);
  const data = await response.json();
  return (data.resultList?.result || []).flatMap(row => {
    const title = plain(row.title);
    const pmcid = /^PMC\d+$/.test(row.pmcid || '') ? row.pmcid : '';
    if (!title || (!pmcid && !row.doi && !row.pmid)) return [];
    const doi = doiOf(row.doi);
    const url = pmcid ? 'https://europepmc.org/articles/' + pmcid
      : row.pmid ? 'https://europepmc.org/article/MED/' + row.pmid : 'https://doi.org/' + encodeURI(doi);
    return [{
      id: pmcid || doi ? (pmcid ? pmcid : 'doi:' + doi) : 'epmc:' + row.id,
      title, authors: (row.authorList?.author || []).map(author => plain(author.fullName)).filter(Boolean).slice(0, 20),
      year: yearOf(row.pubYear), venue: plain(row.journalTitle || row.journalInfo?.journal?.title),
      abstract: plain(row.abstractText).slice(0, 2400), doi, arxiv: '', pmcid,
      url, pdfUrl: pmcid ? 'https://europepmc.org/articles/' + pmcid + '?pdf=render' : '',
      source: 'Europe PMC',
      citationCount: Number.isFinite(row.citedByCount) ? row.citedByCount : null, openAccess: true,
    }];
  });
}

function realUrl(href) {
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    if (/(^|\.)duckduckgo\.com$/i.test(url.hostname) && url.pathname.startsWith('/l/')) {
      const target = url.searchParams.get('uddg');
      return target ? new URL(target).href : '';
    }
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function bingUrl(href) {
  try {
    const url = new URL(href, 'https://www.bing.com');
    if (/(^|\.)bing\.com$/i.test(url.hostname) && url.pathname === '/ck/a') {
      const raw = url.searchParams.get('u');
      if (raw?.startsWith('a1')) {
        const decoded = Buffer.from(raw.slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        if (/^https?:\/\//i.test(decoded)) return decoded;
      }
    }
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function webRow(target, title, snippet) {
  const host = (() => { try { return new URL(target).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  return {
    id: 'url:' + target, title, authors: [], year: null, venue: host,
    abstract: plain(snippet).slice(0, 1200), doi: '', arxiv: '', url: target,
    pdfUrl: /\.pdf(?:$|\?)/i.test(target) ? target : '', source: '网页',
    citationCount: null, openAccess: /\.pdf(?:$|\?)/i.test(target),
  };
}

async function searchBing(query, { request = fetch, signal } = {}) {
  const url = new URL('https://www.bing.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('setlang', 'zh-Hans');
  const response = await request(url, requestOptions({
    signal, redirect: 'follow', headers: { Accept: 'text/html', 'User-Agent': BROWSER_AGENT },
  }));
  if (!response.ok) throw new Error('Bing 返回 HTTP ' + response.status);
  const source = await response.text();
  if (/captcha|verify you are human|unusual traffic/i.test(source.slice(0, 20000))) {
    throw new Error('网页检索需要人工验证，请用浏览器打开。');
  }
  const rows = [];
  for (const block of source.split(/<li[^>]+class="[^"]*\bb_algo\b/i).slice(1)) {
    const heading = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(block)?.[1];
    const anchor = heading && /<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(heading);
    if (!anchor) continue;
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(anchor[1])?.[1] || /\bhref\s*=\s*'([^']*)'/i.exec(anchor[1])?.[1] || '';
    const target = bingUrl(href.replace(/&amp;/gi, '&'));
    const title = plain(anchor[2]);
    if (!target || !title) continue;
    const snippet = /<div[^>]+class="[^"]*b_caption[^"]*"[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(block)?.[1] || '';
    rows.push(webRow(target, title, snippet));
  }
  return rows.slice(0, 10);
}

async function searchDuckDuckGo(query, { request = fetch, signal } = {}) {
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', query);
  const response = await request(url, requestOptions({
    signal, redirect: 'follow', headers: { Accept: 'text/html', 'User-Agent': BROWSER_AGENT },
  }));
  if (!response.ok) throw new Error('网页检索暂时不可用。');
  const source = await response.text();
  if (/anomaly-modal|captcha|challenge-form/i.test(source.slice(0, 12000))) {
    throw new Error('网页检索需要人工验证，请用浏览器打开。');
  }
  const rows = [];
  const anchors = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchors.exec(source))) {
    const attributes = match[1];
    if (!/class\s*=\s*["'][^"']*result__a/i.test(attributes)) continue;
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(attributes)?.[1] || /\bhref\s*=\s*'([^']*)'/i.exec(attributes)?.[1] || '';
    const target = realUrl(href.replace(/&amp;/g, '&'));
    const title = plain(match[2]);
    if (!target || !title) continue;
    const tail = source.slice(match.index, match.index + 3200);
    const snippet = /<a\b[^>]*class\s*=\s*"[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(tail)?.[1] ||
      /<div\b[^>]*class\s*=\s*"[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(tail)?.[1] || '';
    rows.push(webRow(target, title, snippet));
  }
  return rows;
}

export async function searchWeb(query, { request = fetch, signal } = {}) {
  const failures = [];
  for (const engine of [searchBing, searchDuckDuckGo]) {
    const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000);
    try {
      const rows = await engine(query, { request, signal: deadline });
      if (rows.length) return rows;
      failures.push('没有结果');
    } catch (error) {
      if (signal?.aborted) throw error;
      failures.push(error.message);
    }
  }
  throw new Error('网页检索暂时不可用：' + (failures[0] || '连接失败'));
}

const runners = {
  crossref: searchCrossref, arxiv: searchArxiv, openalex: searchOpenAlex,
  semantic: searchSemantic, europepmc: searchEuropePmc, web: searchWeb,
};

function identity(row) {
  if (row.doi) return 'doi:' + row.doi.toLowerCase();
  if (row.arxiv) return 'arxiv:' + row.arxiv.toLowerCase();
  return 'title:' + slug(row.title) + '|' + (row.year || '');
}

function ranking(row) {
  return (row.pdfUrl ? 3 : 0) + (row.openAccess ? 2 : 0) + (row.doi || row.arxiv ? 1 : 0);
}

export function mergeResults(rows) {
  const found = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !normalizeText(row.title)) continue;
    const item = {
      ...row,
      title: normalizeText(row.title), abstract: normalizeText(row.abstract).slice(0, 2400),
      authors: Array.isArray(row.authors) ? [...new Set(row.authors.map(normalizeText).filter(Boolean))].slice(0, 20) : [],
      sources: [...new Set([...(row.sources || []), row.source].filter(Boolean))],
    };
    const key = identity(item);
    const previous = found.get(key);
    if (!previous) { found.set(key, item); continue; }
    found.set(key, {
      ...previous,
      ...Object.fromEntries(Object.entries(item).filter(([, value]) =>
        value !== '' && value !== null && value !== undefined && !(Array.isArray(value) && !value.length))),
      title: previous.title || item.title,
      authors: item.authors.length ? item.authors : previous.authors,
      abstract: item.abstract.length > previous.abstract.length ? item.abstract : previous.abstract,
      doi: previous.doi || item.doi, arxiv: previous.arxiv || item.arxiv,
      venue: previous.venue || item.venue, year: previous.year || item.year,
      url: previous.url || item.url, pdfUrl: previous.pdfUrl || item.pdfUrl,
      openAccess: Boolean(previous.openAccess || item.openAccess),
      citationCount: Math.max(previous.citationCount || 0, item.citationCount || 0) || null,
      sources: [...new Set([...(previous.sources || []), ...(item.sources || [])])],
    });
  }
  return [...found.values()].sort((first, second) =>
    ranking(second) - ranking(first) ||
    (second.citationCount || 0) - (first.citationCount || 0) ||
    (second.year || 0) - (first.year || 0) ||
    first.title.localeCompare(second.title, 'zh-CN'));
}

export function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); });
  });
}

export async function searchAll(query, { sources, signal, request = fetch, semanticKey = '', openalexKey = '' } = {}) {
  const text = normalizeQuery(query);
  const selected = (Array.isArray(sources) && sources.length ? sources : SOURCE_IDS).filter(id => Object.hasOwn(runners, id));
  if (!selected.length) throw new Error('请至少选择一个检索来源。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const statuses = selected.map(id => ({ id, label: SOURCE_LABELS[id], status: 'running', count: 0 }));
  const rows = [];
  await Promise.all(selected.map(async (id, index) => {
    try {
      let value;
      try {
        value = await withTimeout(runners[id](text, { request, signal: combined, semanticKey, openalexKey }),
          8000, '该来源响应超时。');
      } catch (error) {
        const network = /fetch failed|ECONN|ETIMEDOUT|UND_ERR|socket/i.test(
          String(error?.message) + ' ' + String(error?.cause?.code));
        if (!network || combined.aborted) throw error;
        await new Promise(resolve => setTimeout(resolve, 350));
        value = await withTimeout(runners[id](text, { request, signal: combined, semanticKey, openalexKey }),
          8000, '该来源响应超时。');
      }
      rows.push(...value);
      statuses[index] = { ...statuses[index], status: value.length ? 'ok' : 'empty', count: value.length };
    } catch (error) {
      const cause = error?.cause?.code && !String(error.message).includes(error.cause.code) ? '（' + error.cause.code + '）' : '';
      const message = controller.signal.aborted ? '检索超时，请稍后重试。'
        : normalizeText(error?.message).slice(0, 160) + cause || '连接失败';
      statuses[index] = { ...statuses[index], status: 'error', count: 0, message };
    }
  }));
  clearTimeout(timer);
  return { results: mergeResults(rows), sources: statuses };
}

const privateIPv4 = host => {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
};

const privateHost = hostname => {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost') return true;
  if (isIP(host) === 4) return privateIPv4(host);
  if (isIP(host) === 6) {
    if (host === '::' || host === '::1') return true;
    if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
    const mapped = /^::ffff:(.+)$/.exec(host);
    if (mapped) {
      const tail = mapped[1];
      if (isIP(tail) === 4) return privateIPv4(tail);
      const pair = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail);
      if (pair) {
        const high = parseInt(pair[1], 16);
        const low = parseInt(pair[2], 16);
        return privateIPv4([high >> 8, high & 255, low >> 8, low & 255].join('.'));
      }
    }
    return false;
  }
  return false;
};

function httpUrl(value) {
  try {
    const url = new URL(normalizeText(value));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function resultMeta(result) {
  const title = normalizeText(result?.title).slice(0, 500);
  if (!title) throw new Error('检索结果缺少标题。');
  const citationCount = Number(result?.citationCount);
  return {
    title, doi: doiOf(result?.doi), arxiv: arxivOf(result?.arxiv), year: yearOf(result?.year),
    venue: normalizeText(result?.venue).slice(0, 300),
    abstract: normalizeText(result?.abstract).slice(0, 4000),
    sourceUrl: httpUrl(result?.url), pdfUrl: httpUrl(result?.pdfUrl),
    author: Array.isArray(result?.authors) ? normalizeText(result.authors.join(', ')).slice(0, 600) : '',
    citationCount: Number.isFinite(citationCount) && citationCount >= 0 ? Math.round(citationCount) : null,
  };
}

export function validateDownloadUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('下载地址无效。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('下载地址无效。');
  if (privateHost(url.hostname)) throw new Error('不能从本机或私网地址下载。');
  return url.href;
}

export async function downloadPdf(value, { request = fetch, signal, maxBytes = 25 * 1024 * 1024 } = {}) {
  const url = validateDownloadUrl(value);
  const response = await request(url, requestOptions({ signal, redirect: 'follow', headers: { Accept: 'application/pdf' } }));
  if (!response.ok) throw new Error('PDF 下载失败（HTTP ' + response.status + '）。');
  if (response.url) validateDownloadUrl(response.url);
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('PDF 过大，超过下载上限。');
  const chunks = [];
  let total = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      total += bytes.length;
      if (total > maxBytes) throw new Error('PDF 过大，超过下载上限。');
      chunks.push(bytes);
    }
  }
  const data = Buffer.concat(chunks);
  if (!data.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('该链接不是可下载的 PDF。');
  return { data, finalUrl: response.url || url };
}
