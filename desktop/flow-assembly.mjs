import dagre from '@dagrejs/dagre';
import { randomUUID } from 'node:crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { validateModelSvg } from './model-figure.mjs';
import { verifyFlowEvidence } from './flow-evidence.mjs';
import { wrapFlowNodeLabel } from './flow-layout.mjs';
import { journalFigureStyle, journalStagePalette, panelLetter } from './flow-journal-style.mjs';
import { layoutArchetypeBrief, layoutRecipe, normalizeLayoutArchetype, selectLayoutArchetype } from './flow-layout-archetypes.mjs';

const clip = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const xml = value => String(value).toWellFormed().replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '\ufffd').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[char]);

export const frameworkInstructions = [
  '分析用户提供的科研流程，按实际发生顺序划分 2–12 个可独立审核素材的块。先搭空框架，只输出块标题、英文检索词与明确的连线，不生成图元、实验结果或细节。',
  '保留明确存在的分叉、合流和反馈。连接索引从 0 开始，阶段尽量按阅读顺序排列。没有指定分支时使用顺序连接。英文检索词须包含具体方法和研究领域。',
  '返回 {"blocks":[{"label":"块标题","query":"具体英文检索词"}],"edges":[{"from":0,"to":1,"label":"可选交接说明"}]}。',
].join('\n');

export function normalizeFramework(output) {
  const blocks = Array.isArray(output?.blocks) ? output.blocks.map(block => ({
    label: clip(block?.label, 100), query: clip(block?.query, 160),
  })) : [];
  const edges = Array.isArray(output?.edges) ? output.edges.map(edge => ({
    from: edge?.from, to: edge?.to, label: clip(edge?.label, 52),
  })) : [];
  const validIndex = value => Number.isInteger(value) && value >= 0 && value < blocks.length;
  if (blocks.length < 2 || blocks.length > 12 || blocks.some(block => !block.label || !block.query) ||
      edges.length > 32 || edges.some(({ from, to }) => !validIndex(from) || !validIndex(to) || from === to) ||
      new Set(edges.map(({ from, to }) => from + ':' + to)).size !== edges.length) {
    throw new Error('Agent 返回的阶段或连线无效，请补充流程描述后重试。');
  }
  const reached = new Set([0]);
  for (let pass = 0; pass < blocks.length; pass++) {
    for (const { from, to } of edges) {
      if (reached.has(from) || reached.has(to)) { reached.add(from); reached.add(to); }
    }
  }
  if (reached.size !== blocks.length) throw new Error('框架含有未连接的阶段，请补充阶段之间的关系。');
  return { id: randomUUID(), blocks, edges, materials: blocks.map(() => null), confirmed: false };
}

