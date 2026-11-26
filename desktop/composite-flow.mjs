import { overviewDetailInstructions } from './figure-workflow.mjs';
import { flowFormulaSize, layoutCompositeStage, wrapFlowNodeLabel } from './flow-layout.mjs';
import { flowDesignFromStages, flowDrawingRules } from './flow-design.mjs';

const glyphs = ['process', 'matrix', 'stack', 'vector', 'decision', 'spectrum', 'model', 'formula', 'samples', 'combination'];
const stageColors = { rose: '#a7445b', green: '#39714e', teal: '#216e7e', violet: '#654d94', amber: '#895418', indigo: '#405e9e' };
const colors = Object.values(stageColors);
const bands = ['#8f5da5', '#435aa2', '#198491', '#51a491', '#b3bd45', '#e4a531', '#cc5465'];
const safe = value => String(value).toWellFormed().replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '�')
  .replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);

export const compositeFlowInstructions = [
  flowDrawingRules,
  overviewDetailInstructions,
  '只输出 JSON 版式规格，不输出 SVG。形状可用 process（操作）、matrix（矩阵）、stack（堆叠）、vector（条带）、decision（判断）。依据材料选择形状，不添加不存在的关系、结果和步骤。',
  'stages 为横向总览的 2–4 个阶段，标题简短。每个阶段的 columns 是 1–3 列，从左向右读，每列最多 3 个并行节点。编号仅通过列、行的零基索引表示。links 表示阶段内真实关系，可以从左或右连接，或同列上下连接；只在原文明确条件时给连线加短 label（例如“通过”“未通过”）。总览阶段按数组顺序连接。',
  '格式 {"stages":[{"title":"阶段名称","columns":[[{"label":"节点","shape":"process"}],[{"label":"输出","shape":"vector"}]],"links":[[[0,0],[1,0],"通过"]]}]}。每个节点标签最多 48 个字符，连线标签最多 24 个字符。缺少细节的阶段用单个忠实节点表达。',
  '列表示固定阅读层级，列内节点表示并行或同一阶段的子项。让有真实关系的节点尽量相邻；减少交叉线和长回路线。不要为了填满画布拆散同一阶段。',
  '按 figureSpec.archetype 安排阶段内读序。pipeline 尽量一条主线；branch 把同源并行节点放在同一列，汇合点置于下游；cycle 为原有回路保留回连边；overview-detail 的总览只承担阶段导航，关键机制留在详图。',
  '详图只展开总览无法表达的机制、判定和变换。一个阶段只有单项操作时，保留该操作即可，不再用同义节点复述阶段标题或输入输出。组数、分支方向和图元按材料决定。原文指定的重复实验、采样批次和对照组须保留。',
  '以材料中的已编辑步骤为准。原始描述补充研究细节和视觉要求。保持标签使用指定语言，保留公式、符号和术语。缩写可独立成行，尽量使用短标签。',
  'drawingPrompt 提供扩展后的绘图要求。用它选择布局、标注和语义图形，流程事实仍以原始步骤为准。',
  'requirements 和 constraints 为用户的绘图要求，constraints 优先。按 drawingPrompt 和这些原始要求规划分组、形状及节点文字，保留已确认的科学内容。',
  '检索到的论文片段用于理解领域术语和方法，只能依据已编辑步骤及描述确定当前项目流程。论文中的条件、步骤或结论不得冒充用户项目事实。',
  '每个详细节点如有论文原文依据，附 evidence 数组，格式 {"id":"论文 id","page":页码或null,"section":"正文小节名（仅正文小节）","quote":"原文连续摘录"}。总览节点的引用放在 overview.inputEvidence / overview.outputEvidence。摘要使用 page:null 且不填 section；PDF 使用实际页码；正文小节使用 page:null 和准确 section。quote 必须逐字出现在给定片段，至少 12 字符。无对应原文时 evidence:[]，不可编造引用。项目特有步骤即使没有论文支持也保留。',
  '按语义选形：spectrum 画光谱或按波长排列的输入，model 画回归、拟合或多特征合并，formula 画材料已提供的公式（可加 expression 字段）。阶段可加 color 字段，选 rose、green、teal、violet、amber、indigo。需要对照时重复同一视觉符号。',
  '明确的重复采样可用 samples，明确的候选特征组合可用 combination。图元只标明实体类别，不表示具体样本数量。',
  '阶段标题可加 overview：{"input":"明确的输入标签","output":"明确的输出标签","inputShape":"spectrum","outputShape":"vector"}。仅在原材料说明输入、输出时填写，并用这些信息串联主流程。',
].join('\n');

