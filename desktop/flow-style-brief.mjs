// 流程图风格问答：向用户索取风格偏好，跳过或未回答时使用默认专业期刊风格。
import { journalDataPalette, journalFigureRules, journalStagePalette } from './flow-journal-style.mjs';

const question = (id, text, options, help = '') => ({ id, question: text, options, help });

export const flowStyleQuestions = [
  question('composition', '整图希望用什么构图？', [
    '总览＋分阶段详图（期刊 graphical abstract 风格）', '按阶段顺序拼接', '由 Agent 决定',
  ], '总览＋详图会把每个阶段放大成独立面板，适合阶段 2–8 的图。'),
  question('palette', '配色希望走哪种色系？', [
    '低饱和期刊阶段色（蓝、赭、绿，最多三色）', '单色学术蓝灰', '暖色系（赭红、琥珀、橄榄）',
    '数据语义色（蓝、红、青，最多三色）', '跟随论文参考图原色',
  ]),
  question('labels', '图内标注用什么语言？', [
    '英文短术语', '中文', '中英双语（图形用英文，说明用中文）',
  ]),
  question('density', '画面密度偏好？', [
    '高信息密度（有效图元更充分，保留必要留白）', '常规密度', '简洁（图元少、留白多）',
  ]),
];

export function normalizeFlowStyle(input) {
  const style = {};
  flowStyleQuestions.forEach(({ id, options }) => {
    const value = input?.[id];
    if (!Number.isInteger(value) || value < 0 || value >= options.length) return;
    style[id] = value;
  });
  return style;
}

const paletteFamilies = {
  journal: journalStagePalette,
  mono: [
    { stroke: '#4a7ba6', fill: '#e9f1f8' }, { stroke: '#3d6a94', fill: '#e4edf5' },
    { stroke: '#55829f', fill: '#eaf1f4' }, { stroke: '#41668c', fill: '#e7eef6' },
    { stroke: '#4a7ba6', fill: '#e9f1f8' }, { stroke: '#3d6a94', fill: '#e4edf5' },
  ],
  warm: [
    { stroke: '#c05a3a', fill: '#faece7' }, { stroke: '#c78a35', fill: '#faf1e0' },
    { stroke: '#a05a35', fill: '#f6ede4' }, { stroke: '#d99a4a', fill: '#fbf2e3' },
    { stroke: '#b06a45', fill: '#f8efe8' }, { stroke: '#c78a35', fill: '#faf1e0' },
  ],
  data: journalDataPalette,
};

export function flowPalette(style) {
  return paletteFamilies[style?.palette === 1 ? 'mono' : style?.palette === 2 ? 'warm'
    : style?.palette === 3 ? 'data' : 'journal'];
}

export function flowStyleDirectives(style) {
  const directives = [];
  if (style?.labels === 1) directives.push('图内标注使用中文短术语。');
  else if (style?.labels === 2) directives.push('图形内标签用英文短术语，面板底注用中文。');
  else directives.push('图内标注使用英文短术语。');
  if (style?.density === 0) directives.push('画面高信息密度：增加有效科学图元和必要标注，整体近白区域约 62%–76%，不把画面铺满，也不留中央空洞。');
  else if (style?.density === 2) directives.push('画面简洁：只保留核心图元，整体近白区域约 75%–88%，用留白组织层级。');
  else directives.push('画面常规密度：整体近白区域约 65%–80%，图元集中在语义区域，不以铺满画布为目标。');
  if (style?.palette === 1) directives.push('配色使用单色学术蓝灰系：主色 #2f5f8f、辅助深灰 #4f555b，分区只用细线和留白。');
  else if (style?.palette === 2) directives.push('配色使用暖色系：赭红 #a45f32、琥珀 #b88a45、橄榄 #4c7358，白底为主。');
  else if (style?.palette === 3) directives.push('配色使用数据语义色：蓝 #2f5f8f、红 #a33d3d、青 #2f6f6f，最多三种，只标数据图元和阶段编码，白底与中性灰仍占主导。');
  else if (style?.palette === 4) directives.push('配色跟随论文参考图的原图色调，但压缩为不超过三种低饱和阶段色，白底为主。');
  else directives.push('默认使用顶会/顶刊低饱和阶段色：蓝 #2f5f8f、赭 #a45f32、绿 #4c7358，最多三色；大面积留白，不用渐变。');
  directives.push(journalFigureRules);
  return directives.join('');
}

export function flowDefaultComposition(style) {
  if (style?.composition === 0) return 'overviewDetail';
  if (style?.composition === 1) return 'stacked';
  return '';
}
