import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { flowPlanToD2 } from './flow-d2.mjs';
import { journalFigureRules } from './flow-journal-style.mjs';

export const flowDrawingRules = [
  '先确定读者看完应理解的一句话（purpose），再选拓扑（archetype）：pipeline 顺序转换、overview-detail 总览放大、branch 分叉汇合、cycle 回路、swimlane 按参与方分组。以原材料中真实存在的关系为准。',
  '有用户确认步骤时按其内容建立图稿。把参考图拆成阅读方向、分组方式、连线、强调色、标注密度；参考图只提供视觉规则。用户的画布、字体、节点或公式要求优先。',
  '让每个面板完成一个解释任务。用图形区分样本、数据、操作、判定和结果；光谱、模型、矩阵和公式优先用相应矢量图元。同一个对象跨面板保持一致，颜色之外还要有形状或文字区分。',
  '需要图像草稿的概念图可以先探索构图。流程图用原生矢量重建，保留文字、箭头、公式和分组，参考图与复杂背景不成为流程图的内容层。',
  '根据复杂度选择 nodeStyle：glyph 适合数据对象和光谱条带较多的科研图，card 适合强调操作边界，plain 适合文字密集或简洁黑白图。leader 默认使用 line 细引线，none 用于无需引线的构图；只有参考图明确需要时才使用 ribbon。保持图注与正文可辨。',
  journalFigureRules,
].join('\n');

export function selectFlowReferences(papers, inputs, limit = 2, { requireTopicMatch = false } = {}) {
  const words = String(inputs).toLowerCase().match(/[a-z][a-z0-9-]{3,}|[\p{Script=Han}]{2}/gu) || [];
  const terms = [...new Set(words)].filter(word => !/^(?:with|from|figure|workflow|flowchart|diagram|method|study|model|data|research|analysis|流程|阶段|使用|绘制|方法|模型|研究|分析)$/.test(word));
  const diagram = /workflow|flowchart|flow diagram|pipeline|architecture|schematic|method overview|流程|架构|示意/i;
  const candidates = papers.flatMap(paper => (paper.figures || []).map(figure => {
    const searchable = (figure.caption || '').toLowerCase();
    const topicScore = terms.filter(term => searchable.includes(term)).length * 2 +
      terms.filter(term => paper.title?.toLowerCase().includes(term)).length;
    const score = (diagram.test(searchable) ? 4 : 0) + topicScore;
    return { figure: { ...figure, sourceId: paper.id, doi: paper.doi, pmcid: paper.pmcid }, score, topicScore };
  })).sort((a, b) => b.score - a.score);
  const selected = [];
  const sources = new Set();
  const images = new Set();
  for (const { figure, topicScore } of candidates) {
    if (!figure.bytes || sources.has(figure.sourceId) || requireTopicMatch && !topicScore) continue;
    const hash = createHash('sha256').update(figure.bytes).digest('hex');
    if (images.has(hash)) continue;
    images.add(hash);
    sources.add(figure.sourceId);
    selected.push(figure);
    if (selected.length === limit) break;
  }
  return selected;
}

export function flowDesignFromStages(stages, design = {}) {
  const links = stages.flatMap(stage => stage.links);
  const parallel = stages.some(stage => stage.columns.some(column => column.length > 1));
  const archetype = design.archetype || (links.some(([from, to]) => from[0] > to[0]) ? 'cycle' :
    parallel ? 'branch' : 'overview-detail');
  const dataShapes = new Set(['matrix', 'stack', 'vector', 'spectrum', 'model', 'formula', 'samples', 'combination']);
  const nodeStyle = design.nodeStyle || (stages.some(stage => stage.columns.flat().some(node => dataShapes.has(node.shape))) ? 'glyph' : 'card');
  return { ...design, archetype, nodeStyle, leader: design.leader || 'line' };
}

export function flowGeometryScore(checks, isolated = 0) {
  if (!checks || checks.unavailable) return Infinity;
  return checks.clipped * 30 + checks.overlaps * 10 + isolated * 30 +
    (checks.smallLabels || 0) * 2 + (checks.edgeObstructions || 0) * 8 + (checks.nodeOverlaps || 0) * 15 +
    (checks.emptyPanels || 0) * 3;
}

export function preservesFlowContent(before, after) {
  const signature = stages => stages.map(stage => {
    const nodes = stage.columns.flat().map(node => JSON.stringify([node.label, node.expression || ''])).sort();
    const nodeKey = ([col, row]) => {
      const node = stage.columns[col][row];
      const matches = stage.columns.flat().filter(candidate => candidate.label === node.label &&
        (candidate.expression || '') === (node.expression || ''));
      return [node.label, node.expression || '', matches.length > 1 ? [col, row] : null];
    };
    const edges = stage.links.map(([from, to, label]) => JSON.stringify([nodeKey(from), nodeKey(to), label || ''])).sort();
    return [stage.title, stage.input?.label, stage.output?.label, nodes, edges];
  });
  return JSON.stringify(signature(before)) === JSON.stringify(signature(after));
}

export function preservesSvgLabels(before, after) {
  const labels = data => {
    const svg = Buffer.from(data.split(',')[1], 'base64').toString('utf8');
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return Array.from(document.getElementsByTagName('text'), node => node.textContent.replace(/\s+/g, ' ').trim())
      .filter(Boolean).sort();
  };
  return JSON.stringify(labels(before)) === JSON.stringify(labels(after));
}

export async function exportFlowArchive(artifact) {
  const zip = new JSZip();
  const files = {};
  function add(name, bytes) {
    zip.file(name, bytes);
    files[name] = createHash('sha256').update(bytes).digest('hex');
  }
  const { designBrief, ...details } = artifact.figure;
  const references = designBrief?.references?.map(({ data, ...metadata }) => metadata);
  add('figure.svg', Buffer.from(artifact.data.split(',')[1], 'base64'));
  add('figure.json', JSON.stringify({ ...details, designBrief: { ...designBrief, references } }, null, 2));
  if (Array.isArray(details.flowPlan)) {
    add('figure.d2', flowPlanToD2(details.flowPlan, {
      title: details.specification?.title || artifact.title,
      layout: details.flowLayout?.name === 'ELK' ? 'elk' : 'tala',
    }));
  }
  if (designBrief?.prompt) add('drawing-prompt.txt', designBrief.prompt);
  zip.file('manifest.json', JSON.stringify({ format: 'sparkseed-flow-archive', version: 1, artifactId: artifact.id, sha256: files }, null, 2));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
