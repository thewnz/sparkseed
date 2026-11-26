import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from '../desktop/store.mjs';
import { createPaperQueue } from '../desktop/papers.mjs';
import { Later, WorkEffects } from '../desktop/work-effects.mjs';
import { paperTriggerAction, recordPaperParsed } from '../desktop/work-sources.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function readyPaper(store, id = 'paper-1', hash = 'a'.repeat(64)) {
  store.papers.create({ id, hash, filename: id + '.pdf', title: '测试论文' });
  store.papers.metadata(id, { title: '测试论文', author: '', pages: 3 });
  store.papers.finish(id, 'ready');
  return store.papers.get(id);
}

test('论文解析完成按文件内容记录一个来源事件，并入队一次持久触发', () => {
  const store = openStore(':memory:');
  try {
    const paper = readyPaper(store);
    const first = recordPaperParsed(store, paper);
    assert.equal(first.kind, 'paper:parsed');
    assert.equal(first.source, 'paper');
    assert.equal(first.duplicate, false);
    assert.equal(store.work.effects.pending('paper-trigger'), 1);
    const again = recordPaperParsed(store, store.papers.get(paper.id));
    assert.equal(again.duplicate, true);
    assert.equal(again.id, first.id);
    assert.equal(store.work.effects.pending('paper-trigger'), 1);
    assert.equal(store.work.events().length, 1);
    const [row] = store.work.effects.due('paper-trigger');
    assert.equal(row.key, first.id);
    assert.equal(row.payload.paperId, paper.id);
  } finally { store.close(); }
});

test('未解析成功的论文不产生来源事件', () => {
  const store = openStore(':memory:');
  try {
    store.papers.create({ id: 'p2', hash: 'b'.repeat(64), filename: 'p2.pdf', title: '解析失败' });
    store.papers.finish('p2', 'failed', 'PDF 解析中断。');
    assert.equal(recordPaperParsed(store, store.papers.get('p2')), null);
    assert.equal(recordPaperParsed(store, undefined), null);
    assert.equal(store.work.effects.pending('paper-trigger'), 0);
    assert.equal(store.work.events().length, 0);
  } finally { store.close(); }
});

test('解析队列结束时把论文 ID 交给来源回调', async () => {
  const previous = process.env.SPARKSEED_PDF_WORKER;
  process.env.SPARKSEED_PDF_WORKER = new URL('./missing-pdf-worker.mjs', import.meta.url).pathname;
  const calls = [];
  const papers = {
    next: () => calls.length ? undefined : { id: 'p3' },
    begin() {},
    finish(id, status) { calls.push([id, status]); },
  };
  try {
    const seen = [];
    const queue = createPaperQueue(papers, '.', id => seen.push(id));
    queue.run();
    await wait(60);
    queue.stop();
    assert.deepEqual(calls, [['p3', 'failed']]);
    assert.ok(seen.includes('p3'), '完成回调必须带上论文 ID');
  } finally {
    if (previous === undefined) delete process.env.SPARKSEED_PDF_WORKER;
    else process.env.SPARKSEED_PDF_WORKER = previous;
  }
});

test('触发副作用在未接入 Agent 时等待，关闭自动化时丢弃，接入后只调度一次', async () => {
  const store = openStore(':memory:');
  const runner = new WorkEffects(store.work, { interval: 10 });
  try {
    assert.equal(paperTriggerAction({ mode: 'off', provider: 'codex' }), 'drop');
    assert.equal(paperTriggerAction({ mode: 'record', provider: '' }), 'hold');
    assert.equal(paperTriggerAction({ mode: 'act', provider: 'codex' }), 'schedule');

    const paper = readyPaper(store);
    const event = recordPaperParsed(store, paper);
    let scheduled = 0;
    let provider = '';
    let mode = 'record';
    runner.handle('paper-trigger', async payload => {
      const action = paperTriggerAction({ mode, provider });
      if (action === 'drop') return;
      if (action === 'hold') throw new Later('尚未接入 Agent');
      scheduled++;
      store.automation.enqueue({ kind: 'paper-plain', subjectType: 'paper', subjectId: payload.paperId,
        title: '白话摘要', mode, originEventId: payload.eventId });
    }, { limit: () => 1, retry: [10, 30] });
    runner.start();
    await wait(60);
    assert.equal(scheduled, 0);
    assert.equal(store.work.effects.pending('paper-trigger'), 1);
    assert.equal(store.work.effects.health().find(row => row.kind === 'paper-trigger').attempts, 0);

    provider = 'codex';
    runner.kick();
    await wait(60);
    assert.equal(scheduled, 1);
    assert.equal(store.work.effects.pending('paper-trigger'), 0);
    assert.equal(store.automation.list().length, 1);
    assert.equal(store.automation.list()[0].origin_event_id, event.id);

    mode = 'off';
    recordPaperParsed(store, readyPaper(store, 'paper-2', 'c'.repeat(64)));
    runner.kick();
    await wait(60);
    assert.equal(store.work.effects.pending('paper-trigger'), 0);
    assert.equal(store.automation.list().length, 1);
  } finally {
    runner.stop();
    store.close();
  }
});