import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../desktop/store.mjs';

test('笔记可新建、搜索、打标签、置顶与删除', () => {
  const store = openStore(':memory:');
  try {
    const first = store.notes.save({ html: '<p>Koopman 谱方法</p>', text: 'Koopman 谱方法', tags: ['方法', '方法'] });
    assert.equal(first.title, 'Koopman 谱方法');
    assert.deepEqual(first.tags, ['方法']);
    const second = store.notes.save({ title: '采样笔记', text: '分层抽样', sourceType: 'manual' });
    assert.equal(store.notes.list().length, 2);
    assert.deepEqual(store.notes.list({ query: '分层' }).map(note => note.id), [second.id]);
    assert.deepEqual(store.notes.list({ tag: '方法' }).map(note => note.id), [first.id]);
    store.notes.pin(second.id, true);
    assert.equal(store.notes.list()[0].id, second.id);
    const updated = store.notes.save({ ...first, title: 'Koopman 方法', text: '更新后的正文' });
    assert.equal(updated.text, '更新后的正文');
    store.notes.remove(first.id);
    assert.equal(store.notes.list().length, 1);
    assert.throws(() => store.notes.remove(first.id), /笔记不存在/);
  } finally { store.close(); }
});

test('讨论笔记按 Idea 唯一，重复获取不会新建', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create({ body: '小样本', excerpt: '', paper: '', page: '' });
    const first = store.notes.ensureIdea(idea.id, '讨论记录本');
    const second = store.notes.ensureIdea(idea.id, '讨论记录本');
    assert.equal(first.id, second.id);
    assert.equal(first.sourceType, 'idea');
    assert.equal(first.sourceId, idea.id);
    const titled = store.notes.ensureIdea(idea.id, '小样本讨论');
    assert.equal(titled.title, '小样本讨论');
    assert.equal(store.notes.list({ sourceType: 'idea' }).length, 1);
  } finally { store.close(); }
});

test('旧记录本首次启动迁移为一条笔记且不会重复', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sparkseed-notes-'));
  const path = join(directory, 'store.sqlite');
  try {
    const first = openStore(path);
    first.set('notebook', { html: '<p>旧的记录本</p>', text: '旧的记录本' });
    first.close();
    const second = openStore(path);
    const rows = second.notes.list();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, '讨论记录本（旧）');
    assert.equal(rows[0].text, '旧的记录本');
    second.close();
    const third = openStore(path);
    assert.equal(third.notes.list().length, 1);
    third.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
