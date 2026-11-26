import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from '../desktop/store.mjs';
import { Later, WorkEffects } from '../desktop/work-effects.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('持久队列按 kind/key 合并，完成后删除，回执可去重', () => {
  const store = openStore(':memory:');
  try {
    store.work.effects.enqueue('notify', 'n1', { value: 1 });
    store.work.effects.enqueue('notify', 'n1', { value: 2 });
    const due = store.work.effects.due('notify');
    assert.equal(due.length, 1);
    assert.deepEqual(due[0].payload, { value: 2 });
    assert.equal(store.work.effects.pending('notify'), 1);
    store.work.effects.complete('notify', 'n1');
    assert.equal(store.work.effects.pending('notify'), 0);

    assert.equal(store.work.receipts.has('r1'), false);
    store.work.receipts.add('r1', 'notify', 'sent');
    assert.equal(store.work.receipts.has('r1'), true);
    assert.equal(store.work.receipts.list()[0].status, 'sent');
  } finally { store.close(); }
});

test('副作用执行器成功即出队，失败按退避重试，Later 不计失败', async () => {
  const store = openStore(':memory:');
  const runner = new WorkEffects(store.work, { interval: 10 });
  try {
    let calls = 0;
    runner.handle('notify', async () => { calls++; }, { retry: [10, 20], limit: () => 1 });
    store.work.effects.enqueue('notify', 'ok', {});
    runner.start();
    await wait(40);
    assert.equal(calls, 1);
    assert.equal(store.work.effects.pending('notify'), 0);
    assert.ok(Array.isArray(runner.health()));

    let attempts = 0;
    runner.handle('reply', async () => { attempts++; throw new Error('temporary'); }, { retry: [10, 20], limit: () => 1 });
    store.work.effects.enqueue('reply', 'r1', {});
    runner.kick();
    await wait(120);
    assert.ok(attempts >= 2);
    const [health] = store.work.effects.health().filter(row => row.kind === 'reply');
    assert.ok(health.attempts >= 2);

    let held = 0;
    runner.handle('launch', async () => { held++; throw new Later('no slot'); }, { retry: [10, 20], limit: () => 1 });
    store.work.effects.enqueue('launch', 'l1', {});
    runner.kick();
    await wait(60);
    assert.ok(held >= 2);
    assert.equal(store.work.effects.health().find(row => row.kind === 'launch').attempts, 0);
  } finally {
    runner.stop();
    store.close();
  }
});
