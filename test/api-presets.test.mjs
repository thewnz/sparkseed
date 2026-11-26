import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiPresets, apiProtocol, apiPresetDefaults, isApiProvider } from '../desktop/api-presets.mjs';
import { diagnoseAgent, generateQuestion, listApiModels, providers } from '../desktop/agents.mjs';
import { rankTextModels } from '../desktop/model-catalog.mjs';
import { detectCapability } from '../desktop/figure-capabilities.mjs';

test('预设覆盖主流大模型且接口均为 https、协议合法', () => {
  const ids = apiPresets.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'id 不重复');
  for (const preset of apiPresets) {
    assert.ok(['openai', 'anthropic'].includes(preset.protocol), preset.id + ' 协议合法');
    if (preset.id !== 'custom') assert.match(preset.base, /^https:\/\//, preset.id + ' 官方接口 https');
    if (preset.id !== 'custom') assert.ok(preset.model, preset.id + ' 有默认模型');
  }
  for (const id of ['openai', 'deepseek', 'kimi-api', 'qwen', 'zhipu', 'doubao', 'minimax', 'siliconflow', 'openrouter', 'gemini', 'anthropic', 'custom']) {
    assert.ok(ids.includes(id), '包含 ' + id);
  }
});

test('协议映射与自定义默认值', () => {
  assert.equal(isApiProvider('deepseek'), true);
  assert.equal(isApiProvider('kimi'), false, 'CLI 不算 API provider');
  assert.equal(apiProtocol('anthropic'), 'anthropic');
  assert.equal(apiProtocol('deepseek'), 'openai');
  assert.equal(apiProtocol('custom'), 'openai');
  assert.ok(apiPresetDefaults('deepseek').base.length > 0);
  assert.equal(apiPresetDefaults('custom').base, '');
  assert.equal(apiPresetDefaults('custom').model, '');
});

test('providers 表包含全部 API 预设供设置页列出', () => {
  for (const preset of apiPresets) assert.ok(providers[preset.id], 'providers 含 ' + preset.id);
  assert.ok(providers.claude && providers.codex && providers.kimi, '保留本机 CLI');
});

test('listApiModels 拒绝 CLI、未保存地址的预设提示先保存', async () => {
  await assert.rejects(listApiModels('kimi', { base: 'https://example.com' }), /兼容 API/);
  await assert.rejects(listApiModels('deepseek', {}), /请先保存 API 地址/);
});

test('新增 API 预设的连接测试使用已保存配置并支持取消', async t => {
  const stageUpdates = [];
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.pathname, '/v1/chat/completions');
    assert.equal(JSON.parse(options.body).model, 'fixture');
    if (fetch.mock.callCount() > 0) {
      await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    }
    return Response.json({ choices: [{ message: { content: '{"question":"Check?","options":["A","B"]}' } }] });
  });
  const signal = new AbortController().signal;
  const connection = { base: 'http://127.0.0.1/v1', model: 'fixture' };
  assert.equal(await diagnoseAgent('deepseek', connection, signal, (...update) => stageUpdates.push(update)), true);
  assert.equal(fetch.mock.callCount(), 2);
  assert.deepEqual(stageUpdates[0], ['availability', 'passed', '已配置']);
  assert.deepEqual(stageUpdates.at(-1), ['cancel', 'passed', '已中止发起的请求']);
});

test('扩展云端与自建预设覆盖协议、旗舰排序与视觉/推理能力识别', () => {
  const ids = apiPresets.map(p => p.id);
  for (const id of ['xai', 'mistral', 'groq', 'together', 'perplexity', 'stepfun', 'yi', 'qianfan', 'spark', 'custom-anthropic']) {
    assert.ok(ids.includes(id), '包含扩展预设 ' + id);
  }
  assert.equal(apiProtocol('custom-anthropic'), 'anthropic');
  assert.equal(rankTextModels('xai', ['grok-2', 'grok-3-mini', 'grok-3']).recommended, 'grok-3');
  assert.equal(rankTextModels('perplexity', ['sonar', 'sonar-pro', 'sonar-reasoning-pro']).recommended, 'sonar-reasoning-pro');
  assert.equal(detectCapability('mistral', 'pixtral-large-latest').vision, true);
  assert.equal(detectCapability('xai', 'grok-3-mini').reasoning, true);
  assert.equal(detectCapability('qianfan', 'ernie-x1-turbo-32k').reasoning, true);
});

test('runApi 兼容文本块数组响应并准确诊断 404/400/model-not-found 错误', async t => {
  let replyMode = 'blocks';
  t.mock.method(globalThis, 'fetch', async () => {
    if (replyMode === 'blocks') {
      return Response.json({ choices: [{ message: { content: [{ type: 'text', text: '{"question":"Check?","options":["A","B"]}' }] } }] });
    }
    if (replyMode === '404') {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(JSON.stringify({ error: { message: 'model does not exist' } }), { status: 400 });
  });
  const signal = new AbortController().signal;
  const conn = { base: 'http://127.0.0.1/v1', model: 'test-model' };
  const q = await generateQuestion('custom', conn, { body: '测试想法', discussion: [] }, signal);
  assert.equal(q.question, 'Check?');
  replyMode = '404';
  await assert.rejects(generateQuestion('custom', conn, { body: '测试想法', discussion: [] }, signal), /404|接口地址不存在/);
  replyMode = '400';
  await assert.rejects(generateQuestion('custom', conn, { body: '测试想法', discussion: [] }, signal), /模型不可用/);
});
