import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { enqueueResearch } from '../desktop/research-work.mjs';
import { researchDelivery } from '../desktop/work-delivery.mjs';
import { openStore } from '../desktop/store.mjs';

const ideaInput = body => ({ body, paper: '', page: '', excerpt: '' });
const highImpact = { cards: [{ id: 'p1', kind: '反例', page: 3, impact: 'high', quote: '原文短引' }] };

test('交付决定等待状态、观察学习与通知，通知键随证据稳定', () => {
  const initial = { id: 'j1', idea_id: 'i1', kind: 'initial' };
  const questions = { result: { questions: ['要查证哪一个？'], cards: [] } };
  const waiting = researchDelivery(initial, questions);
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.summarize, false);
  assert.equal(waiting.observations, null);
  assert.equal(waiting.notice, null);

  const synthesis = { id: 'j2', idea_id: 'i1', kind: 'synthesis' };
  const organized = { result: { summary: { title: '整理' }, observations: [{ kind: 'style', text: '先核对对照组' }] } };
  const delivered = researchDelivery(synthesis, organized);
  assert.equal(delivered.status, 'ready');
  assert.equal(delivered.summarize, true);
  assert.deepEqual(delivered.observations, organized.result.observations);

  const deep = { id: 'j3', idea_id: 'i1', kind: 'deep' };
  const significant = researchDelivery(deep, { result: highImpact });
  assert.equal(significant.status, 'ready');
  assert.match(significant.notice.title, /改变判断/);
  assert.equal(significant.notice.jobId, 'j3');
  assert.equal(significant.notice.ideaId, 'i1');
  assert.equal(significant.notice.id, significant.notice.key);
  assert.equal(researchDelivery(deep, { result: highImpact }).notice.key, significant.notice.key);
  assert.equal(researchDelivery(deep, { result: { cards: [{ ...highImpact.cards[0], quote: '另一段引文' }] } }).notice.key === significant.notice.key, false);
  assert.equal(researchDelivery(deep, { result: highImpact }, { notifications: false }).notice, null);
  assert.equal(researchDelivery(deep, { result: { cards: [{ kind: '支持', page: 3, impact: 'high' }] } }).notice, null);
});

test('排队的工作项带有持久启动意图，重复排程按工作项合并', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('启动意图'));
    const job = enqueueResearch(store, idea, 'codex', 'synthesis');
    assert.equal(store.work.effects.pending('launch'), 1);
    const [row] = store.work.effects.due('launch');
    assert.equal(row.key, job.id);
    assert.equal(row.payload.jobId, job.id);
    assert.equal(row.payload.ideaId, idea.id);
    enqueueResearch(store, idea, 'codex', 'synthesis');
    assert.equal(store.work.effects.pending('launch'), 1);
    enqueueResearch(store, { ...idea, body: '启动意图 · 新条件' }, 'codex', 'synthesis');
    assert.equal(store.work.effects.pending('launch'), 2);
  } finally { store.close(); }
});

test('重试恢复启动意图，删除工作项同时清掉启动与交付意图', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('重试与删除'));
    const job = enqueueResearch(store, idea, 'codex', 'initial');
    store.work.update(job.id, 'paused', {});
    store.work.effects.complete('launch', job.id);
    assert.equal(store.work.effects.pending('launch'), 0);
    store.work.retry(job.id, 'codex');
    assert.equal(store.work.effects.due('launch')[0].key, job.id);
    store.work.effects.enqueue('deliver', job.id, { jobId: job.id });
    store.work.remove(job.id);
    assert.equal(store.work.effects.pending('launch'), 0);
    assert.equal(store.work.effects.pending('deliver'), 0);
  } finally { store.close(); }
});

test('未完成的启动与交付意图在重启后仍然保留', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sparkseed-launch-'));
  const path = join(directory, 'ideas.sqlite');
  try {
    const first = openStore(path);
    const idea = first.create(ideaInput('重启恢复'));
    const job = enqueueResearch(first, idea, 'codex', 'synthesis');
    first.work.effects.enqueue('deliver', job.id, { jobId: job.id, ideaId: idea.id });
    first.close();

    const second = openStore(path);
    try {
      assert.equal(second.work.get(job.id).status, 'queued');
      assert.deepEqual(second.work.effects.due('launch').map(row => row.key), [job.id]);
      assert.deepEqual(second.work.effects.due('deliver').map(row => row.key), [job.id]);
    } finally { second.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});