const shapes = {
  decision: 'diamond',
  formula: 'page',
  matrix: 'stored_data',
  stack: 'cylinder',
  vector: 'queue',
  spectrum: 'stored_data',
  model: 'hexagon',
  samples: 'cylinder',
  combination: 'stored_data',
};

const accents = {
  rose: '#a7445b', green: '#39714e', teal: '#216e7e',
  violet: '#654d94', amber: '#895418', indigo: '#405e9e',
};

function quote(value) {
  return JSON.stringify(String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '�'))
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function nodeId(column, row) {
  return `node_${column}_${row}`;
}

function block(id, label, shape, className, indent = '  ') {
  return `${indent}${id}: ${quote(label)} {\n${indent}  shape: ${shape}\n${indent}  class: ${className}\n${indent}}`;
}

/**
 * Export the normalized semantic plan, not model-authored coordinates. D2 can
 * then be edited as plain text and laid out locally with TALA, ELK or Dagre.
 */
export function flowPlanToD2(stages, { title = '科研流程图', layout = 'tala' } = {}) {
  if (!Array.isArray(stages) || !stages.length) throw new Error('缺少可导出的流程结构。');
  if (!['tala', 'elk', 'dagre'].includes(layout)) throw new Error('不支持的 D2 布局引擎。');
  const lines = [
    `# Sparkseed semantic source · ${String(title).replace(/[\r\n\u2028\u2029]/g, ' ')}`,
    '# Scientific content is stored as editable labels and connections; coordinates are intentionally omitted.',
    'vars: {',
    '  d2-config: {',
    `    layout-engine: ${layout}`,
    '    theme-id: 0',
    '  }',
    '}',
    'direction: right',
    'classes: {',
    '  process: {',
    '    style: {',
    '      fill: "#ffffff"',
    '      stroke: "#455466"',
    '      font-color: "#172333"',
    '      stroke-width: 1',
    '      border-radius: 2',
    '    }',
    '  }',
    '  data: {',
    '    style: {',
    '      fill: "#f5f7f8"',
    '      stroke: "#607080"',
    '      font-color: "#172333"',
    '      stroke-width: 1',
    '      border-radius: 2',
    '    }',
    '  }',
    '}',
  ];
  stages.forEach((stage, stageIndex) => {
    const color = accents[stage.color] || '#455466';
    lines.push(`stage_${stageIndex}: ${quote(`${String.fromCharCode(65 + stageIndex)} · ${stage.title}`)} {`,
      '  style: {',
      '    fill: "#ffffff"',
      `    stroke: ${quote(color)}`,
      '    stroke-width: 1',
      '  }');
    if (stage.input?.label) lines.push(block('stage_input', stage.input.label, shapes[stage.input.shape] || 'rectangle', 'data'));
    stage.columns.forEach((column, columnIndex) => column.forEach((node, rowIndex) => {
      const label = node.expression && node.expression !== node.label ? `${node.expression}\n${node.label}` : node.label;
      lines.push(block(nodeId(columnIndex, rowIndex), label, shapes[node.shape] || 'rectangle',
        node.shape === 'process' || node.shape === 'decision' ? 'process' : 'data'));
    }));
    if (stage.output?.label) lines.push(block('stage_output', stage.output.label, shapes[stage.output.shape] || 'rectangle', 'data'));
    if (stage.input?.label) {
      stage.columns[0]?.forEach((_, rowIndex) => lines.push(`  stage_input -> ${nodeId(0, rowIndex)}`));
    }
    if (stage.output?.label) {
      const lastColumn = stage.columns.length - 1;
      stage.columns[lastColumn]?.forEach((_, rowIndex) => lines.push(`  ${nodeId(lastColumn, rowIndex)} -> stage_output`));
    }
    stage.links.forEach(([from, to, label]) => {
      const suffix = label ? `: ${quote(label)}` : '';
      lines.push(`  ${nodeId(from[0], from[1])} -> ${nodeId(to[0], to[1])}${suffix}`);
    });
    lines.push('}');
  });
  for (let index = 0; index < stages.length - 1; index++) {
    const from = stages[index].output?.label ? `stage_${index}.stage_output` : `stage_${index}`;
    const to = stages[index + 1].input?.label ? `stage_${index + 1}.stage_input` : `stage_${index + 1}`;
    lines.push(`${from} -> ${to}`);
  }
  return lines.join('\n') + '\n';
}
