import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchCitationGraph, rankCoCitations, workKey } from '../desktop/citation-graph.mjs';
import {
  comparisonCacheKey, metadataRows, normalizeComparison,
} from '../desktop/paper-compare.mjs';

const json = value => ({ ok: true, status: 200, json: async () => value });

test('工作标识优先 DOI，其次 arXiv，最后规范化标题', () => {
  assert.equal(workKey({ doi: 'https://doi.org/10.1000/ABC' }), 'doi:10.1000/abc');
  assert.equal(workKey({ arxiv: 'https://arxiv.org/pdf/2401.00001v3.pdf' }), 'arxiv:2401.00001');
  assert.equal(workKey({ title: 'Koopman  Operators: A <b>Survey</b>' }), 'title:koopmanoperatorsasurvey');
  assert.equal(workKey({}), '');
});

test('共同引用只统计跨论文重复出现的参考文献', () => {
  const rows = rankCoCitations([
    { paperId: 'a', references: [
      { key: 'doi:10.1/x', title: 'Shared', citationCount: 10 },
      { key: 'doi:10.1/only-a', title: 'Only A' },
    ] },
    { paperId: 'b', references: [
      { key: 'doi:10.1/x', title: 'Shared', citationCount: 12 },
      { key: 'doi:10.1/x', title: 'Shared duplicate' },
    ] },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'doi:10.1/x');
  assert.equal(rows[0].sharedBy, 2);
  assert.deepEqual(rows[0].paperIds, ['a', 'b']);
  assert.equal(rows[0].citationCount, 12);
});

test('OpenAlex 返回参考文献与被引列表', async () => {
  const seen = [];
  const request = async url => {
    const value = String(url);
    seen.push(value);
    if (value.includes('filter=doi')) {
      return json({ results: [{ id: 'https://openalex.org/W100', referenced_works: [
        'https://openalex.org/W201', 'https://openalex.org/W202',
      ] }] });
    }
    if (value.includes('filter=openalex')) {
      return json({ results: [
        { id: 'https://openalex.org/W201', title: 'Reference One', publication_year: 2019,
          doi: 'https://doi.org/10.1000/ref1', cited_by_count: 40,
          authorships: [{ author: { display_name: 'Ada Lovelace' } }] },
        { id: 'https://openalex.org/W202', title: 'Reference Two', publication_year: 2020, cited_by_count: 5 },
      ] });
    }
    if (value.includes('filter=cites')) {
      return json({ results: [
        { id: 'https://openalex.org/W301', title: 'Citing Work', publication_year: 2024, cited_by_count: 3 },
      ] });
    }
    throw new Error('unexpected url ' + value);
  };
  const graph = await fetchCitationGraph({ title: 'Seed', doi: '10.1000/seed' }, { request });
  assert.equal(graph.references.length, 2);
  assert.equal(graph.citations.length, 1);
  assert.equal(graph.references[0].key, 'doi:10.1000/ref1');
  assert.equal(graph.references[0].author, 'Ada Lovelace');
  assert.equal(graph.referenceSource, 'OpenAlex');
  assert.equal(graph.citationSource, 'OpenAlex');
  assert.equal(graph.fetchedAt.length > 0, true);
  assert.equal(seen.some(url => url.includes('api_key')), false);
});

test('OpenAlex 失败时回退 Semantic Scholar', async () => {
  const request = async url => {
    const value = String(url);
    if (value.startsWith('https://api.openalex.org')) return { ok: false, status: 503, json: async () => ({}) };
    if (value.includes('/references')) {
      return json({ data: [{ citedPaper: { title: 'S2 Reference', year: 2018,
        externalIds: { DOI: '10.1000/s2ref' }, citationCount: 9 } }] });
    }
    if (value.includes('/citations')) {
      return json({ data: [{ citingPaper: { title: 'S2 Citing', year: 2025, citationCount: 1 } }] });
    }
    throw new Error('unexpected url ' + value);
  };
  const graph = await fetchCitationGraph({ title: 'Seed', doi: '10.1000/seed' }, { request });
  assert.equal(graph.references[0].title, 'S2 Reference');
  assert.equal(graph.references[0].doi, '10.1000/s2ref');
  assert.equal(graph.citations[0].title, 'S2 Citing');
  assert.equal(graph.referenceSource, 'Semantic Scholar');
  assert.equal(graph.citationSource, 'Semantic Scholar');
  assert.ok(graph.errors.some(message => message.includes('OpenAlex')));
});

test('对比矩阵补齐固定行并裁剪到论文数量', () => {
  const rows = normalizeComparison({ rows: [
    { label: '研究问题', values: ['问 A', '问 B', '多余'] },
    { label: '', values: ['忽略'] },
    { label: '方法', values: ['法 A'] },
  ] }, 2);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], { label: '研究问题', values: ['问 A', '问 B'] });
  assert.deepEqual(rows[1], { label: '方法', values: ['法 A', ''] });
  assert.deepEqual(rows[2], { label: '数据与场景', values: ['', ''] });
  assert.deepEqual(rows.map(row => row.label), ['研究问题', '方法', '数据与场景', '主要结论', '局限与争议']);
});

test('对比缓存键与元数据行稳定', () => {
  assert.equal(comparisonCacheKey(['b', 'a', 'a']), 'a|b');
  const rows = metadataRows([
    { year: 2024, venue: 'NeurIPS', rating: 4, read_status: 'reading', citationCount: 12 },
    { year: null, rating: 0, read_status: 'unread' },
  ]);
  assert.deepEqual(rows.map(row => row.label), ['年份', '出处', '作者', '你的评分', '阅读状态', '被引次数']);
  assert.deepEqual(rows[0].values, ['2024', '—']);
  assert.deepEqual(rows[3].values, ['★★★★', '未评分']);
  assert.deepEqual(rows[4].values, ['在读', '未读']);
  assert.deepEqual(rows[5].values, ['12', '—']);
});
