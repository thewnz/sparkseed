export const FIGURE_TYPES = Object.freeze({
  line: '折线图', bar: '分组柱状图', scatter: '散点图', heatmap: '热图', diagram: '流程图',
});
export const FIGURE_THEMES = Object.freeze({ color: '色觉友好', mono: '黑白', ink: '深色' });
export const FIGURE_WIDTHS = Object.freeze({ 720: '单栏', 1080: '双栏', 1440: '宽幅' });
export const FIGURE_MAX_DATA = 120000;
export const FIGURE_TEXT_LIMITS = Object.freeze({ title: 120, xLabel: 65, yLabel: 65, caption: 450 });

export const FIGURE_EXAMPLES = Object.freeze({
  line: ['训练步数,基线,本方法', '0,63,64', '1000,71,74', '3000,76,81', '5000,78,85', '8000,80,88'].join('\n'),
  bar: ['数据集,基线,本方法', '数据集 A,78.1,83.4', '数据集 B,81.2,85.7', '数据集 C,69.8,74.5'].join('\n'),
  scatter: ['推理耗时（毫秒）,模型 A,模型 B', '20,62,65', '31,71,74', '45,72,78', '62,80,83', '85,81,89'].join('\n'),
  heatmap: ['实验,条件 A,条件 B,条件 C', '方案 1,0.84,0.63,0.28', '方案 2,0.49,0.75,0.83', '方案 3,0.22,0.61,0.94'].join('\n'),
  diagram: ['提出研究问题', '收集与清洗数据', '训练与验证模型', '分析结果'].join('\n'),
});

const themes = {
  color: {
    paper: '#ffffff', text: '#171f2c', muted: '#485665', grid: '#dce2e9', missing: '#b2bbc8',
    colors: ['#0072b2', '#a34a00', '#00785a', '#953e7d', '#3c5488', '#7f5423', '#566225', '#52387f'],
    heat: ['#f2f7fa', '#073d6b'],
  },
  mono: {
    paper: '#ffffff', text: '#15191e', muted: '#4e535a', grid: '#d7dadd', missing: '#a5aab0',
    colors: ['#11151a', '#565b63', '#2c3037', '#747a82', '#1e242b', '#656b73', '#434850', '#333840'],
    heat: ['#f7f7f7', '#111111'],
  },
  ink: {
    paper: '#192234', text: '#f4f6fc', muted: '#d0d9e6', grid: '#4b596d', missing: '#8796ad',
    colors: ['#64c8ff', '#ffb663', '#64e5bd', '#ffa1dc', '#b3b7ff', '#f8df83', '#a8df8e', '#f4a3a1'],
    heat: ['#273247', '#75d4ff'],
  },
};

const take = (value, length) => typeof value === 'string' ? value.slice(0, length) : '';
const has = (map, key) => typeof key === 'string' && Object.hasOwn(map, key);
const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const xml = value => String(value).toWellFormed().replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '\ufffd')
  .replace(/[&<>"']/g, character => escapes[character]);

export function normalizeFigureDraft(input) {
  return {
    kind: has(FIGURE_TYPES, input?.kind) ? input.kind : 'line',
    data: typeof input?.data === 'string' && input.data.length <= FIGURE_MAX_DATA ? input.data : '',
    title: take(input?.title, FIGURE_TEXT_LIMITS.title),
    xLabel: take(input?.xLabel, FIGURE_TEXT_LIMITS.xLabel),
    yLabel: take(input?.yLabel, FIGURE_TEXT_LIMITS.yLabel),
    theme: has(FIGURE_THEMES, input?.theme) ? input.theme : 'color',
    width: [720, 1080, 1440].find(width => input?.width === width || input?.width === String(width)) || 1080,
    caption: take(input?.caption, FIGURE_TEXT_LIMITS.caption),
  };
}

// Delimiter selection is confined to the first logical row, outside quoted cells.
function delimiterOf(input) {
  let quoted = false;
  let hasTab = false;
  for (const character of input) {
    if (character === '"') quoted = !quoted;
    if (quoted) continue;
    if (character === '\t') hasTab = true;
    if (character === '\n' || character === '\r') break;
  }
  return hasTab ? '\t' : ',';
}

function readTable(input) {
  const source = input.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
  const delimiter = delimiterOf(source.replace(/^(?: *\n)+/, ''));
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let closed = false;
  let line = 1;
  let rowLine = line;
  function finishField() {
    row.push(field.trim());
    field = '';
    closed = false;
  }
  function finishRow() {
    finishField();
    // Keep delimiters-only rows so an omitted X/category cannot disappear silently.
    if (row.length > 1 || row[0]) rows.push({ line: rowLine, cells: row });
    rowLine = line + 1;
    row = [];
  }
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
        closed = true;
      } else field += character;
    } else if (character === delimiter) finishField();
    else if (character === '\n') finishRow();
    else if (closed) {
      if (character !== ' ') throw new Error(`第 ${line} 行的引号格式不正确。`);
    } else if (character === '"' && !field.trim()) {
      field = '';
      quoted = true;
    } else if (character === '"') throw new Error(`第 ${line} 行的引号格式不正确。`);
    else field += character;
    if (character === '\n') line++;
  }
  if (quoted) throw new Error(`第 ${rowLine} 行有未闭合的引号。`);
  finishRow();
  if (rows.length < 2 || rows[0].cells.length < 2) throw new Error('请提供 CSV／TSV 表头和至少一行数据，每行至少两列。');
  return rows;
}

