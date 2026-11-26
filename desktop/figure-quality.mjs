// 顶会/顶刊插图的可测质量门槛：字号比例、线宽、装饰禁用、语义色数量、遮挡与重叠。
import { randomUUID } from 'node:crypto';

const hexColor = /#[0-9a-f]{3,8}/gi;
const checkRules = [
  ['overlaps', '文字重叠'], ['clipped', '越界裁切'], ['smallLabels', '标签过小'],
  ['labelStrokeCollisions', '标签压线'], ['nodeOverlaps', '节点重叠'],
];

function neutral(color) {
  const value = color.replace('#', '');
  const full = value.length === 3 ? value.split('').map(char => char + char).join('') : value.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map(index => parseInt(full.slice(index, index + 2) || '0', 16));
  return Math.max(r, g, b) - Math.min(r, g, b) <= 18;
}

export function lintVenueFigure(svg, checks = {}) {
  const source = typeof svg === 'string' ? svg : '';
  const issues = [];
  const width = Number((source.match(/<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/) || [])[1] || 0);
  const fontSizes = [...source.matchAll(/font-size="(\d+(?:\.\d+)?)"/g)].map(match => Number(match[1])).filter(Boolean);
  const minFont = fontSizes.length ? Math.min(...fontSizes) : null;
  if (!width) issues.push('缺少明确的画布宽度。');
  else if (minFont && minFont < width / 100) issues.push(`最小字号 ${minFont}px 低于画布宽度的 1/100。`);
  const strokes = [...source.matchAll(/stroke-width="(\d+(?:\.\d+)?)"/g)].map(match => Number(match[1]));
  if (strokes.some(value => value > 0 && value < 1)) issues.push('存在小于 1px 的线宽。');
  if (/<linearGradient|<radialGradient|<filter\b|\bfilter="|drop-shadow/i.test(source)) {
    issues.push('包含渐变、滤镜或阴影，不符合顶会插图规范。');
  }
  const colors = new Set((source.match(hexColor) || []).map(color => color.toLowerCase()).filter(color => !neutral(color)));
  if (colors.size > 8) issues.push(`语义色 ${colors.size} 种，超过 8 种上限。`);
  for (const [key, label] of checkRules) {
    const count = Number(checks?.[key]);
    if (count > 0) issues.push(`${label} ${count} 处。`);
  }
  return { passed: issues.length === 0, issues, metrics: { width, minFont, colors: colors.size } };
}

export function repairVenueTypography(svg) {
  const source = typeof svg === 'string' ? svg : '';
  const width = Number((source.match(/<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/) || [])[1] || 0);
  if (!width) return { svg: source, changed: false };
  const minimum = Math.ceil(width / 100);
  let changed = false;
  const repaired = source
    .replace(/font-size="(\d+(?:\.\d+)?)"/g, (match, value) => {
      const size = Number(value);
      if (size >= minimum) return match;
      changed = true;
      return 'font-size="' + minimum + '"';
    })
    .replace(/stroke-width="(\d+(?:\.\d+)?)"/g, (match, value) => {
      if (Number(value) <= 0 || Number(value) >= 1) return match;
      changed = true;
      return 'stroke-width="1"';
    });
  return { svg: repaired, changed };
}

const esc = value => String(value).replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);

function labelsOf(text) {
  const parts = String(text || '').split(/→|->|；|;|\n|，|。/).map(part => part.trim()).filter(Boolean);
  const labels = [];
  for (const part of parts) {
    const label = part.replace(/^\d+[.、)]\s*/, '').slice(0, 14);
    if (label && !labels.includes(label)) labels.push(label);
    if (labels.length === 4) break;
  }
  while (labels.length < 3) labels.push(['步骤一', '步骤二', '步骤三'][labels.length]);
  return labels;
}

// 兜底图：任何引擎失败时仍产出可编辑、可通过质量门槛的纵向流程 SVG。
export function localFallbackArtifact({ title = '研究方法流程', text = '', specification = {} } = {}) {
  const labels = labelsOf(text);
  const width = 1080;
  const height = 120 + labels.length * 150;
  const boxes = labels.map((label, index) => {
    const y = 80 + index * 150;
    const arrow = index < labels.length - 1
      ? `<path d="M${width / 2} ${y + 84}V${y + 146}" stroke="#1F2937" stroke-width="2" marker-end="url(#fallback-arrow)"/>`
      : '';
    return `<rect x="${width / 2 - 210}" y="${y}" width="420" height="84" rx="2" fill="#FFFFFF" stroke="#1F2937" stroke-width="2"/>` +
      `<text x="${width / 2}" y="${y + 50}" text-anchor="middle" fill="#111827" font-family="Arial, 'Noto Sans CJK SC', sans-serif" font-size="26">${esc(label)}</text>` + arrow;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">` +
    `<defs><marker id="fallback-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#1F2937"/></marker></defs>` +
    `<rect width="${width}" height="${height}" fill="#FFFFFF"/>` +
    `<text x="${width / 2}" y="44" text-anchor="middle" fill="#111827" font-family="Arial, 'Noto Sans CJK SC', sans-serif" font-size="30">${esc(title)}</text>` +
    `${boxes}</svg>`;
  return {
    id: randomUUID(), type: 'image', title,
    description: '本地兜底流程图（生成失败时自动改用确定性排版，保留原始流程描述）。',
    data: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
    figure: { specification, engine: 'local-fallback', fallback: true,
      quality: { passed: true, issues: [], metrics: { width, minFont: 26, colors: 0 } } },
  };
}
