import { useEffect, useMemo, useState } from 'react';
import { flowStyleQuestions } from '../desktop/flow-style-brief.mjs';
import { flowReviewRules } from '../desktop/flow-review-rules.mjs';
import { journalLayoutArchetypes, journalLayoutEvidence, layoutArchetypeBrief } from '../desktop/flow-layout-archetypes.mjs';

import { createAssemblyReplay } from './assembly-replay.mjs';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const kindLabel = { paper: '论文截取', agent: 'Agent 绘制' };

function Source({ item, report }) {
  if (!item) return null;
  const title = item.paper || item.title || item.sourceId;
  const open = item.url ? () => api.openSourceLink(item.url) : item.paperId ? () => api.openPaper(item.paperId) : null;
  return <span className="flow-assembly-source">{open
    ? <button type="button" className="quiet" onClick={() => void open().catch(error => report(errorText(error)))}>{title}</button>
    : title}{(item.label || item.location) && <span>{item.label || item.location}</span>}</span>;
}

function Asset({ asset, label, report }) {
  return <div className="flow-assembly-asset">
    <img src={asset.data} alt={label + ' · ' + kindLabel[asset.kind]} />
    {asset.summary && <p>{asset.summary}</p>}
    {asset.source && <Source item={asset.source} report={report} />}
    {asset.citation && <details>
      <summary>查看已核验的论文原文</summary>
      <Source item={asset.citation} report={report} />
      <blockquote>{asset.citation.quote}</blockquote>
    </details>}
  </div>;
}

function AssemblyPreview({ image, blocks }) {
  const [visible, setVisible] = useState(blocks.length);
  const [frame, setFrame] = useState(null);
  const [playing, setPlaying] = useState(false);
  const replay = useMemo(() => createAssemblyReplay(image), [image]);
  const maxFrames = replay?.length ?? 0;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setFrame(value => Math.min(maxFrames, value + 1)), 300);
    return () => clearInterval(timer);
  }, [playing, maxFrames]);
  useEffect(() => {
    if (frame !== null && frame >= maxFrames) {
      setPlaying(false);
      setFrame(null);
    }
  }, [frame, maxFrames]);
  function startReplay() {
    setVisible(blocks.length);
    setFrame(0);
    setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  const complete = visible === blocks.length;
  const preview = complete ? image : (() => {
    const prefix = 'data:image/svg+xml;base64,';
    const hidden = blocks.slice(visible).map((_, index) => '#assembly-stage-' + (visible + index));
    const style = '<style>' + [...hidden, '#assembly-links'].join(',') + '{display:none}</style>';
    return prefix + btoa(atob(image.slice(prefix.length)).replace(/<\/svg>$/, style + '</svg>'));
  })();
  return <>
    <div className="flow-assembly-graphic"><img src={frame === null ? preview : replay.render(frame)} alt={frame !== null ? '多光标绘制回放' : complete ? '完整流程图' : '逐块拼装预览'} /></div>
    <div className="flow-assembly-actions">
      {frame !== null ? <>
        <button type="button" className="quiet" onClick={() => setPlaying(!playing)}>{playing ? '暂停' : '继续'}</button>
        <button type="button" className="quiet" disabled={playing} onClick={() => setFrame(frame + 1)}>下一帧</button>
        <button type="button" className="quiet" onClick={() => { setPlaying(false); setFrame(null); }}>显示完整图</button>
      </> : <>{replay && <button type="button" className="quiet" onClick={startReplay}>多光标回放</button>}
      {complete
        ? <button type="button" className="quiet" onClick={() => setVisible(1)}>从第一块查看</button>
        : <><button type="button" className="quiet" disabled={visible === 1} onClick={() => setVisible(visible - 1)}>上一步</button>
          <button type="button" className="quiet" onClick={() => setVisible(visible + 1)}>下一步</button>
          <button type="button" className="quiet" onClick={() => setVisible(blocks.length)}>显示完整图</button></>}</>}
      <span role="status" className="muted">{frame === null ? visible + ' / ' + blocks.length + ' 块' + (complete ? '' : ' · ' + blocks[visible - 1]?.label) : '回放 ' + (frame + 1) + ' / ' + maxFrames}</span>
    </div>
  </>;
}

