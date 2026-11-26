import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPublicSource, sourceBrowserUrl } from '../desktop/sources.mjs';

test('GitHub 公开仓库检索不用凭据，并保留检索条件和 Star 数', async () => {
  const query = 'plot stars:>100 language:Python';
  const result = await searchPublicSource('github', query, async (url, options) => {
    assert.equal(url.origin + url.pathname, 'https://api.github.com/search/repositories');
    assert.equal(url.searchParams.get('q'), query);
    assert.equal(new Headers(options.headers).has('authorization'), false);
    return Response.json({ incomplete_results: true, items: [
      { full_name: 'example/plot', html_url: 'https://untrusted.test', description: 'A useful chart', stargazers_count: 321 },
      { full_name: 'example/private', private: true },
    ] });
  });
  assert.deepEqual(result.entries, [{ title: 'example/plot', url: 'https://github.com/example/plot', description: '★ 321 · A useful chart' }]);
  assert.match(result.notice, /部分结果/);
  await assert.rejects(searchPublicSource('github', query,
    async () => new Response('', { status: 429 })), /匿名检索/);
});

test('公开学术来源部分失败时仍返回题录与可打开的 DOI', async () => {
  const result = await searchPublicSource('scholar', 'plot', async url => {
    if (url.hostname === 'api.crossref.org') return Response.json({ message: { items: [
      { DOI: '10.1000/figure', title: ['Scientific Figure'], author: [{ given: 'A', family: 'Author' }] },
    ] } });
    return new Response('', { status: 503 });
  });
  assert.equal(result.entries[0].url, 'https://doi.org/10.1000/figure');
  assert.match(result.entries[0].description, /Crossref.*A Author/);
  assert.match(result.notice, /arXiv.*Europe PMC/);
});

test('浏览器检索指向预设公开站点，查询词只作为参数', () => {
  const query = '图表 & 数据';
  for (const [id, hostname] of [['github', 'github.com'], ['scholar', 'scholar.google.com'], ['web', 'www.bing.com']]) {
    const url = new URL(sourceBrowserUrl(id, query));
    assert.equal(url.hostname, hostname);
    assert.equal(url.searchParams.get('q'), query);
    assert.equal(url.searchParams.size, id === 'github' ? 2 : 1);
  }
  assert.throws(() => sourceBrowserUrl('custom', query), /未知研究工具/);
});
