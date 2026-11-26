import dagre from '@dagrejs/dagre';

export const flowLayoutEngine = Object.freeze({ name: 'Dagre', version: dagre.version,
  algorithm: 'network-simplex', direction: 'LR' });

const fontSize = 12;
export const flowFormulaSize = 14;
const asciiAdvance = fontSize * .58;
const wideAdvance = fontSize * .96;

function tokenWidth(value) {
  return [...value].reduce((sum, character) => sum + (/^[\u0020-\u007e]$/.test(character) ? asciiAdvance : wideAdvance), 0);
}

export function wrapFlowNodeLabel(value, width, size = fontSize) {
  const maxWidth = Math.max(24, width);
  const advance = character => (/^[\u0020-\u007e]$/.test(character) ? size * .58 : size * .96);
  const lines = [];
  let line = '';
  let used = 0;
  const flush = () => {
    if (line.trim()) lines.push(line.trim());
    line = '';
    used = 0;
  };
  for (const token of String(value).match(/[!-~]+|\s+|[^\x00-\x7f]/gu) || []) {
    if (!line && !token.trim()) continue;
    const widthOfToken = tokenWidth(token) * size / fontSize;
    if (token.trim() && widthOfToken > maxWidth) {
      if (line.trim()) flush();
      for (const character of token) {
        const characterWidth = advance(character);
        if (used + characterWidth > maxWidth && line) flush();
        line += character;
        used += characterWidth;
      }
      continue;
    }
    if (used + widthOfToken > maxWidth && line.trim()) flush();
    if (!line && !token.trim()) continue;
    line += token;
    used += widthOfToken;
  }
  flush();
  return lines.length ? lines : [''];
}

function measureNode(node, maxWidth, labelSize, formulaSize, nodeStyle) {
  const words = String(node.label).split(/\s+/).filter(Boolean);
  const expressionWords = String(node.expression || '').split(/\s+/).filter(Boolean);
  const longest = Math.max(0, ...words.map(word => tokenWidth(word) * labelSize / fontSize),
    ...expressionWords.map(word => tokenWidth(word) * formulaSize / fontSize));
  const width = Math.min(maxWidth, Math.max(126, Math.ceil(longest + 24)));
  const glyphScale = node.expression || nodeStyle === 'plain' ? 0 : Math.min(labelSize / 12, (width - 24) / 44);
  const glyphHeight = Math.ceil(42 * glyphScale);
  const lines = node.label === node.expression ? [] : wrapFlowNodeLabel(node.label, width - 24, labelSize);
  const expressionLines = node.expression ? wrapFlowNodeLabel(node.expression, width - 8, formulaSize) : [];
  const lineHeight = Math.ceil(formulaSize * 1.22);
  const height = Math.max(66, 20 + (glyphHeight ? glyphHeight + 8 : 0) + (lines.length + expressionLines.length) * lineHeight);
  return { width, height, lines, expressionLines, lineHeight, glyphScale, glyphHeight };
}

function nodeId(column, row) {
  return `node-${column}-${row}`;
}

/**
 * Run a deterministic Sugiyama-style layout for one scientific-figure stage.
 * The model's columns remain hard reading-order ranks. Dagre optimizes the
 * ordering inside those ranks and routes forward edges; feedback edges are
 * returned for the renderer's reserved outer lanes.
 */
export function layoutCompositeStage(stage, compact = false, maxNodeWidth = 182, labelSize = fontSize, formulaSize = flowFormulaSize, nodeStyle = 'glyph') {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: 'LR', ranker: 'network-simplex', acyclicer: 'greedy',
    ranksep: compact ? 24 : 32, nodesep: compact ? 15 : 22, edgesep: 12, marginx: 8, marginy: 8 });
  graph.setDefaultEdgeLabel(() => ({}));

  const sizes = new Map();
  for (const [columnIndex, column] of stage.columns.entries()) {
    for (const [rowIndex, node] of column.entries()) {
      const id = nodeId(columnIndex, rowIndex);
      const size = measureNode(node, maxNodeWidth, labelSize, formulaSize, nodeStyle);
      sizes.set(id, size);
      graph.setNode(id, { width: size.width, height: size.height });
    }
  }

  const realPairs = new Set();
  stage.links.forEach((link, index) => {
    const [from, to, label = ''] = link;
    const source = nodeId(from[0], from[1]);
    const target = nodeId(to[0], to[1]);
    if (to[0] <= from[0]) return;
    realPairs.add(`${source}\u0000${target}`);
    graph.setEdge(source, target, {
      minlen: Math.max(1, to[0] - from[0]), weight: 4,
      width: label ? Math.min(150, tokenWidth(label) + 18) : 0, height: label ? 18 : 0,
    }, `link-${index}`);
  });

  // Add invisible rank constraints only where a real connection does not
  // already establish the column order. They affect layout, never the SVG.
  for (let columnIndex = 0; columnIndex < stage.columns.length - 1; columnIndex++) {
    for (let fromRow = 0; fromRow < stage.columns[columnIndex].length; fromRow++) {
      for (let toRow = 0; toRow < stage.columns[columnIndex + 1].length; toRow++) {
        const source = nodeId(columnIndex, fromRow);
        const target = nodeId(columnIndex + 1, toRow);
        if (realPairs.has(`${source}\u0000${target}`)) continue;
        graph.setEdge(source, target, { minlen: 1, weight: .01 }, `rank-${columnIndex}-${fromRow}-${toRow}`);
      }
    }
  }

  dagre.layout(graph);
  const visible = graph.nodes().map(id => ({ id, ...graph.node(id), ...sizes.get(id) }))
    .filter(node => sizes.has(node.id));
  const minX = Math.min(...visible.map(node => node.x - node.width / 2));
  const minY = Math.min(...visible.map(node => node.y - node.height / 2));
  const maxX = Math.max(...visible.map(node => node.x + node.width / 2));
  const maxY = Math.max(...visible.map(node => node.y + node.height / 2));
  const offsetX = 8 - minX;
  const offsetY = 8 - minY;
  const nodes = stage.columns.map((column, columnIndex) => column.map((node, rowIndex) => {
    const id = nodeId(columnIndex, rowIndex);
    const position = graph.node(id);
    const size = sizes.get(id);
    return { ...node, ...size, id, column: columnIndex, row: rowIndex,
      x: position.x + offsetX, y: position.y + offsetY };
  }));

  let outerIndex = 0;
  const links = stage.links.map((link, index) => {
    const [from, to, label = ''] = link;
    const source = nodeId(from[0], from[1]);
    const target = nodeId(to[0], to[1]);
    if (to[0] < from[0]) return { index, from, to, label, feedback: true, outerIndex: outerIndex++ };
    if (to[0] === from[0]) return { index, from, to, label, sameRank: true, outerIndex: outerIndex++ };
    const routed = graph.edge({ v: source, w: target, name: `link-${index}` });
    return { index, from, to, label,
      points: routed?.points?.map(point => ({ x: point.x + offsetX, y: point.y + offsetY })) || [],
      ...(Number.isFinite(routed?.x) ? { labelX: routed.x + offsetX, labelY: routed.y + offsetY } : {}) };
  });
  return { nodes, links, width: Math.ceil(maxX - minX + 16), height: Math.ceil(maxY - minY + 16) };
}
