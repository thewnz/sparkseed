import assert from 'node:assert/strict';
import test from 'node:test';
import { rankImageModels, rankTextModels } from '../desktop/model-catalog.mjs';

test('文本模型排序：过滤非对话模型并优先官方主推', () => {
  const openai = rankTextModels('openai', [
    'gpt-4o-mini', 'text-embedding-3-large', 'whisper-1', 'gpt-image-1', 'dall-e-3',
    'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'gpt-5-mini', 'gpt-5',
  ]);
  assert.equal(openai.recommended, 'gpt-5');
  assert.equal(openai.models[0], 'gpt-5');
  assert.ok(!openai.models.includes('text-embedding-3-large'));
  assert.ok(!openai.models.includes('whisper-1'));
  assert.ok(!openai.models.includes('gpt-image-1'));
  assert.ok(openai.models.includes('gpt-4o'));

  const deepseek = rankTextModels('deepseek', ['deepseek-chat', 'deepseek-reasoner', 'deepseek-embedding']);
  assert.equal(deepseek.recommended, 'deepseek-reasoner');
  assert.equal(deepseek.models.length, 2);

  const qwen = rankTextModels('qwen', ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-max-latest', 'text-embedding-v3']);
  assert.equal(qwen.recommended, 'qwen-max-latest');
  assert.ok(qwen.models.indexOf('qwen-plus') < qwen.models.indexOf('qwen-turbo'));

  const zhipu = rankTextModels('zhipu', ['glm-4-air', 'glm-4-plus', 'glm-4.6', 'embedding-3']);
  assert.equal(zhipu.recommended, 'glm-4.6');
});

test('文本模型排序：未知服务商按版本号与 latest 兜底', () => {
  const result = rankTextModels('custom', ['model-1', 'model-2.1', 'model-2.0-latest', 'model-2.0-mini', 'x-embedding']);
  assert.equal(result.recommended, 'model-2.1');
  assert.ok(result.models.indexOf('model-2.0-latest') < result.models.indexOf('model-2.0-mini'));
});

test('图像模型排序：识别图像模型并给出官方主推回退', () => {
  const openai = rankImageModels('openai', ['gpt-4o', 'gpt-image-1', 'dall-e-3', 'gpt-image-1-mini', 'text-embedding-3-small']);
  assert.equal(openai.recommended, 'gpt-image-1');
  assert.deepEqual(openai.models.sort(), ['dall-e-3', 'gpt-image-1', 'gpt-image-1-mini'].sort());

  const fallback = rankImageModels('openai', []);
  assert.deepEqual(fallback.models, ['gpt-image-2.5-sunburst']);
  const minimax = rankImageModels('minimax', []);
  assert.deepEqual(minimax.models, ['image-01', 'MiniMax-H3']);
  const listed = rankImageModels('minimax', ['image-01', 'MiniMax-H3', 'hailuo-2']);
  assert.equal(listed.recommended, 'MiniMax-H3');
  assert.ok(listed.models.indexOf('hailuo-2') < listed.models.indexOf('image-01'));
});
