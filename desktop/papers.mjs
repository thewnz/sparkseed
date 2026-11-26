import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Worker } from 'node:worker_threads';

export const paperLimit = 100 * 1024 * 1024;
export const paperPath = (directory, id) => join(directory, id + '.pdf');

export async function importPaper(papers, directory, file) {
  const info = await stat(file);
  if (!info.isFile() || info.size > paperLimit) throw new Error('单份 PDF 最大支持 100 MB。');
  return importPaperBytes(papers, directory, basename(file), await readFile(file));
}

export async function importPaperBytes(papers, directory, name, bytes) {
  if (bytes.length > paperLimit || !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
    throw new Error('文件不是可识别的 PDF，或超过 100 MB。');
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  const existing = papers.byHash(hash);
  if (existing) return { id: existing.id, duplicate: true };
  const id = randomUUID();
  const filename = basename(name).slice(0, 250);
  await mkdir(directory, { recursive: true });
  const path = paperPath(directory, id);
  await writeFile(path, bytes, { flag: 'wx' });
  try {
    papers.create({ id, hash, filename, title: filename.replace(/\.pdf$/i, '') || '未命名论文' });
    return { id, duplicate: false };
  } catch (error) {
    await rm(path, { force: true }).catch(() => {});
    const imported = papers.byHash(hash);
    if (imported) return { id: imported.id, duplicate: true };
    throw error;
  }
}

export function createPaperQueue(papers, directory, notify) {
  let worker;
  let stopped = false;

  function run() {
    if (worker || stopped) return;
    const job = papers.next();
    if (!job) return;
    papers.begin(job.id);
    notify();
    try {
      worker = new Worker(process.env.SPARKSEED_PDF_WORKER || new URL('./pdf-worker.mjs', import.meta.url),
        { execArgv: [], workerData: paperPath(directory, job.id) });
    } catch {
      papers.finish(job.id, 'failed', '无法启动 PDF 解析器。');
      notify(job.id);
      queueMicrotask(run);
      return;
    }
    const current = worker;
    let outcome;
    let failure = '';
    const timer = setTimeout(() => {
      failure = 'PDF 解析超时，可重试或打开原文件。';
      void current.terminate();
    }, 120000);
    current.on('message', message => {
      if (stopped || failure) return;
      try {
        if (message.type === 'metadata') { papers.metadata(job.id, message); notify(); }
        if (message.type === 'page') papers.addPage(job.id, message.page, message.text);
        if (message.type === 'result') outcome = message.status;
        if (message.type === 'error') failure = message.message;
      } catch {
        failure = '保存 PDF 提取内容失败，可以重试。';
        void current.terminate();
      }
    });
    current.once('error', () => { failure ||= 'PDF 解析进程异常退出。'; });
    current.once('exit', code => {
      clearTimeout(timer);
      worker = null;
      if (stopped) return;
      if (code === 0 && outcome && !failure) papers.finish(job.id, outcome);
      else papers.finish(job.id, 'failed', failure || 'PDF 解析中断，可以重试。');
      notify(job.id);
      run();
    });
  }
  return { run, stop() { stopped = true; if (worker) void worker.terminate(); } };
}
