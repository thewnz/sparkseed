import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from '../desktop/store.mjs';

test('仅信息论文可创建、按 DOI 查找并更新元数据', () => {
  const store = openStore(':memory:');
  try {
    store.papers.createLinked({ id: 'p1', title: 'Only metadata', doi: '10.1000/x', author: 'Ada',
      year: 2024, venue: 'Journal', abstract: 'Finding.', sourceUrl: 'https://doi.org/10.1000/x' });
    assert.equal(store.papers.byDoi('10.1000/X').title, 'Only metadata');
    assert.equal(store.papers.byDoi('not-a-doi'), undefined);
    store.papers.updateMeta('p1', { venue: 'Journal 2', pdfUrl: 'https://example.org/a.pdf' });
    const row = store.papers.get('p1');
    assert.equal(row.venue, 'Journal 2');
    assert.equal(row.pdf_url, 'https://example.org/a.pdf');
    assert.equal(row.status, 'linked');
    assert.equal(row.page_count, 0);
    const listed = store.papers.list()[0];
    assert.equal(listed.doi, '10.1000/x');
    assert.equal(listed.year, 2024);
    assert.equal(listed.abstract, 'Finding.');
  } finally { store.close(); }
});

test('迁移幂等：重复打开同一数据库不报错且保留数据', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'sparkseed-paper-'));
  const path = join(directory, 'store.sqlite');
  try {
    const first = openStore(path);
    first.papers.createLinked({ id: 'p1', title: 'Keep', doi: '10.1000/keep' });
    first.close();
    const second = openStore(path);
    assert.equal(second.papers.byDoi('10.1000/keep').title, 'Keep');
    second.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('普通 PDF 论文可补齐检索元数据', () => {
  const store = openStore(':memory:');
  try {
    store.papers.create({ id: 'p2', hash: 'hash-2', filename: 'a.pdf', title: 'Uploaded' });
    store.papers.updateMeta('p2', { doi: '10.1000/y', year: 2022, venue: 'ICML' });
    const row = store.papers.get('p2');
    assert.equal(row.doi, '10.1000/y');
    assert.equal(row.venue, 'ICML');
    assert.equal(row.status, 'queued');
  } finally { store.close(); }
});

test('仅信息论文可原地升级为可读论文，保留同一 id', () => {
  const store = openStore(':memory:');
  try {
    store.papers.createLinked({ id: 'p1', title: 'Linked', doi: '10.1000/up' });
    assert.equal(store.papers.upgradeLinked('p1', { hash: 'hash-up', filename: 'up.pdf' }), true);
    const row = store.papers.get('p1');
    assert.equal(row.status, 'queued');
    assert.equal(row.filename, 'up.pdf');
    assert.equal(row.sha256, 'hash-up');
    assert.equal(row.doi, '10.1000/up');
    assert.equal(store.papers.upgradeLinked('p1', { hash: 'x', filename: 'x.pdf' }), false);
  } finally { store.close(); }
});
