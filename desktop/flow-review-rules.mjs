// 评审规范约束：来自论文级评审意见的可选硬约束，勾选后参与每块绘制与整图排版。
export const flowReviewRules = [
  { id: 'terminology', label: '术语规范', text: 'RMSE、NSE、R² 等属于性能评价指标，容器标注用 Evaluation metrics、Performance metrics 或 Performance evaluation，不得写成 Statistical test；数据对齐与对比用 Align & compare（按站点与时间对齐），不写成 Merge；统计检验（t 检验、显著性）才可称 statistical test。' },
  { id: 'minFont', label: '最小字号', text: '块内画布 420–640 时正文 ≥14px、关键标签 ≥16px，保证缩放进双栏论文后仍 ≥7pt 可读；底注与图例不用浅灰色。' },
  { id: 'axes', label: '小图完整性', text: '数据对比小图必须可独立阅读：坐标轴名称＋单位＋刻度＋图例齐全，占满所在区域，不留大片空白。' },
  { id: 'stackLabel', label: '结构标注', text: '斜堆、层叠、多维矩阵等结构必须带含义标签（如 Hidden states h_t、Feature maps）；预测/训练/评估阶段明确区分，输入变量与时间步用符号标注（x_t、T、d_model）。' },
  { id: 'alignment', label: '对齐统一', text: '模块底边对齐，圆角容器与虚线框每层不超过一种线型，同组模块宽高一致；元素不得重叠——文字不压图形、标签互不交叠，间距不足先缩图形再缩字。' },
  { id: 'contrast', label: '对比度', text: '文字与背景对比度达到 WCAG AA（正文 4.5:1）；文字不得压在渐变或密集图形上。' },
  { id: 'density', label: '画面密度', text: '有效图元覆盖画布约 68%–85%，四边保留 12–24 px 安全边；内容集中在语义区域，不出现面板中央的大片空白，也不铺满画布。' },
  { id: 'vector', label: '矢量输出', text: '交付以 SVG/PDF 矢量导出为准，导出前按灰度打印与色盲可辨识性复核配色（同组图元不只用红色区分）。' },
  { id: 'realData', label: '数据真实性', text: '指标数值不得虚构：没有真实实验结果时不写具体数字，用占位（如 RMSE = —）或在说明中标注“示例数值，待替换为真实测试集结果”；正式论文插图必须使用真实测试集结果；没有数值时只保留指标名称（RMSE、NSE、R²），删除横线与空白数值栏。' },
  { id: 'legendClarity', label: '颜色对应', text: '多条曲线/多个系列必须能一一对应颜色：直接在曲线旁标注系列名，或放带色块的图例；不得只靠颜色深浅区分。' },
];

export function normalizeFlowReviewRules(input) {
  const ids = Array.isArray(input) ? input : [];
  const valid = new Set(flowReviewRules.map(({ id }) => id));
  return [...new Set(ids.filter(id => typeof id === 'string' && valid.has(id)))];
}

export function flowReviewConstraintText(rules) {
  const active = flowReviewRules.filter(({ id }) => rules.includes(id));
  return active.map(({ text }) => '- ' + text).join('\n');
}
