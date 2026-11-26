import { BrowserWindow } from 'electron';
import { readFile } from 'node:fs/promises';

const templatePath = new URL('./figure-export.html', import.meta.url);

// 复用同一个隐藏窗口，避免每次检查/栅格化都重建 BrowserWindow（每次约 0.3–2s）。
let sharedWindow;
let sharedReady;
let renderQueue = Promise.resolve();

async function getFigureWindow() {
  if (sharedWindow && !sharedWindow.isDestroyed()) {
    await sharedReady;
    return sharedWindow;
  }
  sharedWindow = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  sharedWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  sharedWindow.webContents.on('will-navigate', event => event.preventDefault());
  sharedReady = (async () => {
    const template = await readFile(templatePath);
    await sharedWindow.loadURL('data:text/html;charset=utf-8;base64,' + template.toString('base64'));
  })();
  sharedReady.catch(() => {
    try { if (sharedWindow && !sharedWindow.isDestroyed()) sharedWindow.destroy(); } catch {}
    sharedWindow = undefined;
  });
  await sharedReady;
  return sharedWindow;
}

async function withFigureWindow(render) {
  // 窗口共用时串行执行，等上一个渲染结束再进下一个。
  const job = renderQueue.then(async () => {
    const window = await getFigureWindow();
    return render(window.webContents);
  });
  renderQueue = job.catch(() => {});
  return job;
}

