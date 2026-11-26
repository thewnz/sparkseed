const question = (id, text, options, help = '') => ({ id, question: text, options, help });
const purpose = question('purpose', '这张图最想让读者看懂什么？', [
  '随时间或步骤变化的趋势', '方法或实验组之间的差异', '两个数值变量的关系', '矩阵中的强弱分布', '研究流程或方法步骤', '概念、结构或机制示意',
]);
const source = question('source', '你打算用什么材料来出图？', [
  '粘贴自己的材料', '导入本地文件', '先用内置示例试一遍',
]);
const audience = question('audience', '这张图准备在哪里使用？', [
  '论文或投稿', '组会或答辩', '海报或演示', '自己探索数据',
]);
const emphasis = question('emphasis', '图里需要特别说明什么，读者才不会误解？', [
  '坐标轴的指标与单位', '组别或条件的含义', '样本量、误差或缺失值', '数据来源或处理方法', '暂无额外要求',
], '如果已有想用的指标、单位或图注，可以在此补充。');
const steps = question('emphasis', '流程图需要读者重点看懂哪些内容？', [
  '步骤顺序', '各步骤的输入和输出', '关键条件或分支', '暂无额外要求',
], '可补充关键步骤、输入输出和分支条件。');
const conceptStyle = question('style', '你希望这张示意图采用哪种表达方式？', [
  '简洁期刊风格', '技术架构或流程风格', '图形摘要或插图风格', '由 GPT 根据需求选择',
], '可补充版式、配色、语言或必须原样保留的标签。');
const uncertainty = question('uncertainty', '样本量、误差或缺失值应该怎样交代？', [
  '注明样本量与独立观测单位', '说明误差线或区间的含义', '保留缺失值，图注说明原因', '目前只展示已有的数值',
], '可补充样本量、区间类型或缺失原因。请提供图中需要展示的区间数值。');

const possible = [purpose, source, audience, emphasis, uncertainty, conceptStyle];
const kindForPurpose = ['line', 'bar', 'scatter', 'heatmap', 'diagram', 'diagram'];
export const figureBriefNoteLimit = 600;

export function figureBriefKind(answers) {
  const selected = answers?.purpose?.selected;
  return Array.isArray(selected) ? kindForPurpose[selected[0]] : undefined;
}

export function normalizeFigureBrief(input) {
  const answers = {};
  for (const item of possible) {
    const answer = input?.[item.id];
    if (!answer) continue;
    if (answer.skipped === true) {
      answers[item.id] = { selected: [], note: '', skipped: true };
      continue;
    }
    const options = item.id === 'emphasis' && figureBriefKind(answers) === 'diagram' ? steps.options : item.options;
    const selected = Array.isArray(answer.selected) ? [...new Set(answer.selected.filter(index =>
      Number.isInteger(index) && index >= 0 && index < options.length))].slice(0, options.length) : [];
    const note = typeof answer.note === 'string' ? answer.note.trim().slice(0, figureBriefNoteLimit) : '';
    if (selected.length || note) answers[item.id] = { selected, note };
  }
  return answers;
}

export function figureBriefQuestions(answers) {
  const diagram = figureBriefKind(answers) === 'diagram';
  return [purpose, source, audience, diagram ? steps : emphasis,
    ...(!diagram && answers?.emphasis?.selected.includes(2) ? [uncertainty] : []),
    ...(answers?.purpose?.selected?.[0] === 5 ? [conceptStyle] : [])];
}

export function figureBriefComplete(answers) {
  return figureBriefQuestions(answers).every(({ id }) => Boolean(answers?.[id]));
}

export function figureBriefRecord(input, { includeSkipped = false } = {}) {
  const answers = normalizeFigureBrief(input);
  return figureBriefQuestions(answers).flatMap(item => {
    const answer = answers[item.id];
    if (!answer || (answer.skipped && !includeSkipped)) return [];
    return [{ question: item.question, selections: answer.selected.map(index => item.options[index]), note: answer.note,
      ...(answer.skipped ? { skipped: true } : {}) }];
  });
}
