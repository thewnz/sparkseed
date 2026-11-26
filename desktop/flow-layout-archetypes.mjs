// 100 张开放论文插图的版式类型与可执行配方。
// 数据来源：scripts/extract-layout-features.py -> artifacts/style-benchmark/layout-features.json
// 版式是生成约束，不是论文事实；它决定外层面板、阅读方向和内部子图数量。
export const journalLayoutEvidence = {
  sampleSize: 100,
  methodFigures: 77,
  layoutReference: 23,
  global: {
    aspectMedian: 1.136,
    columnsMedian: 2,
    rowsMedian: 3,
    cellsMedian: 6,
    centerInkMedian: 0.079,
    neutralShareMedian: 0.782,
    accentHueCountMedian: 3,
  },
  archetypes: {
    grid: { count: 63, share: 0.63, aspectMedian: 1.225, columnsMedian: 3, rowsMedian: 3, cellsMedian: 6 },
    vertical: { count: 16, share: 0.16, aspectMedian: 0.922, columnsMedian: 1, rowsMedian: 4, cellsMedian: 4 },
    single: { count: 17, share: 0.17, aspectMedian: 1.245, columnsMedian: 1, rowsMedian: 2, cellsMedian: 2 },
    horizontal: { count: 4, share: 0.04, aspectMedian: 1.019, columnsMedian: 3, rowsMedian: 1, cellsMedian: 3 },
  },
  hueFamilies: [
    { family: '0-29', label: '红', weightedShare: 21.77, imageCount: 75 },
    { family: '180-209', label: '青', weightedShare: 15.79, imageCount: 60 },
    { family: '30-59', label: '橙赭', weightedShare: 12.67, imageCount: 52 },
    { family: '210-239', label: '蓝', weightedShare: 12.16, imageCount: 44 },
    { family: '330-359', label: '玫红', weightedShare: 5.95, imageCount: 31 },
  ],
};

export const journalLayoutArchetypes = {
  grid: {
    id: 'grid', label: '多面板网格',
    description: '阶段按 2–3 列展开，每个面板内部再放 1–3 个相关子图；适合 4–8 个阶段的方法总览。',
    bestFor: '4–8 个阶段，阶段之间有并行或并列关系',
    aspect: [1.05, 1.6], panelGrid: '2×2（4 块）或 3×2（5–8 块）',
  },
  vertical: {
    id: 'vertical', label: '纵向分层',
    description: '外层单列、从上到下阅读，每个横带内部横向排 2–3 个数据子图；适合纵向比较或多组样本。',
    bestFor: '3–5 个阶段，强调自上而下的阶段推进',
    aspect: [0.7, 1.1], panelGrid: '1×3 或 1×4 横带',
  },
  horizontal: {
    id: 'horizontal', label: '横向流水线',
    description: '3 个阶段从左到右排开，面板内部保持 1 列，箭头只连接真实相邻阶段；适合线性方法流水线。',
    bestFor: '2–3 个阶段，严格顺序流程',
    aspect: [1.8, 2.8], panelGrid: '1×2 或 1×3',
  },
  single: {
    id: 'single', label: '单幅主图',
    description: '1–2 个主面板，内部用 2–4 个数据子图组成一个完整机制；不把单幅图拆成多个空框。',
    bestFor: '1–2 个阶段，机制或结构是主角',
    aspect: [1.0, 1.6], panelGrid: '1 或 2 个主面板',
  },
};

export function normalizeLayoutArchetype(value) {
  const id = String(value || '').trim().toLowerCase();
  return Object.hasOwn(journalLayoutArchetypes, id) ? id : '';
}

export function selectLayoutArchetype(count, preferred = '', direction = '') {
  const explicit = normalizeLayoutArchetype(preferred);
  if (explicit) return explicit;
  if (direction === 'TB' && count === 3) return 'vertical';
  if (count <= 2) return 'single';
  if (count === 3) return 'horizontal';
  return 'grid';
}

export function layoutRecipe(archetype, count) {
  const id = normalizeLayoutArchetype(archetype) || selectLayoutArchetype(count);
  if (id === 'vertical') {
    return { id, columns: 1, baseWidth: 900, bodyRatio: 0.35, maxBodyHeight: 360,
      minBodyHeight: 230, panelGap: 24, targetAspect: 0.92 };
  }
  if (id === 'horizontal') {
    return { id, columns: Math.min(3, Math.max(1, count)), baseWidth: 1160, bodyRatio: 1.0,
      maxBodyHeight: 430, minBodyHeight: 240, panelGap: 26, targetAspect: 2.5 };
  }
  if (id === 'single') {
    return { id, columns: count <= 1 ? 1 : 2, baseWidth: 1120, bodyRatio: count <= 1 ? 0.78 : 1.0,
      maxBodyHeight: 620, minBodyHeight: 260, panelGap: 30, targetAspect: 1.45 };
  }
  return { id: 'grid', columns: count <= 4 ? 2 : 3, baseWidth: count <= 4 ? 1080 : 1160,
    bodyRatio: count <= 4 ? 0.82 : 0.92, maxBodyHeight: 460, minBodyHeight: 240,
    panelGap: count <= 4 ? 30 : 26, targetAspect: 1.23 };
}

export function layoutArchetypeBrief(count, preferred = '') {
  const chosen = normalizeLayoutArchetype(preferred);
  const selected = selectLayoutArchetype(count, chosen);
  const recipe = layoutRecipe(selected, count);
  const archetype = journalLayoutArchetypes[selected];
  return `版式基准：100 张中多面板网格 63%、纵向分层 16%、单幅主图 17%、横向流水线 4%。` +
    `${chosen ? '已选' : '当前建议'}「${archetype.label}」：${archetype.description}` +
    `外层 ${recipe.columns} 列，目标宽高比约 ${recipe.targetAspect}；每个面板内部至少 2 个相关子图。`;
}