export async function inspectRenderedFigure(data, { preview = false } = {}) {
  return withFigureWindow(async contents => {
    return contents.executeJavaScript(`(async () => {
      const source = ${JSON.stringify(data)};
      let image = document.images[0];
      if (!image) { image = document.createElement('img'); image.alt = ''; document.body.appendChild(image); }
      image.src = source;
      await image.decode();
      const bytes = Uint8Array.from(atob(source.split(',')[1]), char => char.charCodeAt(0));
      const svg = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'image/svg+xml').documentElement;
      document.body.replaceChildren(document.importNode(svg, true));
      await document.fonts.ready;
      const root = document.querySelector('svg');
      const canvas = root.getBoundingClientRect();
      const labels = [...root.querySelectorAll('text')];
      const previewScale = Math.min(1, 1000 / canvas.width, 700 / canvas.height);
      const smallLabels = labels.filter(node => {
        const matrix = node.getScreenCTM();
        return matrix && parseFloat(getComputedStyle(node).fontSize) *
          Math.hypot(matrix.c, matrix.d) * previewScale < 8;
      }).length;
      const boxes = labels.map(node => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
          width: rect.width, height: rect.height };
      }).filter(rect => rect.width && rect.height);
      const clipped = boxes.filter(box => box.left < canvas.left - 1 || box.top < canvas.top - 1 ||
        box.right > canvas.right + 1 || box.bottom > canvas.bottom + 1).length;
      let overlaps = 0;
      const subset = boxes.slice(0, 250);
      for (const [index, a] of subset.entries()) {
        for (const b of subset.slice(index + 1)) {
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 1 && h > 1 && w * h > 0.08 * Math.min(a.width * a.height, b.width * b.height)) overlaps++;
        }
      }
      const strokes = [...root.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse')]
        .filter(node => !node.closest('defs') && getComputedStyle(node).stroke !== 'none');
      const obstructedLabels = new Set();
      for (const stroke of strokes.slice(0, 300)) {
        const matrix = stroke.getScreenCTM();
        const length = stroke.getTotalLength();
        if (!matrix || !length) continue;
        const steps = Math.min(180, Math.ceil(length * Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)) / 3));
        for (let i = 0; i <= steps; i++) {
          const point = stroke.getPointAtLength(length * i / steps).matrixTransform(matrix);
          for (const box of subset) {
            if (point.x > box.left + 2 && point.x < box.right - 2 &&
                point.y > box.top + box.height * .25 && point.y < box.bottom - box.height * .2) obstructedLabels.add(box);
          }
        }
      }
      const labelStrokeCollisions = obstructedLabels.size;
      let edgeObstructions = 0;
      let nodeOverlaps = 0;
      let emptyPanels = 0;
      for (const panel of root.querySelectorAll('g[id^="flow-stage-"]')) {
        const bounds = [...panel.querySelectorAll('rect[id^="flow-node-"]')];
        const nodes = bounds.map(node => ({ id: node.id, box: node.getBoundingClientRect() }));
        const frame = panel.querySelector('rect[id^="flow-panel-"]')?.getBoundingClientRect();
        if (!frame || !nodes.length) continue;
        const footprint = Math.max(...nodes.map(node => node.box.right)) - Math.min(...nodes.map(node => node.box.left));
        if (nodes.length > 1 && footprint / frame.width < .42) emptyPanels++;
        for (const [index, { box: a }] of nodes.entries()) {
          for (const { box: b } of nodes.slice(index + 1)) {
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) nodeOverlaps++;
          }
        }
        for (const edge of panel.querySelectorAll('path[id^="flow-edge-"]')) {
          const match = /^flow-edge-([A-Z])-\\d+-(\\d+-\\d+)-to-(\\d+-\\d+)$/.exec(edge.id);
          const matrix = edge.getScreenCTM();
          if (!match || !matrix) continue;
          const [, stage, from, to] = match;
          const obstacles = nodes.filter(node => node.id !== 'flow-node-' + stage + '-' + from + '-bounds' &&
            node.id !== 'flow-node-' + stage + '-' + to + '-bounds');
          const length = edge.getTotalLength();
          const segments = Math.min(240, Math.ceil(length / 4));
          for (let index = 1; index < segments; index++) {
            const point = edge.getPointAtLength(length * index / segments).matrixTransform(matrix);
            if (obstacles.some(({ box }) => point.x > box.left + 3 && point.x < box.right - 3 &&
                point.y > box.top + 3 && point.y < box.bottom - 3)) {
              edgeObstructions++;
              break;
            }
          }
        }
      }
      let previewImage = '';
      if (${JSON.stringify(preview)}) {
        try {
          const markup = new XMLSerializer().serializeToString(root);
          const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
          const image = new Image();
          image.src = url;
          await image.decode();
          const scale = Math.min(1, 1000 / image.naturalWidth, 700 / image.naturalHeight);
          const output = document.createElement('canvas');
          output.width = Math.max(1, Math.round(image.naturalWidth * scale));
          output.height = Math.max(1, Math.round(image.naturalHeight * scale));
          output.getContext('2d').drawImage(image, 0, 0, output.width, output.height);
          previewImage = output.toDataURL('image/png');
          URL.revokeObjectURL(url);
        } catch { /* A rendered preview is optional when SVG resources cannot be rasterized. */ }
      }
      return { width: Math.round(canvas.width), height: Math.round(canvas.height), labels: labels.length,
        clipped, overlaps, smallLabels, labelStrokeCollisions, edgeObstructions, nodeOverlaps, emptyPanels,
        sampled: boxes.length > subset.length || strokes.length > 300, previewImage };
    })()`);
  });
}

export async function renderFigureExport(data, format) {
  if (!/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error('此作品无法转换格式。');
  return withFigureWindow(async contents => {
    const [width, height] = await contents.executeJavaScript(
      `(async () => {
        let image = document.images[0];
        if (!image) { image = document.createElement('img'); image.alt = ''; document.body.appendChild(image); }
        image.src = ${JSON.stringify(data)};
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      })()`);
    if (!width || !height || width > 2000 || height > 10000) throw new Error('图形尺寸无法导出。');
    if (format === 'pdf') {
      return contents.printToPDF({
        printBackground: true, pageSize: { width: width / 96, height: height / 96 },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
    }
    const png = await contents.executeJavaScript(`(() => {
      const image = document.images[0];
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth * 2;
      canvas.height = image.naturalHeight * 2;
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    })()`);
    if (!png.startsWith('data:image/png;base64,')) throw new Error('PNG 转换失败。');
    return Buffer.from(png.slice(png.indexOf(',') + 1), 'base64');
  });
}
