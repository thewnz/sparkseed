import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from '../desktop/store.mjs';
import { normalizeWorkPolicy, revalidateWorkMandate, workMandate, workPolicyEffect, workPolicyVersion } from '../desktop/work-policy.mjs';
import { mandateLabel } from '../src/work-labels.mjs';

const ideaInput = body => ({ body, excerpt: '', paper: '', page: '' });

test('策略版本由规则与运行方式共同决定，Mandate 记录授权依据', () => {
  const base = normalizeWorkPolicy({ mode: 'act', rules: { 'initial-research': true } });
  const quiet = normalizeWorkPolicy({ mode: 'record', rules: { 'initial-research': true } });
  const narrower = normalizeWorkPolicy({ mode: 'act', rules: { 'initial-research': false } });
  assert.notEqual(workPolicyVersion(base), workPolicyVersion(quiet));
  assert.notEqual(workPolicyVersion(base), workPolicyVersion(narrower));
  assert.equal(workPolicyVersion(base), workPolicyVersion(normalizeWorkPolicy({ mode: 'act' })));

  const inferred = workMandate({ policy: base, strength: 'inferred', rules: ['initial-research'], revision: 'r1' });
  assert.equal(inferred.strength, 'inferred');
  assert.deepEqual(inferred.rules, ['initial-research']);
  assert.equal(revalidateWorkMandate(inferred, base), true);
  assert.equal(revalidateWorkMandate(inferred, quiet), false);
  assert.equal(revalidateWorkMandate(inferred, narrower), false);
  assert.equal(revalidateWorkMandate(workMandate({ policy: base, strength: 'explicit' }), quiet), true);
  assert.equal(mandateLabel(inferred), '规则 · 新 Idea 文献初查');
  assert.equal(mandateLabel(workMandate({ policy: base, strength: 'explicit' })), '你发起');
});

test('策略变化只产生提示，不撤销进行中的工作', () => {
  const before = normalizeWorkPolicy({ mode: 'act', rules: { 'initial-research': true, 'paper-plain': true } });
  const after = normalizeWorkPolicy({ mode: 'record', rules: { 'initial-research': false, 'paper-plain': true } });
  const inferred = workMandate({ policy: before, strength: 'inferred', rules: ['initial-research', 'paper-plain'] });
  const effect = workPolicyEffect(inferred, before, after);
  assert.equal(effect.proactive, true);
  assert.deepEqual(effect.rules, [{ id: 'initial-research', enabled: false }]);
  assert.equal(effect.from, workPolicyVersion(before));
  assert.equal(effect.to, workPolicyVersion(after));
  assert.equal(workPolicyEffect(workMandate({ policy: before, strength: 'explicit' }), before, after), null);
  assert.equal(workPolicyEffect(inferred, before, before), null);
});

test('重复 Trigger 只记录一次，Mandate 与策略提示随工作项持久化', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('小样本评估'));
    const policy = normalizeWorkPolicy({ mode: 'act', rules: { 'initial-research': true } });
    const eventInput = { source: 'idea', subjectType: 'idea', subjectId: idea.id, kind: 'research:initial', payload: { revision: 'r1' } };
    const first = store.work.recordEvent(eventInput);
    const again = store.work.recordEvent(eventInput);
    assert.equal(first.duplicate, false);
    assert.equal(again.duplicate, true);
    assert.equal(again.id, first.id);
    const job = store.work.enqueue({ ideaId: idea.id, kind: 'initial', revision: 'r1', provider: 'codex', input: {},
      originEventId: first.id, mandate: workMandate({ policy, strength: 'inferred', rules: ['initial-research'], revision: 'r1' }) });
    assert.equal(store.work.get(job.id).mandate.strength, 'inferred');
    assert.equal(store.work.get(job.id).origin_event_id, first.id);
    store.work.setPolicyNotice(job.id, { proactive: true, rules: [] });
    assert.equal(store.work.public(idea.id).find(row => row.id === job.id).policyNotice.proactive, true);
    assert.equal(store.work.dashboard().find(row => row.id === job.id).policyNotice.proactive, true);

    const auto = store.automation.enqueue({ kind: 'paper-plain', subjectType: 'paper', subjectId: 'p1', title: '生成白话摘要',
      mandate: workMandate({ policy, strength: 'inferred', rules: ['paper-plain'], source: 'paper', subject: 'p1' }), originEventId: first.id });
    assert.equal(auto.mandate.strength, 'inferred');
    store.automation.setPolicyNotice(auto.id, { rules: [{ id: 'paper-plain', enabled: false }] });
    assert.equal(store.automation.get(auto.id).policyNotice.rules[0].enabled, false);
  } finally { store.close(); }
});
