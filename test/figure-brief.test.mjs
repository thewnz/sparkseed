import assert from 'node:assert/strict';
import { test } from 'node:test';
import { figureBriefComplete, figureBriefKind, figureBriefQuestions, figureBriefRecord, normalizeFigureBrief } from '../desktop/figure-brief.mjs';

const answer = (...selected) => ({ selected, note: '' });
const table = { purpose: answer(0), source: answer(2), audience: answer(0), emphasis: answer(2) };

test('数据图需要确认目的、材料和用途，按需追问缺失与不确定性', () => {
  assert.equal(figureBriefComplete({}), false);
  assert.equal(figureBriefKind(table), 'line');
  assert.equal(figureBriefComplete(table), false);
  assert.equal(figureBriefQuestions(table).at(-1).id, 'uncertainty');
  const complete = normalizeFigureBrief({ ...table, uncertainty: { ...answer(2, 2, -1, 300), note: '  原始记录为空  ' } });
  assert.equal(figureBriefComplete(complete), true);
  assert.deepEqual(figureBriefRecord(complete).at(-1), {
    question: '样本量、误差或缺失值应该怎样交代？', selections: ['保留缺失值，图注说明原因'], note: '原始记录为空',
  });
});

test('概念和流程选项使用独立的追问，不将分支误记为不确定性', () => {
  const concept = normalizeFigureBrief({ ...table, purpose: answer(5), emphasis: answer(2), uncertainty: answer(0), style: answer(0) });
  assert.equal(figureBriefKind(concept), 'diagram');
  assert.equal(figureBriefComplete(concept), true);
  assert.equal(figureBriefRecord(concept).at(-2).selections[0], '关键条件或分支');
  assert.equal(figureBriefRecord(concept).at(-1).selections[0], '简洁期刊风格');
});

test('每个基础问题可跳过，跳过不推荐图型也不进入模型需求', () => {
  const skipped = { skipped: true };
  const answers = normalizeFigureBrief({ purpose: skipped, source: skipped, audience: skipped, emphasis: skipped });
  assert.deepEqual(answers.purpose, { selected: [], note: '', skipped: true });
  assert.deepEqual(normalizeFigureBrief(answers), answers);
  assert.equal(figureBriefKind(answers), undefined);
  assert.equal(figureBriefComplete(answers), true);
  assert.deepEqual(figureBriefRecord(answers), []);
  assert.equal(figureBriefRecord(answers, { includeSkipped: true }).filter(row => row.skipped).length, 4);
  assert.equal(figureBriefComplete(normalizeFigureBrief({ ...answers, source: answer() })), false);
});

test('跳过条件追问不影响已填写的需求', () => {
  const data = normalizeFigureBrief({ ...table, uncertainty: { skipped: true } });
  assert.equal(figureBriefComplete(data), true);
  assert.equal(figureBriefRecord(data).length, 4);

  const concept = normalizeFigureBrief({ ...table, purpose: answer(5), source: { skipped: true }, style: { skipped: true } });
  assert.equal(figureBriefComplete(concept), true);
  assert.deepEqual(figureBriefRecord(concept, { includeSkipped: true })[2].selections, ['论文或投稿']);
  assert.deepEqual(figureBriefRecord(concept).flatMap(row => row.selections), ['概念、结构或机制示意', '论文或投稿', '关键条件或分支']);
});
