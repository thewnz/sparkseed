import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// 自动裁掉整图四周的大片空白：栅格化后扫描非近白像素包围盒，重写根 viewBox。
const NEAR_WHITE = 246;

export async function cropSvgBlank(data, rasterize, analyzeImage, { maxAspect = 0 } = {}) {
  try {
    if (!data?.startsWith('data:image/svg+xml;base64,') || typeof rasterize !== 'function' || typeof analyzeImage !== 'function') {
      return data;
    }
    const svg = Buffer.from(data.split(',')[1], 'base64').toString('utf8');
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    const width = Number.parseFloat(root.getAttribute('width'));
    const height = Number.parseFloat(root.getAttribute('height'));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 4 || height < 4) return data;
    const rendered = await rasterize(data);
    const image = analyzeImage(rendered?.bytes);
    if (!image || !image.bitmap || image.w < 4 || image.h < 4) return data;
    const { w: pw, h: ph, bitmap } = image;
    let minX = pw, minY = ph, maxX = -1, maxY = -1;
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = (y * pw + x) * 4;
        if (bitmap[i] < NEAR_WHITE || bitmap[i + 1] < NEAR_WHITE || bitmap[i + 2] < NEAR_WHITE) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return data;
    const margin = 6;
    minX = Math.max(0, minX - margin);
    minY = Math.max(0, minY - margin);
    maxX = Math.min(pw - 1, maxX + margin);
    maxY = Math.min(ph - 1, maxY + margin);
    const sx = width / pw, sy = height / ph;
    const cx = Math.floor(minX * sx);
    let cy = Math.floor(minY * sy);
    const cw = Math.min(width - cx, Math.ceil((maxX - minX + 1) * sx));
    let ch = Math.min(height - cy, Math.ceil((maxY - minY + 1) * sy));
    if (cw > width * 0.97 && ch > height * 0.97) return data;
    if (Number.isFinite(maxAspect) && maxAspect > 0 && cw / ch > maxAspect) {
      // 裁白不能意外把横向方法图拉成过窄长条；在原画布内补回对称白边。
      const needed = Math.min(height, Math.ceil(cw / maxAspect));
      cy = Math.max(0, Math.min(cy - Math.floor((needed - ch) / 2), height - needed));
      ch = needed;
    }
    root.setAttribute('viewBox', cx + ' ' + cy + ' ' + cw + ' ' + ch);
    root.setAttribute('width', String(cw));
    root.setAttribute('height', String(ch));
    const out = new XMLSerializer().serializeToString(root);
    return 'data:image/svg+xml;base64,' + Buffer.from(out).toString('base64');
  } catch {
    return data;
  }
}
