export const workRuleLabels = {
  'paper-plain': '新论文白话摘要',
  'paper-quiz': '新论文自测题',
  'initial-research': '新 Idea 文献初查',
  'synthesis': '讨论整理与关联',
  'deep-research': '确认问题后的文献深查',
};

export const workRuleLabel = id => workRuleLabels[id] || id;

export function mandateLabel(mandate) {
  if (!mandate) return '本地记录';
  if (mandate.strength === 'explicit') return '你发起';
  const first = Array.isArray(mandate.rules) ? mandate.rules[0] : '';
  return first ? '规则 · ' + workRuleLabel(first) : '自动规则';
}

export function policyNoticeText(notice) {
  if (!notice) return '';
  const rules = Array.isArray(notice.rules) ? notice.rules.filter(rule => rule.enabled === false).map(rule => workRuleLabel(rule.id)) : [];
  if (rules.length) return '规则已变化：' + rules.join('、') + '。进行中的工作仍会按原授权完成。';
  if (notice.proactive) return '自动执行已关闭。进行中的工作仍会按原授权完成。';
  return '策略已更新，进行中的工作仍会按原授权完成。';
}
