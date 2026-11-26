const svg = content => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 116" role="img"><rect width="240" height="116" fill="#ffffff"/>${content}</svg>`;
const box = (x, y, w, h, fill = '#ffffff', stroke = '#8fa0b0', radius = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
const arrow = (x1, y1, x2, y2, color = '#546273') => `<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="1.2" marker-end="url(#a)"/>`;
const thumb = content => svg(`<defs><marker id="a" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5Z" fill="#546273"/></marker></defs>${content}`);

export const FLOW_REFERENCE_GALLERY = Object.freeze([
  {
    id: 'overview-detail', label: '总览 + 局部详图',
    description: '上方保留完整主流程，下方用同色分区展开关键阶段；适合方法总览、分阶段实验和复杂特征筛选。',
    archetype: 'overview-detail', layout: 'compact', nodeStyle: 'glyph', leader: 'line', frame: 'open', palette: ['#2f5f8f', '#a45f32', '#4c7358'],
    keywords: ['总览', '详图', '局部', '放大', '阶段', '流程图', 'overview', 'detail', 'panel', 'multi-stage'],
    preview: thumb(`${box(28,16,48,22,'#f1f6fa','#2f5f8f')}${box(96,16,48,22,'#faf3ed','#a45f32')}${box(164,16,48,22,'#f2f7f3','#4c7358')}${box(18,62,62,28,'#ffffff','#2f5f8f')}${box(89,62,62,28,'#ffffff','#a45f32')}${box(160,62,62,28,'#ffffff','#4c7358')}<path d="M43 44v14 M114 44v14 M185 44v14" stroke="#8fa0b0" stroke-width="1"/><path d="M80 76h7 M151 76h7" stroke="#3f4448" stroke-width="1.2" marker-end="url(#a)"/><text x="121" y="104" font-size="8" fill="#4f555b" text-anchor="middle" font-family="Arial">stage panels + detail</text>`),
  },
  {
    id: 'parallel-merge', label: '并行分支 + 汇合',
    description: '同层展示并行实验、比较或多路输入，再汇合到共享结果；适合消融实验、候选筛选和多模态分析。',
    archetype: 'branch', layout: 'panels', nodeStyle: 'card', leader: 'line', frame: 'solid', palette: ['#2f5f8f', '#a45f32', '#4c7358'],
    keywords: ['并行', '分支', '汇合', '多路', '比较', 'parallel', 'branch', 'merge', 'ablation', 'candidate'],
    preview: thumb(`${box(12,43,47,29,'#e9eef8','#8095bd')}${box(91,14,57,25,'#f5e8d7','#c99a5b')}${box(91,46,57,25,'#e4f0e6','#7eaa89')}${box(91,78,57,25,'#e8e4f3','#9689ba')}${box(181,43,47,29,'#dfeef0','#659ca6')}${arrow(59,57,81,27)}${arrow(59,57,81,58)}${arrow(59,57,81,90)}${arrow(148,27,171,53)}${arrow(148,58,171,58)}${arrow(148,90,171,63)}`),
  },
  {
    id: 'feedback-cycle', label: '主线 + 反馈回路',
    description: '突出前向主线，并将验证、优化等反馈关系沿外侧回接；适合迭代算法、模型训练和闭环实验。',
    archetype: 'cycle', layout: 'compact', nodeStyle: 'card', leader: 'line', frame: 'open', palette: ['#8095bd', '#7eaa89', '#c99a5b'],
    keywords: ['反馈', '回路', '迭代', '循环', '闭环', '优化', 'feedback', 'cycle', 'iteration', 'loop', 'training'],
    preview: thumb(`${box(16,42,55,31,'#e7edf6','#8095bd')}${box(93,42,55,31,'#e9f0e6','#7eaa89')}${box(170,42,55,31,'#f4e8de','#c99a5b')}${arrow(71,57,83,57)}${arrow(148,57,160,57)}<path d="M198 74 C198 106 43 106 43 76" fill="none" stroke="#798a9a" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#a)"/><text x="121" y="100" fill="#526273" font-size="9" text-anchor="middle" font-family="Arial">review &amp; refine</text>`),
  },
  {
    id: 'swimlane', label: '泳道 / 参与方',
    description: '按角色、设备、数据源或研究阶段分区，分区内保持各自顺序并明确跨区交接；适合多主体协作流程。',
    archetype: 'swimlane', layout: 'stacked', nodeStyle: 'plain', leader: 'line', frame: 'solid', palette: ['#8095bd', '#7eaa89', '#c99a5b'],
    keywords: ['泳道', '参与方', '角色', '设备', '数据源', '协作', 'swimlane', 'actor', 'participant', 'lane', 'cross-functional'],
    preview: thumb(`${box(9,12,222,27,'#f4f6fa','#b8c1cf',4)}${box(9,44,222,27,'#f4faf6','#b8c9bc',4)}${box(9,76,222,27,'#fbf6ef','#d4c3a8',4)}<text x="17" y="29" fill="#627188" font-size="8" font-family="Arial">DATA</text><text x="17" y="61" fill="#66836e" font-size="8" font-family="Arial">MODEL</text><text x="17" y="93" fill="#9a805b" font-size="8" font-family="Arial">RESEARCHER</text>${box(72,18,41,15,'#e4eafa','#9caecc',3)}${box(129,50,41,15,'#e3f0e4','#91b39a',3)}${box(186,82,32,15,'#f5e8d7','#caab7a',3)}${arrow(113,26,125,58)}${arrow(170,58,182,90)}`),
  },
  {
    id: 'matrix-feature', label: '矩阵 / 特征筛选',
    description: '把数据表示、排序、组合和筛选设计成连续的图形语法；适合组学、光谱、影像和模型特征工程。',
    archetype: 'overview-detail', layout: 'panels', nodeStyle: 'glyph', leader: 'line', frame: 'open', palette: ['#2f5f8f', '#a45f32', '#4c7358'],
    keywords: ['矩阵', '光谱', '波长', '特征', '筛选', '排序', '组合', '组学', 'matrix', 'spectrum', 'wavelength', 'feature', 'omics'],
    preview: thumb(`${box(9,33,42,49,'#edf0f7','#9daac0')}${[0,1,2,3].map(i=>`<path d="M16 ${42+i*9}h28" stroke="${['#8067a8','#5e91b5','#68a887','#d2aa58'][i]}" stroke-width="4"/>`).join('')}${box(72,38,42,39,'#f6e5e3','#c78386')}${box(127,38,42,39,'#e5f1e8','#82ad8c')}${box(182,38,46,39,'#e1eff2','#74a9b0')}${arrow(51,57,64,57)}${arrow(114,57,119,57)}${arrow(169,57,174,57)}<text x="93" y="92" font-size="8" fill="#667" text-anchor="middle">rank</text><text x="148" y="92" font-size="8" fill="#667" text-anchor="middle">combine</text>`),
  },
  {
    id: 'compact-method', label: '紧凑方法流程',
    description: '按阅读顺序压缩为清晰的模块链，减少空白和无意义装饰；适合步骤较少、单栏排版或快速出图。',
    archetype: 'pipeline', layout: 'compact', nodeStyle: 'glyph', leader: 'line', frame: 'open', palette: ['#2f5f8f', '#a45f32', '#4c7358'],
    keywords: ['顺序', '简单', '单栏', '紧凑', '方法', 'pipeline', 'sequential', 'method', 'compact', 'single-column'],
    preview: thumb(`${box(12,42,48,31,'#e7edf6','#8095bd')}${box(74,42,48,31,'#f5ead9','#c99a5b')}${box(136,42,48,31,'#e5f0e6','#7eaa89')}${box(198,42,30,31,'#deedf0','#659ca6')}${arrow(60,57,68,57)}${arrow(122,57,130,57)}${arrow(184,57,192,57)}<path d="M19 85h202" stroke="#d6dce4" stroke-width="1"/>`),
  },
]);

export const FLOW_REFERENCE_AUTO = Object.freeze({
  id: 'auto', label: 'AI 自动推荐',
  description: '结合流程步骤、领域关键词与论文插图推荐构图；硬性约束优先。',
  preview: thumb(`${box(24,41,53,32,'#e7edf6','#8095bd')}${box(94,24,53,32,'#e5f0e6','#7eaa89')}${box(94,59,53,32,'#f5ead9','#c99a5b')}${box(164,41,53,32,'#deedf0','#659ca6')}${arrow(77,57,88,38)}${arrow(77,57,88,75)}${arrow(147,38,158,53)}${arrow(147,75,158,60)}`),
});

const byId = new Map(FLOW_REFERENCE_GALLERY.map(profile => [profile.id, profile]));
export const getFlowReferenceProfile = id => byId.get(id) || null;
export const flowReferencePreviewData = id => {
  const profile = id === 'auto' ? FLOW_REFERENCE_AUTO : getFlowReferenceProfile(id);
  return profile ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(profile.preview)}` : '';
};

export function recommendFlowReference(input = {}) {
  const context = [input.description, input.steps, input.requirements, input.constraints, input.archetype]
    .flat(Infinity).filter(Boolean).join(' ').toLowerCase();
  const scores = FLOW_REFERENCE_GALLERY.map((profile, index) => ({
    profile,
    score: profile.keywords.reduce((score, keyword) => score + (context.includes(keyword.toLowerCase()) ? 2 : 0), 0) +
      (profile.archetype === input.archetype ? 3 : 0) - index * 0.001,
  })).sort((a, b) => b.score - a.score);
  const winner = scores[0];
  const reason = winner.score > 0 ? `根据流程主题、步骤或拓扑匹配到“${winner.profile.label}”。` : '流程特征较通用，默认采用紧凑方法流程。';
  return { profile: winner.score > 0 ? winner.profile : getFlowReferenceProfile('compact-method'), reason };
}

export function applyFlowReferenceDefaults(design, profile, { preferProfile = false, useDefaults = true } = {}) {
  if (!profile) return design;
  if (!useDefaults) return { ...design, referenceProfileId: profile.id };
  return {
    ...design,
    layout: preferProfile ? profile.layout : design.layout || profile.layout,
    nodeStyle: preferProfile ? profile.nodeStyle : design.nodeStyle || profile.nodeStyle,
    leader: preferProfile ? profile.leader : design.leader || profile.leader,
    frame: preferProfile ? profile.frame : design.frame || profile.frame,
    palette: design.palette?.length ? design.palette : profile.palette || [],
    referenceProfileId: profile.id,
  };
}
