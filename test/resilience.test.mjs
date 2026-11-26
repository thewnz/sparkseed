import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../desktop/store.mjs';

test('坏 progress JSON 不再阻止启动或列表读取', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sparkseed-resilience-'));
  const path = join(directory, 'store.sqlite');
  try {
    const first = openStore(path);
    const idea = first.create({ body: '小样本', excerpt: '', paper: '', page: '' });
    const job = first.work.enqueue({ ideaId: idea.id, kind: 'synthesis', revision: 'r1', provider: 'codex', input: {} });
    first.work.update(job.id, 'ready', { result: { summary: { title: '研究摘要' } } });
    first.close();

    const db = new DatabaseSync(path);
    db.prepare("UPDATE research_work SET progress = 'not-json' WHERE id = ?").run(job.id);
    db.close();

    const reopened = openStore(path);
    assert.doesNotThrow(() => reopened.list());
    assert.doesNotThrow(() => reopened.work.dashboard());
    assert.deepEqual(reopened.work.get(job.id).progress, {});
    assert.equal(reopened.get(idea.id).analysis, null);
    reopened.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('补充线索生成新初查后，旧的待确认问题移出任务列表', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create({ body: '小样本', excerpt: '', paper: '', page: '' });
    const first = store.work.enqueue({ ideaId: idea.id, kind: 'initial', revision: 'r1', provider: 'codex', input: {} });
    store.work.update(first.id, 'waiting', { result: { questions: ['先看采样还是评价？'] } });
    const second = store.work.enqueue({ ideaId: idea.id, kind: 'initial', revision: 'r2', provider: 'codex', input: {} });
    assert.equal(store.work.get(first.id).status, 'superseded');
    assert.deepEqual(store.work.dashboard().map(row => row.id), [second.id]);
    assert.equal(store.work.next().id, second.id);
  } finally { store.close(); }
});
