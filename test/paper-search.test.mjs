import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  downloadPdf, mergeResults, normalizeQuery, resultMeta, searchAll, searchArxiv, searchCrossref,
  searchEuropePmc, searchOpenAlex, searchSemantic, searchWeb, validateDownloadUrl,
} from '../desktop/paper-search.mjs';

const json = value => ({ ok: true, status: 200, json: async () => value, text: async () => JSON.stringify(value) });
const xml = value => ({ ok: true, status: 200, text: async () => value, json: async () => ({}) });
const html = value => ({ ok: true, status: 200, text: async () => value, json: async () => ({}) });
const failing = status => ({ ok: false, status, json: async () => ({}), text: async () => '' });

test('检索词必填、压缩空白并限制长度', () => {
  assert.equal(normalizeQuery('  small   sample  '), 'small sample');
  assert.throws(() => normalizeQuery('   '), /请填写检索词/);
  assert.throws(() => normalizeQuery('x'.repeat(301)), /过长/);
});

test('Crossref 结果归一化为统一结构', async () => {
  const rows = await searchCrossref('small sample', { request: async () => json({
    message: { items: [{
      DOI: '10.1000/ABC', title: ['Small <i>sample</i> study'],
      author: [{ given: 'Ada', family: 'Lovelace' }], published: { 'date-parts': [[2024]] },
      'container-title': ['Journal'], abstract: '<jats:p>Finding.</jats:p>',
      'is-referenced-by-count': 7,
      link: [{ 'content-type': 'application/pdf', URL: 'https://example.org/a.pdf' }],
    }] },
  }) });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].doi, '10.1000/abc');
  assert.equal(rows[0].title, 'Small sample study');
  assert.deepEqual(rows[0].authors, ['Ada Lovelace']);
  assert.equal(rows[0].year, 2024);
  assert.equal(rows[0].venue, 'Journal');
  assert.equal(rows[0].abstract, 'Finding.');
  assert.equal(rows[0].source, 'Crossref');
  assert.equal(rows[0].citationCount, 7);
  assert.equal(rows[0].pdfUrl, 'https://example.org/a.pdf');
  assert.equal(rows[0].url, 'https://doi.org/10.1000/abc');
});

test('arXiv Atom 结果解析标题、作者、PDF 与年份', async () => {
  const rows = await searchArxiv('koopman operator', { request: async () => xml(`<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>http://arxiv.org/abs/2401.00001v2</id>
        <published>2024-01-02T00:00:00Z</published>
        <title>Koopman   Operators for Control</title>
        <summary>We study spectral properties.</summary>
        <author><name>Ada Lovelace</name></author>
        <author><name>Alan Turing</name></author>
        <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.1000/xyz</arxiv:doi>
      </entry>
    </feed>`) });
  assert.equal(rows[0].arxiv, '2401.00001v2');
  assert.equal(rows[0].title, 'Koopman Operators for Control');
  assert.deepEqual(rows[0].authors, ['Ada Lovelace', 'Alan Turing']);
  assert.equal(rows[0].year, 2024);
  assert.equal(rows[0].pdfUrl, 'https://arxiv.org/pdf/2401.00001v2');
  assert.equal(rows[0].openAccess, true);
  assert.equal(rows[0].doi, '10.1000/xyz');
});

test('OpenAlex 还原倒排摘要并读取开放 PDF', async () => {
  const rows = await searchOpenAlex('graph learning', { request: async () => json({
    results: [{
      id: 'https://openalex.org/W1', doi: 'https://doi.org/10.1000/ABC', title: 'Graph Learning',
      publication_year: 2023, cited_by_count: 12,
      authorships: [{ author: { display_name: 'Grace Hopper' } }],
      primary_location: { source: { display_name: 'NeurIPS' } },
      abstract_inverted_index: { Graph: [0], learning: [1], works: [2] },
      open_access: { is_oa: true, oa_url: 'https://example.org/paper.pdf' },
      best_oa_location: { pdf_url: 'https://example.org/paper.pdf' },
    }],
  }) });
  assert.equal(rows[0].doi, '10.1000/abc');
  assert.equal(rows[0].abstract, 'Graph learning works');
  assert.equal(rows[0].venue, 'NeurIPS');
  assert.equal(rows[0].pdfUrl, 'https://example.org/paper.pdf');
  assert.equal(rows[0].openAccess, true);
  assert.equal(rows[0].citationCount, 12);
});

