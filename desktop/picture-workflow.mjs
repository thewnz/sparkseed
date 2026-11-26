export const pictureTypes = {
  data: { label: '数据图', description: '用表格数据画折线、柱状、散点或热图。适合比较数值、趋势和相关性。' },
  flow: { label: '流程图', description: '先确认步骤和连线，逐块审核素材，再拼接整图。' },
  concept: { label: '概念示意', description: '说明机制、结构或实体关系，可用矢量图或 PNG 表达，适合论文方法图和图形摘要。' },
  illustration: { label: '自由配图', description: '从文字描述构图，适合汇报配图和情境插画。图片服务可生成位图。' },
};

export function pictureTypeOf(draft) {
  if (Object.hasOwn(pictureTypes, draft?.pictureType)) return draft.pictureType;
  if (draft?.type === 'image') return 'illustration';
  if (draft?.figureMode === 'concept' || (!draft?.figureMode && draft?.figureBrief?.purpose?.selected?.[0] === 5 && draft?.concept)) return 'concept';
  return draft?.figure?.kind === 'diagram' ? 'flow' : 'data';
}

export function pictureWorkflowOf(value) {
  return value === 'hybrid' || value === 'agent' ? value : undefined;
}