// Accept decimals and scientific notation. Missing cells and numeric zero remain distinct.
const isMissing = value => /^(?:|n\/a|na|nan|null|—)$/i.test(value);
const numeric = value => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value);
function readNumber(value, line, column) {
  if (isMissing(value)) return null;
  if (!numeric(value)) throw new Error(`第 ${line} 行「${column}」需要数字或空值。`);
  const number = Number(value);
  if (Math.abs(number) > 1e100 || (number !== 0 && Math.abs(number) < 1e-100) ||
      (number === 0 && /[1-9]/.test(value.split(/[eE]/)[0]))) {
    throw new Error(`第 ${line} 行「${column}」超出绘图数值范围，请先换算单位并在轴标签说明。`);
  }
  return number;
}

function tableData(draft) {
  const [header, ...records] = readTable(draft.data);
  const heat = draft.kind === 'heatmap';
  const scatter = draft.kind === 'scatter';
  const columns = header.cells.slice(1);
  if (columns.some(value => !value) || new Set(columns).size !== columns.length) {
    throw new Error('第一列之后的表头需填写不同的名称。');
  }
  const maxRows = { line: 1000, bar: 36, scatter: 1000, heatmap: 30 }[draft.kind];
  const maxColumns = heat ? 24 : themes.color.colors.length;
  if (columns.length > maxColumns || records.length > maxRows) {
    throw new Error(`${FIGURE_TYPES[draft.kind]}最多支持 ${maxRows} 行、${maxColumns} 个数据列（第一列之外）。请拆分数据再绘制。`);
  }
  let missing = 0;
  const rows = records.map(({ line, cells }) => {
    if (cells.length !== header.cells.length) {
      throw new Error(`第 ${line} 行有 ${cells.length} 列，表头有 ${header.cells.length} 列。缺失数值请保留空单元格。`);
    }
    if (!cells[0] || (scatter && isMissing(cells[0]))) throw new Error(`第 ${line} 行的第一列为空。`);
    const values = columns.map((column, index) => readNumber(cells[index + 1], line, column));
    missing += values.filter(value => value === null).length;
    return { label: cells[0], values, line };
  });
  if (missing === rows.length * columns.length) throw new Error('数据区全部为空，至少需要一个有效数值。');
  const continuous = scatter || (draft.kind === 'line' && rows.every(row => numeric(row.label)));
  if (continuous) for (const row of rows) row.x = readNumber(row.label, row.line, header.cells[0] || 'X');
  if (draft.kind === 'line' && continuous && rows.some((row, index) => index > 0 && row.x <= rows[index - 1].x)) {
    throw new Error('折线图的数值横轴需要严格递增。请先按横轴排序，或用散点图展示同一横轴上的多组观测。');
  }
  const warnings = [];
  if (missing) warnings.push(heat ? `有 ${missing} 个缺失值，热图使用斜线表示。` :
    draft.kind === 'line' ? `有 ${missing} 个缺失值，折线在相应位置断开。` : `有 ${missing} 个缺失值，相应数据点未绘制。`);
  if (!continuous && new Set(rows.map(row => row.label)).size !== rows.length) warnings.push('第一列有重复标签，重复行会按输入顺序分别绘制。');
  if (draft.kind === 'line' && !continuous && rows.some(row => numeric(row.label))) {
    warnings.push('第一列包含文本与数字，按等距类别处理。');
  }
  if (!heat && !draft.yLabel && columns.length > 1) warnings.push('多系列使用同一纵轴，请确认数据单位一致。');
  return { columns, rows, missing, warnings, continuous, firstHeader: header.cells[0] };
}

