import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from '../desktop/store.mjs';
import { attentionOf, automationWorkStage, canRetryWork, researchWorkStage, workStageGroup, workStageLabel } from '../desktop/work-stage.mjs';

const ideaInput = body => ({ body, excerpt: '', paper: '', page: '' });

test('研究工作项按事实推导阶段，不跟随状态字符串', () => {
  assert.deepEqual(researchWorkStage({ status: 'queued' }), { stage: 'working', action: 'queued' });
  assert.deepEqual(researchWorkStage({ status: 'running' }), { stage: 'working' });
  assert.deepEqual(researchWorkStage({ status: 'waiting' }), { stage: 'person', action: 'answer' });
  assert.deepEqual(researchWorkStage({ status: 'ready' }), { stage: 'person', action: 'review' });
  assert.deepEqual(researchWorkStage({ status: 'failed' }), { stage: 'person', action: 'failed' });
  assert.deepEqual(researchWorkStage({ status: 'paused' }), { stage: 'person', action: 'blocked' });
  assert.deepEqual(researchWorkStage({ status: 'superseded' }), { stage: 'ended' });
  assert.deepEqual(researchWorkStage({ status: 'whatever' }), { stage: 'idle' });
  assert.equal(workStageGroup(researchWorkStage({ status: 'waiting' })), 'attention');
  assert.equal(workStageGroup(researchWorkStage({ status: 'ready' })), 'ready');
  assert.equal(workStageGroup(researchWorkStage({ status: 'queued' })), 'active');
  assert.equal(workStageLabel(researchWorkStage({ status: 'waiting' })), '待你回答');
  assert.equal(workStageLabel(researchWorkStage({ status: 'ready' })), '待查看');
});

test('自动化票据复用同一套阶段，但等待的是确认而不是回答', () => {
  assert.deepEqual(automationWorkStage({ status: 'waiting' }), { stage: 'person', action: 'answer' });
  assert.equal(workStageLabel(automationWorkStage({ status: 'waiting' }), 'automation'), '待你确认');
  assert.equal(workStageLabel(automationWorkStage({ status: 'ended' }), 'automation'), '已结束');
  assert.deepEqual(automationWorkStage({ status: 'running' }), { stage: 'working' });
  assert.equal(workStageGroup(automationWorkStage({ status: 'failed' })), 'attention');
});

test('attention 只保留一个可操作的问题，重试资格由事实决定', () => {
  const waiting = { status: 'waiting', progress: { attention: { kind: 'question', question: '先看采样还是评价？', options: ['先看采样', '先看评价'] } } };
  assert.deepEqual(attentionOf(waiting, 'research'), { kind: 'question', question: '先看采样还是评价？', options: ['先看采样', '先看评价'] });
  assert.equal(canRetryWork(waiting, 'research'), false);
  const fallback = { status: 'waiting', progress: { result: { questions: ['只保存了问题'] } } };
  assert.equal(attentionOf(fallback, 'research').question, '只保存了问题');
  const failed = { status: 'failed', error: '模型不可用' };
  assert.equal(canRetryWork(failed, 'research'), true);
  assert.deepEqual(attentionOf(failed, 'research'), { kind: 'retry', question: '模型不可用', options: [] });
  assert.equal(canRetryWork({ status: 'ready' }, 'research'), false);
  assert.equal(canRetryWork({ status: 'waiting' }, 'automation'), true);
  assert.equal(attentionOf({ status: 'waiting', title: '生成白话摘要' }, 'automation').kind, 'approval');
});

test('工作项列表与仪表盘返回统一阶段，人工请求优先占用保留槽', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('小样本评估'));
    const auto = store.work.enqueue({ ideaId: idea.id, kind: 'initial', revision: 'auto', provider: 'codex', input: {} });
    const manual = store.work.enqueue({ ideaId: idea.id, kind: 'deep', revision: 'manual', provider: 'codex', input: { question: '先看哪个？' }, manual: true });
    assert.equal(store.work.nextForSlot('manual').id, manual.id);
    assert.equal(store.work.nextForSlot('auto').id, auto.id);
    assert.equal(store.work.nextForSlot('auto', [auto.id]).id, manual.id);
    assert.equal(store.work.nextForSlot('manual', [manual.id]), undefined);

    store.work.update(auto.id, 'waiting', {
      attention: { kind: 'question', question: '先看采样还是评价？', options: ['先看采样', '先看评价'] },
      result: { questions: ['先看采样还是评价？'], cards: [], papers: [] },
    });
    const [job] = store.work.public(idea.id).filter(row => row.id === auto.id);
    assert.deepEqual(job.workStage, { stage: 'person', action: 'answer' });
    assert.equal(job.attention.question, '先看采样还是评价？');
    assert.equal(job.canRetry, false);
    assert.equal(job.manual, false);
    const [row] = store.work.dashboard().filter(item => item.id === auto.id);
    assert.deepEqual(row.workStage, { stage: 'person', action: 'answer' });
    assert.equal(row.attention.question, '先看采样还是评价？');
    assert.equal(row.stage, null);
    const [manualRow] = store.work.dashboard().filter(item => item.id === manual.id);
    assert.equal(manualRow.manual, true);
    assert.equal(manualRow.workStage.stage, 'working');

    store.work.update(auto.id, 'failed', { result: {} }, '模拟失败');
    const [failed] = store.work.dashboard().filter(item => item.id === auto.id);
    assert.equal(failed.canRetry, true);
    assert.equal(failed.workStage.action, 'failed');
  } finally { store.close(); }
});
