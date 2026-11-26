import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateModelSvg } from '../desktop/model-figure.mjs';
import { normalizeCompositeFlow, renderCompositeFlow } from '../desktop/composite-flow.mjs';

const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480">${body}</svg>`;
test('模型矢量图保留内部标记和文字，拒绝主动内容与外部资源', () => {
  const graphic = svg('<defs><marker id="arrow"><path d="M0 0L5 3L0 6Z"/></marker></defs><path marker-end="url(#arrow)" d="M1 1L5 5"/><text>研究 A &amp; B</text>');
  assert.match(validateModelSvg(graphic), /研究 A &amp; B/);
  const accessible = '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480" role="img" aria-labelledby="t"><title id="t">图</title><rect width="10" height="10"/></svg>';
  assert.match(validateModelSvg(accessible), /role="img"/);
  for (const body of ['<script/>', '<foreignObject/>', '<path onclick="alert(1)"/>',
    '<path fill="url(https://example.test/a)"/>', '<image href="https://example.test/a"/>', '<g><rect></g>']) {
    assert.throws(() => validateModelSvg(svg(body)), /SVG 格式/);
  }
});

test('阶段详图绘制同列连线和回路', () => {
  const stages = normalizeCompositeFlow({ stages: [
    { title: 'Calibration', columns: [[{ label: 'Update' }, { label: 'Simulate' }], [{ label: 'Compare' }]],
      links: [[[0, 0], [0, 1]], [[0, 1], [1, 0]], [[1, 0], [0, 0], 'Retry']] },
    { title: 'Validation', columns: [[{ label: 'Evaluate' }]], links: [] },
  ] });
  const output = validateModelSvg(renderCompositeFlow(stages, { title: 'Model calibration', caption: '', theme: 'color', width: 1080 }));
  assert.match(output, /id="flow-edge-A-0-0-0-to-0-1" d="M[\d.]+ [\d.]+V[\d.]+"/);
  assert.match(output, /id="flow-edge-A-2-1-0-to-0-0"[^>]+stroke-dasharray/);
});
