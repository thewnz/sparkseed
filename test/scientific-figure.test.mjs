import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIGURE_EXAMPLES, FIGURE_TYPES, normalizeFigureDraft, planFigure } from '../desktop/scientific-figure.mjs';
import { normalizeFlowSteps } from '../desktop/figure-workflow.mjs';
import { inspectCompositeStructure, normalizeCompositeFlow, normalizeFlowCritique, renderCompositeFlow } from '../desktop/composite-flow.mjs';
import { layoutCompositeStage, wrapFlowNodeLabel } from '../desktop/flow-layout.mjs';
import { validateModelSvg } from '../desktop/model-figure.mjs';
import { preservesFlowContent } from '../desktop/flow-design.mjs';
import { applyFlowReferenceDefaults, getFlowReferenceProfile } from '../desktop/flow-reference-gallery.mjs';
import { extractArticleFigures, normalizeFlowComposition } from '../desktop/flow-style.mjs';
import JSZip from 'jszip';

test('全图构图保留不等宽模块并拒绝越界或相互覆盖的区域', () => {
  const core = { label: 'Calibration', stageIndices: [1], x: 25, y: 10, width: 70, height: 80, focus: 'Decision loop' };
  const input = { label: 'Inputs', stageIndices: [0], x: 2, y: 20, width: 20, height: 30, focus: 'Time series' };
  const plan = { aspect: 'Wide', readingOrder: 'Inputs to calibration', zones: [input, core] };
  assert.deepEqual(normalizeFlowComposition(plan, 2), plan);
  assert.throws(() => normalizeFlowComposition({ ...plan, zones: [input, { ...core, x: 15 }] }, 2), /全图构图/);
  assert.throws(() => normalizeFlowComposition({ ...plan, zones: [input, { ...core, width: 80 }] }, 2), /全图构图/);
  assert.throws(() => normalizeFlowComposition({ ...plan, zones: [input] }, 2), /全图构图/);
});

test('论文插图提取请求内嵌图并保留出处', async () => {
  const zip = new JSZip();
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  zip.file('figures/fig1.png', png);
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  let requested;
  const request = async url => {
    requested = url;
    return new Response(bytes, { status: 200 });
  };
  const xml = '<fig id="F1"><label>Fig 1</label><caption><p>Study workflow</p></caption><graphic xlink:href="fig1"/></fig>';
  const figures = await extractArticleFigures(xml, { pmcid: 'PMC123', title: 'Example', url: 'https://europepmc.org/articles/PMC123' },
    new AbortController().signal, request);
  assert.equal(requested.searchParams.get('includeInlineImage'), 'yes');
  assert.equal(figures.length, 1);
  assert.equal(figures[0].url, 'https://europepmc.org/articles/PMC123#F1');
  assert.deepEqual(figures[0].bytes, png);
});

test('补充材料 ZIP 支持 webp 与 gif 内嵌图并识别真实 MIME', async () => {
  const zip = new JSZip();
  const webp = Buffer.from('52494646000000005745425056503820', 'hex');
  const gif = Buffer.from('4749463839610100010000003b', 'hex');
  zip.file('figures/fig1.webp', webp);
  zip.file('figures/fig2.gif', gif);
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const request = async () => new Response(bytes, { status: 200 });
  const xml = '<fig id="F1"><caption><p>Study workflow</p></caption><graphic xlink:href="fig1.webp"/></fig>'
    + '<fig id="F2"><caption><p>Analysis pipeline</p></caption><graphic xlink:href="fig2.gif"/></fig>';
  const figures = await extractArticleFigures(xml, { pmcid: 'PMC123', title: 'Example', url: 'https://europepmc.org/articles/PMC123' },
    new AbortController().signal, request);
  assert.deepEqual(figures.map(figure => [figure.mime, figure.bytes.length]),
    [['image/webp', webp.length], ['image/gif', gif.length]]);
});

test('补充材料 ZIP 损坏时返回空列表而不阻断正文读取', async () => {
  const request = async () => new Response(Buffer.from('not a zip'), { status: 200 });
  const xml = '<fig id="F1"><caption><p>Study workflow</p></caption><graphic xlink:href="fig1.png"/></fig>';
  const figures = await extractArticleFigures(xml, { pmcid: 'PMC123', title: 'Example', url: 'https://europepmc.org/articles/PMC123' },
    new AbortController().signal, request);
  assert.deepEqual(figures, []);
});

