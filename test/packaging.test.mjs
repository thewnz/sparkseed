import assert from 'node:assert/strict';
import { test } from 'node:test';
import { packagedPaths } from '../desktop/runtime-paths.mjs';

test('安装包从 resources 读取 PDF worker、字体资源与品牌图', () => {
  const paths = packagedPaths({
    packaged: true,
    resourcesPath: 'C:\\Program Files\\Sparkseed\\resources',
    root: 'C:\\Program Files\\Sparkseed\\resources\\app.asar',
  });
  assert.equal(paths.worker, 'C:\\Program Files\\Sparkseed\\resources\\desktop\\pdf-worker.mjs');
  assert.equal(paths.pdfjs, 'C:\\Program Files\\Sparkseed\\resources\\node_modules\\pdfjs-dist');
  assert.equal(paths.brand, 'C:\\Program Files\\Sparkseed\\resources\\brand-mark.png');
  assert.equal(paths.commands.worker, paths.worker);
  assert.equal(paths.commands.pdfjs, paths.pdfjs);
});

test('开发环境继续读取项目目录，不依赖安装资源', () => {
  const paths = packagedPaths({
    packaged: false,
    resourcesPath: 'C:\\ignored',
    root: 'C:\\work\\sparkseed',
  });
  assert.equal(paths.worker, '');
  assert.equal(paths.pdfjs, 'C:\\work\\sparkseed\\node_modules\\pdfjs-dist');
  assert.equal(paths.brand, 'C:\\work\\sparkseed\\dist\\brand-mark.png');
  assert.deepEqual(paths.commands, {});
});
import { readFileSync } from 'node:fs';

test('安装包包含桌面进程导入的共享源码', () => {
  const { build } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const file of ['idea-map.mjs', 'work-labels.mjs']) {
    assert.ok(build.files.includes('src/' + file), file);
  }
});
