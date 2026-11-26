import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from '../desktop/store.mjs';

test('自动化票据去重、批准、重试与忽略', () => {
  const store = openStore(':memory:');
  try {
    const job = store.automation.enqueue({ kind: 'paper-plain', subjectType: 'paper', subjectId: 'p1',
      title: '生成白话', mode: 'record' });
    assert.equal(job.status, 'queued');
    const duplicate = store.automation.enqueue({ kind: 'paper-plain', subjectType: 'paper', subjectId: 'p1',
      title: '重复', mode: 'record' });
    assert.equal(duplicate.id, job.id);

    store.automation.update(job.id, { status: 'waiting', stage: '等待你确认', requires_attention: true });
    assert.equal(store.automation.attention(), 1);
    const approved = store.automation.approve(job.id);
    assert.equal(approved.status, 'queued');
    assert.equal(approved.mode, 'act');
    assert.equal(store.automation.attention(), 0);

    store.automation.update(job.id, { status: 'failed', error: '网络失败', requires_attention: true });
    assert.equal(store.automation.retry(job.id).status, 'queued');
    assert.equal(store.automation.dismiss(job.id).status, 'ended');

    const ignored = store.automation.enqueue({ kind: 'paper-plain', subjectType: 'paper', subjectId: 'p1',
      title: '再次生成', mode: 'act' });
    assert.equal(ignored.status, 'ended');
    assert.equal(ignored.result.dismissed, true);
  } finally { store.close(); }
});

test('自动化模式判定：批准后的记录票据可以执行，关闭时默认跳过', async () => {
  const { automationDecision } = await import('../desktop/automation-policy.mjs');
  assert.equal(automationDecision('off', 'record'), 'skip');
  assert.equal(automationDecision('off', 'act'), 'run');
  assert.equal(automationDecision('record', 'record'), 'wait');
  assert.equal(automationDecision('record', 'act'), 'run');
  assert.equal(automationDecision('act', 'record'), 'run');
  assert.equal(automationDecision('act', 'act'), 'run');
});
