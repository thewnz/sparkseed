import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { openStore } from '../desktop/store.mjs';

test('Idea 生命周期：创建、回答、评分、置顶、删除', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create({ body: '比较采样方式', excerpt: '原文', paper: '示例', page: '3' }, 'codex');
    assert.equal(idea.status, 'queued');
    assert.equal(store.list().length, 1);
    store.update(idea.id, 'ready', 'codex', null, [{ question: '比较什么？', options: ['样本', '类别'], answer: { options: [0], note: '', skipped: false } }]);
    assert.equal(store.get(idea.id).discussion[0].answer.options[0], 0);
    store.rateIdea(idea.id, 'importance', 5);
    store.rateIdea(idea.id, 'researchValue', 4);
    store.rateIdea(idea.id, 'usability', 3);
    const rated = store.get(idea.id);
    assert.equal(rated.importance, 5);
    assert.equal(rated.research_value, 4);
    assert.equal(rated.usability, 3);
    store.pinIdea(idea.id, true);
    assert.equal(store.list()[0].pinned_at !== null, true);
    assert.throws(() => store.update('missing', 'ready', 'codex'), /不存在/);
    store.removeIdea(idea.id);
    assert.equal(store.list().length, 0);
  } finally { store.close(); }
});

test('研读台数据：速读、白话、术语去重与自测间隔', () => {
  const store = openStore(':memory:');
  try {
    store.papers.createLinked({ id: 'p1', title: 'A' });
    const triage = store.papers.triage.save('p1', { type: '实证', context: '背景', correctness: '合理',
      contributions: '贡献', clarity: '清楚', decision: 'continue', seconds: 120 });
    assert.equal(triage.decision, 'continue');
    assert.equal(store.papers.triage.get('p1').seconds, 120);

    const insight = store.papers.insights.save({ paperId: 'p1', page: 1, kind: 'plain', text: '白话',
      citations: [{ page: 1, quote: 'small sample' }], supported: true });
    assert.equal(insight.text, '白话');
    assert.equal(insight.citations.length, 1);
    assert.equal(store.papers.insights.get('p1', 1, 'plain').supported, true);

    const first = store.papers.glossary.save({ paperId: 'p1', term: '估计量', definition: '统计量', page: 1 });
    const second = store.papers.glossary.save({ paperId: 'p1', term: '估计量', definition: '更新释义', page: 2 });
    assert.equal(first.id, second.id);
    assert.equal(store.papers.glossary.list('p1').length, 1);
    assert.equal(store.papers.glossary.list('p1')[0].definition, '更新释义');

    const card = store.papers.review.save({ paperId: 'p1', question: '核心问题？', answer: '答案',
      sourcePage: 1, sourceQuote: 'small sample' });
    const good = store.papers.review.review(card.id, 'good');
    assert.equal(good.reviews, 1);
    assert.ok(Date.parse(good.due) > Date.now() + 86400000);
    const again = store.papers.review.review(card.id, 'again');
    assert.equal(again.reviews, 2);
    assert.ok(Date.parse(again.due) < Date.now() + 20 * 60000);
    assert.equal(store.papers.review.list('p1').length, 1);
  } finally { store.close(); }
});

test('preload 暴露的 IPC 通道与主进程注册一一对应', () => {
  const preload = readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../desktop/main.mjs', import.meta.url), 'utf8');
  const invoked = new Set([...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(match => match[1]));
  const handled = new Set([...main.matchAll(/handle\('([^']+)'/g)].map(match => match[1]));
  const missing = [...invoked].filter(channel => !handled.has(channel));
  assert.deepEqual(missing, []);
  const listened = new Set([...preload.matchAll(/listen\('([^']+)'/g)].map(match => match[1]));
  const sent = new Set([...main.matchAll(/webContents\.send\('([^']+)'/g)].map(match => match[1]));
  const missingEvents = [...listened].filter(event => !sent.has(event));
  assert.deepEqual(missingEvents, []);
});

test('新 revision 的初查会取代旧的 waiting 初查', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create({ body: '小样本', excerpt: '', paper: '', page: '' });
    const first = store.work.enqueue({ ideaId: idea.id, kind: 'initial', revision: 'r1', provider: 'codex', input: {} });
    store.work.update(first.id, 'waiting', { plan: { queries: [] } });
    const second = store.work.enqueue({ ideaId: idea.id, kind: 'initial', revision: 'r2', provider: 'codex', input: {} });
    assert.equal(store.work.get(first.id).status, 'superseded');
    assert.equal(store.work.get(second.id).status, 'queued');
  } finally { store.close(); }
});
