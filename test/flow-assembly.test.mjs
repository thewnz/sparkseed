import assert from 'node:assert/strict';
import test from 'node:test';
import { openStore } from '../desktop/store.mjs';
import { createFlowAssemblySession } from '../desktop/flow-assembly-session.mjs';

const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQn0AAAAASUVORK5CYII=', 'base64');
const png = 'data:image/png;base64,' + pngBytes.toString('base64');
const quote = 'Rainfall time series are encoded before the model estimates discharge.';
const evidence = { id: 'paper-1', page: null, section: '', quote };
const paper = { id: 'paper-1', title: 'Rainfall runoff encoding', abstract: quote, url: 'https://example.org/paper',
  figures: [{ paper: 'Rainfall runoff encoding', label: 'Figure 1', caption: 'Rainfall workflow',
    mime: 'image/png', bytes: pngBytes }] };
const blockSvg = label => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160" viewBox="0 0 200 160"><text x="20" y="60">${label}</text></svg>`;

test('流程图依次确认、审核和拼接，暂存素材及布局修改不会覆盖已审核素材', async () => {
  const store = openStore(':memory:');
  try {
    const projectId = store.studio.create('降雨径流', '', { kind: 'diagram' });
    const draft = { type: 'figure', pictureType: 'flow', figure: { kind: 'diagram', title: '降雨径流' },
      flowPrompt: '先编码降雨序列，再估计径流' };
    store.studio.draft(projectId, draft);
    let searches = 0;
    let refuseScience = false;
    let overlaps = 0;
    const requests = [];
    const session = createFlowAssemblySession({
      studio: store.studio, changed() {}, canVision: true, inspect: async () => ({ clipped: 0, overlaps }), cropFigure: () => png,
      rasterize: async svg => {
        assert.match(Buffer.from(svg.split(',')[1], 'base64').toString(), /编码降雨/);
        return { mime: 'image/png', bytes: pngBytes };
      },
      search: async () => { searches++; return { papers: [paper] }; },
      runModel: (_id, operation) => operation({
        signal: new AbortController().signal,
        ask: async (instructions, input, images = [], role) => {
          requests.push(input);
          if (instructions.startsWith('科研图独立复核')) {
            assert.equal(role, 'lead');
            return refuseScience ? { valid: false, issues: ['方向与原文矛盾'] } : { valid: true, issues: [] };
          }
          if (instructions.includes('空框架')) return {
            blocks: [{ label: '编码降雨', query: 'rainfall encoding' }, { label: '估计径流', query: 'rainfall runoff' }],
            edges: [{ from: 0, to: 1, label: '序列' }, { from: 1, to: 0, label: '回路' }],
          };
          if (input.kind === 'paper') {
            assert.equal(images.length, 1);
            return { referenceIndex: 0, crop: { x: 10, y: 10, width: 80, height: 80 }, evidence };
          }
          if (input.kind === 'agent') return { svg: blockSvg(input.revision ? 'Updated' : 'Original'),
            evidence: input.revision ? { ...evidence, quote: 'This quotation does not match the source.' } : evidence };
          if (instructions.startsWith('只为当前')) return { evidence };
          assert.equal(images.length, 2);
          return { direction: input.revision ? 'TB' : 'LR', rankGap: 70, nodeGap: 50,
            sizes: [{ width: 280, height: 240 }, { width: 340, height: 260 }], rationale: '参考论文分层排列', referenceIndex: 0 };
        },
      }),
    });
    const act = (operation, options) => session.action(projectId, { operation, ...options });
    let { flow } = await act('framework');
    const flowId = flow.id;
    const run = (operation, options) => act(operation, { flowId, ...options });
    const persisted = () => store.studio.get(projectId).draft.flowAssembly;
    assert.equal(searches, 0);
    assert.equal(flow.edges.length, 2);
    assert.deepEqual(persisted().materials, [null, null]);
    await assert.rejects(run('material', { index: 0, kind: 'agent' }), /先确认框架/);
    await run('confirm');
    await assert.rejects(run('material', { index: 1, kind: 'paper' }), /按框架顺序/);
    overlaps = 1;
    ({ flow } = await run('material', { index: 0, kind: 'agent' }));
    assert.match(flow.candidate.warnings.join(' '), /文字重叠/);
    await run('discard');
    overlaps = 0;
    refuseScience = true;
    ({ flow } = await run('material', { index: 0, kind: 'agent' }));
    assert.equal(flow.candidate.scientificReview, false);
    assert.match(flow.candidate.scientificReviewIssues.join(' '), /方向与原文矛盾/);
    await run('discard');
    refuseScience = false;
    ({ flow } = await run('material', { index: 0, kind: 'agent' }));
    const staleId = flow.candidate.id;
    assert.equal(persisted().materials[0], null);
    const resumed = createFlowAssemblySession({ studio: store.studio });
    assert.equal((await resumed.action(projectId, { operation: 'read' })).flow.candidate.id, staleId);
    ({ flow } = await run('material', { index: 0, kind: 'agent', revision: '加大标签' }));
    assert.match(requests.find(input => input.previous)?.previous.svg, /Original/);
    await assert.rejects(run('approve', { index: 0, candidateId: staleId }), /预览已失效/);
    await run('approve', { index: 0, candidateId: flow.candidate.id });
    const first = persisted().materials[0];
    assert.match(Buffer.from(first.data.split(',')[1], 'base64').toString(), /Updated/);
    await assert.rejects(run('layout'), /全部素材/);
    ({ flow } = await run('material', { index: 1, kind: 'paper' }));
    assert.equal(flow.candidate.source.label, 'Figure 1');
    assert.equal(persisted().materials[1], null);
    await run('approve', { index: 1, candidateId: flow.candidate.id });
    store.studio.draft(projectId, { ...draft, flowAssembly: { replaced: true } });
    assert.deepEqual(persisted().materials[0], first);
    ({ flow } = await run('layout'));
    assert.equal(flow.layout.direction, 'LR');
    const originalLayout = flow.layout.id;
    ({ flow } = await run('layout', { method: 'local', archetype: 'vertical' }));
    assert.equal(flow.layout.composition, undefined);
    assert.match(flow.layout.rationale, /保留所有分支/);
    ({ flow } = await run('layout', { revision: '改为纵向' }));
    assert.equal(flow.layout.direction, 'TB');
    assert.deepEqual(persisted().materials[0], first);
    assert.equal(store.studio.get(projectId).versions.length, 0);
    await assert.rejects(run('save', { layoutId: originalLayout }), /失效/);
    refuseScience = true;
    const warned = await run('save', { layoutId: flow.layout.id });
    assert.equal(warned.artifact.figure.scientificReview.valid, false);
    assert.match(warned.artifact.figure.scientificReview.issues.join(' '), /方向与原文矛盾/);
    assert.equal(store.studio.get(projectId).versions.length, 1);
    refuseScience = false;
    const saved = await run('save', { layoutId: flow.layout.id });
    const { artifact } = saved;
    assert.equal(saved.flow.layout.saved, true);
    assert.match(artifact.data, /^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(artifact.data.split(',')[1], 'base64').toString();
    assert.match(svg, /<text x="20" y="60"[^>]*>Updated<\/text>/);
    assert.match(svg, /<image.*data:image\/png;base64,/);
    assert.equal(artifact.figure.assembly.materials[1].citation.quote, quote);
    await run('save', { layoutId: flow.layout.id });
    assert.equal(store.studio.get(projectId).versions.length, 1);
    ({ flow } = await run('material', { index: 1, kind: 'paper', revision: '调整截取范围' }));
    assert.equal(persisted().layout.id, artifact.id);
    await run('discard');
    assert.equal((await act('read')).flow.layout.id, artifact.id);
  } finally {
    store.close();
  }
});

test('带图布局返回非法参数时退回纯文本，碰撞时加距试排且可以保存', async () => {
  const store = openStore(':memory:');
  try {
    const projectId = store.studio.create('降雨径流', '', { kind: 'diagram' });
    store.studio.draft(projectId, { type: 'figure', pictureType: 'flow',
      figure: { kind: 'diagram', title: '降雨径流' }, flowPrompt: '先编码降雨序列，再估计径流' });
    let failNextLayout = false;
    const session = createFlowAssemblySession({
      studio: store.studio, changed() {}, inspect: async () => {
        if (!failNextLayout) return { clipped: 0 };
        failNextLayout = false;
        return { overlaps: 1 };
      }, cropFigure: () => png,
      rasterize: async () => ({ mime: 'image/png', bytes: pngBytes }),
      search: async () => ({ papers: [paper] }),
      runModel: (_id, operation) => operation({
        signal: new AbortController().signal,
        ask: async (instructions, input, images = []) => {
          if (instructions.startsWith('科研图独立复核')) return { valid: true, issues: [] };
          if (instructions.includes('空框架')) return {
            blocks: [{ label: '编码降雨', query: 'rainfall encoding' }, { label: '估计径流', query: 'rainfall runoff' }],
            edges: [{ from: 0, to: 1 }] };
          if (input.kind === 'paper') return { referenceIndex: 0, crop: { x: 10, y: 10, width: 80, height: 80 }, evidence };
          if (input.kind === 'agent') return { svg: blockSvg('Original'), evidence };
          if (images.length) return { direction: 'invalid' };
          assert.ok(instructions.includes('没有图像输入'));
          assert.equal(input.references.length, 1);
          return { direction: 'TB', rankGap: 70, nodeGap: 50,
            sizes: [{ width: 280, height: 240 }, { width: 340, height: 260 }],
            rationale: '依参考图说明纵向排列', referenceIndex: 0 };
        },
      }),
    });
    const act = (operation, options) => session.action(projectId, { operation, ...options });
    const { flow: framework } = await act('framework');
    await act('confirm', { flowId: framework.id });
    const first = await act('material', { flowId: framework.id, index: 0, kind: 'agent' });
    await act('approve', { flowId: framework.id, index: 0, candidateId: first.flow.candidate.id });
    const second = await act('material', { flowId: framework.id, index: 1, kind: 'paper' });
    await act('approve', { flowId: framework.id, index: 1, candidateId: second.flow.candidate.id });
    failNextLayout = true;
    const { flow } = await act('layout', { flowId: framework.id });
    assert.equal(flow.layout.direction, 'TB');
    assert.ok(flow.layout.rankGap >= 105);
    assert.match(flow.layout.rationale, /纵向排列/);
    const { artifact } = await act('save', { flowId: framework.id, layoutId: flow.layout.id });
    assert.equal(artifact.figure.assembly.blocks.length, 2);
  } finally {
    store.close();
  }
});

test('没有论文参考图时使用纯文本布局，不放宽逐块引文门控', async () => {
  const store = openStore(':memory:');
  try {
    const projectId = store.studio.create('无参考图流程', '', { kind: 'diagram' });
    store.studio.draft(projectId, { type: 'figure', pictureType: 'flow',
      figure: { kind: 'diagram', title: '无参考图流程' }, flowPrompt: '先编码降雨序列，再估计径流' });
    const session = createFlowAssemblySession({
      studio: store.studio, changed() {}, inspect: async () => ({ clipped: 0 }), cropFigure: () => png,
      rasterize: async () => { throw new Error('纯文本排版不需要预览栅格化'); },
      search: async () => ({ papers: [{ ...paper, figures: [] }] }),
      runModel: (_id, operation) => operation({
        signal: new AbortController().signal,
        ask: async (instructions, input, images = []) => {
          if (instructions.startsWith('科研图独立复核')) return { valid: true, issues: [] };
          if (instructions.includes('空框架')) return {
            blocks: [{ label: '编码降雨', query: 'rainfall encoding' }, { label: '估计径流', query: 'rainfall runoff' }],
            edges: [{ from: 0, to: 1 }] };
          if (input.kind === 'agent') {
            if (!input.previous) return { svg: '<svg style="color:red"/>', evidence };
            assert.match(instructions, /上次 SVG 缺失或格式无效/);
            return { svg: blockSvg('Repaired'), evidence };
          }
          assert.ok(instructions.includes('没有图像输入'));
          assert.equal(images.length, 0);
          assert.deepEqual(input.references, []);
          return { direction: 'LR', rankGap: 70, nodeGap: 50,
            sizes: [{ width: 280, height: 240 }, { width: 340, height: 260 }], rationale: '按期刊视觉契约排列' };
        },
      }),
    });
    const act = (operation, options) => session.action(projectId, { operation, ...options });
    const { flow: framework } = await act('framework');
    await act('confirm', { flowId: framework.id });
    for (const index of [0, 1]) {
      const generated = await act('material', { flowId: framework.id, index, kind: 'agent' });
      assert.match(Buffer.from(generated.flow.candidate.data.split(',')[1], 'base64').toString(), /Repaired/);
      await act('approve', { flowId: framework.id, index, candidateId: generated.flow.candidate.id });
    }
    const { flow } = await act('layout', { flowId: framework.id });
    assert.equal(flow.layout.direction, 'LR');
    const { artifact } = await act('save', { flowId: framework.id, layoutId: flow.layout.id });
    assert.deepEqual(artifact.figure.designBrief.references, []);
    assert.equal(artifact.figure.assembly.materials[0].citation.quote, quote);
  } finally {
    store.close();
  }
});

test('总览+详图构图使用白底细线面板和细引线，不使用渐变装饰', async () => {
  const store = openStore(':memory:');
  try {
    const projectId = store.studio.create('降雨径流', '', { kind: 'diagram' });
    store.studio.draft(projectId, { type: 'figure', pictureType: 'flow',
      figure: { kind: 'diagram', title: '降雨径流' }, flowPrompt: '先编码降雨序列，再估计径流' });
    const session = createFlowAssemblySession({
      studio: store.studio, changed() {}, inspect: async () => ({ clipped: 0 }), cropFigure: () => png,
      rasterize: async () => ({ mime: 'image/png', bytes: pngBytes }),
      search: async () => ({ papers: [paper] }),
      runModel: (_id, operation) => operation({
        signal: new AbortController().signal,
        ask: async (instructions, input, images = []) => {
          if (instructions.startsWith('科研图独立复核')) return { valid: true, issues: [] };
          if (instructions.includes('空框架')) return {
            blocks: [{ label: '编码降雨', query: 'rainfall encoding' }, { label: '估计径流', query: 'rainfall runoff' }],
            edges: [{ from: 0, to: 1 }] };
          if (input.kind === 'paper') return { referenceIndex: 0, crop: { x: 10, y: 10, width: 80, height: 80 }, evidence };
          if (input.kind === 'agent') return { svg: blockSvg('Original'), evidence };
          return { direction: 'TB', rankGap: 70, nodeGap: 50,
            sizes: [{ width: 280, height: 240 }, { width: 340, height: 260 }],
            rationale: '总览式构图', referenceIndex: 0, composition: 'overviewDetail', captions: ['编码降雨序列', '估计径流'] };
        },
      }),
    });
    const act = (operation, options) => session.action(projectId, { operation, ...options });
    const { flow: framework } = await act('framework');
    await act('confirm', { flowId: framework.id });
    const first = await act('material', { flowId: framework.id, index: 0, kind: 'agent' });
    await act('approve', { flowId: framework.id, index: 0, candidateId: first.flow.candidate.id });
    const second = await act('material', { flowId: framework.id, index: 1, kind: 'paper' });
    await act('approve', { flowId: framework.id, index: 1, candidateId: second.flow.candidate.id });
    const { flow } = await act('layout', { flowId: framework.id });
    assert.equal(flow.layout.composition, 'overviewDetail');
    const { artifact } = await act('save', { flowId: framework.id, layoutId: flow.layout.id });
    const svg = Buffer.from(artifact.data.split(',')[1], 'base64').toString();
    assert.match(svg, /编码降雨/);
    assert.doesNotMatch(svg, /linearGradient|stroke-dasharray="9 6"|<circle|rx="2"|stroke="#a6b0b8"/);
    assert.match(svg, /font-size="12" font-weight="600" fill="#1a1a1a">\(a\)<\/text>/);
    assert.match(svg, /font-size="12" font-weight="600" fill="#1a1a1a">\(b\)<\/text>/);
    assert.match(svg, /font-size="12" fill="#4f555b"/);
    assert.match(svg, /markerWidth="5" markerHeight="5"/);
    assert.match(svg, /<image[^>]*preserveAspectRatio="xMidYMid meet"/);
    assert.ok(svg.length > 1000);
  } finally {
    store.close();
  }
});

test('风格问答与评审规范约束驱动生成指令和渲染配色', async () => {
  const { normalizeFlowStyle, flowStyleDirectives, flowDefaultComposition } = await import('../desktop/flow-style-brief.mjs');
  const { flowReviewConstraintText, normalizeFlowReviewRules, flowReviewRules } = await import('../desktop/flow-review-rules.mjs');
  assert.deepEqual(normalizeFlowStyle({ composition: 0, palette: 1, labels: 9, density: 'x' }),
    { composition: 0, palette: 1 });
  assert.match(flowStyleDirectives({ labels: 1 }), /中文短术语/);
  assert.equal(flowDefaultComposition({ composition: 0 }), 'overviewDetail');
  assert.equal(flowDefaultComposition({}), '');
  const ids = normalizeFlowReviewRules(['terminology', 'axes', 'bad']);
  assert.deepEqual(ids, ['terminology', 'axes']);
  assert.match(flowReviewConstraintText(ids), /Performance evaluation/);
  assert.equal(flowReviewConstraintText([]), '');
  assert.ok(flowReviewRules.length >= 6);
});

test('总览式构图：网格箭头、自适应底注与自动裁边', async () => {
  const { cropSvgBlank } = await import('../desktop/flow-crop.mjs');
  const { renderAssembly } = await import('../desktop/flow-assembly.mjs');
  const svgData = renderAssembly({ id: 'f', blocks: [
      { label: '预测径流 LSTM 序列到序列模型输出流量', query: 'a' },
      { label: '评估阶段预测与实测对比', query: 'b' }],
      edges: [{ from: 0, to: 1, label: '预测流量' }],
      materials: [
        { id: 'm1', index: 0, kind: 'agent', data: 'data:image/svg+xml;base64,' + Buffer.from(blockSvg('Pred')).toString('base64'), summary: '', citation: {} },
        { id: 'm2', index: 1, kind: 'agent', data: 'data:image/svg+xml;base64,' + Buffer.from(blockSvg('Eval')).toString('base64'), summary: '', citation: {} },
      ], confirmed: true },
    { kind: 'diagram', title: '图', data: '', width: 1080, theme: 'color' },
    { composition: 'overviewDetail', direction: 'LR', rankGap: 70, nodeGap: 50,
      sizes: [{ width: 300, height: 240 }, { width: 300, height: 240 }],
      rationale: 'r', referenceIndex: 0, reference: {}, captions: ['编码降雨序列', '预测与实测对比'] });
  const svg = Buffer.from(svgData.split(',')[1], 'base64').toString();
  assert.match(svg, /viewBox="0 0 (\d+) (\d+)"/);
  const width = Number(svg.match(/<svg[^>]*width="(\d+)"/)[1]);
  assert.ok(width >= 1120, '双列构图画布加宽');
  assert.match(svg, /stroke-width="1\.2"[^>]*marker-end="url\(#assembly-arrow\)"/);
  assert.ok((svg.match(/font-size="10\.5" fill="#4f555b"/g) || []).length >= 2, '两行底注');
  // 裁边：伪栅格 40x40，仅左上 10x10 有墨迹
  const fake = Buffer.alloc(40 * 40 * 4, 255);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const i = (y * 40 + x) * 4;
    fake[i] = 0; fake[i + 1] = 0; fake[i + 2] = 0;
  }
  const cropped = await cropSvgBlank(svgData,
    async () => ({ mime: 'image/png', bytes: Buffer.alloc(0) }),
    () => ({ w: 40, h: 40, bitmap: fake }), { maxAspect: 3.2 });
  const croppedSvg = Buffer.from(cropped.split(',')[1], 'base64').toString();
  const box = croppedSvg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.ok(box[2] < width * 0.6, 'viewBox 裁剪到内容');
  assert.ok(box[0] >= 0 && box[1] >= 0);
  assert.ok(box[2] / box[3] <= 3.2, '裁白后仍保持横向画布比例上限');
  // 缺 rasterize/analyzeImage 时原样返回
  assert.equal(await cropSvgBlank(svgData, null, null), svgData);
});

