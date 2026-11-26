import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from '../desktop/store.mjs';
import { comparisonCacheKey } from '../desktop/paper-compare.mjs';

function twoPapers(store) {
  for (const id of ['paper-a', 'paper-b']) {
    store.papers.create({ id, hash: id.repeat(8).slice(0, 64), filename: id + '.pdf', title: id });
    store.papers.finish(id, 'ready');
  }
  return ['paper-a', 'paper-b'];
}

test('跨篇对比生成结果可保存并读回，重复生成走更新', () => {
  const store = openStore(':memory:');
  try {
    const ids = twoPapers(store);
    const key = comparisonCacheKey(ids);
    const rows = [{ label: '研究问题', values: ['甲的问题', '乙的问题'] }];
    const saved = store.papers.comparison.save(key, ids, rows, { generated: true, model: 'mock' });
    assert.equal(saved.generated, true);
    assert.equal(saved.model, 'mock');
    assert.deepEqual(saved.paperIds, [...ids].sort());
    assert.deepEqual(saved.rows, rows);
    const again = store.papers.comparison.save(key, ids, [{ label: '方法', values: ['甲', '乙'] }], { generated: true, model: 'mock' });
    assert.deepEqual(again.rows, [{ label: '方法', values: ['甲', '乙'] }]);
    assert.deepEqual(store.papers.comparison.get(key).rows, again.rows);
  } finally { store.close(); }
});

test('未生成时保存元数据对比不标记 generated', () => {
  const store = openStore(':memory:');
  try {
    const ids = twoPapers(store);
    const key = comparisonCacheKey(ids);
    const saved = store.papers.comparison.save(key, ids, [], {});
    assert.equal(saved.generated, false);
    assert.deepEqual(saved.rows, []);
  } finally { store.close(); }
});