export const blockInstructions = [
  '只处理指定阶段。以用户流程为准，论文作为方法依据和视觉参考。使用调整要求修订当前块，不画其他阶段、整图或跨块连线。',
  '生成方式为 agent 时，返回一个独立 SVG，必须带 xmlns、width、height、viewBox，只使用常见矢量图元及 SVG 文字，不引用外部资源，不重复块标题。按真实论文方法图绘制：白底占主导，文字近黑，外框线 0.8–1.2px，主箭头 1.1–1.3px 且箭头头部小，功能小框圆角 0–2px。不要使用胶囊卡片、投影、发光、渐变或装饰性虚线框。标签用短术语，画布宽 420–640，正文与关键标签 ≥12px；块内不画外层大框，需要内部分区时用细线、极浅 tint 和留白。主体内容占画布约 72%–88%，四边留 12–24px，不把内容缩在上半部。',
  '完整度硬约束：每个块至少包含 10 个可读文本片段与 12 个独立矢量图元，其中至少 3 个承载真实数据形状（谱线条带、矩阵、曲线、节点、样本、装置轮廓等）。必须同时有“对象/数据形状 + 方法操作或结构 + 注释/图例/单位/公式”三层信息；只有阶段名、空框和箭头的空骨架必须补全后再返回。',
  '两级构图：一个阶段块不是最终的大面板，内部应有 2–4 个相关子图组成同一科学叙事（例如输入数据条带 + 方法操作 + 输出/指标），子图横向排成 2–3 列或“一个大图 + 两个小图”。不要整块只画一个居中图元、一条箭头或一排等高空框。',
  '色彩按 100 张基准控制：白、浅灰、近黑等中性色约占 70%–82%，彩色墨迹约 30%，同图最多三种阶段色。红、青、蓝、赭只用于数据语义和阶段编码；每块最多两种低饱和主色，不做装饰性大底色。',
  '按科学含义选择图元，不要为了“高级感”套装饰配方。序列或光谱用简洁的离散条带、刻度和必要的通道标记；只有颜色本身编码真实光谱或数值时才使用对应色标。矩阵或张量用平面网格或 2–4 层有明确含义的轻量错位层，不画无信息的半透明 3D 卡片堆。神经网络用小圆点和细实线分层连接。公式用独立 SVG 文字，不用图片。强调色只标关键对象，整块最多使用两种低饱和主色。',
  '数学符号用真正的 SVG 上下标：下标写 <tspan dy="4" font-size="9">1:T</tspan>（如 x 的 1:T）、上标或帽子写 <tspan dy="-7" font-size="9">^</tspan> 或组合字符（Q̂）；禁止用下划线写法（x_1、h_t）。元素不得重叠：文字不压图形，标签之间互不交叠，间距不足时先缩图形再缩字。',
  '术语与完整性规范：RMSE、NSE、R² 等属于性能评价指标，容器标注用 Performance metrics 或 Performance evaluation，不得写成 Statistical test；统计检验（t 检验、显著性）才可称 statistical test。数据图小图必须可独立阅读：坐标轴名称＋单位＋刻度＋图例齐全；预测/训练/评估阶段要明确区分；输入变量、时间步、序列维度用符号标注（如 x_t、T、d_model）。',
  '画布与来源规范：素材按内容裁边，保留 12–24px 安全边，主体覆盖约 72%–88%；不要用空白撑构图，也不要让图元碰到边缘。多条曲线或系列必须能一一对应颜色或直接标注系列名；指标数值不得虚构，无真实结果时用占位符并在说明中标注待替换；数据对齐与对比标注用 Align & compare。',
  '生成方式为 paper 时，仅从实际提供的图片里选择，说明选图理由，并以百分比提供 crop {x,y,width,height}。需要整张截取图时使用 0,0,100,100。revision 提到裁切时只调整选中图的裁切，除非用户要求换图。此方式无需返回 SVG。',
  '两种方式都返回一条直接支持此阶段的论文原文 evidence {id,page,section,quote}。quote 必须连续逐字摘录，至少 12 字。只在对应来源填写页码或章节，摘要两个均留空。',
  '输出 JSON {"svg":"独立 SVG（或省略）","referenceIndex":0,"crop":{"x":0,"y":0,"width":100,"height":100},"summary":"本块内容和素材选择理由","evidence":{"id":"论文 id","page":null,"section":"","quote":"论文原文"}}。',
].join('\n');

export function approvedBlockEvidence(block, output, papers) {
  const report = verifyFlowEvidence([{
    title: block.label, columns: [[{ label: block.label, evidence: [output?.evidence] }]],
  }], { papers });
  const citation = report.nodes[0].citations.find(item => item.verified);
  if (!citation) throw new Error('此块未找到可核验的论文原文。请补充具体方法或导入相关论文后重试。');
  return citation;
}

export function normalizeCrop(value) {
  const { x, y, width, height } = value || {};
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 ||
      width < 5 || height < 5 || x + width > 100 || y + height > 100) {
    throw new Error('Agent 返回的论文裁切区域无效，请重试。');
  }
  return { x, y, width, height };
}

