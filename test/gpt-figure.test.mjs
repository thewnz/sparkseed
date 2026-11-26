import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeGptFigure } from '../desktop/gpt-figure.mjs';

const pngFixture = (() => {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEJkAAAAASUVORK5CYII=', 'base64');
  // Stub dimensions for testing the response container validation independently of decoding.
  bytes.writeUInt32BE(1536, 16);
  bytes.writeUInt32BE(1024, 20);
  return bytes.toString('base64');
})();

test('GPT Image only sends requested illustration text to the official image endpoint', async () => {
  const artifact = await makeGptFigure({
    key: 'test-key', title: '概念图', prompt: ' 研究系统概念图 ',
    request: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/images/generations');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), {
        model: 'gpt-image-2.5-sunburst', prompt: '研究系统概念图',
        quality: 'high', size: '1536x1024', output_format: 'png', n: 1,
      });
      return Response.json({ data: [{ b64_json: pngFixture }] });
    },
  });
  assert.equal(artifact.type, 'image');
  assert.equal(artifact.title, '概念图');
  assert.equal(artifact.data, 'data:image/png;base64,' + pngFixture);
});

test('GPT Image rejects HTTP errors, oversized or invalid response data, and preserves cancellation', async () => {
  const config = { key: 'test-key', prompt: '概念图' };
  const call = request => makeGptFigure({ ...config, request });
  await assert.rejects(call(async () => new Response('{"private":"secret"}', { status: 403 })), /项目权限/);
  await assert.rejects(call(async () => new Response('', { headers: { 'content-length': '24000001' } })), /大小上限/);
  await assert.rejects(call(async () => Response.json({ data: [{ b64_json: pngFixture.slice(0, -16) }] })), /有效的 PNG/);
  await assert.rejects(makeGptFigure({
    ...config, signal: AbortSignal.abort(), request: () => assert.fail('aborted request should never be sent'),
  }), { name: 'AbortError' });
});

test('revisions send the selected draft to the edit endpoint and preserve the original artifact', async () => {
  const reference = 'data:image/png;base64,' + pngFixture;
  const updated = await makeGptFigure({
    key: 'test-key', title: '概念图', prompt: '只修改箭头', reference,
    request: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/images/edits');
      assert.deepEqual(JSON.parse(options.body).images, [{ image_url: reference }]);
      return Response.json({ data: [{ b64_json: pngFixture }] });
    },
  });
  assert.ok(updated.id);
  assert.equal(updated.title, '概念图');
});