test('补充材料请求遇到网络错误后重试一次', async () => {
  const zip = new JSZip();
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  zip.file('figures/fig1.png', png);
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  let calls = 0;
  const request = async () => {
    calls++;
    if (calls === 1) throw new TypeError('fetch failed');
    return new Response(bytes, { status: 200 });
  };
  const xml = '<fig id="F1"><caption><p>Study workflow</p></caption><graphic xlink:href="fig1.png"/></fig>';
  const figures = await extractArticleFigures(xml, { pmcid: 'PMC123', title: 'Example', url: 'https://europepmc.org/articles/PMC123' },
    new AbortController().signal, request);
  assert.equal(calls, 2);
  assert.deepEqual(figures[0].bytes, png);
});

test('已规划的硬性版式参数优先，参考图库补足缺失字段', () => {
  const profile = getFlowReferenceProfile('overview-detail');
  const design = { layout: 'stacked', frame: 'open', leader: 'none' };
  assert.deepEqual(applyFlowReferenceDefaults(design, profile, { useDefaults: false }), {
    ...design, referenceProfileId: profile.id,
  });
  const merged = applyFlowReferenceDefaults(design, profile);
  assert.equal(merged.layout, 'stacked');
  assert.equal(merged.frame, 'open');
  assert.equal(merged.leader, 'none');
  assert.equal(merged.nodeStyle, 'glyph');
});

test('自动修订不能交换同名节点的边或改变公式', () => {
  const stage = { title: 'Input', columns: [[{ label: 'Sample' }, { label: 'Sample' }],
    [{ label: 'Difference', shape: 'formula', expression: '1/R_i − 1/R_ref' }]], links: [[[0, 0], [1, 0]]] };
  const normal = stage => normalizeCompositeFlow({ stages: [stage, { title: 'Output', columns: [[{ label: 'Result' }]], links: [] }] });
  const before = normal(stage);
  assert.equal(preservesFlowContent(before, normal({ ...stage, links: [[[0, 1], [1, 0]]] })), false);
  const modified = structuredClone(before);
  modified[0].columns[1][0].expression = '1/R_i';
  assert.equal(preservesFlowContent(before, modified), false);
  const svg = validateModelSvg(renderCompositeFlow(before, normalizeFigureDraft({ kind: 'diagram' })));
  assert.match(svg, /baseline-shift="sub" font-size="12">ref<\/tspan>/);
});

test('较长的科研术语及模型换行仍可合成可编辑 SVG', () => {
  const longLabel = 'Candidate and Reference Wavelength\nCombinations for Inverse Difference';
  const stages = normalizeCompositeFlow({ stages: [
    { title: 'Feature construction', columns: [[{ label: longLabel }]], links: [] },
    { title: 'Selection', columns: [[{ label: 'Optimal Wavelength Set' }]], links: [] },
  ] });
  assert.equal(stages[0].columns[0][0].label, longLabel.replace('\n', ' '));
  assert.match(validateModelSvg(renderCompositeFlow(stages, normalizeFigureDraft({ kind: 'diagram' }))), /<text\b/);
});