export const compositeFlowRevisionInstructions = [
  compositeFlowInstructions,
  '根据初稿的版面检查调整分布、节点列和图形。保留阶段标题、总览输入输出、节点标签、公式及连线两端和标签；保持阶段顺序，允许调整阶段内索引。',
  '保留所有已提供的节点 evidence 原文引用以及总览 inputEvidence/outputEvidence。',
  '结构检查中可能列出孤立节点。自动排版修订只处理视觉问题，保留该节点和已有连线供用户检查。',
].join('\n');

export const compositeFlowCritiqueInstructions = [
  '第一张附图是需要审查的实际渲染结果。若 visualDraftImage 指出第二张图，使用它对照视觉重点及比例。草案中的文字和箭头须按用户材料及核对项判断。',
  '若提供 composition，对照成图检查整体阅读顺序、各区相对面积及核心图形大小。图元小到无法辨认或重要区域被挤压时，指出该区域和可执行的放大或重排建议。',
  '你是科研流程图审稿员。检查附带的真实渲染图，结合结构规格检查阅读顺序、留白、阶段密度、节点对齐、箭头连接、图形与标签匹配、颜色区分和裁切。',
  '仅报告截图中清晰可见的问题。流程步骤与用户材料冲突属于 critical，空间挤压、箭头误导或重要标签难读属于 major，轻微不统一属于 minor。不要仅为个人审美要求修改。',
  '逐条对照 requirements、constraints 和 designChecks。图中明确违反硬性约束时记为 critical，并写明对应要求和可执行的修复。',
  '返回 JSON {"verdict":"pass|revise","issues":[{"severity":"critical|major|minor","location":"阶段/节点","problem":"可观察的问题","fix":"局部修复建议"}]}。没有明确问题返回 pass 和空数组。',
].join('\n');

export function normalizeFlowCritique(value) {
  const issues = Array.isArray(value?.issues) ? value.issues.slice(0, 8).flatMap(issue => {
    if (!['critical', 'major', 'minor'].includes(issue?.severity) ||
        typeof issue.problem !== 'string' || !issue.problem.trim()) return [];
    return [{ severity: issue.severity, location: String(issue.location || '整体布局').slice(0, 100),
      problem: issue.problem.trim().slice(0, 260), fix: String(issue.fix || '').trim().slice(0, 260) }];
  }) : [];
  return { verdict: issues.some(issue => issue.severity !== 'minor') ? 'revise' : 'pass', issues };
}

export function inspectCompositeStructure(stages) {
  const isolated = [];
  let nodes = 0;
  for (const [stageIndex, stage] of stages.entries()) {
    const degree = stage.columns.map(column => column.map(() => 0));
    for (const [from, to] of stage.links) {
      degree[from[0]][from[1]]++;
      degree[to[0]][to[1]]++;
    }
    for (const [columnIndex, column] of stage.columns.entries()) {
      for (const [rowIndex] of column.entries()) {
        nodes++;
        if (degree[columnIndex][rowIndex] === 0 && stage.columns.flat().length > 1) {
          isolated.push({ stage: stage.title, stageIndex, columnIndex, rowIndex });
        }
      }
    }
  }
  return { stages: stages.length, nodes, links: stages.reduce((sum, stage) => sum + stage.links.length, 0),
    isolated, valid: isolated.length === 0 };
}