const font = 'Arial, Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif';
const measure = (value, size) => [...value].reduce((width, character) =>
  width + (/[\x20-\x7e]/.test(character) ? size * 0.61 : size), 0);
const splitText = (text, width, size) => {
  const lines = [];
  let line = '';
  for (const character of text.replace(/\s+/g, ' ')) {
    if (line && measure(line + character, size) > width) {
      lines.push(line.trimEnd());
      line = '';
    }
    line += character;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
};

function compactLabel(value, width, size, notes) {
  if (measure(value, size) <= width) return value;
  notes.shortened = true;
  return width <= size ? '…' : (splitText(value, width - size, size)[0] || '') + '…';
}

function text(x, y, value, attributes = '') {
  return `<text x="${x}" y="${y}" ${attributes}>${xml(value)}</text>`;
}
function label(x, y, value, width, size, attributes = '') {
  return splitText(value, width, size).map((line, index) =>
    text(x, y + index * size * 1.25, line, `font-size="${size}" ${attributes}`)).join('');
}
function line(x1, y1, x2, y2, attributes = '') {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attributes}/>`;
}
function rect(x, y, width, height, attributes = '') {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${attributes}/>`;
}

const numberLabel = value => {
  const absolute = Math.abs(value);
  if (absolute && (absolute < .001 || absolute >= 1000000)) return Number(value.toPrecision(8)).toExponential().replace('e+', 'e');
  return String(Number(value.toPrecision(10)));
};

function tickLabels(ticks) {
  const concise = ticks.map(numberLabel);
  return new Set(concise).size === ticks.length ? concise : ticks.map(String);
}

function scaleExtent(values, includeZero = false) {
  const min = Math.min(...values, ...(includeZero ? [0] : []));
  const max = Math.max(...values, ...(includeZero ? [0] : []));
  const padding = min === max ? Math.abs(min || 1) * .1 : 0;
  const low = min - padding;
  const high = max + padding;
  const ideal = (high - low) / 5;
  const order = 10 ** Math.floor(Math.log10(ideal));
  const step = [1, 2, 2.5, 5, 10].find(factor => factor >= ideal / order) * order;
  const tickStart = Math.floor(low / step);
  const tickEnd = Math.ceil(high / step);
  if (includeZero && min === 0 && max === 0) return { low: 0, high: 1, ticks: [0, .25, .5, .75, 1] };
  // Enumerate by offset because tick indexes can exceed Number.MAX_SAFE_INTEGER.
  const ticks = [...new Set(Array.from({ length: tickEnd - tickStart + 1 }, (_, index) => (tickStart + index) * step))];
  const coverLow = Math.min(low, ticks[0] ?? low);
  const coverHigh = Math.max(high, ticks.at(-1) ?? high);
  return { low: coverLow, high: coverHigh, ticks: ticks.length > 1 ? ticks : [low, high] };
}
const position = (domain, start, size) => value => start + (value - domain.low) / (domain.high - domain.low) * size;

const patterns = ['', '7 4', '2 3', '10 3 2 3', '12 4', '3 3 1 3', '9 2 2 2', '4 4 2 4'];
function marker(x, y, index, color) {
  const style = `fill="${color}"`;
  switch (index) {
    case 1: return rect(x - 4, y - 4, 8, 8, style);
    case 2: return `<path d="M${x} ${y - 5} l5 9 h-10Z" ${style}/>`;
    case 3: return `<path d="M${x} ${y - 5} l5 5 -5 5 -5 -5Z" ${style}/>`;
    case 4: return `<path d="M${x} ${y + 5} l5 -9 h-10Z" ${style}/>`;
    case 5: return `<path d="M${x - 4} ${y} h8m-4 -4v8" stroke="${color}" stroke-width="2.4"/>`;
    case 6: return `<path d="M${x - 4} ${y - 4} l8 8m-8 0l8 -8" stroke="${color}" stroke-width="2.4"/>`;
    case 7: return `<circle cx="${x}" cy="${y}" r="4" fill="none" stroke="${color}" stroke-width="2.2"/>`;
    default: return `<circle cx="${x}" cy="${y}" r="4" ${style}/>`;
  }
}