export function vectorBlock(value) {
  const svg = validateModelSvg(value);
  if (svg.length > 80_000) throw new Error('此块的 SVG 过大，请要求 Agent 简化图元。');
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

export const assemblyInstructions = [
  '按用户的要求、已确认的流程连接、已审核素材的图像与检索到的论文参考图，设计整图阅读方向、块的比例和间距。论文仅借鉴构图，禁止改写素材和流程连接。',
  'composition 选择 stacked（按方向顺序拼接）或 overviewDetail（小写 (a)(b)(c) 标记的独立详图面板，适合阶段 2–8 且各块素材已完整）。overviewDetail 不使用顶部缩略总览条、扇形放大线或彩色虚线底板；每个面板由阶段标题带、白底主体和面板底注组成，用细箭头组织阅读顺序，direction 决定主方向，sizes 表示各面板的相对高度。',
  'overviewDetail 还要给出 archetype：grid（多面板网格，100 张中 63%）、vertical（纵向分层，16%）、horizontal（横向流水线，4%）、single（单幅主图，17%）。4 块优先 grid 2×2，5–8 块优先 grid 3 列，3 块严格顺序可用 horizontal，3 块强调上下推进可用 vertical。archetype 只决定外层面板排列，不改变流程连接；每个面板内部仍需 2–4 个相关子图。',
  '综合上一版构图与本次布局反馈。为每个块按索引指定宽 200–520、高 180–420（单位 px），核心块可占更大空间；高度应容纳标题带、有效图元和底注，不要留下半块空白。方向用 LR（横向）、TB（纵向）、RL 或 BT，阶段间距 45–160，同层间距 30–110。',
  '可用 alignment 为 center、UL、UR、DL、DR，routing 为 polyline 或 smooth，frame 为 outlined 或 open。用户指定画布宽度时设置 canvasWidth（480–2000 px）。给出参考图的索引和借鉴的具体构图特点。',
  'captions 为每个块提供面板底部短说明（≤60 字符，语言跟随标注语言；英文论文用英文，如 "Rainfall–runoff forecasting with LSTM"，长解释放论文图注，不进图内）。',
  '返回 JSON {"direction":"LR","rankGap":75,"nodeGap":45,"sizes":[{"width":280,"height":220}],"alignment":"center","routing":"polyline","frame":"outlined","composition":"stacked","archetype":"grid","captions":["短说明"],"canvasWidth":null,"referenceIndex":0,"rationale":"布局理由"}。',
].join('\n');

export const assemblyInstructionsTextOnly = [
  ...assemblyInstructions.slice(0, -1),
  '本轮没有图像输入：仅凭参考图的来源、图注与构图说明、各块摘要和布局反馈决定方向、比例与间距，不要声称已查看图片。',
  'captions 为每个块提供面板底部短说明（≤60 字符，语言跟随标注语言；英文论文用英文，如 "Rainfall–runoff forecasting with LSTM"，长解释放论文图注，不进图内）。',
  '返回 JSON {"direction":"LR","rankGap":75,"nodeGap":45,"sizes":[{"width":280,"height":220}],"alignment":"center","routing":"polyline","frame":"outlined","composition":"stacked","archetype":"grid","captions":["短说明"],"canvasWidth":null,"referenceIndex":0,"rationale":"布局理由"}。',
].join('\n');

export function normalizeAssembly(value, count, references) {
  const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const direction = String(value?.direction || '').trim().toUpperCase();
  const rankGap = Number(value?.rankGap);
  const nodeGap = Number(value?.nodeGap);
  // 模型常把参考图索引按 1 起计数，夹取到有效范围。
  const referenceIndex = references.length ? Math.max(0, Math.min(references.length - 1, Math.floor(Number(value?.referenceIndex) || 0))) : 0;
  const sizes = Array.isArray(value?.sizes)
    ? value.sizes.map(size => ({ width: Number(size?.width), height: Number(size?.height) })) : [];
  const rationale = clip(value?.rationale, 500);
  if (!['LR', 'TB', 'RL', 'BT'].includes(direction) || !Number.isFinite(rankGap) || !Number.isFinite(nodeGap) ||
      sizes.length !== count || sizes.some(size => !Number.isFinite(size.width) || !Number.isFinite(size.height)) ||
      !rationale) {
    throw new Error('Agent 返回的布局参数不完整，可重试或进一步明确布局要求。');
  }
  const captions = Array.isArray(value?.captions) ? value.captions
    .map(item => clip(item, 60)).filter(Boolean) : [];
  return { direction, rankGap: clamp(rankGap, 45, 160), nodeGap: clamp(nodeGap, 30, 110),
    sizes: sizes.map(size => ({ width: clamp(size.width, 200, 520), height: clamp(size.height, 150, 380) })), rationale,
    ...(captions.length === count ? { captions } : {}),
    ...(['UL', 'UR', 'DL', 'DR'].includes(String(value.alignment || '').toUpperCase()) ? { alignment: value.alignment.toUpperCase() } : {}),
    routing: value.routing === 'smooth' ? 'smooth' : 'polyline',
    frame: value.frame === 'open' ? 'open' : 'outlined',
    ...(value.composition === 'overviewDetail' ? { composition: 'overviewDetail' } : {}),
    ...(normalizeLayoutArchetype(value.archetype) ? { archetype: normalizeLayoutArchetype(value.archetype) } : {}),
    ...(Number.isFinite(value.canvasWidth) && inRange(value.canvasWidth, 480, 2000) ? { canvasWidth: value.canvasWidth } : {}),
    reference: references[referenceIndex] };
}

// 参考图式构图：标题带 + 小写字母面板 + 细箭头 + 白底或极浅底详图。
// 100 张方法图的中位是“信息更完整”而不是“留白更多”：把阶段标题、有效图元和
// 底注压进同一面板，避免 3 个大空框浮在画布上半部。

function renderOverviewDetail(flow, specification, layout, style) {
  const count = flow.blocks.length;
  // 100 张基准的四种版式；用户显式选择 > 模型输出 > 阶段数/方向默认。
  const archetype = normalizeLayoutArchetype(layout?.archetype) ||
    selectLayoutArchetype(count, '', layout?.direction);
  const recipe = layoutRecipe(archetype, count);
  const columns = recipe.columns;
  const baseWidth = recipe.baseWidth;
  const width = Math.min(journalFigureStyle.canvas.maxWidth, Math.max(baseWidth, layout?.canvasWidth || 0));
  const margin = journalFigureStyle.canvas.margin;
  const panelGap = recipe.panelGap;
  const top = 16;
  const captionLineHeight = 14;
  const panelW = Math.floor((Math.min(width - 2 * margin, 1600) - (columns - 1) * panelGap) / columns);
  const panelXs = Array.from({ length: count }, (_, i) =>
    Math.round((width - (columns * panelW + (columns - 1) * panelGap)) / 2) + (i % columns) * (panelW + panelGap));
  const panels = flow.blocks.map((_, index) => {
    const asset = flow.materials[index];
    const label = flow.blocks[index].label;
    const captionText = layout?.captions?.[index] && layout.captions[index] !== label
      ? layout.captions[index] : '';
    const captionLines = captionText ? wrapFlowNodeLabel(captionText, panelW - 24, journalFigureStyle.font.caption) : [];
    const captionH = captionLines.length ? captionLines.length * captionLineHeight + 4 : 0;
    const titleLines = wrapFlowNodeLabel(label, panelW - 46, journalFigureStyle.font.label);
    const headerH = Math.max(27, titleLines.length * 15 + 13);
    const bodyH = Math.min(recipe.maxBodyHeight, Math.max(recipe.minBodyHeight,
      Math.round(panelW * recipe.bodyRatio),
      clampPanelBody(asset, panelW, layout?.sizes?.[index]?.height, columns >= 2),
    ));
    return { index, captionLines, titleLines, headerH, bodyH, asset, captionH,
      height: headerH + 8 + bodyH + (captionLines.length ? 6 + captionH : 0) };
  });
  const rows = Math.ceil(count / columns);
  const rowHeights = Array.from({ length: rows }, (_, r) =>
    Math.max(...panels.slice(r * columns, (r + 1) * columns).map(p => p.height)));
  const panelsH = rowHeights.reduce((sum, h) => sum + h, 0) + (rows - 1) * panelGap;
  const height = Math.ceil(top + panelsH + 14);
  const ink = journalFigureStyle.ink;
  const secondary = journalFigureStyle.secondary;

  const panelTopYs = [];
  let cursorY = top;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const index = row * columns + col;
      if (index < count) panelTopYs[index] = cursorY;
    }
    cursorY += rowHeights[row] + panelGap;
  }

  const panelBodies = panels.map(panel => {
    const panelX = panelXs[panel.index];
    const panelY = panelTopYs[panel.index];
    const stage = journalStagePalette[panel.index % journalStagePalette.length];
    const bodyY = panelY + panel.headerH + 8;
    const material = panel.asset
      ? renderBlock(panel.asset, panel.index, panelX, bodyY, panelW, panel.bodyH)
      : '';
    const captionY = bodyY + panel.bodyH + 6;
    return `<g id="assembly-stage-${panel.index}">
      <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panel.headerH}" fill="${stage.tint}"/>
      <line x1="${panelX}" y1="${panelY + panel.headerH}" x2="${panelX + panelW}" y2="${panelY + panel.headerH}" stroke="${stage.stroke}" stroke-width="${journalFigureStyle.stroke.hairline}"/>
      <text x="${panelX + 10}" y="${panelY + 17}" font-size="${journalFigureStyle.font.panel}" font-weight="600" fill="${ink}">${panelLetter(panel.index)}</text>
      ${panel.titleLines.map((line, i) => `<text x="${panelX + 32}" y="${panelY + 17 + i * 15}" font-size="${journalFigureStyle.font.label}" font-weight="600" fill="${ink}">${xml(line)}</text>`).join('')}
      ${material}
      ${panel.captionLines.map((line, i) => `<text x="${panelX + 2}" y="${captionY + 10 + i * captionLineHeight}" font-size="${journalFigureStyle.font.caption}" fill="${secondary}">${xml(line)}</text>`).join('')}
      </g>`;
  }).join('');

  const linkEdges = [];
  for (const { from, to } of flow.edges) {
    if (to !== from + 1 || from < 0 || from >= count - 1) continue;
    // 单列纵向版式：相邻阶段之间用短竖箭头连接，不能让面板只靠编号阅读。
    if (columns === 1) {
      const x = panelXs[from] + Math.round(panelW / 2);
      const y1 = panelTopYs[from] + panels[from].height;
      const y2 = panelTopYs[to] - 3;
      linkEdges.push(`<path d="M${x},${y1} L${x},${y2}" fill="none" stroke="${journalFigureStyle.arrow}" stroke-width="${journalFigureStyle.stroke.arrow}" stroke-linejoin="round" marker-end="url(#assembly-arrow)"/>`);
      continue;
    }
    if (Math.floor(from / columns) !== Math.floor(to / columns)) continue;
    const row = Math.floor(from / columns);
    const fromPanel = panels[from];
    const toPanel = panels[to];
    const y1 = panelTopYs[from] + fromPanel.headerH + 8 + Math.round(fromPanel.bodyH / 2);
    const y2 = panelTopYs[to] + toPanel.headerH + 8 + Math.round(toPanel.bodyH / 2);
    const x1 = panelXs[from] + panelW + 2;
    const x2 = panelXs[to] - 4;
    const bend = Math.round((x1 + x2) / 2);
    const path = Math.abs(y1 - y2) < 2
      ? `M${x1},${y1} L${x2},${y2}`
      : `M${x1},${y1} L${bend},${y1} L${bend},${y2} L${x2},${y2}`;
    linkEdges.push(`<path d="${path}" fill="none" stroke="${journalFigureStyle.arrow}" stroke-width="${journalFigureStyle.stroke.arrow}" stroke-linejoin="round" marker-end="url(#assembly-arrow)"/>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${xml(journalFigureStyle.fontFamily)}" fill="${ink}">
    <defs><marker id="assembly-arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="${journalFigureStyle.arrow}"/></marker></defs>
    <rect width="100%" height="100%" fill="${journalFigureStyle.background}"/>
    ${panelBodies}<g id="assembly-links">${linkEdges.join('')}</g></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

function clampPanelBody(asset, panelW, sizeHeight, compact = false) {
  if (asset?.kind === 'paper' && asset.data.startsWith('data:image/')) {
    return Math.round(Math.min(compact ? 320 : 420, Math.max(200, (sizeHeight || 260) * (compact ? 0.9 : 1.2))));
  }
  const svg = Buffer.from(asset.data.split(',')[1], 'base64').toString('utf8');
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const widthAttr = Number.parseFloat(root.getAttribute('width'));
  const heightAttr = Number.parseFloat(root.getAttribute('height'));
  if (Number.isFinite(widthAttr) && Number.isFinite(heightAttr) && widthAttr > 0) {
    return Math.round(Math.min(compact ? 340 : 460, Math.max(190, (panelW - 20) * heightAttr / widthAttr)));
  }
  return compact ? 230 : 280;
}

const colorAttribute = new Set(['fill', 'stroke', 'stop-color', 'flood-color']);
const rgbaPattern = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i;
const hexByte = value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');

// PDF 与 PyMuPDF 对 rgba() 的支持不一致，常见结果是整块被画成黑色。
// 在嵌入前把 rgba/rgb 转成十六进制，并把透明度拆成独立的 *-opacity 属性。
function normalizeSvgColors(root) {
  for (const element of [root, ...Array.from(root.getElementsByTagName('*'))]) {
    for (const attribute of Array.from(element.attributes)) {
      if (!colorAttribute.has(attribute.name)) continue;
      const match = attribute.value.trim().match(rgbaPattern);
      if (!match) continue;
      const [, r, g, b, a] = match;
      const hex = '#' + hexByte(Number(r)) + hexByte(Number(g)) + hexByte(Number(b));
      element.setAttribute(attribute.name, hex);
      if (a !== undefined && Number(a) < 1) element.setAttribute(attribute.name + '-opacity', String(Number(a)));
    }
    const style = element.getAttribute('style');
    if (!style || !/rgba?\(/i.test(style)) continue;
    const inline = /(fill|stroke|stop-color)\s*:\s*(rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\))/gi;
    const normalized = style.replace(inline, (match, property, value, r, g, b, a) => {
      const hex = '#' + hexByte(Number(r)) + hexByte(Number(g)) + hexByte(Number(b));
      const opacity = a !== undefined && Number(a) < 1 ? `;${property}-opacity:${Number(a)}` : '';
      return `${property}:${hex}${opacity}`;
    });
    if (normalized !== style) element.setAttribute('style', normalized);
  }
}

function renderBlock(asset, index, x, y, width, height, prefixOverride) {
  if (asset.kind === 'paper') {
    return `<image data-assembly-material="" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" href="${xml(asset.data)}"/>`;
  }
  const svg = Buffer.from(asset.data.split(',')[1], 'base64').toString('utf8');
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  normalizeSvgColors(root);
  const prefix = prefixOverride || 'block-' + index + '-';
  for (const element of [root, ...Array.from(root.getElementsByTagName('*'))]) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name === 'id') element.setAttribute('id', prefix + attribute.value);
      else if (/^url\(#[\w.-]+\)$/.test(attribute.value)) {
        element.setAttribute(attribute.name, attribute.value.replace('#', '#' + prefix));
      }
    }
  }
  // 不用嵌套 <svg>：部分 PDF/位图渲染器会忽略嵌套根上的 x/y，导致所有块叠在原点。
  // 直接按 viewBox 计算 meet 缩放，把子元素放进 <g> 里，浏览器、PDF 与预览表现一致。
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  const widthAttr = Number.parseFloat(root.getAttribute('width'));
  const heightAttr = Number.parseFloat(root.getAttribute('height'));
  const [vx, vy, vw, vh] = viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0
    ? viewBox : [0, 0, Number.isFinite(widthAttr) ? widthAttr : width, Number.isFinite(heightAttr) ? heightAttr : height];
  const scale = Math.min(width / vw, height / vh);
  const offsetX = x + (width - vw * scale) / 2 - vx * scale;
  const offsetY = y + (height - vh * scale) / 2 - vy * scale;
  const content = Array.from(root.childNodes)
    .map(node => new XMLSerializer().serializeToString(node)).join('');
  return `<g data-assembly-material="" transform="translate(${offsetX.toFixed(3)} ${offsetY.toFixed(3)}) scale(${scale.toFixed(4)})">${content}</g>`;
}

