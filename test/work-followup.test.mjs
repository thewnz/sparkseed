import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enqueueResearch, followUpNeedsInitial, recordDiscussionReply } from '../desktop/research-work.mjs';
import { openStore } from '../desktop/store.mjs';

const ideaInput = body => ({ body, paper: '', page: '', excerpt: '' });
const withPlan = queries => ({ plan: { focus: '查证', queries } });

function initialJobs(store, idea, statuses) {
  return statuses.map(([status, queries]) => {
    const job = enqueueResearch(store, { ...idea, body: idea.body + status + queries.join('') }, 'codex', 'initial');
    store.work.update(job.id, status, withPlan(queries));
    return job;
  });
}

test('讨论追问会恢复失败的初查，即使它已经保存了检索式', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('比较两种估计方法'));
    initialJobs(store, idea, [['failed', ['estimate error comparison']]]);
    assert.equal(followUpNeedsInitial(store.work.list(idea.id)), true);
  } finally { store.close(); }
});

test('已交付或正在进行的初查不被讨论追问重复排入', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('检查重复排程'));
    for (const status of ['ready', 'queued', 'running', 'paused']) {
      const jobs = initialJobs(store, idea, [[status, ['deep learning survey']]]);
      assert.equal(followUpNeedsInitial(store.work.list(idea.id)), false, status);
      store.work.remove(jobs[0].id);
    }
  } finally { store.close(); }
});

test('已被取代的初查不再挡住追问，等待回答且没有检索式的初查可以继续', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('追问订阅'));
    const [older, newer] = initialJobs(store, idea, [['failed', ['old query']], ['waiting', []]]);
    store.work.update(newer.id, 'superseded', withPlan(['superseded query']));
    assert.equal(followUpNeedsInitial(store.work.list(idea.id)), true);
    store.work.remove(older.id);
    store.work.update(newer.id, 'waiting', withPlan([]));
    assert.equal(followUpNeedsInitial(store.work.list(idea.id)), true);
    assert.equal(followUpNeedsInitial([]), true);
  } finally { store.close(); }
});

test('同一条讨论回复只记录一个来源事件，新回复产生新事件', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('记录回复事件'));
    const first = recordDiscussionReply(store, { ...idea, discussion: [{ message: '加入对照组' }] });
    const again = recordDiscussionReply(store, { ...idea, discussion: [{ message: '加入对照组' }] });
    assert.equal(first.duplicate, false);
    assert.equal(again.duplicate, true);
    assert.equal(again.id, first.id);
    assert.equal(first.kind, 'idea:reply');
    assert.equal(first.actor, 'user');
    const second = recordDiscussionReply(store, { ...idea, discussion: [{ message: '加入对照组' }, { message: '再补一句' }] });
    assert.notEqual(second.id, first.id);
    assert.equal(store.work.events().length, 2);
  } finally { store.close(); }
});

test('追问创建的工作项挂在回复事件上', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('追问来源'));
    const reply = recordDiscussionReply(store, { ...idea, discussion: [{ message: '换一个数据集' }] });
    const job = enqueueResearch(store, idea, 'codex', 'synthesis', '', false, null, reply);
    assert.equal(job.origin_event_id, reply.id);
    const automatic = enqueueResearch(store, idea, 'codex', 'initial');
    assert.notEqual(automatic.origin_event_id, reply.id);
    assert.ok(automatic.origin_event_id.startsWith('evt-'));
  } finally { store.close(); }
});