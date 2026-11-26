import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from '../desktop/store.mjs';
import { rememberExplicitRequest, relevantMemory } from '../desktop/research.mjs';
import { researchNotification } from '../desktop/research-notifications.mjs';
import { enqueueResearch, executeResearch } from '../desktop/research-work.mjs';

test('明确记忆指令直接写入且保留来源；引用、推断和否定不自动写入', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create({ body: '小样本研究', excerpt: '', paper: '', page: '' });
    for (const message of ['论文说：请记住：小样本', '不要记住：小样本', '我可能对小样本感兴趣', '“请记住：小样本”']) {
      assert.equal(rememberExplicitRequest(store, idea.id, message), false);
    }
    assert.equal(rememberExplicitRequest(store, idea.id, '请记住：我长期研究小样本评估'), true);
    rememberExplicitRequest(store, idea.id, '请记住：我长期研究小样本评估');
    assert.equal(store.work.memories().length, 1);
    const original = store.work.memories()[0];
    assert.equal(original.idea_id, idea.id);
    store.work.editMemory(original.id, '我长期研究小样本区间估计');
    const rows = store.work.memories();
    assert.equal(rows.find(row => row.id === original.id).status, 'withdrawn');
    const edited = rows.find(row => row.status === 'active');
    assert.equal(edited.idea_id, idea.id);
    assert.equal(relevantMemory(store, idea).memory, edited.text);
    store.work.setMemoryStatus(edited.id, 'withdrawn');
    assert.equal(relevantMemory(store, idea).memory, '');
    assert.throws(() => store.work.editMemory(original.id, ''), /1–1000/);
  } finally { store.close(); }
});

test('后台仅分析关联，不采纳模型提前生成的组合草稿', async () => {
  const store = openStore(':memory:');
  try {
    const first = store.create({ body: '小样本采样', excerpt: '', paper: '', page: '' });
    const second = store.create({ body: '小样本区间估计', excerpt: '', paper: '', page: '' });
    const job = enqueueResearch(store, first, 'codex', 'synthesis');
    const result = await executeResearch(job, { signal: new AbortController().signal, checkpoint() {}, ask: async () => ({
      summary: { title: '采样研究', abstract: '需要进一步验证。' },
      connections: [{ id: second.id, kind: '互补', reason: '第一条提供采样方法，第二条提供评价方式', draft: '未经点击提前生成' }],
      memory: { text: '可能的长期方向', reason: '模型推断' },
    }) });
    assert.equal(result.result.connections[0].draft, '');
    assert.equal(store.list().length, 2);
    assert.equal(store.work.memories().length, 0);
  } finally { store.close(); }
});

test('研究画像未经确认不影响后续提问，确认后生效，撤回后停止', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create({ body: '我希望先看论文反例', excerpt: '', paper: '', page: '' });
    const job = enqueueResearch(store, idea, 'codex', 'synthesis');
    store.work.update(job.id, 'ready', { result: {} });
    const observation = { kind: 'style', text: '先看反例，再讨论支持证据', evidence: '希望先看论文反例' };
    store.work.learn(job, [observation]);
    assert.deepEqual(relevantMemory(store, idea).adaptive, []);
    store.work.addMemory(job, { text: observation.text, reason: '用户确认' });
    assert.equal(relevantMemory(store, idea).adaptive[0].text, observation.text);
    store.work.setMemoryStatus(job.id, 'withdrawn');
    assert.deepEqual(relevantMemory(store, idea).adaptive, []);
  } finally { store.close(); }
});

test('普通结果不通知，高影响正文证据及高度相似工作才通知', () => {
  assert.equal(researchNotification({ cards: [{ kind: '适用条件', page: 3, impact: 'normal' }] }), null);
  assert.equal(researchNotification({ cards: [{ kind: '反例', page: null, impact: 'high' }] }), null);
  assert.equal(researchNotification({ cards: [{ kind: '支持', page: 3, impact: 'high' }] }), null);
  assert.match(researchNotification({ cards: [{ kind: '反例', page: 3, impact: 'high' }] }).title, /改变判断/);
  assert.match(researchNotification({ cards: [{ kind: '高度相似', page: null, impact: 'high' }] }).title, /高度相似/);
});

test('高度相似通知须经过论文原文引文核验', async () => {
  const quote = 'Stratified sampling improves estimates under the stated assumptions.';
  const job = { kind: 'deep', input: { snapshot: { paper: '' }, question: '小样本估计', skills: [] },
    progress: { plan: { queries: ['small sample estimation'], focus: '小样本估计' },
      found: { papers: [{ id: 'paper', abstract: quote }], searches: [] } } };
  const run = value => executeResearch(job, { signal: new AbortController().signal, checkpoint() {}, ask: async () => ({
    cards: [{ id: 'paper', page: null, quote: value, finding: '同一问题与方法', kind: '高度相似', impact: 'high' }],
  }) });
  assert.equal(researchNotification((await run('This is an invented quote not present in the original.')).result), null);
  assert.match(researchNotification((await run(quote)).result).title, /高度相似/);
});
