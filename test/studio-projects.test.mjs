import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openStore } from '../desktop/store.mjs';
import { conceptImagePrompt, overviewDetailLayout } from '../desktop/figure-workflow.mjs';
import { pictureTypeOf } from '../desktop/picture-workflow.mjs';

test('统一图片入口保留旧类型及独立的表格与流程材料', () => {
  const store = openStore(':memory:');
  try {
    const id = store.studio.create('图文项目');
    const table = '时间,读数\n0,1\n1,2';
    const steps = '采样\n审核';
    assert.equal(pictureTypeOf({ type: 'image' }), 'illustration');
    assert.equal(pictureTypeOf({ type: 'figure', figureMode: 'concept' }), 'concept');
    assert.equal(pictureTypeOf({ type: 'figure', figure: { kind: 'diagram' } }), 'flow');
    store.studio.draft(id, { type: 'figure', pictureType: 'flow', pictureWorkflow: 'agent',
      figure: { kind: 'line', data: table }, flowFigure: { kind: 'diagram', data: steps },
      flowPrompt: '先采样，再审核', flowRequirements: '突出审核分支', flowConstraints: '标签必须使用英文' });
    const { draft } = store.studio.get(id);
    assert.equal(pictureTypeOf(draft), 'flow');
    assert.equal(draft.pictureWorkflow, 'agent');
    assert.equal(draft.figure.data, table);
    assert.equal(draft.flowFigure.data, steps);
    assert.equal(draft.flowPrompt, '先采样，再审核');
    assert.equal(draft.flowRequirements, '突出审核分支');
    assert.equal(draft.flowConstraints, '标签必须使用英文');
  } finally { store.close(); }
});

test('模块修改要求、布局选项和版本修订随项目草稿保存，且不覆盖审核素材', () => {
  const store = openStore(':memory:');
  try {
    const id = store.studio.create('审核中的图稿');
    const flowAssembly = { id: 'flow-a', candidate: { id: 'candidate-a' }, materials: [{ data: 'approved' }] };
    store.studio.saveFlowAssembly(id, flowAssembly);
    const flowEditor = { flowId: 'flow-a', selected: 0, blocks: { 0: { kind: 'agent', query: 'model', feedback: '放大标签' } },
      layoutFeedback: '增加间距', composition: 'overviewDetail', layoutArchetype: 'grid' };
    store.studio.draft(id, { type: 'figure', flowEditor, revisions: { 'version-a': '保留箭头' } });
    const draft = store.studio.get(id).draft;
    assert.deepEqual(draft.flowEditor, flowEditor);
    assert.deepEqual(draft.revisions, { 'version-a': '保留箭头' });
    assert.deepEqual(draft.flowAssembly, flowAssembly);
  } finally { store.close(); }
});

test('编辑上下文只接受有界字段，清空修改要求不会复活旧值', () => {
  const store = openStore(':memory:');
  try {
    const id = store.studio.create('输入边界');
    store.studio.draft(id, { flowEditor: { flowId: 'flow-a', selected: 99, blocks: {
      0: { kind: 'invalid', query: 'q'.repeat(200), feedback: 'x'.repeat(1700) }, 20: { feedback: '越界' },
    }, composition: 'invalid', layoutArchetype: 'invalid' }, revisions: { a: 'r'.repeat(2000) } });
    const editor = store.studio.get(id).draft.flowEditor;
    assert.equal(editor.selected, null);
    assert.equal(editor.blocks[0].kind, 'agent');
    assert.equal(editor.blocks[0].query.length, 160);
    assert.equal(editor.blocks[0].feedback.length, 1500);
    assert.equal(editor.blocks[20], undefined);
    assert.equal(editor.composition, '');
    assert.equal(editor.layoutArchetype, '');
    assert.equal(store.studio.get(id).draft.revisions.a.length, 1500);
    store.studio.draft(id, { flowEditor: { flowId: 'flow-a', blocks: {} }, revisions: {} });
    assert.deepEqual(store.studio.get(id).draft.flowEditor.blocks, {});
    assert.deepEqual(store.studio.get(id).draft.revisions, {});
  } finally { store.close(); }
});

