import { randomUUID } from 'node:crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const namespace = 'http://www.w3.org/2000/svg';
const elements = new Set('svg g defs clipPath marker pattern linearGradient radialGradient stop path line rect circle ellipse polyline polygon text tspan title desc'.split(' '));
const attributes = new Set(('id viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points dx dy transform ' +
  'fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray opacity ' +
  'font-family font-weight font-size font-style text-anchor dominant-baseline baseline-shift letter-spacing ' +
  'preserveAspectRatio clip-path clipPathUnits marker-start marker-mid marker-end markerWidth markerHeight markerUnits ' +
  'refX refY orient patternUnits patternContentUnits patternTransform gradientUnits gradientTransform fx fy offset stop-color stop-opacity ' +
  'role aria-label aria-labelledby aria-describedby aria-hidden').split(' '));
const paintReferences = new Set(['fill', 'stroke', 'stop-color', 'clip-path', 'marker-start', 'marker-mid', 'marker-end']);

export function validateModelSvg(value) {
  const svg = typeof value === 'string' ? value.trim() : '';
  const invalid = () => new Error('模型返回的 SVG 格式不受支持。请重试，或换一个绘图模型。');
  if (!svg || svg.length > 500_000 || /<\?|<!DOCTYPE|<!ENTITY/i.test(svg)) throw invalid();
  let document;
  try { document = new DOMParser({ onError() { throw invalid(); } }).parseFromString(svg, 'image/svg+xml'); }
  catch { throw invalid(); }
  const root = document.documentElement;
  const validSize = value => /^\d+(?:\.\d+)?(?:px)?$/.test(value) && parseFloat(value) >= 100 && parseFloat(value) <= 2000;
  if (root?.tagName !== 'svg' || !validSize(root.getAttribute('width')) || !validSize(root.getAttribute('height'))) throw invalid();
  const viewBox = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || viewBox.some(number => !Number.isFinite(number)) || viewBox[2] <= 0 || viewBox[3] <= 0) throw invalid();
  let count = 0;
  function visit(node, depth) {
    if (++count > 12000 || depth > 40) throw invalid();
    if ([3, 4, 8].includes(node.nodeType)) return;
    if (node.nodeType !== 1 || node.namespaceURI !== namespace || !elements.has(node.tagName)) throw invalid();
    for (const attribute of Array.from(node.attributes)) {
      if (node === root && attribute.name === 'xmlns' && attribute.value === namespace) continue;
      if (attribute.namespaceURI || !attributes.has(attribute.name)) throw invalid();
      if (paintReferences.has(attribute.name) &&
          !/^(?:[\w#.%\s,-]+|(?:rgba?|hsla?)\([0-9.,%\s-]+\)|url\(#[\w.-]+\))$/i.test(attribute.value)) throw invalid();
    }
    for (const child of Array.from(node.childNodes)) visit(child, depth + 1);
  }
  for (const child of Array.from(document.childNodes)) visit(child, 0);
  return new XMLSerializer().serializeToString(root);
}

export function modelFigureArtifact(output, specification, metadata) {
  const svg = validateModelSvg(output?.svg);
  const title = specification.title.trim() || (typeof output.title === 'string' && output.title.trim().slice(0, 120)) || 'AI 科研图';
  const summary = typeof output.summary === 'string' ? output.summary.trim().slice(0, 600) : '';
  const checks = Array.isArray(output.checks) ? output.checks.slice(0, 6)
    .filter(check => typeof check === 'string').map(check => check.trim().slice(0, 240)).filter(Boolean) : [];
  return { id: randomUUID(), type: 'image', title, description: summary,
    data: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
    figure: { specification, ...metadata, summary, warnings: checks } };
}
