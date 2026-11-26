import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from '../desktop/store.mjs';
import { normalizeSuggestions, summaryInstructions } from '../desktop/memory-summary.mjs';
import { appendMemoryProfile, readResearchProfile, saveResearchSection } from '../desktop/research.mjs';

test('记忆总结只保留有效类型、去重并限制四条', () => {
  const rows = normalizeSuggestions({
    suggestions: [
      { text: '长期关注小样本区间估计', kind: 'direction', evidence: '我希望先看反例', confidence: 0.9 },
      { text: '长期关注小样本区间估计', kind: 'method', evidence: '重复', confidence: 0.2 },
      { text: 'x', kind: 'direction', evidence: '', confidence: 2 },
      { text: '偏好先读原文再看摘要', kind: 'habit', evidence: '先读原文', confidence: 2 },
      { text: '避免在摘要阶段下结论', kind: 'constraint', evidence: '摘要证据不足', confidence: 0.4 },
      { text: '使用分层抽样', kind: 'unknown', evidence: '讨论', confidence: -1 },
      { text: '第五条应该被截断', kind: 'method', evidence: '', confidence: 0.5 },
    ],
  });
  assert.equal(rows.length, 4);
  assert.equal(rows[0].text, '长期关注小样本区间估计');
  assert.equal(rows[0].confidence, 0.9);
  assert.equal(rows[1].confidence, 1);
  assert.equal(rows[2].kind, 'constraint');
  assert.equal(rows[3].kind, 'direction');
  assert.match(summaryInstructions(), /"suggestions"/);
});

test('已存在的记忆不再生成建议', () => {
  const rows = normalizeSuggestions([
    { text: '长期关注小样本估计', kind: 'direction', evidence: '', confidence: 0.9 },
    { text: '偏好先读原文', kind: 'habit', evidence: '', confidence: 0.9 },
  ], ['长期关注小样本估计的方法', '偏好先读原文']);
  assert.equal(rows.length, 0);
});

test('记忆建议可写入、去重、采纳与忽略', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create({ body: '小样本', excerpt: '', paper: '', page: '' });
    const row = store.work.addSuggestion({ text: '长期关注小样本估计', kind: 'direction', idea_id: idea.id, confidence: 0.8 });
    assert.ok(row.id);
    assert.equal(store.work.hasSuggestion('长期关注小样本估计').id, row.id);
    assert.equal(store.work.suggestions().length, 1);
    store.work.addSuggestion({ id: row.id, text: '重复', kind: 'direction' });
    assert.equal(store.work.suggestions().length, 1);
    assert.equal(store.work.decideSuggestion(row.id, 'ignored').status, 'ignored');
    assert.throws(() => store.work.decideSuggestion(row.id, 'unknown'), /未知/);
    assert.throws(() => store.work.decideSuggestion('missing', 'ignored'), /不存在/);
  } finally { store.close(); }
});

test('采纳的总结追加到 Memory 且不重复', () => {
  const store = openStore(':memory:');
  try {
    const profile = readResearchProfile(store);
    saveResearchSection(store, { section: 'memory', text: '已有记忆', revision: profile.memory.revision });
    appendMemoryProfile(store, ['长期关注小样本估计', '已有记忆'], { ideaId: 'idea-1' });
    const text = readResearchProfile(store).memory.text;
    assert.equal(text, '已有记忆\n\n长期关注小样本估计');
    appendMemoryProfile(store, ['长期关注小样本估计'], { ideaId: 'idea-1' });
    assert.equal(readResearchProfile(store).memory.text, text);
  } finally { store.close(); }
});

test('记忆整理只接受真实 id 且至少合并两条', async () => {
  const { consolidateInstructions, normalizeConsolidation } = await import('../desktop/memory-summary.mjs');
  const memories = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];
  const groups = normalizeConsolidation({ groups: [
    { ids: ['m1', 'm2'], text: '长期关注小样本估计', kind: 'direction' },
    { ids: ['m2'], text: '单条不合并' },
    { ids: ['m3', 'missing'], text: '只有一条有效' },
    { ids: ['m1', 'm2'], text: '' },
  ] }, memories);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].ids, ['m1', 'm2']);
  assert.match(consolidateInstructions(), /groups/);
});

