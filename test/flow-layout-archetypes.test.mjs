import assert from 'node:assert/strict';
import test from 'node:test';
import { journalLayoutArchetypes, layoutRecipe, normalizeLayoutArchetype, selectLayoutArchetype } from '../desktop/flow-layout-archetypes.mjs';
import { normalizeAssembly, renderAssembly } from '../desktop/flow-assembly.mjs';

const blockSvg = text => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">`
  + `<rect x="20" y="20" width="600" height="320" fill="none" stroke="#c6cbd0" stroke-width="0.9"/>`
  + `<rect x="50" y="80" width="180" height="90" fill="#e8f0f7" stroke="#2f5f8f"/>`
  + `<rect x="270" y="80" width="150" height="150" fill="#f6ebe4" stroke="#a45f32"/>`
  + `<text x="50" y="60" font-size="14" fill="#1a1a1a">${text}</text>`
  + `<text x="270" y="60" font-size="12" fill="#4f555b">data shape</text></svg>`;

const materials = count => Array.from({ length: count }, (_, index) => ({
  id: 'm' + index, index, kind: 'agent',
  data: 'data:image/svg+xml;base64,' + Buffer.from(blockSvg('S' + index)).toString('base64'),
  summary: '', citation: {},
}));

const flow = count => ({
  id: 'f', blocks: Array.from({ length: count }, (_, index) => ({ label: '阶段 ' + (index + 1), query: 'q' })),
  edges: Array.from({ length: count - 1 }, (_, index) => ({ from: index, to: index + 1 })),
  materials: materials(count), confirmed: true,
});

const render = (count, archetype) => {
  const data = renderAssembly(flow(count), { kind: 'diagram', title: '图', data: '', width: 1080, theme: 'color' },
    { composition: 'overviewDetail', direction: 'LR', rankGap: 70, nodeGap: 50,
      sizes: Array.from({ length: count }, () => ({ width: 300, height: 260 })),
      archetype, rationale: 'r', referenceIndex: 0, reference: {}, captions: [] });
  return Buffer.from(data.split(',')[1], 'base64').toString();
};

test('版式枚举与阶段数推荐稳定', () => {
  assert.equal(normalizeLayoutArchetype('GRID'), 'grid');
  assert.equal(normalizeLayoutArchetype('unknown'), '');
  assert.deepEqual(Object.keys(journalLayoutArchetypes), ['grid', 'vertical', 'horizontal', 'single']);
  assert.equal(selectLayoutArchetype(2), 'single');
  assert.equal(selectLayoutArchetype(3), 'horizontal');
  assert.equal(selectLayoutArchetype(4), 'grid');
  assert.equal(selectLayoutArchetype(8), 'grid');
  assert.equal(selectLayoutArchetype(3, '', 'TB'), 'vertical');
  assert.equal(selectLayoutArchetype(4, 'vertical'), 'vertical');
});

test('版式配方按 100 张基准给出列数、画布宽度和面板高度上限', () => {
  assert.equal(layoutRecipe('grid', 4).columns, 2);
  assert.equal(layoutRecipe('grid', 6).columns, 3);
  assert.equal(layoutRecipe('vertical', 4).columns, 1);
  assert.equal(layoutRecipe('horizontal', 3).columns, 3);
  assert.equal(layoutRecipe('single', 2).columns, 2);
  assert.ok(layoutRecipe('vertical', 4).maxBodyHeight <= 360);
  assert.ok(layoutRecipe('grid', 6).baseWidth >= 1120);
});

test('normalizeAssembly 接收 archetype 并拒绝未知值', () => {
  const base = { direction: 'LR', rankGap: 70, nodeGap: 50,
    sizes: [{ width: 300, height: 240 }, { width: 300, height: 240 }],
    rationale: 'ok', composition: 'overviewDetail' };
  assert.equal(normalizeAssembly({ ...base, archetype: 'grid' }, 2, []).archetype, 'grid');
  assert.equal(normalizeAssembly({ ...base, archetype: 'nope' }, 2, []).archetype, undefined);
});

test('纵向分层渲染为单列三行，画布接近方形', () => {
  const svg = render(3, 'vertical');
  assert.match(svg, /\(a\)/);
  assert.match(svg, /\(b\)/);
  assert.match(svg, /\(c\)/);
  const width = Number(svg.match(/<svg[^>]*width="(\d+)"/)[1]);
  const height = Number(svg.match(/<svg[^>]*height="(\d+)"/)[1]);
  const aspect = width / height;
  assert.ok(aspect >= 0.6 && aspect <= 1.1, `纵向分层比例应接近 0.92，实际 ${aspect}`);
  const headers = (svg.match(/height="2[678]"/g) || []).length;
  assert.ok(headers >= 3, '三块面板都有标题带');
  assert.equal((svg.match(/marker-end=/g) || []).length, 2, '纵向版式保留两条阶段箭头');
});

test('块内 rgba 颜色转为十六进制并保留透明度', () => {
  const rgba = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="280">'
    + '<rect x="10" y="10" width="120" height="80" fill="rgba(47,95,143,0.5)"/>'
    + '<rect x="10" y="110" width="120" height="80" style="fill:rgba(163,61,61,0.4);stroke:rgba(47,95,143,0.5)"/></svg>';
  const source = flow(2);
  source.materials[0] = { ...source.materials[0], data: 'data:image/svg+xml;base64,' + Buffer.from(rgba).toString('base64') };
  const data = renderAssembly(source, { kind: 'diagram' }, { composition: 'overviewDetail', archetype: 'single',
    direction: 'LR', rankGap: 70, nodeGap: 50, sizes: [{ width: 300, height: 240 }, { width: 300, height: 240 }],
    rationale: 'r', captions: [], referenceIndex: 0 });
  const svg = Buffer.from(data.split(',')[1], 'base64').toString();
  assert.match(svg, /fill="#2f5f8f"/);
  assert.match(svg, /fill-opacity="0\.5"/);
  assert.match(svg, /fill:#a33d3d;fill-opacity:0\.4/);
  assert.match(svg, /stroke:#2f5f8f;stroke-opacity:0\.5/);
  assert.doesNotMatch(svg, /rgba\(/);
});

test('多面板网格渲染为 3 列 5 块，宽度受控', () => {
  const svg = render(5, 'grid');
  assert.match(svg, /\(e\)/);
  const width = Number(svg.match(/<svg[^>]*width="(\d+)"/)[1]);
  const height = Number(svg.match(/<svg[^>]*height="(\d+)"/)[1]);
  assert.ok(width >= 1120 && width <= 1680);
  assert.ok(width / height >= 1.0 && width / height <= 2.0, `网格比例应接近 1.23，实际 ${width / height}`);
});