test('科研概念图保存总览详图版式，并只在选用时加入图像生成指引', () => {
  const store = openStore(':memory:');
  try {
    const project = store.studio.create('方法图');
    store.studio.draft(project, { type: 'figure', concept: '信号处理', conceptLayout: overviewDetailLayout });
    assert.equal(store.studio.get(project).draft.conceptLayout, overviewDetailLayout);
    const prompt = { concept: '信号处理', title: '方法流程', skills: [] };
    assert.match(conceptImagePrompt({ ...prompt, conceptLayout: overviewDetailLayout }), /贯穿全宽的总流程/);
    assert.doesNotMatch(conceptImagePrompt(prompt), /贯穿全宽的总流程/);
    store.studio.draft(project, { ...store.studio.get(project).draft, conceptLayout: '' });
    assert.equal(store.studio.get(project).draft.conceptLayout, undefined);
  } finally { store.close(); }
});

test('历史作品只迁移一次，项目草稿、版本和归档在重启后保留', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sparkseed-projects-'));
  const database = join(directory, 'ideas.sqlite');
  let store = openStore(database);
  try {
    const legacy = { id: randomUUID(), title: '旧图片', type: 'image', data: 'data:image/png;base64,AA==' };
    store.set('studio:artifact:' + legacy.id, legacy);
    store.set('studio:last', legacy.id);
    const project = store.studio.create('实验汇报', 'idea-id');
    const draft = { type: 'slides', prompt: '  整理实验结果\n', ideaId: 'idea-id', coverId: '' };
    store.studio.draft(project, draft);
    const result = { id: randomUUID(), title: '实验汇报第一版', type: 'slides', slides: [] };
    store.studio.record(result, project);
    const imported = store.studio.list().find(item => item.title === '历史作品');
    assert.equal(imported.versionCount, 1);
    assert.deepEqual(store.studio.get(imported.id).versions.map(item => ({ ...item })), [
      { id: legacy.id, title: legacy.title, type: 'image', created: null, raster: 1 },
    ]);
    store.studio.rename(project, '阶段汇报');
    store.studio.archive(project, true);
    assert.throws(() => store.studio.draft(project, draft), /无法编辑/);
    assert.throws(() => store.studio.record({ ...result, id: randomUUID() }, project), /无法保存/);
    assert.equal(store.setting('studio:last'), result.id);
    store.close();
    store = openStore(database);
    assert.equal(store.studio.list().length, 2);
    const reopened = store.studio.get(project);
    assert.equal(reopened.title, '阶段汇报');
    assert.equal(reopened.archived, 1);
    assert.deepEqual(reopened.draft, draft);
    assert.deepEqual(reopened.versions.map(item => item.id), [result.id]);
    assert.deepEqual(store.setting('studio:artifact:' + legacy.id), legacy);
    store.studio.archive(project, false);
    store.studio.record({ ...result, id: randomUUID(), title: '第二版' }, project);
    assert.deepEqual(store.studio.get(project).versions.map(item => item.title), ['第二版', result.title]);
  } finally {
    store.close();
    await rm(database, { force: true });
    await rmdir(directory);
  }
});

test('删除图文项目会清理独有版本，保留讨论附件与其他项目封面', () => {
  const store = openStore(':memory:');
  try {
    const source = store.studio.create('待删除');
    const destination = store.studio.create('另一个项目');
    const result = () => ({ id: randomUUID(), title: '作品', type: 'image', data: 'data:image/png;base64,AA==' });
    const attachment = result();
    const cover = result();
    const unused = result();
    const remaining = result();
    store.studio.record(remaining, destination);
    for (const item of [attachment, cover, unused]) store.studio.record(item, source);
    store.create({ body: '讨论', excerpt: '', paper: '', page: '', artifact: { id: attachment.id } });
    store.studio.draft(destination, { type: 'slides', coverId: cover.id });
    store.studio.remove(source);
    assert.deepEqual(store.studio.list().map(project => project.id), [destination]);
    for (const item of [attachment, cover]) assert.deepEqual(store.setting('studio:artifact:' + item.id), item);
    assert.equal(store.setting('studio:artifact:' + unused.id), undefined);
    assert.equal(store.setting('studio:last'), remaining.id);
  } finally { store.close(); }
});