test('记忆会因重复而强化，可置顶、衰减与合并', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create({ body: '小样本', excerpt: '', paper: '', page: '' });
    const job = { id: 'm-1', idea_id: idea.id };
    store.work.addMemory(job, { text: '长期关注小样本估计', reason: '讨论', kind: 'direction' });
    store.work.addMemory(job, { text: '长期关注小样本估计', reason: '重复', kind: 'direction' });
    const first = store.work.memories().find(row => row.text === '长期关注小样本估计');
    assert.equal(first.hits, 2);
    assert.ok(first.strength > 1);
    store.work.pinMemory(first.id, true);
    const before = store.work.memories().find(row => row.id === first.id).strength;
    store.work.decayMemories(-1);
    const after = store.work.memories().find(row => row.id === first.id).strength;
    assert.equal(after, before);

    store.work.addMemory({ id: 'm-2', idea_id: idea.id }, { text: '偏好先读原文再看摘要', reason: '讨论', kind: 'habit' });
    const second = store.work.memories().find(row => row.text === '偏好先读原文再看摘要');
    store.work.consolidateMemory([{ ids: [first.id, second.id], text: '长期关注小样本估计，并先读原文', kind: 'direction' }]);
    const rows = store.work.memories();
    assert.ok(rows.some(row => row.status === 'withdrawn' && row.merged_from.length > 0));
    assert.ok(rows.some(row => row.status === 'active' && row.text.includes('先读原文')));
  } finally { store.close(); }
});

test('自动流程不会复活已撤回记忆，且相似匹配要求足够接近', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create({ body: '小样本', excerpt: '', paper: '', page: '' });
    store.work.addMemory({ id: 'm1', idea_id: idea.id }, { text: '使用 R 做统计', reason: '讨论', kind: 'method' });
    const row = store.work.memories()[0];
    store.work.setMemoryStatus(row.id, 'withdrawn');
    const again = store.work.addMemory({ id: 'm2', idea_id: idea.id }, { text: '使用 R 做统计', reason: '自动', kind: 'method' });
    assert.equal(again, null);
    assert.equal(store.work.memories().find(item => item.id === row.id).status, 'withdrawn');

    store.work.addMemory({ id: 'm3', idea_id: idea.id }, { text: '使用 R 做统计', reason: '手动', kind: 'method' });
    const active = store.work.memories().find(item => item.status === 'active');
    store.work.addMemory({ id: 'm4', idea_id: idea.id }, { text: '使用 R 做统计并偏好 Python', reason: '自动', kind: 'method' });
    assert.ok(store.work.memories().some(item => item.status === 'active' && item.text.includes('偏好 Python')));
    const similar = store.work.findSimilarMemory('使用 R');
    assert.equal(similar, null);
  } finally { store.close(); }
});

test('重叠合并组只处理一次并保留来源', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create({ body: 'x', excerpt: '', paper: '', page: '' });
    for (const [id, text] of [['a', '记忆 A'], ['b', '记忆 B'], ['c', '记忆 C']]) {
      store.work.addMemory({ id, idea_id: idea.id }, { text, reason: '讨论', kind: 'fact' });
    }
    store.work.consolidateMemory([
      { ids: ['a', 'b'], text: '合并 AB', kind: 'fact' },
      { ids: ['b', 'c'], text: '合并 BC', kind: 'fact' },
    ]);
    const rows = store.work.memories();
    const active = rows.filter(row => row.status === 'active');
    assert.equal(active.filter(row => row.text.startsWith('合并')).length, 1);
    assert.ok(active.some(row => row.text === '记忆 C'));
    assert.ok(rows.filter(row => row.status === 'withdrawn').every(row => row.merged_from.length >= 2));
  } finally { store.close(); }
});

test('记忆衰减按时间戳节流', async () => {
  const { shouldDecay } = await import('../desktop/memory-summary.mjs');
  const now = Date.now();
  assert.equal(shouldDecay(null, now), true);
  assert.equal(shouldDecay(new Date(now - 2 * 86400000).toISOString(), now), false);
  assert.equal(shouldDecay(new Date(now - 8 * 86400000).toISOString(), now), true);
  assert.equal(shouldDecay('bad-date', now), true);
});