export function normalizeCompositeFlow(value) {
  const invalid = () => new Error('模型返回的阶段版式无效。请明确主流程和阶段内关系后重试。');
  const label = text => {
    const compact = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
    if (!compact || compact.length > 96) throw invalid();
    return compact;
  };
  const evidence = items => Array.isArray(items) ? items.slice(0, 2).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const id = typeof item.id === 'string' ? item.id.trim().slice(0, 180) : '';
    const quote = typeof item.quote === 'string' ? item.quote.trim().slice(0, 360) : '';
    const section = typeof item.section === 'string' ? item.section.trim().slice(0, 160) : '';
    const page = Number.isSafeInteger(item.page) && item.page > 0 ? item.page : null;
    return id || quote ? [{ id, quote, page, ...(section ? { section } : {}) }] : [];
  }) : [];
  if (!Array.isArray(value?.stages) || value.stages.length < 2 || value.stages.length > 4) throw invalid();
  return value.stages.map(stage => {
    if (!Array.isArray(stage?.columns) || !stage.columns.length || stage.columns.length > 3) throw invalid();
    const columns = stage.columns.map(column => {
      if (!Array.isArray(column) || !column.length || column.length > 3) throw invalid();
      return column.map(node => ({ label: label(node?.label), shape: glyphs.includes(node?.shape) ? node.shape : 'process',
        evidence: evidence(node?.evidence),
        ...(node?.shape === 'formula' && typeof node.expression === 'string' && node.expression.trim() ?
          { expression: label(node.expression) } : {}) }));
    });
    const port = point => Array.isArray(point) && point.length === 2 && point.every(Number.isInteger) &&
      columns[point[0]]?.[point[1]];
    if (!Array.isArray(stage.links) || stage.links.length > 15) throw invalid();
    const links = stage.links.map(link => {
      if (!Array.isArray(link) || (link.length !== 2 && link.length !== 3) || !link.slice(0, 2).every(port) ||
          (link[0][0] === link[1][0] && link[0][1] === link[1][1])) throw invalid();
      if (link.length === 3 && typeof link[2] !== 'string') throw invalid();
      const edgeLabel = typeof link[2] === 'string' ? link[2].trim() : '';
      if (edgeLabel.length > 24 || /[\r\n]/.test(edgeLabel)) throw invalid();
      return edgeLabel ? [link[0], link[1], edgeLabel] : [link[0], link[1]];
    });
    const overview = stage.overview || { input: stage.input?.label, inputShape: stage.input?.shape,
      output: stage.output?.label, outputShape: stage.output?.shape };
    return { title: label(stage.title), columns, links,
      ...(Object.hasOwn(stageColors, stage.color) ? { color: stage.color } : {}),
      ...(typeof overview?.input === 'string' && overview.input.trim() ? {
        input: { label: label(overview.input), shape: glyphs.includes(overview.inputShape) ? overview.inputShape : 'vector',
          evidence: evidence(overview.inputEvidence || stage.input?.evidence) },
      } : {}),
      ...(typeof overview?.output === 'string' && overview.output.trim() ? {
        output: { label: label(overview.output), shape: glyphs.includes(overview.outputShape) ? overview.outputShape : 'vector',
          evidence: evidence(overview.outputEvidence || stage.output?.evidence) },
      } : {}) };
  });
}

