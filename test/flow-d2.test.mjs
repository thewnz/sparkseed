import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { flowPlanToD2 } from '../desktop/flow-d2.mjs';
import { exportFlowArchive } from '../desktop/flow-design.mjs';

const stages = [
  { title: '光谱输入', color: 'teal', input: { label: '原始光谱', shape: 'spectrum' },
    columns: [[{ label: '波段筛选', shape: 'process' }, { label: '异常样本', shape: 'decision' }],
      [{ label: '特征矩阵', shape: 'matrix' }]],
    links: [[[0, 0], [1, 0], '保留'], [[0, 1], [1, 0], '复核']],
    output: { label: '候选波长', shape: 'vector' } },
  { title: '模型验证', input: { label: '候选波长', shape: 'vector' },
    columns: [[{ label: 'PLS 回归', shape: 'model', expression: 'y = Xb' }]],
    links: [] },
];

test('D2 导出保留阶段、节点、公式与真实连线，不包含模型坐标', () => {
  const source = flowPlanToD2(stages, { title: '波长优选流程' });
  assert.match(source, /layout-engine: tala/);
  assert.match(source, /stage_0: "A · 光谱输入"/);
  assert.match(source, /stage_1: "B · 模型验证"/);
  assert.match(source, /node_0_0 -> node_1_0: "保留"/);
  assert.match(source, /node_0_1 -> node_1_0: "复核"/);
  assert.match(source, /stage_input -> node_0_0/);
  assert.match(source, /node_1_0 -> stage_output/);
  assert.match(source, /stage_0\.stage_output -> stage_1\.stage_input/);
  assert.match(source, /y = Xb\\nPLS 回归/);
  assert.doesNotMatch(source, /\b(?:x|y): -?\d+(?:\.\d+)?\b/);
  assert.throws(() => flowPlanToD2([]), /缺少可导出的流程结构/);
  assert.throws(() => flowPlanToD2(stages, { layout: 'unknown' }), /不支持的 D2 布局引擎/);
});

test('D2 字符串转义阻止标签注入图源结构', () => {
  const source = flowPlanToD2([{ title: '阶段"\n恶意: {',
    columns: [[{ label: '节点"\nstyle.stroke: red', shape: 'process' }]], links: [] }]);
  assert.match(source, /阶段\\"\\n恶意: \{/);
  assert.match(source, /节点\\"\\nstyle\.stroke: red/);
  assert.equal(source.split('\n').filter(line => line === '恶意: {').length, 0);
  assert.equal(source.split('\n').filter(line => line === 'style.stroke: red').length, 0);
});

test('ZIP 源文件包包含可编辑 D2，并在清单中记录摘要', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
  const archive = await exportFlowArchive({ id: 'figure-1', title: '测试', data: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
    figure: { specification: { title: '测试流程' }, flowPlan: stages, designBrief: { references: [] } } });
  const zip = await JSZip.loadAsync(archive);
  assert.ok(zip.file('figure.d2'));
  assert.match(await zip.file('figure.d2').async('string'), /波长筛选|波段筛选/);
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  const d2 = await zip.file('figure.d2').async('nodebuffer');
  assert.equal(manifest.sha256['figure.d2'], createHash('sha256').update(d2).digest('hex'));
});
