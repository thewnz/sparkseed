import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectCapability, normalizeCapabilityOverrides, reasoningAdvice } from '../desktop/figure-capabilities.mjs';
import { resolveFigureRoute, vectorFallback } from '../desktop/figure-routing.mjs';

test('能力识别：常见供应商与模型', () => {
  const minimax = detectCapability('minimax', 'MiniMax-M3');
  assert.equal(minimax.imageApi, true);
  assert.equal(minimax.reasoning, true);
  assert.equal(minimax.vision, true);
  assert.equal(detectCapability('minimax', 'MiniMax-M3.1-Flash').vision, true);
  assert.equal(detectCapability('openai', 'gpt-4.1').vision, true);
  assert.equal(detectCapability('deepseek', 'deepseek-chat').vision, false);
  assert.equal(detectCapability('qwen', 'qwen-vl-max').vision, true);
  assert.equal(detectCapability('unknown', 'text-model').vision, false);
});

test('能力覆盖优先于推断，并可过滤无效值', () => {
  assert.equal(detectCapability('deepseek', 'deepseek-vl2', { deepseek: { vision: true } }).vision, true);
  assert.equal(detectCapability('minimax', 'MiniMax-M3', { minimax: { imageApi: false } }).imageApi, false);
  assert.deepEqual(normalizeCapabilityOverrides({ minimax: { vision: 'yes', imageApi: false }, bad: 'x' }), { minimax: { imageApi: false } });
  assert.match(reasoningAdvice({ reasoning: true }), /非推理型/);
  assert.equal(reasoningAdvice({ reasoning: false }), '');
});

test('路由：流程图与数据图始终矢量', () => {
  for (const pictureType of ['flow', 'data']) {
    const route = resolveFigureRoute({ pictureType, agentProvider: 'deepseek', imageProvider: 'minimax', capabilities: { minimax: { imageApi: true } } });
    assert.equal(route.engine, 'vector');
    assert.equal(route.provider, 'deepseek');
  }
});

test('路由：插画在有图像服务时走位图，否则矢量', () => {
  const raster = resolveFigureRoute({ pictureType: 'illustration', agentProvider: 'deepseek', imageProvider: 'minimax', capabilities: { minimax: { imageApi: true } } });
  assert.equal(raster.engine, 'raster');
  assert.equal(raster.provider, 'minimax');
  const vector = resolveFigureRoute({ pictureType: 'illustration', agentProvider: 'deepseek', imageProvider: '' });
  assert.equal(vector.engine, 'vector');
  assert.match(vector.reason, /未配置图像服务/);
  const disabled = resolveFigureRoute({ pictureType: 'concept', agentProvider: 'deepseek', imageProvider: 'minimax', capabilities: { minimax: { imageApi: false } } });
  assert.equal(disabled.engine, 'vector');
});

test('位图失败可回退矢量并保留原因', () => {
  const fallback = vectorFallback('deepseek', '位图请求超时');
  assert.equal(fallback.engine, 'vector');
  assert.equal(fallback.provider, 'deepseek');
  assert.match(fallback.reason, /超时/);
});