function labelLines(value, width, size) {
  const lines = [];
  let line = '';
  let used = 0;
  for (const token of value.match(/[!-~]+|\s+|[^\x00-\x7f]/gu) || []) {
    if (!line && !token.trim()) continue;
    const advance = [...token].reduce((sum, character) => sum + (/^[\u0020-\u007e]$/.test(character) ? .61 : 1.04) * size, 0);
    if (used + advance > width && line.trim()) {
      lines.push(line.trim());
      line = '';
      used = 0;
    }
    if (!line && !token.trim()) continue;
    line += token;
    used += advance;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function fitLabel(value, width, size) {
  const longest = Math.max(0, ...(value.match(/[!-~]+/g) || []).map(word => word.length));
  return longest ? Math.min(size, width / (.61 * longest)) : size;
}

function text(x, y, value, width, size, fill, bold = false) {
  size = fitLabel(value, width, size);
  return labelLines(value, width, size).map((line, index) =>
    `<text x="${x}" y="${y + index * size * 1.28}" fill="${fill}" font-size="${size}" text-anchor="middle" font-weight="${bold ? 650 : 450}">${safe(line)}</text>`).join('');
}

function glyph(shape, x, y, ink, multicolor, scale = 1) {
  const color = i => multicolor ? bands[i % bands.length] : ink;
  const mark = (dx, dy, width, height, fill = ink, opacity = 1) =>
    `<rect x="${dx}" y="${dy}" width="${width}" height="${height}" rx="1.7" fill="${fill}" fill-opacity="${opacity}"/>`;
  let art;
  if (shape === 'matrix') art = Array.from({ length: 12 }, (_, i) =>
    mark(i % 4 * 10 - 19, Math.floor(i / 4) * 9 - 13, 8, 7, color(i), multicolor ? .86 : i % 4 / 5 + .36)).join('');
  else if (shape === 'stack') art = [8, 3, -2, -7].map((dy, i) =>
    `<path d="M-16 ${dy}l8-9h26l-8 9Z" fill="${ink}" fill-opacity="${.36 + i * .19}" stroke="${ink}" stroke-width=".55"/>`).join('');
  else if (shape === 'spectrum') art = bands.map((_, i) =>
    mark(-8, i * 6 - 21, 16, 6, color(i), .55 + i * .07)).join('');
  else if (shape === 'vector') art = [0, 1, 2, 3, 4].map(i =>
    mark(i * 8 - 20, -7, 6, 14, ink, .45 + i * .12)).join('');
  else if (shape === 'model') art = [-13, 0, 13].map(cy =>
    `<path d="M-13 ${cy}L14 0" stroke="${ink}" stroke-width="1" stroke-dasharray="2 2"/><circle cx="-15" cy="${cy}" r="4.6" fill="${ink}"/>`).join('') +
    `<circle cx="14" cy="0" r="6" fill="${ink}"/>`;
  else if (shape === 'samples') art = [-15, -6, 6, 15].map((dx, i) =>
    mark(dx - 2, -10 + i % 2 * 3, 5, 20, color(i), .65 + i * .08)).join('');
  else if (shape === 'combination') art = `<path d="M-16 -12q-5 0-5 5v4l-3 3 3 3v4q0 5 5 5m32-24q5 0 5 5v4l3 3-3 3v4q0 5-5 5" fill="none" stroke="${ink}" stroke-width="1.5"/>` +
    [-12, -4, 5].map((dx, i) => mark(dx, -7, 5, 7, color(i)) + mark(dx, 1, 5, 7, color(i + 3))).join('');
  else if (shape === 'decision') art = `<path d="M0 -14l18 14-18 14-18-14Z" stroke="${ink}" stroke-width="1.5" fill="${ink}" fill-opacity=".18"/>`;
  else art = mark(-19, -12, 38, 24, ink, .30) + `<path d="M-12 -6h24m-24 6h18m-18 6h12" stroke="${ink}" stroke-width="1.8"/>`;
  return `<g transform="translate(${x} ${y}) scale(${scale})">${art}</g>`;
}

function flowPath(points) {
  if (points.length < 2 || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return '';
  let d = `M${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const before = points[index - 1];
    const current = points[index];
    const after = points[index + 1];
    const radius = Math.min(7, Math.hypot(current.x - before.x, current.y - before.y) / 2,
      Math.hypot(after.x - current.x, after.y - current.y) / 2);
    const toward = (from, to) => {
      const distance = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      return { x: current.x + (to.x - current.x) * radius / distance,
        y: current.y + (to.y - current.y) * radius / distance };
    };
    const entry = toward(current, before);
    const exit = toward(current, after);
    d += `L${entry.x} ${entry.y}Q${current.x} ${current.y} ${exit.x} ${exit.y}`;
  }
  const last = points.at(-1);
  return d + `L${last.x} ${last.y}`;
}

function nodeCard(node, color, ink, paper, multicolor, style, labelSize, formulaSize) {
  const left = node.x - node.width / 2;
  const top = node.y - node.height / 2;
  const { glyphScale, glyphHeight, lines: labelLinesForNode, expressionLines, lineHeight } = node;
  const contentCount = labelLinesForNode.length + expressionLines.length;
  const firstY = glyphScale ? top + 18 + glyphHeight + labelSize : node.y + labelSize / 3 - (contentCount - 1) * lineHeight / 2;
  const labelSvg = [
    ...expressionLines.map((line, index) => {
      const expression = safe(line).replace(/_([a-zA-Z0-9]+)/g,
        `<tspan baseline-shift="sub" font-size="${Math.round(formulaSize * .72)}">$1</tspan>`);
      return `<text x="${node.x}" y="${firstY + index * lineHeight}" fill="${ink}" font-size="${formulaSize}" text-anchor="middle" font-weight="650" font-style="italic">${expression}</text>`;
    }),
    ...labelLinesForNode.map((line, index) => `<text x="${node.x}" y="${firstY + (index + expressionLines.length) * lineHeight}" fill="${ink}" font-size="${labelSize}" text-anchor="middle" font-weight="520">${safe(line)}</text>`),
  ].join('');
  const framed = style === 'card' || style === 'glyph' && (!glyphScale || node.shape === 'process');
  return `<g id="${node.id}">
    <rect id="${node.id}-bounds" x="${left}" y="${top}" width="${node.width}" height="${node.height}" rx="2" fill="${framed ? paper : 'none'}" stroke="${framed ? color : 'none'}" stroke-opacity=".72" stroke-width="1.1"/>
    ${glyphScale ? glyph(node.shape, node.x, top + 10 + glyphHeight / 2, color, multicolor, glyphScale) : ''}${labelSvg}
    <title>${safe(node.expression ? node.expression + ' · ' + node.label : node.label)}</title>
  </g>`;
}

export function renderCompositeFlow(stages, specification, design = {}) {
  design = flowDesignFromStages(stages, design);
  const width = specification.width;
  const labelSize = Math.max(14, Math.round(width / 80));
  const formulaSize = Math.max(flowFormulaSize, labelSize + 2);
  const theme = specification.theme;
  const paper = theme === 'ink' ? '#192234' : '#ffffff';
  const ink = theme === 'ink' ? '#f4f6fc' : '#172333';
  const accent = index => {
    if (theme === 'mono') return '#59616d';
    if (theme === 'ink') return ['#ff9ab0', '#86d6a3', '#73d3e3', '#c1abff'][index];
    const chosen = design.palette?.[index];
    // A near-white accent makes routes and glyphs disappear on the paper.
    if (chosen && /^#[\da-f]{6}$/i.test(chosen) &&
        chosen.slice(1).match(/../g).some(channel => parseInt(channel, 16) < 180)) return chosen;
    return stageColors[stages[index].color] || colors[index];
  };
  const multicolor = theme !== 'mono';
  const title = specification.title.trim() || '研究流程';
  const titleLines = labelLines(title, width - 58, fitLabel(title, width - 58, 24)).length;
  const top = 16 + titleLines * 31;
  const margin = 18;
  const gap = 14;
  const stageWidth = (width - margin * 2) / stages.length;
  const headY = top + 10;
  const availableWidth = width - margin * 2;
  const slot = Math.floor((availableWidth - gap * (stages.length - 1)) / stages.length);
  const alignPanels = design.layout === 'compact' && design.archetype === 'overview-detail';
  const aligned = alignPanels && slot >= 218 ? stages.map(stage => {
    const columns = stage.columns.length;
    const maxNodeWidth = Math.floor((slot - 40 - 24 * (columns - 1)) / columns);
    return maxNodeWidth >= 112 ? layoutCompositeStage(stage, true, maxNodeWidth, labelSize, formulaSize, design.nodeStyle) : null;
  }) : [];
  const fitsAligned = aligned.length > 0 && aligned.every(layout => layout && layout.width + 24 <= slot);
  const layouts = fitsAligned ? aligned : stages.map(stage => layoutCompositeStage(stage, design.compactSpacing, 182, labelSize, formulaSize, design.nodeStyle));
  const preferredWidths = layouts.map(layout => fitsAligned ? slot : Math.max(218, layout.width + 24));
  const labelKey = label => label?.normalize('NFKC').trim().toLowerCase();
  const sharedTransfer = stages.map((stage, index) => {
    const next = stages[index + 1];
    const label = labelKey(stage.output?.label);
    return Boolean(label && label === labelKey(next?.input?.label) &&
      [stage, next].some(panel => panel.columns.flat().some(node => labelKey(node.label) === label)));
  });
  const hasInput = stages.map((stage, index) => Boolean(stage.input &&
    (index === 0 || labelKey(stages[index - 1].output?.label) !== labelKey(stage.input.label))));
  const hasOutput = stages.map((stage, index) => Boolean(stage.output && !sharedTransfer[index]));
  const endpointWidth = Math.min(100, stageWidth * .26);
  const endpointScale = Math.min(1.2, (stageWidth * .105 - 6) / 22, endpointWidth / 44);
  const endpointLabelOffset = Math.max(24, Math.ceil(21 * endpointScale) + 12);
  const overviewHeight = Math.max(76, ...stages.map((stage, i) => {
    const heading = String.fromCharCode(65 + i) + ' · ' + stage.title;
    const textWidth = stageWidth * .52 - 8;
    const endpointRows = Math.max(0, ...[hasInput[i] && stage.input, hasOutput[i] && stage.output].filter(Boolean).map(node =>
      wrapFlowNodeLabel(node.label, endpointWidth, 12).length));
    return Math.max(labelLines(heading, textWidth, fitLabel(heading, textWidth, 14)).length * 18 + 36,
      endpointRows * 30 + 16 + 2 * (endpointLabelOffset - 24));
  }));
  const maxPerRow = design.layout === 'stacked' ? 1 : design.layout === 'panels' ? 2 : stages.length;
  const rows = [];
  for (let index = 0; index < stages.length; index++) {
    const row = rows.at(-1);
    const nextWidth = row ? row.reduce((sum, item) => sum + preferredWidths[item.index], 0) +
      gap * row.length + preferredWidths[index] : preferredWidths[index];
    if (!row || row.length >= maxPerRow || nextWidth > availableWidth) rows.push([{ index }]);
    else row.push({ index });
  }
  let footer = headY + overviewHeight + 31;
  const metrics = new Array(stages.length);
  for (const row of rows) {
    const rowWidth = row.reduce((sum, item) => sum + Math.min(preferredWidths[item.index], availableWidth), 0) + gap * (row.length - 1);
    const rowStart = Math.max(margin, (width - rowWidth) / 2);
    const headerHeights = row.map(({ index }) => {
      const headerWidth = Math.min(preferredWidths[index], availableWidth) - 54;
      const heading = stages[index].title;
      const size = fitLabel(heading, headerWidth, labelSize);
      return Math.max(38, 18 + labelLines(heading, headerWidth, size).length * Math.ceil(size * 1.28));
    });
    const panelHeight = Math.max(...row.map(({ index }, rowIndex) => layouts[index].height +
      headerHeights[rowIndex] + 12 + layouts[index].links.filter(link => link.feedback || link.sameRank).length * 12));
    let x = rowStart;
    for (const [rowIndex, { index }] of row.entries()) {
      const panelWidth = Math.min(preferredWidths[index], availableWidth);
      metrics[index] = { x, y: footer, panelWidth, panelHeight, headerHeight: headerHeights[rowIndex], layout: layouts[index] };
      x += panelWidth + gap;
    }
    footer += panelHeight + gap;
  }
  const caption = specification.caption.trim();
  const height = Math.ceil(footer + 6 + (caption ? labelLines(caption, width - 60, 14).length * 18 + 12 : 0));
  const frame = (x, y, w, h, color) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${design.frame === 'open' ? 0 : 2}" fill="${design.frame === 'open' ? 'none' : '#fff'}" stroke="${design.frame === 'open' ? 'none' : color}" stroke-width="1.1" stroke-opacity=".55"${design.frame === 'dashed' ? ' stroke-dasharray="6 4"' : ''}/>`;
  const overview = [];
  const leaders = [];
  const panels = [];
  const arrowheads = [];
  stages.forEach((stage, index) => {
    const color = accent(index);
    const letter = String.fromCharCode(65 + index);
    const { x, y, panelWidth, panelHeight, headerHeight, layout } = metrics[index];
    const anchor = margin + (index + .5) * stageWidth;
    const panelCenter = x + panelWidth / 2;
    const stageMiddle = headY + overviewHeight / 2;
    const boxWidth = stageWidth * .52;
    const nodeWidth = endpointWidth;
    const partX = direction => anchor + direction * stageWidth * .365;
    const heading = letter + ' · ' + stage.title;
    const headingSize = fitLabel(heading, boxWidth - 8, 14);
    const headingRows = labelLines(heading, boxWidth - 8, headingSize).length;
    overview.push(`<rect x="${anchor - boxWidth / 2}" y="${headY + 2}" width="${boxWidth}" height="${overviewHeight - 4}" rx="2" fill="#fff" stroke="${color}" stroke-width="1.1"/>`,
      text(anchor, stageMiddle + headingSize / 3 - (headingRows - 1) * headingSize * .64, heading, boxWidth - 8, 14, ink, true));
    for (const [part, direction] of [[hasInput[index] ? stage.input : null, -1],
      [hasOutput[index] ? stage.output : null, 1]]) {
      if (!part) continue;
      const lines = wrapFlowNodeLabel(part.label, nodeWidth, 12);
      const iconY = stageMiddle - 7;
      overview.push(glyph(part.shape, partX(direction), iconY, color, multicolor, endpointScale),
        ...lines.map((line, row) => `<text x="${partX(direction)}" y="${iconY + endpointLabelOffset + row * 15}" font-size="12" text-anchor="middle" fill="${ink}">${safe(line)}</text>`));
    }
    const arrow = (start, end) => `<path d="M${start} ${stageMiddle - 7}H${end}" stroke="${ink}" stroke-width="1.5" marker-end="url(#flow-arrow)"/>`;
    const symbolExtent = Math.ceil(22 * endpointScale) + 2;
    if (hasInput[index]) overview.push(arrow(partX(-1) + symbolExtent, anchor - boxWidth / 2 - 2));
    if (hasOutput[index]) overview.push(arrow(anchor + boxWidth / 2 + 2, partX(1) - symbolExtent));
    if (index < stages.length - 1) {
      const nextAnchor = margin + (index + 1.5) * stageWidth;
      const nextBoxWidth = stageWidth * .52;
      const start = hasOutput[index] ? partX(1) + symbolExtent : anchor + boxWidth / 2 + 2;
      const end = hasInput[index + 1] ? nextAnchor - stageWidth * .365 - symbolExtent : nextAnchor - nextBoxWidth / 2 - 2;
      overview.push(arrow(start, end));
    }
    arrowheads.push(`<marker id="flow-arrow-${index}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4 0 8Z" fill="${color}"/></marker>`);
    if (rows.length === 1 && design.leader !== 'none') {
      const start = headY + overviewHeight - 2;
      leaders.push(design.leader === 'ribbon' ?
        `<polygon points="${anchor - 13},${start} ${anchor + 13},${start} ${panelCenter + 34},${y} ${panelCenter - 34},${y}" fill="${color}" fill-opacity=".19"/>` :
        `<path d="M${anchor} ${start}L${panelCenter} ${y}" stroke="${color}" stroke-opacity=".42" stroke-width="1.2" stroke-dasharray="3 4"/>`);
    }

    const graphX = x + (panelWidth - layout.width) / 2;
    const graphY = y + headerHeight;
    const headerWidth = panelWidth - 54;
    const panel = [`<rect id="flow-panel-${letter}-bounds" x="${x}" y="${y}" width="${panelWidth}" height="${panelHeight}" fill="none" stroke="none"/>`,
      frame(x, y, panelWidth, panelHeight, color),
      text(x + 18, y + 24, letter, 18, 12, color, true),
      text(x + 42 + headerWidth / 2, y + 24, stage.title, headerWidth, labelSize, ink, true)];
    const nodeMap = new Map(layout.nodes.flat().map(node => [node.id, node]));
    const columnRight = layout.nodes.map(column => Math.max(...column.map(node => node.x + node.width / 2)) + 8);
    const routedLabels = [];
    for (const edge of layout.links) {
      const edgeId = `flow-edge-${letter}-${edge.index}-${edge.from.join('-')}-to-${edge.to.join('-')}`;
      const source = nodeMap.get(`node-${edge.from[0]}-${edge.from[1]}`);
      const target = nodeMap.get(`node-${edge.to[0]}-${edge.to[1]}`);
      if (edge.points?.length >= 2) {
        const points = edge.points.map(point => ({ x: graphX + point.x, y: graphY + point.y }));
        panel.push(`<path id="${edgeId}" d="${flowPath(points)}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#flow-arrow-${index})"/>`);
        if (edge.label) routedLabels.push({ x: edge.labelX == null ? (points[0].x + points.at(-1).x) / 2 : graphX + edge.labelX,
          y: edge.labelY == null ? (points[0].y + points.at(-1).y) / 2 : graphY + edge.labelY, label: edge.label });
        continue;
      }
      if (edge.sameRank) {
        const column = layout.nodes[edge.from[0]].slice().sort((a, b) => a.y - b.y);
        const sourceIndex = column.findIndex(node => node.id === `node-${edge.from[0]}-${edge.from[1]}`);
        const targetIndex = column.findIndex(node => node.id === `node-${edge.to[0]}-${edge.to[1]}`);
        if (Math.abs(targetIndex - sourceIndex) === 1) {
          const direction = Math.sign(targetIndex - sourceIndex);
          const startY = graphY + source.y + direction * source.height / 2;
          const endY = graphY + target.y - direction * target.height / 2;
          panel.push(`<path id="${edgeId}" d="M${graphX + source.x} ${startY}V${endY}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" marker-end="url(#flow-arrow-${index})"/>`);
          if (edge.label) routedLabels.push({ x: graphX + source.x + 24, y: (startY + endY) / 2, label: edge.label });
          continue;
        }
      }
      const sourceRight = source.x + source.width / 2;
      const targetRight = target.x + target.width / 2;
      const sourceRail = columnRight[edge.from[0]];
      const targetRail = columnRight[edge.to[0]];
      const trackY = graphY + layout.height + 3 + ((edge.outerIndex ?? 0) + 1) * 11;
      const points = [
        { x: graphX + sourceRight, y: graphY + source.y },
        { x: graphX + sourceRail, y: graphY + source.y },
        { x: graphX + sourceRail, y: trackY },
        { x: graphX + targetRail, y: trackY },
        { x: graphX + targetRail, y: graphY + target.y },
        { x: graphX + targetRight, y: graphY + target.y },
      ];
      panel.push(`<path id="${edgeId}" d="${flowPath(points)}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${edge.feedback ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#flow-arrow-${index})"/>`);
      if (edge.label) routedLabels.push({ x: graphX + (sourceRail + targetRail) / 2,
        y: trackY - 4, label: edge.label });
    }
    for (const node of nodeMap.values()) panel.push(nodeCard({ ...node, id: `flow-node-${letter}-${node.column}-${node.row}`, x: graphX + node.x, y: graphY + node.y },
      color, ink, theme === 'ink' ? '#273449' : '#ffffff', multicolor, design.nodeStyle, labelSize, formulaSize));
    for (const item of routedLabels) {
      const labelWidth = Math.min(156, Math.max(40, item.label.length * 10 + 16));
      panel.push(`<g><rect x="${item.x - labelWidth / 2}" y="${item.y - 10}" width="${labelWidth}" height="18" fill="${paper}"/><text x="${item.x}" y="${item.y + 3}" text-anchor="middle" font-size="12" fill="${ink}">${safe(item.label)}</text></g>`);
    }
    panels.push(`<g id="flow-stage-${letter}">${panel.join('')}</g>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <title>${safe(title)}</title><desc>横向流程总览及各阶段详图</desc>
    <defs><marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4 0 8Z" fill="${ink}"/></marker>${arrowheads.join('')}</defs>
    <rect width="${width}" height="${height}" fill="${paper}"/>
    <g font-family="Arial, Microsoft YaHei, sans-serif">
    ${text(width / 2, 28, title, width - 58, 24, ink, true)}
    ${frame(margin, top, width - margin * 2, 20 + overviewHeight, theme === 'ink' ? '#f4c489' : '#64748b')}
    ${leaders.join('')}${overview.join('')}${panels.join('')}
    ${caption ? text(width / 2, footer + 12, caption, width - 60, 14, ink) : ''}
    </g></svg>`;
}
