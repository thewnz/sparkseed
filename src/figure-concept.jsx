import { Icon } from './icons.jsx';
import { overviewDetailExample, overviewDetailLayout } from '../desktop/figure-workflow.mjs';

const conceptTemplates = [
  {
    label: '方法总览 + 详图',
    layout: overviewDetailLayout,
    text: overviewDetailExample,
  },
  {
    label: '双路线对比',
    layout: '',
    text: '左右对比两种方法路线：左侧展示传统基线流程（输入 -> 单尺度特征 -> 线性分类）；右侧展示本文方法（输入 -> 多尺度对齐 -> 自适应门控融合 -> 输出），中间用虚线标出核心差异点。',
  },
  {
    label: '系统数据流',
    layout: '',
    text: '从左到右呈现三阶段处理管线：1）多源原始数据输入与清洗；2）核心表征编码与约束校验；3）结果输出与反馈回流闭环。标明各阶段张量/数据流向。',
  },
];

export function FigureConcept({ draft, change, generate, openSettings, enabled, active, locked, cancel, useSteps,
  engine, providerLabel, layout, setLayout }) {
  const overview = layout === overviewDetailLayout;
  return <form className="figure-concept" onSubmit={event => {
    event.preventDefault();
    if (enabled && !locked && draft.trim()) generate();
  }}>
    <div className="concept-header-row">
      <label><span>版式</span><select value={layout || ''} onChange={event => setLayout(event.target.value)} disabled={locked}>
        <option value="">由模型安排</option>
        <option value={overviewDetailLayout}>总览＋分阶段详图</option>
      </select></label>
      <div className="concept-scaffolds" role="group" aria-label="构图模板">
        {conceptTemplates.map(tpl => <button key={tpl.label} type="button" className="filter-pill" disabled={locked}
          onClick={() => { if (tpl.layout) setLayout(tpl.layout); change(tpl.text); }}>
          {tpl.label}
        </button>)}
      </div>
    </div>
    <p className="muted">生成时，描述和绘图需求会发送给{providerLabel || '所选绘图模型'}，可能产生 API 费用。</p>
    <label><span>画面内容与关系</span><textarea value={draft} onChange={event => change(event.target.value)} disabled={locked}
      rows={5} maxLength={3000} placeholder={overview ? '先写横向总流程，再说明各阶段要展开的分支、模块和数据形状。' :
        '写明要出现的元素、确切术语、连接方向和你最想突出的关系。不要粘贴实验数据。'} /></label>
    {overview && <p className="muted">上方展示总流程，下方将关键阶段展开，并用对应的颜色和连线标明归属。</p>}
    <div className="inline-actions">
      {enabled ? <button className="primary icon-label" disabled={locked || !draft.trim()}><Icon name="layers" />
        {active ? '正在生成…' : '生成示意图'}</button> :
        <button className="quiet" type="button" onClick={openSettings}>{engine === 'gpt' ? '配置图片或绘图服务' : '选择绘图 Agent'}</button>}
      {active && <button type="button" className="quiet" onClick={cancel}>停止</button>}
      {useSteps && !draft.trim() && <button type="button" className="quiet" disabled={locked} onClick={useSteps}>用已有流程步骤起草</button>}
    </div>
  </form>;
}
