import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localFallbackArtifact, lintVenueFigure, repairVenueTypography } from '../desktop/figure-quality.mjs';
import { validateModelSvg } from '../desktop/model-figure.mjs';

const svgOf = artifact => Buffer.from(artifact.data.split(',')[1], 'base64').toString('utf8');

test('期刊质量门槛拦截渐变、小字号与几何问题', () => {
  const gradient = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="400" viewBox="0 0 1080 400"><defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>';
  assert.equal(lintVenueFigure(gradient).passed, false);
  const small = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><text font-size="8">标签</text></svg>';
  assert.match(lintVenueFigure(small).issues.join(), /字号/);
  const clean = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="400" viewBox="0 0 1080 400"><text font-size="24" fill="#1F2937">标签</text><path stroke-width="1.5" d="M0 0L10 10"/></svg>';
  assert.equal(lintVenueFigure(clean).passed, true);
});

test('期刊质量门槛合并渲染重叠报告', () => {
  const clean = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="400" viewBox="0 0 1080 400"><text font-size="24">标签</text></svg>';
  const result = lintVenueFigure(clean, { overlaps: 2, clipped: 1 });
  assert.equal(result.passed, false);
  assert.match(result.issues.join(), /文字重叠 2 处/);
  assert.match(result.issues.join(), /越界裁切 1 处/);
});

test('确定性兜底图合法且通过质量门槛', () => {
  const artifact = localFallbackArtifact({ title: '光谱分析流程', text: '数据采集 → 预处理 → 模型训练 → 结果验证' });
  const svg = svgOf(artifact);
  assert.match(svg, /数据采集/);
  assert.match(svg, /结果验证/);
  assert.equal(lintVenueFigure(svg).passed, true);
  assert.ok(validateModelSvg(svg).includes('<svg'));
  assert.equal(artifact.figure.fallback, true);
});

test('兜底图在描述不足时仍给出三步', () => {
  const artifact = localFallbackArtifact({ title: '流程', text: '' });
  const svg = svgOf(artifact);
  assert.match(svg, /步骤一/);
  assert.match(svg, /步骤三/);
});

test('字号与线宽修复让相近尺寸的图通过门槛', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="899" height="300" viewBox="0 0 899 300"><text font-size="7">标签</text><path stroke-width="0.5" d="M0 0L10 10"/></svg>';
  const repaired = repairVenueTypography(svg);
  assert.equal(repaired.changed, true);
  assert.match(repaired.svg, /font-size="9"/);
  assert.match(repaired.svg, /stroke-width="1"/);
  assert.equal(lintVenueFigure(repaired.svg).passed, true);
});
