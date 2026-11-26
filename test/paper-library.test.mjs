import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from '../desktop/store.mjs';
import { cleanCategoryNames, classifyInstructions } from '../desktop/paper-classify.mjs';
import { fetchJournalRank, rankEntries, rankLabel } from '../desktop/journal-rank.mjs';

test('分类支持嵌套、计数、多分类归属与递归删除', () => {
  const store = openStore(':memory:');
  try {
    store.papers.createLinked({ id: 'p1', title: 'A' });
    store.papers.createLinked({ id: 'p2', title: 'B' });
    let rows = store.papers.categories.save({ name: '机器学习', color: '#123456' });
    const root = rows.find(row => row.name === '机器学习');
    rows = store.papers.categories.save({ name: '视觉', parentId: root.id });
    const child = rows.find(row => row.name === '视觉');
    assert.equal(rows.filter(row => row.parentId === root.id).length, 1);
    assert.throws(() => store.papers.categories.save({ name: '视觉', parentId: root.id }), /同名/);
    assert.throws(() => store.papers.categories.save({ name: '循环', parentId: child.id, id: root.id }), /子分类|上级/);

    store.papers.categories.assign('p1', child.id, true);
    store.papers.categories.assign('p1', root.id, true);
    store.papers.categories.assign('p1', root.id, true);
    store.papers.categories.assign('p2', root.id, true);
    assert.deepEqual(store.papers.categories.forPaper('p1').sort(), [root.id, child.id].sort());
    assert.equal(store.papers.categories.list().find(row => row.id === root.id).count, 2);
    assert.equal(store.papers.list().find(row => row.id === 'p1').categoryIds.length, 2);

    store.papers.categories.remove(root.id);
    assert.equal(store.papers.categories.list().length, 0);
    assert.equal(store.papers.categories.forPaper('p1').length, 0);
    assert.throws(() => store.papers.categories.assign('missing', root.id, true), /论文不存在|分类不存在/);
  } finally { store.close(); }
});

test('评分、星标与阅读状态持久化并校验范围', () => {
  const store = openStore(':memory:');
  try {
    store.papers.createLinked({ id: 'p1', title: 'A' });
    store.papers.setRating('p1', 5);
    store.papers.setFavorite('p1', true);
    store.papers.setReadStatus('p1', 'done');
    const row = store.papers.get('p1');
    assert.equal(row.rating, 5);
    assert.equal(row.favorite, 1);
    assert.equal(row.read_status, 'done');
    store.papers.setRating('p1', null);
    assert.equal(store.papers.get('p1').rating, null);
    assert.throws(() => store.papers.setRating('p1', 6), /1 到 5/);
    assert.throws(() => store.papers.setReadStatus('p1', 'unknown'), /阅读状态/);
    assert.throws(() => store.papers.setFavorite('missing', true), /论文不存在/);
    store.papers.saveJournalRating('p1', { label: 'Q1' });
    assert.match(store.papers.get('p1').journal_rating, /Q1/);
  } finally { store.close(); }
});

test('期刊评级扁平化嵌套结构并去重', () => {
  const entries = rankEntries({ officialRank: { all: { sci: 'Q1', sciif: '8.2' },
    select: { jcr: 'Q1' } }, customRank: { ccf: 'A' }, empty: '' });
  assert.equal(entries.length, 4);
  assert.equal(rankLabel(entries), 'sci Q1 · sciif 8.2 · jcr Q1 · ccf A');
  assert.deepEqual(rankEntries([{ name: '中科院', value: '1区' }]), [{ key: '中科院', value: '1区' }]);
});

test('期刊评级请求校验密钥与返回码', async () => {
  await assert.rejects(() => fetchJournalRank('', 'key'), /期刊或会议/);
  await assert.rejects(() => fetchJournalRank('Nature', ''), /easyScholar 密钥/);
  await assert.rejects(() => fetchJournalRank('Nature', 'key', { request: async () => ({
    ok: true, json: async () => ({ code: 400, msg: '密钥失效' }),
  }) }), /密钥失效/);
  const value = await fetchJournalRank('Nature', 'key', { request: async () => ({
    ok: true, json: async () => ({ code: 200, data: { customRank: { ccf: 'A' } } }),
  }) });
  assert.equal(value.label, 'ccf A');
  assert.equal(value.venue, 'Nature');
});

test('分类建议只保留已知名称、去重并限制三条', () => {
  const names = cleanCategoryNames(['机器学习', '视觉', '机器学习', '新方向', '第四个', '第五个'],
    ['机器学习', '视觉']);
  assert.deepEqual(names, ['机器学习', '视觉', '新方向']);
  assert.deepEqual(cleanCategoryNames([1, null, '  '], []), []);
  assert.match(classifyInstructions(['机器学习']), /机器学习/);
  assert.match(classifyInstructions([]), /暂无/);
});