test('Semantic Scholar 带上可选密钥并解析外部 ID', async () => {
  let headers;
  const rows = await searchSemantic('contrastive', { semanticKey: 'secret',
    request: async (url, options) => { headers = options.headers; return json({
      data: [{ paperId: 's2', title: 'Contrastive', abstract: 'A', year: 2022, venue: 'ICML',
        authors: [{ name: 'A' }, { name: 'B' }], externalIds: { DOI: '10.1000/Y', ArXiv: '2201.00002' },
        openAccessPdf: { url: 'https://example.org/c.pdf' }, citationCount: 4,
        url: 'https://www.semanticscholar.org/paper/s2' }],
    }); } });
  assert.equal(headers['x-api-key'], 'secret');
  assert.equal(rows[0].doi, '10.1000/y');
  assert.equal(rows[0].arxiv, '2201.00002');
  assert.equal(rows[0].openAccess, true);
  assert.equal(rows[0].source, 'Semantic Scholar');
});

test('Semantic Scholar 限流给出可读错误', async () => {
  await assert.rejects(() => searchSemantic('x', { request: async () => failing(429) }), /请求过多/);
});

test('Europe PMC 只收开放获取并给出 PDF 渲染地址', async () => {
  const rows = await searchEuropePmc('cancer', { request: async () => json({
    resultList: { result: [{ pmcid: 'PMC123', doi: '10.1000/Z', title: 'Cancer study', pubYear: '2021',
      journalTitle: 'BMJ', abstractText: 'Results.', citedByCount: 5,
      authorList: { author: [{ fullName: 'Ada Lovelace' }] } }] },
  }) });
  assert.equal(rows[0].pmcid, 'PMC123');
  assert.equal(rows[0].pdfUrl, 'https://europepmc.org/articles/PMC123?pdf=render');
  assert.equal(rows[0].openAccess, true);
  assert.equal(rows[0].url, 'https://europepmc.org/articles/PMC123');
});

test('网页检索解析 DuckDuckGo 跳转链接与摘要', async () => {
  const rows = await searchWeb('koopman', { request: async () => html(`
    <div class="result results_links">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fpaper">Koopman <b>paper</b></a>
      <a class="result__snippet">A useful survey.</a>
    </div>`) });
  assert.equal(rows[0].url, 'https://example.org/paper');
  assert.equal(rows[0].title, 'Koopman paper');
  assert.equal(rows[0].abstract, 'A useful survey.');
  assert.equal(rows[0].source, '网页');
});

test('多来源结果按 DOI 去重并合并来源', () => {
  const rows = mergeResults([
    { id: 'a', title: 'T', doi: '10.1000/x', authors: [], year: 2024, venue: '', abstract: '', arxiv: '', url: '', pdfUrl: '', source: 'Crossref', citationCount: 3, openAccess: false },
    { id: 'b', title: 'T', doi: '10.1000/X', authors: ['A'], year: 2024, venue: 'V', abstract: 'A', arxiv: '', url: '', pdfUrl: 'https://x/a.pdf', source: 'OpenAlex', citationCount: 9, openAccess: true },
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].sources.sort(), ['Crossref', 'OpenAlex']);
  assert.equal(rows[0].pdfUrl, 'https://x/a.pdf');
  assert.equal(rows[0].citationCount, 9);
  assert.deepEqual(rows[0].authors, ['A']);
});

test('同题不同年不合并，结果优先有 PDF 与高引用', () => {
  const rows = mergeResults([
    { id: 'a', title: 'Same', doi: '', authors: [], year: 2020, venue: '', abstract: '', arxiv: '', url: '', pdfUrl: '', source: '网页', citationCount: null, openAccess: false },
    { id: 'b', title: 'Same', doi: '', authors: [], year: 2021, venue: '', abstract: '', arxiv: '', url: '', pdfUrl: '', source: 'Crossref', citationCount: 50, openAccess: false },
    { id: 'c', title: 'Other', doi: '', authors: [], year: 2021, venue: '', abstract: '', arxiv: '', url: '', pdfUrl: 'https://x/o.pdf', source: 'arXiv', citationCount: 0, openAccess: true },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].title, 'Other');
});

test('单源失败不影响其他来源', async () => {
  const request = async url => {
    if (String(url).includes('crossref')) throw new Error('offline');
    if (String(url).includes('europepmc')) return json({ resultList: { result: [] } });
    return json({ results: [] });
  };
  const value = await searchAll('query', { sources: ['crossref', 'europepmc'], request });
  assert.equal(value.sources.find(row => row.id === 'crossref').status, 'error');
  assert.match(value.sources.find(row => row.id === 'crossref').message, /offline|连接/);
  assert.equal(value.sources.find(row => row.id === 'europepmc').status, 'empty');
});