test('总览式构图按底注实际行数增加面板高度，长说明完整保留', async () => {
  const { renderAssembly } = await import('../desktop/flow-assembly.mjs');
  const render = captions => {
    const data = renderAssembly({ id: 'f', blocks: [
        { label: '阶段一', query: 'a' }, { label: '阶段二', query: 'b' }, { label: '阶段三', query: 'c' }],
      edges: [{ from: 0, to: 1 }, { from: 1, to: 2 }],
      materials: Array.from({ length: 3 }, (_, index) => ({
        id: 'm' + index, index, kind: 'agent',
        data: 'data:image/svg+xml;base64,' + Buffer.from(blockSvg('Stage ' + index)).toString('base64'),
        summary: '', citation: {} })), confirmed: true },
      { kind: 'diagram', title: '图', data: '', width: 1120, theme: 'color' },
      { composition: 'overviewDetail', direction: 'LR', rankGap: 70, nodeGap: 50,
        sizes: Array.from({ length: 3 }, () => ({ width: 300, height: 240 })),
        captions, rationale: 'r', referenceIndex: 0, reference: {} });
    return Buffer.from(data.split(',')[1], 'base64').toString();
  };
  const shortSvg = render(['短说明', '中期说明', '后期说明']);
  const longSvg = render(['长说明'.repeat(20), '中期说明', '后期说明']);
  const height = svg => Number(svg.match(/<svg[^>]*height="(\d+)"/)[1]);
  const width = Number(shortSvg.match(/<svg[^>]*width="(\d+)"/)[1]);
  assert.ok(width / height(shortSvg) <= 3.2, `三列横排宽高比落在期刊样本范围内：${width}/${height(shortSvg)}`);
  assert.ok(height(longSvg) > height(shortSvg), '长底注增加面板及画布高度');
  assert.ok((longSvg.match(/font-size="10\.5" fill="#4f555b"/g) || []).length >= 3,
    '长底注在面板下方完整排版');
  assert.equal((longSvg.match(/长/g) || []).length, 20, '底注文字没有被截断');
});
