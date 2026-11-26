import { DOMParser } from '@xmldom/xmldom';

const canvasSize = root => {
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    return { x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3] };
  }
  const width = Number.parseFloat(root.getAttribute('width'));
  const height = Number.parseFloat(root.getAttribute('height'));
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { x: 0, y: 0, width, height } : null;
};

const hiddenByDefinition = node => {
  let parent = node.parentNode;
  while (parent?.nodeType === 1) {
    if (/^(?:defs|marker|clipPath|mask|pattern|symbol)$/i.test(parent.nodeName)) return true;
    parent = parent.parentNode;
  }
  return false;
};

const boundsOf = (node, canvas) => {
  const number = name => {
    const value = Number.parseFloat(node.getAttribute(name));
    return Number.isFinite(value) ? value : null;
  };
  const tag = node.nodeName.toLowerCase();
  if (tag === 'rect') {
    const x = number('x') ?? 0, y = number('y') ?? 0;
    const width = number('width'), height = number('height');
    return width > 0 && height > 0 ? { x, y, w: width, h: height } : null;
  }
  if (tag === 'circle') {
    const cx = number('cx') ?? 0, cy = number('cy') ?? 0, r = number('r');
    return r > 0 ? { x: cx - r, y: cy - r, w: r * 2, h: r * 2 } : null;
  }
  if (tag === 'ellipse') {
    const cx = number('cx') ?? 0, cy = number('cy') ?? 0, rx = number('rx'), ry = number('ry');
    return rx > 0 && ry > 0 ? { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 } : null;
  }
  if (tag === 'line') {
    const x1 = number('x1'), x2 = number('x2'), y1 = number('y1'), y2 = number('y2');
    return [x1, x2, y1, y2].every(Number.isFinite)
      ? { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 1, h: Math.abs(y2 - y1) || 1 } : null;
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const points = (node.getAttribute('points') || '').trim().split(/[ ,]+/).map(Number).filter(Number.isFinite);
    const xs = points.filter((_, index) => index % 2 === 0), ys = points.filter((_, index) => index % 2 === 1);
    if (!xs.length || !ys.length) return null;
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) || 1,
      h: Math.max(...ys) - Math.min(...ys) || 1 };
  }
  if (tag === 'path') {
    const numbers = (node.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
    if (numbers.length < 4) return null;
    const xs = numbers.filter((_, index) => index % 2 === 0), ys = numbers.filter((_, index) => index % 2 === 1);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) || 1,
      h: Math.max(...ys) - Math.min(...ys) || 1 };
  }
  if (tag === 'text') {
    const x = number('x') ?? 0, y = number('y') ?? 0;
    const text = node.textContent.trim();
    const font = Number.parseFloat(node.getAttribute('font-size')) || 12;
    return text ? { x, y: y - font, w: Math.max(font, text.length * font * 0.55), h: font * 1.25 } : null;
  }
  return null;
};

export function auditBlockSvg(value) {
  try {
    const root = new DOMParser().parseFromString(String(value), 'image/svg+xml').documentElement;
    const canvas = canvasSize(root);
    if (!canvas) return { ok: false, level: 'invalid', textCount: 0, vectorCount: 0, coverage: 0,
      issues: ['画布缺少有效的 width/height 或 viewBox。'] };
    const texts = [];
    const shapes = [];
    const all = Array.from(root.getElementsByTagName('*'));
    for (const node of all) {
      if (hiddenByDefinition(node)) continue;
      const tag = node.nodeName.toLowerCase();
      if (tag === 'text') {
        const content = node.textContent.replace(/\s+/g, ' ').trim();
        if (content) texts.push(content);
        continue;
      }
      if (!['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path'].includes(tag)) continue;
      const box = boundsOf(node, canvas);
      if (!box) continue;
      const isBackground = tag === 'rect' && box.w * box.h >= canvas.width * canvas.height * 0.82 &&
        !node.getAttribute('marker-end');
      if (!isBackground) shapes.push(box);
    }
    const boxes = [...shapes];
    for (const node of all) {
      if (node.nodeName.toLowerCase() !== 'text' || hiddenByDefinition(node)) continue;
      const box = boundsOf(node, canvas);
      if (box) boxes.push(box);
    }
    const minX = Math.min(...boxes.map(b => b.x)), minY = Math.min(...boxes.map(b => b.y));
    const maxX = Math.max(...boxes.map(b => b.x + b.w)), maxY = Math.max(...boxes.map(b => b.y + b.h));
    const coverage = boxes.length ? (maxX - minX) * (maxY - minY) / (canvas.width * canvas.height) : 0;
    const issues = [];
    if (texts.length < 7) issues.push(`可读文本仅 ${texts.length} 条，至少需要 7 条主标签、注释或单位。`);
    if (shapes.length < 10) issues.push(`有效图元仅 ${shapes.length} 个，至少需要 10 个。`);
    if (coverage < 0.46) issues.push(`内容有效覆盖约 ${(coverage * 100).toFixed(0)}%，应达到 46% 以上。`);
    const level = texts.length < 4 && shapes.length < 6 ? 'empty' : issues.length ? 'sparse' : 'ok';
    return { ok: issues.length === 0, level, textCount: texts.length, vectorCount: shapes.length,
      coverage: Number(coverage.toFixed(3)), issues };
  } catch (error) {
    return { ok: false, level: 'invalid', textCount: 0, vectorCount: 0, coverage: 0,
      issues: ['SVG 无法解析：' + error.message] };
  }
}

export function repairAuditText(audit) {
  return [
    '当前块未通过画面完整度检查，属于空骨架或大框小内容。保留已核验的科学内容与公式，补足数据形状、方法操作和注释后重新返回完整 SVG。',
    '问题：' + (audit?.issues?.join('；') || '有效图元和注释不足。'),
    '不要虚构实验结果；材料未给出的数值用符号或占位，并明确标注待替换。',
  ].join('\n');
}