test('下载地址拒绝本机、私网、file 与凭据', () => {
  assert.throws(() => validateDownloadUrl('http://127.0.0.1/a.pdf'), /本机/);
  assert.throws(() => validateDownloadUrl('http://192.168.1.2/a.pdf'), /本机/);
  assert.throws(() => validateDownloadUrl('file:///c:/a.pdf'), /下载地址/);
  assert.throws(() => validateDownloadUrl('https://user:pass@example.org/a.pdf'), /下载地址/);
  assert.equal(validateDownloadUrl('https://arxiv.org/pdf/2401.00001'), 'https://arxiv.org/pdf/2401.00001');
});

test('下载只接受 PDF 魔数并限制大小', async () => {
  const request = async () => ({ ok: true, status: 200, url: 'https://example.org/a.pdf',
    headers: new Headers({ 'content-length': '8' }),
    body: (async function* () { yield Buffer.from('%PDF-1.4'); })() });
  const value = await downloadPdf('https://example.org/a.pdf', { request });
  assert.equal(value.data.subarray(0, 5).toString(), '%PDF-');
  await assert.rejects(() => downloadPdf('https://example.org/a.pdf', { request: async () => ({
    ok: true, status: 200, url: 'https://example.org/a.pdf', headers: new Headers(),
    body: (async function* () { yield Buffer.from('<html>'); })() }) }), /不是可下载的 PDF/);
  await assert.rejects(() => downloadPdf('https://example.org/a.pdf', { request: async () => ({
    ok: true, status: 200, url: 'https://example.org/a.pdf', headers: new Headers({ 'content-length': '999999999' }),
    body: (async function* () { yield Buffer.from('%PDF-1.4'); })() }) }), /过大/);
});

test('检索结果元数据清洗 DOI、年份与危险链接', () => {
  const meta = resultMeta({ title: '  Paper  ', doi: '10.1000/ABC', arxiv: '2401.00001v2', year: '2024',
    venue: ' Journal ', abstract: ' Finding. ', url: 'javascript:alert(1)',
    pdfUrl: 'https://example.org/a.pdf', authors: ['Ada', ' Alan '], citationCount: '42' });
  assert.equal(meta.title, 'Paper');
  assert.equal(meta.doi, '10.1000/abc');
  assert.equal(meta.arxiv, '2401.00001v2');
  assert.equal(meta.year, 2024);
  assert.equal(meta.venue, 'Journal');
  assert.equal(meta.author, 'Ada, Alan');
  assert.equal(meta.sourceUrl, '');
  assert.equal(meta.pdfUrl, 'https://example.org/a.pdf');
  assert.equal(meta.citationCount, 42);
  assert.throws(() => resultMeta({ title: '   ' }), /缺少标题/);
});

test('Bing 结果优先解析并解码跳转与 HTML 实体', async () => {
  const encoded = 'a1' + Buffer.from('https://example.org/bing-paper').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_');
  const rows = await searchWeb('koopman', { request: async url => {
    if (String(url).includes('bing.com')) return html(`<ol id="b_results"><li class="b_algo">
      <h2><a href="https://www.bing.com/ck/a?ptn=3&amp;u=${encoded}&amp;ntb=1">Koopman &amp; control</a></h2>
      <div class="b_caption"><p>2024&#0183; Intro paragraph</p></div></li></ol>`);
    throw new Error('不应回退到 DuckDuckGo');
  } });
  assert.equal(rows[0].url, 'https://example.org/bing-paper');
  assert.equal(rows[0].title, 'Koopman & control');
  assert.match(rows[0].abstract, /2024/);
});

test('OpenAlex 可选密钥附加到请求参数', async () => {
  let target = '';
  await searchOpenAlex('graph', { openalexKey: 'secret-key', request: async url => {
    target = String(url); return json({ results: [] });
  } });
  assert.match(target, /api_key=secret-key/);
});

test('下载地址拦截 IPv4 映射 IPv6 与重定向到私网', async () => {
  assert.throws(() => validateDownloadUrl('http://[::ffff:127.0.0.1]/a.pdf'), /本机|私网/);
  assert.throws(() => validateDownloadUrl('http://[::ffff:7f00:1]/a.pdf'), /本机|私网/);
  assert.throws(() => validateDownloadUrl('http://[fe80::1]/a.pdf'), /本机|私网/);
  await assert.rejects(() => downloadPdf('https://example.org/a.pdf', { request: async () => ({
    ok: true, status: 200, url: 'http://192.168.1.5/a.pdf', headers: new Headers({ 'content-length': '8' }),
    body: (async function* () { yield Buffer.from('%PDF-1.4'); })() }) }), /本机|私网/);
});

test('单源超时能主动结束而不是拖住整页', async () => {
  const { withTimeout } = await import('../desktop/paper-search.mjs');
  await assert.rejects(() => withTimeout(new Promise(() => {}), 20, '该来源响应超时。'), /超时/);
});
