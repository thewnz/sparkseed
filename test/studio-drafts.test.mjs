import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStudioDrafts } from '../src/studio-drafts.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));

test('保存完成通知期间的新输入仍会启动下一次保存', async () => {
  const writes = [];
  const drafts = createStudioDrafts(async (id, draft) => { writes.push(draft.prompt); });
  let edited = false;
  drafts.subscribe(() => {
    if (!edited && drafts.getSnapshot().a?.status === 'saved') {
      edited = true;
      drafts.update('a', { prompt: '继续输入' });
    }
  });
  drafts.update('a', { prompt: '第一稿' });
  await tick();
  assert.deepEqual(writes, ['第一稿', '继续输入']);
  assert.equal(await drafts.flush('a'), true);
  assert.equal(drafts.getSnapshot().a.status, 'saved');
});

test('同一项目串行保存并合并等待中的输入，旧请求不能覆盖新草稿', async () => {
  const writes = [];
  const releases = [];
  const drafts = createStudioDrafts((id, draft) => new Promise(resolve => {
    writes.push({ id, draft }); releases.push(resolve);
  }));
  drafts.update('a', { prompt: '第一稿' });
  await tick();
  drafts.update('a', { prompt: '第二稿' });
  drafts.update('a', { prompt: '最终稿' });
  assert.equal(drafts.getSnapshot().a.status, 'saving');
  assert.equal(writes.length, 1);
  releases.shift()();
  await tick();
  assert.deepEqual(writes, [{ id: 'a', draft: { prompt: '第一稿' } }, { id: 'a', draft: { prompt: '最终稿' } }]);
  releases.shift()();
  assert.equal(await drafts.flush('a'), true);
  assert.equal(drafts.getSnapshot().a.status, 'saved');
  assert.equal(drafts.getSnapshot().a.draft.prompt, '最终稿');
});

test('保存失败保留输入供重新进入和重试，项目之间互不覆盖', async () => {
  let broken = true;
  const writes = [];
  const drafts = createStudioDrafts(async (id, draft) => {
    if (id === 'a' && broken) throw new Error('磁盘不可写');
    writes.push([id, draft.prompt]);
  });
  drafts.update('a', { prompt: '未保存要求' });
  assert.equal(await drafts.flush('a'), false);
  assert.equal(drafts.getSnapshot().a.status, 'error');
  assert.equal(drafts.getSnapshot().a.draft.prompt, '未保存要求');
  drafts.update('b', { prompt: '另一项目' });
  assert.equal(await drafts.flush('b'), true);
  assert.equal(drafts.getSnapshot().a.status, 'error');
  broken = false;
  drafts.update('a', drafts.getSnapshot().a.draft);
  assert.equal(await drafts.flush('a'), true);
  assert.deepEqual(writes, [['b', '另一项目'], ['a', '未保存要求']]);
});

test('页面取消订阅不会取消保存，快照只在数据改变时变化', async () => {
  let release;
  const drafts = createStudioDrafts(() => new Promise(resolve => { release = resolve; }));
  let events = 0;
  const unsubscribe = drafts.subscribe(() => events++);
  const before = drafts.getSnapshot();
  assert.equal(drafts.getSnapshot(), before);
  drafts.update('a', { prompt: '返回后继续' });
  await tick();
  assert.notEqual(drafts.getSnapshot(), before);
  unsubscribe();
  const eventCount = events;
  release();
  await drafts.flush('a');
  assert.equal(events, eventCount);
  assert.equal(drafts.getSnapshot().a.status, 'saved');
  assert.equal(drafts.getSnapshot().a.draft.prompt, '返回后继续');
});