test('分阶段流程图使用分层布局，保留分支、图形、边标签和阶段颜色', () => {
  const stage = { title: '质检', columns: [[{ label: '<采集>', shape: 'stack' }],
    [{ label: '通过', shape: 'matrix' }, { label: '复检', shape: 'decision' }]],
  links: [[[0, 0], [1, 0], '通过'], [[0, 0], [1, 1], '复核'], [[1, 1], [0, 0]]] };
  const plan = normalizeCompositeFlow({ stages: [stage, { ...stage, title: '汇总' }] });
  const svg = validateModelSvg(renderCompositeFlow(plan, normalizeFigureDraft({ kind: 'diagram', theme: 'color' })));
  assert.match(svg, /流程总览/);
  assert.match(svg, /&lt;采集&gt;/);
  assert.match(svg, /#a7445b/);
  assert.match(svg, /#39714e/);
  assert.match(svg, />通过<\/text>/);
  assert.match(svg, /stroke-opacity="\.72"/);
  assert.equal((svg.match(/marker-end="url\(#flow-arrow(?:-\d+)?\)"/g) || []).length, 7);
  assert.throws(() => normalizeCompositeFlow({ stages: [stage, { ...stage, links: [[[0, 0], [2, 0]]] }] }), /版式无效/);
});

test('流程布局按模型列固定阅读方向，由图算法排列节点并输出可用连线', () => {
  const stage = normalizeCompositeFlow({ stages: [
    { title: '分支处理', columns: [[{ label: '样品采集', shape: 'stack' }, { label: '仪器校准', shape: 'process' }],
      [{ label: '质量判定', shape: 'decision' }], [{ label: '计算指标', shape: 'model' }, { label: '保存结果', shape: 'vector' }]],
    links: [[[0, 0], [0, 1], '校准后'], [[0, 0], [1, 0]], [[0, 1], [1, 0]], [[1, 0], [2, 0]],
      [[1, 0], [2, 1]], [[2, 1], [0, 0], '重新采集']] },
    { title: '输出', columns: [[{ label: '图表', shape: 'vector' }]], links: [] },
  ] })[0];
  const layout = layoutCompositeStage(stage);
  const centers = layout.nodes.map(column => column[0].x);
  assert.ok(centers[0] < centers[1] && centers[1] < centers[2]);
  assert.ok(layout.links.filter(link => !link.feedback && !link.sameRank).every(link => link.points.length >= 2));
  assert.equal(layout.links.filter(link => link.feedback).length, 1);
  assert.equal(layout.links.filter(link => link.sameRank).length, 1);
  assert.ok(layout.width > centers.at(-1));
  assert.ok(layout.height > 100);
  assert.ok(wrapFlowNodeLabel('A very long scientific processing label', 72).length > 1);
});

test('科研流程图保留原始公式、输入和输出，并在词间换行', () => {
  const stages = [
    { title: 'Primary reduction', color: 'rose', overview: { input: 'Raw spectra', inputShape: 'spectrum' },
      columns: [[{ label: 'Bootstrap PLSR', shape: 'model' }], [{ label: 'Wavelength stability ranking', shape: 'matrix' }]],
      links: [[[0, 0], [1, 0]]] },
    { title: 'Final reduction', color: 'teal', overview: { output: 'Optimal set', outputShape: 'vector' },
      columns: [[{ label: 'Inverse difference', shape: 'formula', expression: '1/Rᵢ − 1/Rref' }]], links: [] },
  ];
  const plan = normalizeCompositeFlow({ stages });
  assert.deepEqual(normalizeCompositeFlow({ stages: plan }), plan);
  const svg = validateModelSvg(renderCompositeFlow(plan, normalizeFigureDraft({ kind: 'diagram', width: 720 })));
  assert.match(svg, />Wavelength(?: stability)?<\/text>/);
  assert.match(svg, /<title>1\/Rᵢ − 1\/Rref · Inverse difference<\/title>/);
  const labels = [...svg.matchAll(/<text\b[^>]*>([^<]+)<\/text>/g)].map(match => match[1]).join(' ');
  assert.match(labels, /Raw spectra/);
  assert.match(labels, /Optimal set/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('流程结构检查报告孤立节点，视觉评审过滤无效反馈', () => {
  const plan = normalizeCompositeFlow({ stages: [
    { title: '采集', columns: [[{ label: '样本' }, { label: '设备' }], [{ label: '信号' }]], links: [[[0, 0], [1, 0]]] },
    { title: '输出', columns: [[{ label: '结果' }]], links: [] },
  ] });
  const report = inspectCompositeStructure(plan);
  assert.equal(report.nodes, 4);
  assert.deepEqual(report.isolated, [{ stage: '采集', stageIndex: 0, columnIndex: 0, rowIndex: 1 }]);
  assert.equal(normalizeFlowCritique({ verdict: 'revise', issues: [{ severity: 'major',
    location: '采集', problem: '节点拥挤', fix: '分组' }, { severity: 'unknown', problem: '忽略' }] }).verdict, 'revise');
  assert.equal(normalizeFlowCritique({ verdict: 'revise', issues: [{ severity: 'minor', problem: '颜色可调' }] }).verdict, 'pass');
});

test('AI 拆分步骤可逐行绘制，拒绝不完整或越界的模型结果', () => {
  const steps = normalizeFlowSteps({ steps: ['  采集样本  ', '若通过质检则汇总', '保留记录'] });
  assert.deepEqual(steps, ['采集样本', '若通过质检则汇总', '保留记录']);
  assert.match(planFigure({ kind: 'diagram', data: steps.join('\n') }).svg, /若通过质检则汇总/);
  for (const invalid of [null, [], ['单个步骤'], Array(13).fill('步骤'), ['步骤', '含有\n换行'],
    ['步骤', '长'.repeat(101)], ['步骤', 1], ['步骤', ' ']]) {
    assert.throws(() => normalizeFlowSteps({ steps: invalid }), /步骤/);
  }
});

test('科研绘图模板都可离线生成，可按选定尺寸预览和导出', () => {
  assert.deepEqual(Object.keys(FIGURE_EXAMPLES), Object.keys(FIGURE_TYPES));
  for (const [kind, data] of Object.entries(FIGURE_EXAMPLES)) {
    const first = planFigure({ kind, data, width: '720', theme: 'mono' });
    assert.match(first.svg, /^<svg[^>]+width="720" height="\d+"/);
    assert.match(first.svg, /<title id="figure-title">/);
    assert.doesNotMatch(first.svg, /NaN|Infinity/);
    assert.equal(first.svg, planFigure({ kind, data, width: 720, theme: 'mono' }).svg);
  }
});

test('带引号的 CSV 和粘贴的 TSV 保留数据，折线遇缺失值断开且保留零', () => {
  const data = '\ufeff"训练,步数"\t"准确率\n（%）"\r\n1\t0\r\n2\t\r\n5\t1e-1\r\n';
  assert.equal(normalizeFigureDraft({ data }).data, data);
  const result = planFigure({ kind: 'line', data });
  assert.match(result.svg, /训练,步数/);
  assert.match(result.svg, /1 · 准确率\n（%） 0/);
  assert.match(result.svg, /5 · 准确率\n（%） 0\.1/);
  assert.match(result.svg, /<path d="M[\d.]+ [\d.]+ M[\d.]+ [\d.]+ " fill="none"/);
  assert.match(result.warnings[0], /1 个缺失值.*断开/);
  const csv = planFigure({ kind: 'bar', data: '类别,"数值,均值"\n"组 ""A""",-2\n组 B,0\n' });
  assert.match(csv.svg, /组 &quot;A&quot; · 数值,均值 -2/);
  assert.match(csv.svg, /组 B · 数值,均值 0/);
});

test('按实际间距绘制数值轴，拒绝无法解释的横轴和错列', () => {
  const chart = planFigure({ kind: 'line', data: '时间,值\n0,1\n2,2\n8,3' });
  const [first, second, third] = [...chart.svg.matchAll(/<circle cx="([\d.]+)"/g)].map(match => Number(match[1]));
  assert.ok(Math.abs((third - first) / (second - first) - 4) < 1e-8);
  assert.throws(() => planFigure({ kind: 'line', data: '时间,值\n2,1\n1,2' }), /严格递增/);
  assert.throws(() => planFigure({ kind: 'scatter', data: '组,值\nA,1' }), /需要数字/);
  assert.throws(() => planFigure({ kind: 'line', data: '时间,参考,值\n1,2' }), /表头有 3 列/);
  assert.throws(() => planFigure({ kind: 'line', data: '时间,值\n1,1e-999' }), /超出绘图数值范围/);
});

test('热图标出缺失值并转义文字，流程图同样不会插入可执行标签', () => {
  const input = '<script>alert(1)</script>';
  const heatmap = planFigure({ kind: 'heatmap', data: '实验,' + input + ',第二列\nA,0,\nB,1,3' });
  assert.match(heatmap.svg, /A · 第二列 缺失/);
  assert.match(heatmap.svg, /A · &lt;script&gt;alert\(1\)&lt;\/script&gt; 0/);
  assert.doesNotMatch(heatmap.svg, /<script>/);
  assert.match(heatmap.warnings[0], /斜线/);
  const diagram = planFigure({ kind: 'diagram', data: input + '\n下一步', caption: '<img onerror=x>' });
  assert.match(diagram.svg, /&lt;script&gt;/);
  assert.match(diagram.svg, /&lt;img onerror=x&gt;/);
  assert.doesNotMatch(diagram.svg, /<(script|img)/);
});
