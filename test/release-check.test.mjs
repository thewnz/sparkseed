import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkRelease } from '../desktop/release-check.mjs';

const source = 'https://updates.example.com/sparkseed.json';
const release = { version: '0.1.10', downloadUrl: 'https://updates.example.com/releases', notes: '修复流程图预览' };
const response = (manifest = release) => async (url, options) => {
  assert.equal(url, source);
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Accept, 'application/json');
  assert.ok(options.signal instanceof AbortSignal);
  return Response.json(manifest);
};

test('更新检查区分新版、同版本和较旧的更新源', async () => {
  const newer = await checkRelease(source, '0.1.5', response());
  assert.deepEqual(newer, { current: '0.1.5', latest: '0.1.10', status: 'available',
    available: true, downloadUrl: release.downloadUrl, notes: release.notes });
  assert.equal((await checkRelease(source, '0.1.10', response())).status, 'current');
  const older = await checkRelease(source, '0.2.0', response());
  assert.equal(older.status, 'older');
  assert.equal(older.downloadUrl, undefined);
});

test('更新检查拒绝非 HTTPS、错误清单与超大响应', async () => {
  await assert.rejects(checkRelease('http://updates.example.com/sparkseed.json', '0.1.5', response()), /HTTPS/);
  await assert.rejects(checkRelease(source, '0.1.5', response({ ...release, downloadUrl: 'file:///installer' })), /HTTPS/);
  await assert.rejects(checkRelease(source, '0.1.5', response({ version: 'beta' })), /版本/);
  await assert.rejects(checkRelease(source, '0.1.5', response({ ...release, notes: 'x'.repeat(66_000) })), /过大/);
  await assert.rejects(checkRelease(source, '0.1.5', async () => new Response('missing', { status: 404 })), /404/);
});