export function FlowAssembly({ projectId, draft, material, edit, locked, model, openSettings, cancel, act, onPreview }) {
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [working, setWorking] = useState('');
  const [activity, setActivity] = useState([]);
  const [problem, setProblem] = useState('');
  const editor = flow && draft.flowEditor?.flowId === flow.id ? draft.flowEditor : {};
  const selected = editor.selected ?? null;
  const layoutFeedback = editor.layoutFeedback || '';
  const composition = editor.composition || '';
  const layoutArchetype = editor.layoutArchetype || '';
  const [compareView, setCompareView] = useState('module');
  const [replace, setReplace] = useState(false);
  const candidate = flow?.candidate;
  const completed = (flow?.materials || []).filter(Boolean).length;
  const next = flow?.materials.indexOf(null) ?? -1;
  const index = candidate?.index ?? selected ?? (next < 0 ? 0 : next);
  const block = flow?.blocks[index];
  const approved = flow?.materials[index];
  const disabled = locked || Boolean(working) || loading;
  const stage = !flow?.confirmed ? 1 : next !== -1 || candidate || selected !== null ? 2 : 3;
  const [viewStage, setViewStage] = useState(null);
  const activeStage = viewStage && (viewStage === 1 || (viewStage === 2 && flow?.confirmed) || (viewStage === 3 && flow?.confirmed && next === -1))
    ? viewStage : stage;
  useEffect(() => { setViewStage(null); }, [stage]);
  const blockInput = editor.blocks?.[index] || {};
  const kind = blockInput.kind || candidate?.kind || approved?.kind || 'agent';
  const query = blockInput.query || '';
  const materialFeedback = blockInput.feedback || '';
  const canRevise = Boolean(materialFeedback.trim() || query.trim());

  function updateEditor(change) {
    edit({ flowEditor: { ...editor, flowId: flow?.id || '', ...change } });
  }
  function updateBlock(change) {
    updateEditor({ blocks: { ...editor.blocks, [index]: { ...blockInput, ...change } } });
  }

  useEffect(() => {
    setActivity([]);
    return api.onFlowProgress?.(event => {
      if (event.projectId !== projectId) return;
      setActivity(previous => [...previous, event].slice(-16));
    });
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setProblem('');
    void api.flowAssembly(projectId, { operation: 'read' }).then(result => {
      if (active) {
        setFlow(result.flow);
      }
    }, error => {
      if (active) setProblem(errorText(error));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, loadAttempt]);

  useEffect(() => {
    const preview = candidate ? { id: candidate.id, image: candidate.data, title: '待审核素材预览' }
      : flow?.layout ? { ...flow.layout, title: '整图布局预览' }
      : flow && { id: flow.id, image: flow.frameworkImage, title: '空框架预览' };
    onPreview(preview ? { id: preview.id, projectId, type: 'image', title: preview.title,
      data: preview.image, figure: { specification: { kind: 'diagram' } } } : null);
  }, [flow, candidate, onPreview, projectId]);

  async function perform(operation, fields) {
    setWorking(operation);
    if (['framework', 'material', 'layout', 'save'].includes(operation)) setActivity([]);
    setProblem('');
    try {
      const result = await act({ operation, flowId: flow?.id, ...fields });
      if (!result) {
        setActivity(previous => [...previous, { label: '已停止本次操作' }]);
        return;
      }
      setFlow(result.flow);
      if (operation === 'framework') {
        edit({ flowEditor: { flowId: result.flow.id, selected: null, blocks: {} } });
        setReplace(false);
      } else if (['approve', 'material', 'discard'].includes(operation)) {
        const blocks = { ...editor.blocks };
        delete blocks[index];
        updateEditor({ blocks, ...(operation === 'approve' ? { selected: null } : {}) });
      } else if (operation === 'layout') updateEditor({ layoutFeedback: '' });
    } catch (error) { setProblem(errorText(error)); }
    finally { setWorking(''); }
  }

  function selectBlock(position) {
    updateEditor({ selected: position });
    setCompareView('module');
  }

  const hasInputs = Boolean(draft.flowPrompt?.trim() || material?.data?.trim());
  const needsRebuild = Boolean(flow && !flow.confirmed && flow.origin &&
    ((draft.flowPrompt || '').trim().slice(0, 3000) !== (flow.origin.description || '') ||
      (material?.data || '').trim().slice(0, 3000) !== (flow.origin.steps || '')));
  const stepSource = flow?.origin?.description || flow?.origin?.steps;
  const flowStyle = draft.flowStyle || {};
  const styleDone = Boolean(draft.flowStyleConfirmed) || flowStyleQuestions.every(({ id }) => Number.isInteger(flowStyle[id]));
  const progress = stage === 1 ? (flow?.confirmed ? 28 : flow ? 14 : 0)
    : stage === 2 ? 28 + Math.round((completed / Math.max(1, flow.blocks.length)) * 44)
      : flow?.layout?.saved ? 100 : flow?.layout ? 96 : 72;
  return <div className="flow-assembly" data-stage={activeStage}>
    <div className="flow-assembly-steps segmented-pills" role="tablist" aria-label="绘制步骤">
      {[
        [1, '1. 框架与风格', true],
        [2, '2. 逐块素材', Boolean(flow?.confirmed)],
        [3, '3. 整图排版', Boolean(flow?.confirmed && next === -1)],
      ].map(([num, label, unlocked]) =>
        <button key={num} type="button" role="tab" className="quiet"
          aria-selected={activeStage === num}
          disabled={!unlocked}
          onClick={() => setViewStage(num)}>
          {stage > num ? '✓ ' : ''}{label}
        </button>)}
    </div>
    <p className="flow-assembly-current" role="status">{activeStage === 1 ? '先描述研究流程并确认阶段与连线，再进入素材审核。' :
      activeStage === 2 ? `正在审核第 ${index + 1} / ${flow.blocks.length} 块；通过后自动跳到下一块。` : flow.layout?.saved ? '整图已验收。可从右侧预览导出，或重新排版生成新版本。' : '素材已齐全。确认整图预览后，点击验收并保存。'}</p>
    <div className="flow-assembly-progress" aria-label="绘图进度"><span style={{ width: `${progress}%` }} /></div>
    {activeStage === 1 && <>
    <div className="flow-style-presets" role="group" aria-label="期刊风格预设">
      <span className="muted">快捷风格：</span>
      {[
        ['顶刊白底细线', { composition: 0, palette: 0, labels: 0, density: 0 }],
        ['双栏紧凑', { composition: 1, palette: 0, labels: 1, density: 1 }],
        ['汇报高对比', { composition: 0, palette: 1, labels: 0, density: 0 }],
      ].map(([label, preset]) => <button key={label} type="button" className="filter-pill" disabled={disabled}
        onClick={() => edit({ flowStyle: preset, flowStyleConfirmed: true })}>{label}</button>)}
    </div>
    <details className="flow-assembly-style">
      <summary>自定义期刊样式（选填）<span>默认白底、细线、低饱和阶段色</span></summary>
      {styleDone ? <div className="flow-assembly-style-summary">
        <p>{flowStyleQuestions.map(({ id, options }) => Number.isInteger(flowStyle[id]) ? options[flowStyle[id]] : '默认').join(' · ')}</p>
        <button type="button" className="quiet" onClick={() => edit({ flowStyle: {}, flowStyleConfirmed: false })}>修改风格</button>
      </div> : <div className="flow-assembly-style-questions">{flowStyleQuestions.map(({ id, question: text, options, help }) =>
        <fieldset key={id} className="flow-assembly-style-question">
          <legend>{text}</legend>
          <div className="flow-assembly-style-options">{options.map((option, index) =>
            <button key={option} type="button" className={flowStyle[id] === index ? 'chip active' : 'chip'} disabled={disabled}
              onClick={() => edit({ flowStyle: { ...flowStyle, [id]: index } })}>{option}</button>)}
            <button type="button" className="chip muted" disabled={disabled}
              onClick={() => { const next = { ...flowStyle }; delete next[id]; edit({ flowStyle: next }); }}>跳过</button>
          </div>
          {help && <p className="muted">{help}</p>}
        </fieldset>)}
        <div className="flow-assembly-actions">
          <button type="button" className="primary" onClick={() => edit({ flowStyleConfirmed: true })}>使用当前选择</button>
          <button type="button" className="quiet" onClick={() => edit({ flowStyle: {}, flowStyleConfirmed: true })}>全部使用默认</button>
        </div>
        <p className="muted">未回答或跳过的问题使用默认期刊风格；答案会参与每块绘制、配色和整图排版。</p>
      </div>}
    </details>
    {loading && <p role="status" className="muted">正在读取流程图草稿…</p>}
    {(working || activity.length > 0) && <div className="flow-assembly-activity">
      <div className="flow-assembly-actions" role="status">
        <span>{working ? activity.at(-1)?.label || '正在处理…' : problem ? '本次操作未完成' : activity.at(-1)?.label}</span>
        {['framework', 'material', 'layout', 'save'].includes(working) && <button type="button" className="quiet" onClick={cancel}>停止</button>}
      </div>
      {activity.length > 0 && <details open={working ? true : undefined}>
        <summary>查看处理过程</summary>
        <ol>{activity.map(({ label, detail }, i) => <li key={i}>{label}{detail && <span> · {detail}</span>}</li>)}</ol>
      </details>}
    </div>}
    {!model && stage !== 3 && <div className="flow-assembly-actions"><span className="muted">连接绘图 Agent 后可分析流程和排版。</span>
      <button type="button" className="quiet" onClick={openSettings}>生成设置</button></div>}
    <details className="flow-framework-details" data-confirmed={Boolean(flow?.confirmed)} open={!flow?.confirmed || replace ? true : undefined}>
    <summary>{flow?.confirmed ? `已确认框架 · ${flow.blocks.length} 个模块 · 查看或重建` : '研究流程与框架'}</summary>
    <section className="flow-assembly-section" aria-label="流程框架" aria-busy={working === 'framework'}>
      <div className="flow-assembly-heading"><h4>第 1 步 · 流程框架</h4>{flow?.confirmed && <span className="muted">已确认 · {flow.blocks.length} 块</span>}</div>
      {(!flow?.confirmed || replace) && <fieldset disabled={disabled} className="flow-assembly-fields">
        <label>流程描述<textarea value={draft.flowPrompt || ''} rows={4} maxLength={3000}
          placeholder="写出起点、各阶段及先后关系，注明需要保留的分支或反馈。"
          onChange={event => edit({ flowPrompt: event.target.value })} /></label>
        {material?.data && <label>已录入的步骤<textarea rows={3} maxLength={3000} value={material.data}
          onChange={event => edit({ data: event.target.value })} /></label>}
        <div className="flow-assembly-actions">
          <button type="button" className="primary" disabled={!hasInputs || !model}
            onClick={() => void perform('framework', { replace, description: draft.flowPrompt, steps: material?.data })}>{replace ? '根据新描述重建' : flow ? '重新分析框架' : '生成流程框架'}</button>
          {replace && <button type="button" className="quiet" onClick={() => setReplace(false)}>取消重建</button>}
        </div>
        {replace && <p className="muted">重建成功后，新框架会重新开始逐块审核。已保存的作品版本仍可查看。</p>}
      </fieldset>}
      {flow && <details open={!flow.confirmed ? true : undefined}>
        <summary>查看框架和阶段连线</summary>
        {flow.confirmed && <p className="flow-assembly-origin">{stepSource}</p>}
        <div className="flow-assembly-graphic"><img src={flow.frameworkImage} alt="空框架，显示阶段名称和箭头" /></div>
        <ol className="flow-assembly-outline">{(flow.edges || []).map(({ from, to, label }) =>
          <li key={from + ':' + to}>{flow.blocks?.[from]?.label} → {flow.blocks?.[to]?.label}{label ? ' · ' + label : ''}</li>)}</ol>
      </details>}
      {flow && !replace && <div className="flow-assembly-actions">
        {flow.confirmed
          ? <button type="button" className="quiet" disabled={disabled} onClick={() => setReplace(true)}>更新流程并重建框架</button>
          : needsRebuild ? <p className="muted">流程描述或步骤已修改，请先重新分析框架。</p>
          : <button type="button" className="primary" disabled={disabled} onClick={() => void perform('confirm')}>确认框架，开始逐块审核</button>}
      </div>}
    </section>
    </details>
    <details className="flow-assembly-section flow-advanced">
      <summary>绘图要求与硬性约束</summary>
      <fieldset className="flow-assembly-fields" disabled={disabled}>
        <label>绘图要求<textarea value={draft.flowRequirements || ''} rows={2} maxLength={3000}
          placeholder="例如：英文标注，突出模型结构。" onChange={event => edit({ flowRequirements: event.target.value })} /></label>
        <label>硬性约束<textarea value={draft.flowConstraints || ''} rows={2} maxLength={3000}
          placeholder="例如：保留反馈连线和指定公式。" onChange={event => edit({ flowConstraints: event.target.value })} /></label>
        <div className="flow-assembly-review-rules">
          <span className="muted">评审规范（可选勾选，勾选后作为硬约束参与每块绘制与整图排版）：</span>
          <div className="flow-assembly-style-options">{flowReviewRules.map(({ id, label }) =>
            <button key={id} type="button"
              className={(draft.flowReviewRules || []).includes(id) ? 'chip active' : 'chip'} disabled={disabled}
              onClick={() => {
                const active = draft.flowReviewRules || [];
                edit({ flowReviewRules: active.includes(id) ? active.filter(item => item !== id) : [...active, id] });
              }}>{label}</button>)}
          </div>
        </div>
      </fieldset>
    </details>
    </>}
    {activeStage === 2 && flow?.confirmed && block && <section className="flow-assembly-section" aria-label="逐块审核素材" aria-busy={working === 'material'}>
      <div className="flow-assembly-heading"><h4>第 2 步 · 逐块素材</h4><span className="muted">{completed}/{flow.blocks.length} 已通过</span></div>
      <div className="flow-compare-switch" role="group" aria-label="审核视图">
        <button type="button" className="quiet" aria-pressed={compareView === 'framework'} onClick={() => setCompareView('framework')}>整图参考</button>
        <button type="button" className="quiet" aria-pressed={compareView === 'module'} onClick={() => setCompareView('module')}>当前模块</button>
      </div>
      <div className="flow-compare" data-view={compareView}>
        <div className="flow-compare-pane" data-pane="framework">
          <header><strong>{flow.layout ? '上次整图布局' : '框架参考'}</strong><span className="muted">{completed}/{flow.blocks.length} 块已通过</span></header>
          <div className="flow-compare-image" tabIndex={0}><img src={flow.layout?.image || flow.frameworkImage} alt={flow.layout ? '上次生成的整图布局' : '已确认框架参考'} /></div>
          <p className="muted">参考图不会随模块自动更新；素材全部通过后再生成整图布局。</p>
        </div>
        <div className="flow-compare-pane" data-pane="module">
          <header><strong>{candidate ? '待审核图稿' : approved ? '已通过素材' : '当前模块'}</strong><span className="muted">{block.label}</span></header>
          {candidate ? <Asset asset={candidate} label={block.label} report={setProblem} /> :
            approved ? <Asset asset={approved} label={block.label} report={setProblem} /> :
            <p className="muted">尚未生成本块。选择素材来源后点击“生成本块”。</p>}
          {candidate && approved && <details><summary>对照已通过的版本</summary><Asset asset={approved} label={block.label} report={setProblem} /></details>}
          {candidate && <p className="muted">待审核 · 第 {candidate.attempt || 1} 稿{candidate.revision ? '：' + candidate.revision : ''}</p>}
          <fieldset disabled={disabled} className="flow-assembly-fields">
            {!candidate && <label>素材来源<select value={kind} onChange={event => updateBlock({ kind: event.target.value })}>
              <option value="agent">Agent 绘制</option><option value="paper">从论文截取</option></select></label>}
            <details>
              <summary>调整论文检索词</summary>
              <label>论文检索词<input value={query} maxLength={160}
                placeholder={candidate?.query || approved?.query || block.query} onChange={event => updateBlock({ query: event.target.value })} /></label>
            </details>
            <label>{candidate || approved ? '本块修改要求' : '本块素材要求（选填）'}<textarea rows={2} maxLength={1500}
              placeholder="例如：只截取中间的网络结构，保留输入和输出标签。"
              value={materialFeedback} onChange={event => updateBlock({ feedback: event.target.value })} /></label>
            {candidate && <p className="flow-review-hint">{canRevise ? '已填写修改要求：先提交修改，或清空要求后通过当前稿。' : '请先核对当前稿；通过或放弃后，才能切换其他模块。'}</p>}
          </fieldset>
        </div>
      </div>
      <div className="flow-block-wall" role="group" aria-label="模块缩略图">
        {flow.blocks.map(({ label }, i) => {
          const asset = flow.materials[i];
          const thumb = (candidate?.index === i ? candidate : asset)?.data;
          return <button key={i} type="button" className="flow-block-thumb" aria-pressed={index === i}
            disabled={disabled || (candidate && candidate.index !== i) || (next !== -1 && i > next)}
            onClick={() => selectBlock(i)}>
            <span className="flow-block-thumb-frame">{thumb
              ? <img src={thumb} alt={label + ' 缩略图'} />
              : <span className="muted">{i === next ? '待生成' : '待前序通过'}</span>}</span>
            <strong><span className="flow-block-number">{i + 1}</span>{label.replace(/^\d+[.、．]\s*/, '')}</strong>
            <small>{candidate?.index === i ? '待审核' : asset ? '已通过' : i === next ? '待生成' : '待前序通过'}</small>
          </button>;
        })}
      </div>
      {next === -1 && !candidate && <button type="button" className="quiet" disabled={disabled}
        onClick={() => updateEditor({ selected: null })}>返回整图排版</button>}
      <fieldset disabled={disabled} className="flow-assembly-fields">
        <div className="flow-assembly-actions flow-actionbar">
          <span className="flow-action-context">{candidate ? `第 ${index + 1} 块待审核` : `第 ${index + 1} 块 · ${approved ? '修改已通过素材' : '准备生成'}`}</span>
          {candidate && <button type="button" className={canRevise ? 'quiet' : 'primary'} disabled={canRevise}
            onClick={() => void perform('approve', { index, candidateId: candidate.id })}>
            {next === -1 || (!approved && completed + 1 === flow.blocks.length) ? '通过，进入整图排版' : '通过，进入下一块'}</button>}
          <button type="button" className={!candidate || canRevise ? 'primary' : 'quiet'} disabled={!model || (candidate && !canRevise)}
            onClick={() => void perform('material', { index, kind: candidate?.kind || kind, query, revision: materialFeedback })}>
            {candidate || approved ? '提交修改并重新生成' : '生成本块'}</button>
          {candidate && <button type="button" className="quiet" onClick={() => void perform('discard')}>放弃本稿</button>}
        </div>
      </fieldset>
    </section>}
    {activeStage === 3 && <section className="flow-assembly-section" aria-label="整图布局" aria-busy={working === 'layout' || working === 'save'}>
      <div className="flow-assembly-heading"><h4>第 3 步 · 整图布局</h4><span className="muted">{flow.layout?.saved ? '已验收并保存' : flow.layout ? '待整图验收' : flow.blocks.length + ' 块已审核'}</span></div>
      <div className="flow-block-wall" role="group" aria-label="已审核模块">
        {flow.blocks.map(({ label }, i) => {
          const asset = flow.materials[i];
          return <button key={i} type="button" className="flow-block-thumb" disabled={disabled} onClick={() => selectBlock(i)}>
            <span className="flow-block-thumb-frame">{asset?.data
              ? <img src={asset.data} alt={label + ' 缩略图'} />
              : <span className="muted">待生成</span>}</span>
            <strong><span className="flow-block-number">{i + 1}</span>{label.replace(/^\d+[.、．]\s*/, '')}</strong>
            <small>{asset ? '已审核 · 点按重做' : '待生成'}</small>
          </button>;
        })}
      </div>
      {flow.layout && <>
        <AssemblyPreview key={flow.layout.id} image={flow.layout.image} blocks={flow.blocks} />
        <p>{flow.layout.rationale}</p>
        <Source item={flow.layout.reference} report={setProblem} />
      </>}
      <fieldset disabled={disabled} className="flow-assembly-fields">
        <div className="flow-layout-options">
        <p className="muted">生成布局预览时，Agent 会结合已审核素材、连线和可用参考图规划整图。</p>
        <label>{flow.layout ? '布局修改要求' : '布局要求（选填）'}<textarea rows={2} maxLength={1500}
          placeholder="例如：改为纵向阅读，拉开阶段间距，放大模型块。"
          value={layoutFeedback} onChange={event => updateEditor({ layoutFeedback: event.target.value })} /></label>
        <div className="flow-assembly-layout-options">
        <label>构图<select value={composition} onChange={event => {
          updateEditor({ composition: event.target.value, ...(event.target.value === 'stacked' ? { layoutArchetype: '' } : {}) });
        }}>
          <option value="">由 Agent 决定</option>
          <option value="stacked">顺序拼接</option>
          <option value="overviewDetail">总览＋详图（期刊风格）</option>
        </select></label>
        <label>版式<select value={layoutArchetype} onChange={event => {
          updateEditor({ layoutArchetype: event.target.value, ...(event.target.value ? { composition: 'overviewDetail' } : {}) });
        }}>
          <option value="">自动（按阶段数推荐）</option>
          {Object.values(journalLayoutArchetypes).map(item =>
            <option key={item.id} value={item.id}>{item.label} · 基准 {Math.round((journalLayoutEvidence.archetypes[item.id]?.share || 0) * 100)}%</option>)}
        </select></label>
        </div>
        {flow.layout?.archetype && <p className="flow-assembly-archetype-tag">
          当前版式：{journalLayoutArchetypes[flow.layout.archetype]?.label || flow.layout.archetype}
        </p>}
        <p className="muted flow-assembly-archetype-hint">{layoutArchetypeBrief(flow.blocks.length, layoutArchetype || flow.layout?.archetype)}</p>
        </div>
        {!model && <div className="flow-assembly-actions">
          <span className="muted">重新排版和整图验收需要连接绘图模型。</span>
          <button type="button" className="quiet" onClick={openSettings}>连接模型</button>
        </div>}
        {layoutFeedback.trim() && <div className="flow-assembly-actions">
          <span className="muted">文字修改要求由 Agent 处理。本地排版需要先清除这项要求。</span>
          <button type="button" className="quiet" onClick={() => updateEditor({ layoutFeedback: '' })}>清除布局修改要求</button>
        </div>}
        <div className="flow-assembly-actions flow-actionbar">
          <span className="flow-action-context">{flow.layout?.saved ? '此布局已保存为作品版本' : flow.layout ? '布局草稿 · 尚未保存作品' : '素材齐全 · 准备排版'}</span>
          <button type="button" className={flow.layout ? 'quiet' : 'primary'} disabled={!model}
            onClick={() => void perform('layout', { revision: layoutFeedback,
              composition: composition === 'stacked' ? 'stacked' : (layoutArchetype ? 'overviewDetail' : composition || undefined),
              archetype: composition === 'stacked' ? undefined : (layoutArchetype || undefined) })}>
            {working === 'layout' ? '正在排版…' : flow.layout ? '按要求重新排版' : '生成布局预览'}</button>
          <button type="button" className="quiet" disabled={Boolean(layoutFeedback.trim())}
            title="仅按所选版式拼接，不使用模型规划。"
            onClick={() => void perform('layout', { method: 'local', composition, archetype: layoutArchetype })}>本地排版</button>
          {flow.layout && !flow.layout.saved && <button type="button" className="primary" disabled={!model} onClick={() => void perform('save', { layoutId: flow.layout.id })}>{working === 'save' ? '正在验收…' : '验收并保存'}</button>}
        </div>
      </fieldset>
    </section>}
    {problem && <div className="flow-assembly-actions" role="alert"><p className="error">{problem}</p>
      <button type="button" className="quiet" disabled={disabled} onClick={() => setLoadAttempt(value => value + 1)}>刷新草稿</button>
    </div>}
  </div>;
}

