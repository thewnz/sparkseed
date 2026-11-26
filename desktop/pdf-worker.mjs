import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const bundled = process.env.SPARKSEED_PDFJS;
// mth
const resources = bundled
  ? new URL(pathToFileURL(bundled).href + '/')
  : new URL('../node_modules/pdfjs-dist/', import.meta.url);
const resource = name => fileURLToPath(new URL(name + '/', resources)).replaceAll('\\', '/');
const clean = value => typeof value === 'string' ? value.trim().slice(0, 500) : '';

let task;
try {
  const data = new Uint8Array(typeof workerData === 'string' ? await readFile(workerData) : workerData.data);
  task = getDocument({
    data, cMapUrl: resource('cmaps'), cMapPacked: true, standardFontDataUrl: resource('standard_fonts'),
    disableFontFace: true, useSystemFonts: false, isEvalSupported: false, verbosity: 0,
  });
  const document = await task.promise;
  const { info } = await document.getMetadata().catch(() => ({}));
  parentPort.postMessage({ type: 'metadata', title: clean(info?.Title), author: clean(info?.Author), pages: document.numPages });
  let containsText = false;
  let figureCount = 0;
  const pageLimit = Math.min(document.numPages, workerData?.maxPages ?? document.numPages);
  for (let number = 1; number <= pageLimit; number++) {
    const page = await document.getPage(number);
    const { items } = await page.getTextContent();
    const text = items.filter(item => typeof item.str === 'string')
      .map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('').replace(/[^\S\n]+/g, ' ').trim().slice(0, 24000);
    containsText ||= Boolean(text);
    parentPort.postMessage({ type: 'page', page: number, text });
    if (workerData?.illustrations && figureCount < 1 && number <= 16) {
      const viewport = page.getViewport({ scale: 1 });
      const lines = items.filter(item => item.str?.trim() && item.transform).map(item => ({
        text: item.str, x: item.transform[4], y: viewport.convertToViewportPoint(item.transform[4], item.transform[5])[1],
        width: item.width,
      }));
      for (const line of lines) {
        if (!/^\s*(?:fig(?:ure)?\.?\s*\d+|图\s*\d+)/i.test(line.text)) continue;
        const caption = lines.filter(row => row.y >= line.y - 2 && row.y < line.y + 36 &&
          Math.abs(row.x - line.x) < viewport.width * .44).map(row => row.text).join(' ');
        if (!/workflow|flowchart|flow diagram|pipeline|architecture|schematic|流程|架构/i.test(caption)) continue;
        const twoColumns = lines.some(row => row.x > viewport.width * .5 && row.width > viewport.width * .24);
        const column = twoColumns && line.width < viewport.width * .48;
        const left = column && line.x > viewport.width * .48 ? viewport.width * .49 : 12;
        const right = column ? left + viewport.width * .47 : viewport.width - 12;
        const bottom = line.y - 10;
        const preceding = lines.filter(row => row.y < bottom - 6 && row.x < right && row.x + row.width > left &&
          row.width > (right - left) * .55);
        const top = Math.max(18, ...preceding.map(row => row.y + 5), bottom - viewport.height * .58);
        if (bottom - top < 64) continue;
        const { canvas, context } = document.canvasFactory.create(Math.ceil(right - left), Math.ceil(bottom - top));
        try {
          await page.render({ canvasContext: context, viewport, transform: [1, 0, 0, 1, -left, -top] }).promise;
          const bytes = canvas.toBuffer('image/png');
          if (bytes.length <= 900_000) {
            parentPort.postMessage({ type: 'figure', page: number, caption: caption.slice(0, 340), bytes });
            figureCount++;
          }
        } finally {
          document.canvasFactory.destroy({ canvas, context });
        }
        if (figureCount) break;
      }
    }
    page.cleanup();
  }
  parentPort.postMessage({ type: 'result', status: containsText ? 'ready' : 'empty' });
} catch (error) {
  parentPort.postMessage({ type: 'error', message: error.name === 'PasswordException'
    ? '这份 PDF 受密码保护，可以打开原文件查看。' : '无法提取这份 PDF 的文字，可以打开原文件或重试。' });
} finally {
  await task?.destroy().catch(() => {});
}
