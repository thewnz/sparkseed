import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from '../desktop/store.mjs';
import { locateQuote } from '../desktop/annotation-anchor.mjs';
import { normalizeReaderLayout, readerLayoutLimits } from '../desktop/reader-layout.mjs';

test('批注可创建、更新、筛选与软删除', () => {
  const store = openStore(':memory:');
  try {
    store.papers.createLinked({ id: 'p1', title: 'A' });
    const created = store.papers.annotations.save({ paperId: 'p1', kind: 'highlight', page: 2,
      quote: 'A sampled result', prefix: 'before', suffix: 'after', color: '#f2c94c',
      rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.04 }, { x: 1.4, y: -0.2, w: 0, h: 0.1 }] });
    assert.equal(created.kind, 'highlight');
    assert.equal(created.page, 2);
    assert.equal(created.rects.length, 1);
    assert.equal(created.rects[0].x, 0.1);
    assert.deepEqual(store.papers.annotations.list('p1').map(row => row.id), [created.id]);

    const updated = store.papers.annotations.save({ ...created, note: '需要复核', tags: ['方法', '方法'] });
    assert.equal(updated.note, '需要复核');
    assert.deepEqual(updated.tags, ['方法']);

    store.papers.annotations.remove(created.id);
    assert.equal(store.papers.annotations.list('p1').length, 0);
    assert.throws(() => store.papers.annotations.remove(created.id), /批注不存在/);
  } finally { store.close(); }
});

test('书签可不选文字，划线必须选文字并拒绝非法类型', () => {
  const store = openStore(':memory:');
  try {
    store.papers.createLinked({ id: 'p1', title: 'A' });
    const bookmark = store.papers.annotations.save({ paperId: 'p1', kind: 'bookmark', page: 3 });
    assert.equal(bookmark.quote, '第 3 页');
    assert.deepEqual(bookmark.rects, []);
    assert.throws(() => store.papers.annotations.save({ paperId: 'p1', kind: 'highlight', page: 1 }), /选择要标记/);
    assert.throws(() => store.papers.annotations.save({ paperId: 'p1', kind: 'unknown', page: 1, quote: 'x' }), /不完整/);
    assert.throws(() => store.papers.annotations.save({ paperId: 'missing', kind: 'bookmark', page: 1 }), /论文不存在/);
  } finally { store.close(); }
});

test('论文笔记保存、覆盖并保留纯文本', () => {
  const store = openStore(':memory:');
  try {
    store.papers.createLinked({ id: 'p1', title: 'A' });
    assert.deepEqual(store.papers.notes.get('p1'), { html: '', text: '', updated: null });
    store.papers.notes.save('p1', { html: '<p>第一段</p>', text: '第一段' });
    store.papers.notes.save('p1', { html: '<p>第二段</p>', text: '第二段' });
    const note = store.papers.notes.get('p1');
    assert.equal(note.html, '<p>第二段</p>');
    assert.equal(note.text, '第二段');
    assert.ok(note.updated);
    assert.throws(() => store.papers.notes.save('missing', { html: '', text: '' }), /论文不存在/);
  } finally { store.close(); }
});

test('引文定位支持精确、空白归一与前后文兜底', () => {
  const text = 'We study  small   sample estimation. The estimator is consistent.';
  assert.deepEqual(locateQuote(text, { quote: 'small   sample' }), { start: 10, end: 24 });
  assert.deepEqual(locateQuote(text, { quote: 'small sample estimation' }), { start: 9, end: 32 });
  assert.deepEqual(locateQuote(text, { quote: 'not in text', prefix: 'We study', suffix: '' }), { start: 8, end: 19 });
  assert.equal(locateQuote(text, { quote: '' }), null);
  assert.equal(locateQuote(text, { quote: 'missing' }), null);
});

test('阅读器布局宽度被限制并保留开合状态', () => {
  assert.deepEqual(normalizeReaderLayout(undefined), { left: 215, right: 310, leftOpen: true, rightOpen: true });
  assert.deepEqual(normalizeReaderLayout({ left: 10, right: 9999, leftOpen: false, rightOpen: 0 }),
    { left: readerLayoutLimits.left.min, right: readerLayoutLimits.right.max, leftOpen: false, rightOpen: true });
  assert.deepEqual(normalizeReaderLayout({ left: 250.6, right: 300.2 }),
    { left: 251, right: 300, leftOpen: true, rightOpen: true });
});