export function renderAssembly(flow, specification, layout, style) {
  if (layout?.composition === 'overviewDetail') return renderOverviewDetail(flow, specification, layout, style);
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: layout?.direction || 'LR', ranksep: layout?.rankGap || 54,
    nodesep: layout?.nodeGap || 36, align: layout?.alignment, marginx: 25, marginy: 25, acyclicer: 'greedy' });
  graph.setDefaultEdgeLabel(() => ({}));
  const blockLines = flow.blocks.map(({ label }, index) => {
    const { width, height } = layout?.sizes[index] || { width: 200, height: 68 };
    const lines = wrapFlowNodeLabel(label, width - 60, 16);
    graph.setNode(String(index), { width, height: Math.max(height, lines.length * 20 + (layout ? 115 : 28)) });
    return lines;
  });
  for (const { from, to, label } of flow.edges) {
    const lines = wrapFlowNodeLabel(label, 126, 13);
    graph.setEdge(String(from), String(to), { width: label ? 134 : 0, height: label ? lines.length * 16 + 8 : 0, lines });
  }
  dagre.layout(graph);
  const dimension = graph.graph();
  const width = Math.max(320, Math.ceil(dimension.width));
  const height = Math.ceil(dimension.height + 8);
  const paths = graph.edges().map(edge => {
    const { points, lines, x, y, height } = graph.edge(edge);
    const label = height ? lines.map((line, i) =>
      `<text x="${x}" y="${y - height / 2 + 14 + i * 15}" text-anchor="middle" font-size="${journalFigureStyle.font.note}" fill="${journalFigureStyle.secondary}" stroke="#ffffff" stroke-width="3" paint-order="stroke">${xml(line)}</text>`).join('') : '';
    const style = `fill="none" stroke="${journalFigureStyle.arrow}" stroke-width="${journalFigureStyle.stroke.arrow}" stroke-linejoin="round" marker-end="url(#assembly-arrow)"`;
    const point = ({ x, y }) => x + ',' + y;
    const line = layout?.routing === 'smooth'
      ? `<path ${style} d="M${point(points[0])} ${points.slice(1, -1).map((pos, i) => {
        const next = points[i + 2];
        return 'Q' + point(pos) + ' ' + point({ x: (pos.x + next.x) / 2, y: (pos.y + next.y) / 2 });
      }).join(' ')} L${point(points.at(-1))}"/>`
      : `<polyline ${style} points="${points.map(point).join(' ')}"/>`;
    return line + label;
  }).join('');
  const panels = flow.blocks.map((_, index) => {
    const { x, y, width, height } = graph.node(String(index));
    const lines = blockLines[index];
    const asset = layout && flow.materials[index];
    const headerHeight = lines.length * 18 + 10;
    return `<g id="assembly-stage-${index}" transform="translate(${x - width / 2} ${y - height / 2})"><rect width="${width}" height="${height}" rx="0" fill="#fff" stroke="${layout?.frame === 'open' ? 'none' : journalFigureStyle.rule}" stroke-width="${journalFigureStyle.stroke.panel}"/>
      <text x="12" y="19" font-size="${journalFigureStyle.font.panel}" font-weight="600" fill="${journalFigureStyle.ink}">${panelLetter(index)}</text>
      ${lines.map((line, i) => `<text x="36" y="${21 + i * 18}" font-size="${journalFigureStyle.font.label}" font-weight="600" fill="${journalFigureStyle.ink}">${xml(line)}</text>`).join('')}
      ${asset ? renderBlock(asset, index, 10, headerHeight + 3, width - 20, height - headerHeight - 13) : ''}
      </g>`;
  }).join('');
  const scale = Math.min((layout?.canvasWidth || Math.min(2000, width)) / width, 10000 / height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.floor(width * scale)}" height="${Math.floor(height * scale)}" viewBox="0 0 ${width} ${height}" font-family="${xml(journalFigureStyle.fontFamily)}" fill="${journalFigureStyle.ink}">
    <defs><marker id="assembly-arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="${journalFigureStyle.arrow}"/></marker></defs>
    <rect width="100%" height="100%" fill="${journalFigureStyle.background}"/>
    <g id="assembly-links">${paths}</g>${panels}</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}