function barPattern(index, theme) {
  if (!index) return '';
  const size = index < 4 ? 6 : 9;
  const directions = ['M0 0L9 9', 'M0 9L9 0', 'M0 3H9', 'M3 0V9', 'M0 0L9 9 M0 9L9 0', 'M0 3H9 M3 0V9', 'M1 3H3 M6 7H8'];
  return `<pattern id="bar-${index}" width="${size}" height="${size}" patternUnits="userSpaceOnUse" viewBox="0 0 9 9">
    ${rect(0, 0, 9, 9, `fill="${theme.colors[index]}"`)}
    <path d="${directions[index - 1]}" fill="none" stroke="${theme.paper}" stroke-width="1.35"/>
  </pattern>`;
}

function layerTooltip(description, content) {
  return `<g><title>${xml(description)}</title>${content}</g>`;
}

function axisFigure(draft, table, theme, width, top, notes) {
  const { columns, rows, continuous, firstHeader } = table;
  const isLine = draft.kind === 'line';
  const bar = draft.kind === 'bar';
  const xLabel = draft.xLabel || firstHeader;
  const yLabel = draft.yLabel || (columns.length === 1 ? columns[0] : '');
  const observed = rows.flatMap(row => row.values.filter(value => value !== null));
  const yExtent = scaleExtent(observed, bar);
  const xExtent = continuous ? scaleExtent(rows.map(row => row.x)) : null;
  const yTicks = tickLabels(yExtent.ticks);
  const xNames = continuous ? tickLabels(xExtent.ticks) : rows.map(row => row.label);
  const yTickWidth = Math.max(...yTicks.map(value => measure(value, 15)));
  const yLabelLines = yLabel ? splitText(yLabel, Math.round(width * .39), 17).length : 0;
  const left = Math.ceil(yTickWidth) + 40 + yLabelLines * 22;
  const edgeLabelWidth = continuous ? measure(xNames.at(-1), 14) : Math.min(105, measure(xNames.at(-1), 14));
  const right = width - Math.max(37, Math.ceil(edgeLabelWidth / 2 + 9));
  const plotWidth = right - left;
  const legendGroups = [];
  let legendX = left;
  let legendY = top + 10;
  if (columns.length > 1) {
    columns.forEach((name, index) => {
      const shown = compactLabel(name, plotWidth - 50, 15, notes);
      const itemWidth = measure(shown, 15) + 58;
      if (legendX > left && legendX + itemWidth > right) {
        legendX = left;
        legendY += 26;
      }
      const color = theme.colors[index];
      const swatch = bar ? rect(legendX, legendY - 10, 14, 12, `fill="${index ? `url(#bar-${index})` : color}"`)
        : (isLine ? line(legendX, legendY - 4, legendX + 19, legendY - 4, `stroke="${color}" stroke-width="2" stroke-dasharray="${patterns[index] || 'none'}"`) : '') +
          marker(legendX + 9, legendY - 4, index, color);
      legendGroups.push(layerTooltip(name, swatch + text(legendX + 25, legendY, shown, 'font-size="15"')));
      legendX += itemWidth;
    });
    top = legendY + 28;
  }
  const plotHeight = Math.round(plotWidth * .55);
  const bottom = top + plotHeight;
  const y = position(yExtent, bottom, -plotHeight);
  const categoryStep = plotWidth / rows.length;
  const categoricalPadding = rows.length === 1 ? plotWidth / 2 : 0;
  const x = continuous ? position(xExtent, left, plotWidth) :
    bar ? index => left + (index + .5) * categoryStep :
      index => left + categoricalPadding + index / Math.max(1, rows.length - 1) * plotWidth;
  const grid = yExtent.ticks.map((value, index) =>
    line(left, y(value), right, y(value), `stroke="${theme.grid}"`) +
    text(left - 11, y(value) + 5, yTicks[index], 'text-anchor="end" font-size="15"')).join('');
  const zero = bar && yExtent.low < 0 ? line(left, y(0), right, y(0), `stroke="${theme.muted}" stroke-width="1.25"`) : '';
  const xTicks = continuous ? xExtent.ticks.map((value, index) => ({ point: x(value), name: xNames[index] })) :
    rows.map((row, index) => ({ point: x(index), name: row.label }));
  const labelSpacing = continuous ? plotWidth / Math.max(1, xTicks.length - 1) : 0;
  const skip = Math.max(1, Math.ceil(xTicks.length / (plotWidth / 75)));
  const tickMarks = xTicks.filter((_, index) => index % skip === 0).map(({ point, name }) => {
    const shown = compactLabel(name, continuous ? labelSpacing * skip - 10 :
      Math.min(105, categoryStep * skip - 10), 14, notes);
    return line(point, bottom, point, bottom + 5, `stroke="${theme.muted}"`) +
      layerTooltip(name, text(point, bottom + 22, shown, 'text-anchor="middle" font-size="14"'));
  }).join('');
  if (!continuous && skip > 1) notes.sparse = true;
  const xAxisTitleY = bottom + 51;
  const xAxisTitle = xLabel ? label((left + right) / 2, xAxisTitleY, xLabel, plotWidth, 17, 'text-anchor="middle"') : '';
  const yAxisTitle = yLabel ? `<g transform="translate(24 ${(top + bottom) / 2}) rotate(-90)">${label(0, 0, yLabel, Math.round(width * .39), 17, 'text-anchor="middle"')}</g>` : '';
  const marks = columns.map((name, index) => {
    const color = theme.colors[index];
    const barWidth = Math.min(54, categoryStep * .76 / columns.length);
    const coordinates = rows.map((row, rowIndex) => {
      const value = row.values[index];
      if (value === null) return null;
      return { x: x(continuous ? row.x : rowIndex), y: y(value), row, value };
    });
    let path = '';
    let connected = false;
    const points = coordinates.map(point => {
      if (!point) {
        connected = false;
        return '';
      }
      const { x: px, y: py, row, value } = point;
      const tooltip = `${row.label} · ${name} ${value}`;
      if (bar) {
        const center = px + (index - (columns.length - 1) / 2) * barWidth;
        const style = `fill="${index ? `url(#bar-${index})` : color}"`;
        return layerTooltip(tooltip, value === 0 ? line(center - barWidth * .31, py, center + barWidth * .31, py, `stroke="${color}" stroke-width="2.5"`) :
          rect(center - barWidth * .43, Math.min(py, y(0)), barWidth * .86, Math.abs(py - y(0)), style));
      }
      path += `${connected ? 'L' : 'M'}${px} ${py} `;
      connected = true;
      return layerTooltip(tooltip, marker(px, py, index, color));
    }).join('');
    return (isLine ? `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.25" stroke-dasharray="${patterns[index] || 'none'}"/>` : '') + points;
  }).join('');
  const defs = bar ? columns.map((_, index) => barPattern(index, theme)).join('') : '';
  const content = `<defs>${defs}</defs>${legendGroups.join('')}${grid}${zero}${marks}
    ${line(left, bottom, right, bottom, `stroke="${theme.muted}"`)}${line(left, top, left, bottom, `stroke="${theme.muted}"`)}
    ${tickMarks}${xAxisTitle}${yAxisTitle}`;
  return { content, end: xLabel ? xAxisTitleY + (splitText(xLabel, plotWidth, 17).length - 1) * 22 : bottom + 29 };
}

function rgb(hex) {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16));
}
function mix(start, stop, ratio) {
  return rgb(start).map((channel, index) => Math.round(channel + (rgb(stop)[index] - channel) * ratio));
}
function luminance(channels) {
  return channels.reduce((value, channel, index) => {
    const unit = channel / 255;
    return value + (unit <= .04045 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
  }, 0);
}

function heatmap(draft, table, theme, width, top, notes) {
  const { columns, rows } = table;
  const yLabelLines = draft.yLabel ? splitText(draft.yLabel, Math.round(width * .36), 17).length : 0;
  const yAxisMargin = yLabelLines ? 26 + (yLabelLines - 1) * 22 : 11;
  const rowLabelWidth = Math.min(width * .29, Math.max(36, ...rows.map(row => measure(row.label, 14))));
  const gridLeft = yAxisMargin + rowLabelWidth + 22;
  const gridWidth = width - gridLeft - 38;
  const cellWidth = gridWidth / columns.length;
  const cellHeight = Math.max(16, Math.min(58, cellWidth * .8));
  const gridTop = top + 21;
  const values = rows.flatMap(row => row.values.filter(value => value !== null));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const [start, stop] = theme.heat;
  const color = ratio => mix(start, stop, ratio);
  const cellStyle = `stroke="${theme.paper}" stroke-width="0.8"`;
  const supportedText = cellWidth >= 57 && cellHeight >= 23;
  const cells = rows.map((row, rowIndex) => {
    const y = gridTop + rowIndex * cellHeight;
    return layerTooltip(row.label, text(gridLeft - 10, y + cellHeight / 2 + 5,
      compactLabel(row.label, rowLabelWidth, 14, notes), 'text-anchor="end" font-size="14"')) +
      row.values.map((value, columnIndex) => {
        const x = gridLeft + columnIndex * cellWidth;
        const description = `${row.label} · ${columns[columnIndex]} ${value === null ? '缺失' : value}`;
        if (value === null) return layerTooltip(description, rect(x, y, cellWidth, cellHeight, `fill="url(#missing)" ${cellStyle}`));
        const channels = color(high === low ? .5 : (value - low) / (high - low));
        const shown = numberLabel(value);
        const annotation = supportedText && measure(shown, 14) < cellWidth - 7 ? text(x + cellWidth / 2,
          y + cellHeight / 2 + 5, shown, `text-anchor="middle" font-size="14" fill="${luminance(channels) > .179 ? '#000000' : '#ffffff'}"`) : '';
        return layerTooltip(description, rect(x, y, cellWidth, cellHeight, `fill="rgb(${channels.join(',')})" ${cellStyle}`) + annotation);
      }).join('');
  }).join('');
  const columnSkip = Math.max(1, Math.ceil(26 / cellWidth));
  if (columnSkip > 1) notes.sparse = true;
  const columnLabels = columns.map((name, index) => index % columnSkip === 0 ?
    layerTooltip(name, text(gridLeft + (index + .5) * cellWidth, gridTop - 8,
      compactLabel(name, cellWidth * columnSkip - 5, 14, notes), 'text-anchor="middle" font-size="14"')) :
    layerTooltip(name, rect(gridLeft + index * cellWidth, gridTop - 21, cellWidth, 21, 'fill="transparent"'))).join('');
  const gridBottom = gridTop + rows.length * cellHeight;
  const xLabelLines = draft.xLabel ? splitText(draft.xLabel, gridWidth, 17).length : 0;
  const xLabel = draft.xLabel ? label(gridLeft + gridWidth / 2, gridBottom + 26, draft.xLabel, gridWidth, 17, 'text-anchor="middle"') : '';
  const yLabel = draft.yLabel ? `<g transform="translate(24 ${(gridTop + gridBottom) / 2}) rotate(-90)">${label(0, 0, draft.yLabel, Math.round(width * .36), 17, 'text-anchor="middle"')}</g>` : '';
  const colorY = gridBottom + 25 + xLabelLines * 22;
  const colorWidth = Math.min(180, gridWidth * .46);
  const defs = `<defs><pattern id="missing" patternUnits="userSpaceOnUse" width="7" height="7">
    <path d="M0 0L7 7" stroke="${theme.missing}" stroke-width="1.5"/></pattern>
    <linearGradient id="heat-scale"><stop stop-color="${start}"/><stop offset="1" stop-color="${stop}"/></linearGradient></defs>`;
  const missingLegend = table.missing ? rect(gridLeft + colorWidth + 24, colorY, 15, 12, `fill="url(#missing)" stroke="${theme.missing}"`) +
    text(gridLeft + colorWidth + 46, colorY + 11, '缺失值', 'font-size="14"') : '';
  const legend = high === low ? rect(gridLeft, colorY, 15, 12, `fill="rgb(${color(.5).join(',')})"`) +
    text(gridLeft + 22, colorY + 11, numberLabel(low), 'font-size="14"') :
    rect(gridLeft, colorY, colorWidth, 12, 'fill="url(#heat-scale)"') +
    text(gridLeft, colorY + 29, numberLabel(low), 'font-size="14"') +
    text(gridLeft + colorWidth, colorY + 29, numberLabel(high), 'text-anchor="end" font-size="14"');
  return { content: defs + cells + columnLabels + xLabel + yLabel + legend + missingLegend, end: colorY + 29 };
}

function protocol(draft, theme, width, top) {
  const nodes = draft.data.replace(/^\ufeff/, '').split(/\r\n?|\n/).map(value => value.trim()).filter(Boolean);
  if (nodes.length < 2 || nodes.length > 12) throw new Error('每行填写一个流程步骤，请输入 2–12 个步骤。');
  if (nodes.some(node => node.length > 100)) throw new Error('每个流程步骤最多 100 个字符。请拆分或精简长步骤。');
  const boxWidth = Math.min(width - 130, 620);
  const left = (width - boxWidth) / 2;
  const center = width / 2;
  let y = top;
  const contents = nodes.map((node, index) => {
    const lines = splitText(node, boxWidth - 38, 21);
    const height = Math.max(66, 26 * lines.length + 31);
    const content = rect(left, y, boxWidth, height, `rx="7" fill="${theme.paper}" stroke="${theme.muted}" stroke-width="1.5"`) +
      label(center, y + (height - (lines.length - 1) * 26) / 2 + 7, node, boxWidth - 38, 21, 'text-anchor="middle"');
    y += height;
    if (index === nodes.length - 1) return content;
    const arrow = `<path d="M${center} ${y} v22 m-6 -6 6 6 6 -6" fill="none" stroke="${theme.muted}" stroke-width="2"/>`;
    y += 30;
    return content + arrow;
  }).join('');
  return { content: contents, end: y, summary: `${nodes.length} 个步骤 · 自上而下` };
}

const recommendations = {
  line: '用于有先后顺序的数据。数值横轴保留实际间距。',
  bar: '用于比较离散组别。柱形从零起算。',
  scatter: '用于查看两个数值变量的关系。散点之间没有连线。',
  heatmap: '用于查看矩阵中各单元格的相对大小。色标使用实际数值范围。',
  diagram: '用于表达步骤的先后顺序。每行对应一个节点。',
};

export function inspectFigureInput(input) {
  if (typeof input?.data === 'string' && input.data.length > FIGURE_MAX_DATA) throw new Error('数据过大，请拆分后再绘制。');
  const draft = normalizeFigureDraft(input);
  if (!draft.data.trim()) throw new Error('请粘贴数据、导入文件或载入示例。');
  if (draft.kind === 'diagram') return { summary: '已提供流程材料', warnings: [] };
  const table = tableData(draft);
  return { summary: `${table.rows.length} 行 · ${table.columns.length} 个数据列 · ${table.missing} 个缺失值`,
    warnings: table.missing ? [`原始数据有 ${table.missing} 个缺失值，请核对图中显示。`] : [] };
}

export function planFigure(input) {
  if (typeof input?.data === 'string' && input.data.length > FIGURE_MAX_DATA) throw new Error('数据过大，请拆分后再绘制。');
  const draft = normalizeFigureDraft(input);
  for (const key of Object.keys(FIGURE_TEXT_LIMITS)) draft[key] = draft[key].trim();
  if (!draft.data.trim()) throw new Error('请粘贴数据、导入文件或载入示例。');
  const title = draft.title || FIGURE_TYPES[draft.kind];
  const width = draft.width;
  const theme = themes[draft.theme];
  const titleSize = 28;
  const top = 40 + splitText(title, width - 76, titleSize).length * 35;
  const notes = { shortened: false, sparse: false };
  const table = draft.kind === 'diagram' ? null : tableData(draft);
  const plot = !table ? protocol(draft, theme, width, top) :
    draft.kind === 'heatmap' ? heatmap(draft, table, theme, width, top, notes) : axisFigure(draft, table, theme, width, top, notes);
  const warnings = table?.warnings || [];
  if (notes.sparse) warnings.push('横轴间隔显示部分标签，原始数据仍全部参与绘图。');
  if (notes.shortened) warnings.push('较长的标签用省略号显示，SVG 源文件保留完整标签。');
  const summary = plot.summary || `${table.rows.length} 行 · ${table.columns.length} 个数据列 · ${table.missing} 个缺失值`;
  const caption = draft.caption ? label(38, plot.end + 37, draft.caption, width - 76, 15, `fill="${theme.muted}"`) : '';
  const height = Math.ceil(plot.end + (caption ? 47 + splitText(draft.caption, width - 76, 15).length * 19 : 37));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="figure-title figure-description" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <title id="figure-title">${xml(title)}</title><desc id="figure-description">${xml([FIGURE_TYPES[draft.kind], summary, draft.caption].filter(Boolean).join('。'))}</desc>
    ${rect(0, 0, width, height, `fill="${theme.paper}"`)}
    <g font-family="${font}" fill="${theme.text}">
      ${label(38, 46, title, width - 76, titleSize, 'font-weight="700"')}${plot.content}${caption}
    </g>
  </svg>`;
  return { svg, warnings, summary, recommendation: recommendations[draft.kind] };
}
