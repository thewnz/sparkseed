import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createStudioDrafts } from './studio-drafts.mjs';
import { Icon } from './icons.jsx';
import { ideaDates, ideaTitle } from './idea-text.mjs';
import { FigureEditor, FigureReview, figureExample } from './scientific-figure.jsx';
import { BriefSummary, FigureIntake } from './figure-intake.jsx';
import { FigureConcept } from './figure-concept.jsx';
import { FlowAssembly } from './flow-assembly.jsx';
import { figureBriefComplete, figureBriefKind, figureBriefQuestions, figureBriefRecord } from '../desktop/figure-brief.mjs';
import { FIGURE_TEXT_LIMITS, normalizeFigureDraft } from '../desktop/scientific-figure.mjs';
import { builtInFigureSkills, overviewDetailLayout } from '../desktop/figure-workflow.mjs';
import { pictureTypes, pictureTypeOf, pictureWorkflowOf } from '../desktop/picture-workflow.mjs';
import { flowReferencePreviewData, getFlowReferenceProfile } from '../desktop/flow-reference-gallery.mjs';
import './studio.css';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const typeLabel = { figure: '科研绘图', slides: '演示文稿' };
const versionLabel = { ...typeLabel, image: '配图', figure: '科研图', concept: 'PNG 示意图' };
const modeIcon = { figure: 'stars', slides: 'document', image: 'media' };
const storedProject = 'sparkseed.studio.project';
const draftStore = createStudioDrafts((id, draft) => api.saveStudioDraft(id, draft));
const creationTypes = { data: '数据图', flow: '流程图', concept: '概念示意', illustration: '自由配图', slides: '演示文稿' };
const creationIcons = { data: 'chart', flow: 'flow', concept: 'stars', illustration: 'media', slides: 'document' };
const creationFormats = { data: 'SVG · PDF · CSV', flow: '分块核验 · D2 · SVG', concept: 'SVG · PNG', illustration: '高清插图', slides: 'PPTX 演示稿' };

window.addEventListener('beforeunload', event => {
  if (Object.values(draftStore.getSnapshot()).some(item => item.status !== 'saved')) {
    event.preventDefault();
    event.returnValue = '';
  }
});

function SlideContent({ slide, cover }) {
  return <article className="studio-slide" data-cover={Boolean(cover)}>
    <h2>{slide.title}</h2>
    <ul>{slide.points.map((point, index) => <li key={index}>{point}</li>)}</ul>
    {cover && <img src={cover} alt="" />}
  </article>;
}

export function ArtifactPreview({ artifact, filmstrip = false, allowZoom = false }) {
  const [index, setIndex] = useState(0);
  const [actualSize, setActualSize] = useState(false);
  if (allowZoom && artifact.figure?.specification?.kind === 'diagram') return <div className="studio-flow-inspector">
    <div className="studio-flow-toolbar">
      <button type="button" className="quiet icon-label" aria-pressed={actualSize} onClick={() => setActualSize(!actualSize)}>
        <Icon name={actualSize ? 'minimize' : 'maximize'} />
        {actualSize ? '适应画布窗口' : '100% 原始尺寸'}
      </button>
    </div>
    <div className="studio-flow-scroll" data-actual-size={actualSize} tabIndex={0} aria-label="流程图预览">
      <img src={artifact.data} alt={artifact.title} />
    </div>
  </div>;
  if (artifact.type === 'image') return <img className="studio-image" src={artifact.data} alt={artifact.title} />;
  const slide = artifact.slides[Math.min(index, artifact.slides.length - 1)];
  const multiple = artifact.slides.length > 1;
  return <div className="studio-deck" data-pages={multiple ? 'multiple' : 'single'} data-filmstrip={filmstrip && multiple}>
    <SlideContent slide={slide} cover={index === 0 ? artifact.cover : null} />
    {multiple && filmstrip && <nav className="studio-filmstrip" aria-label="幻灯片大纲">
      {artifact.slides.map((page, pageIndex) => <button key={pageIndex} className="quiet" type="button"
        aria-current={pageIndex === index ? 'page' : undefined}
        onClick={() => setIndex(pageIndex)} title={page.title}>
        <span>{String(pageIndex + 1).padStart(2, '0')}</span>
        <strong>{page.title}</strong>
      </button>)}
    </nav>}
    {multiple && !filmstrip && <div className="inline-actions studio-pager">
      <button type="button" className="quiet" disabled={index === 0} onClick={() => setIndex(index - 1)}>上一页</button>
      <span>{index + 1} / {artifact.slides.length}</span>
      <button type="button" className="quiet" disabled={index + 1 >= artifact.slides.length} onClick={() => setIndex(index + 1)}>下一页</button>
    </div>}
  </div>;
}

function PreviewPlaceholder({ mode }) {
  if (mode === 'slides') return <div className="studio-preview-sketch slide-sketch" aria-hidden="true">
    <div className="slide-sketch-sheet"><strong /><i /><i /><i /><span /></div>
    <div className="slide-sketch-pages"><i /><i /><i /></div>
  </div>;
  if (mode === 'image') return <div className="studio-preview-sketch image-sketch" aria-hidden="true">
    <div><Icon name="media" /></div>
  </div>;
  return <div className="studio-preview-sketch figure-sketch" aria-hidden="true"><div><i /><i /><i /><i /><i /></div></div>;
}

const promptCopy = {
  slides: {
    heading: '汇报文稿编排', label: '汇报主题、受众与核心结论',
    placeholder: '写下汇报主题、听众背景、要展示的关键实验结果和建议页数…',
    sample: '制作 6 页课题组阶段汇报。依次介绍研究问题、方法、实验设置、主要结果、局限和下一步计划。',
    action: '生成演示文稿', preview: '幻灯片画布', empty: '生成后可逐页检视大纲与版面，确认后一键导出 PPTX。',
  },
  image: {
    heading: '视觉插图描述', label: '主体元素与构图风格',
    placeholder: '写下画面主体、空间构图、低饱和色调倾向以及必须保留的标签文字…',
    sample: '画一张简洁的科研工作流插图。画面从左到右表现数据采集、分析和输出。留白充足，用低饱和蓝绿色区分步骤。',
    action: '生成视觉插图', preview: '插图画布', empty: '生成后可在右侧画布展开核对细节并导出图片。',
  },
  figure: { preview: '科研图稿画布', empty: '配置左侧材料并生成后，可在此核对版面、迭代版本与导出矢量图。' },
};

export function StudioAttachment({ attachment, remove }) {
  const [artifact, setArtifact] = useState(null);
  const [error, setError] = useState('');
  if (!attachment) return null;
  return <div className="studio-attachment">
    <div className="inline-actions">
      <button type="button" className="quiet icon-label" aria-expanded={Boolean(artifact)} onClick={async () => {
        if (artifact) { setArtifact(null); return; }
        try {
          const result = await api.getStudioArtifact(attachment.id);
          if (!result) throw new Error('找不到这个作品。');
          setArtifact(result);
          setError('');
        } catch (failure) { setError(errorText(failure)); }
      }}><Icon name="layers" />{attachment.title}</button>
      {remove && <button type="button" className="quiet" onClick={remove}>移除</button>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {artifact && <ArtifactPreview key={artifact.id} artifact={artifact} />}
  </div>;
}

function StudioDialog({ title, close, children }) {
  const dialog = useRef(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    element.showModal();
    element.querySelector('form input, form select')?.focus();
    return () => element.close();
  }, []);
  return <dialog className="studio-dialog" ref={dialog} aria-label={title} onCancel={event => {
    event.preventDefault();
    close();
  }}>
    <header>
      <h2>{title}</h2>
      <button type="button" className="quiet icon-only-btn" onClick={close} aria-label="关闭"><Icon name="close" /></button>
    </header>
    {children}
  </dialog>;
}

function StudioSettings({ config, entries, close, save, openAgents, imageContext }) {
  const [settings, setSettings] = useState(config);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageModels, setImageModels] = useState([]);
  const [imageModelLoading, setImageModelLoading] = useState(false);
  const [imageModelError, setImageModelError] = useState('');

  async function loadImageModels() {
    setImageModelLoading(true);
    setImageModelError('');
    try {
      const result = await api.listImageModels(settings.imageMode === 'minimax' ? 'minimax' : 'openai');
      const list = Array.isArray(result) ? result : result?.models || [];
      setImageModels(list);
      const recommended = Array.isArray(result) ? '' : result?.recommended || '';
      setSettings(previous => ({ ...previous, imageModel: previous.imageModel || recommended || list[0] || '' }));
    } catch (failure) { setImageModelError(errorText(failure)); }
    finally { setImageModelLoading(false); }
  }

  const options = entries.filter(item => item.ready ?? (item.installed || item.hasKey));
  const field = key => ({
    value: settings[key] || '',
    onChange: event => setSettings(previous => ({ ...previous, [key]: event.target.value })),
  });
  const connected = role => options.some(item => item.id === settings[role]);

  function connectionOptions(role, fallback) {
    return <>
      <option value="">{fallback}</option>
      {options.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      {settings[role] && settings[role] !== 'legacy-custom' && !connected(role) &&
        <option value={settings[role]} disabled>原连接不可用</option>}
    </>;
  }

  function chooseRole(role, model, event) {
    const value = event.target.value;
    setSettings(previous => ({ ...previous, [role]: value, [model]: '' }));
  }

  function capabilityOverride(key, value) {
    setSettings(previous => {
      const provider = previous.provider;
      if (!provider || provider === 'legacy-custom') return previous;
      const next = { ...(previous.capabilities || {}) };
      const entry = { ...(next[provider] || {}) };
      if (value === undefined) delete entry[key];
      else entry[key] = value;
      if (Object.keys(entry).length) next[provider] = entry;
      else delete next[provider];
      return { ...previous, capabilities: next };
    });
  }

  const drawingSettings = <>
    <label>绘图与文稿模型
      <select value={settings.provider || ''} onChange={event => chooseRole('provider', 'model', event)}>
        {connectionOptions('provider', '使用默认 Agent')}
        {config.provider === 'legacy-custom' && <option value="legacy-custom">旧版工作台连接</option>}
      </select>
    </label>
    {settings.provider === 'legacy-custom' && <p className="muted">旧版连接仍可使用。要统一管理 API，请在偏好设置接入后选择对应模型。</p>}
    {settings.provider && settings.provider !== 'legacy-custom' && <div className="studio-settings-fields">
      <label className="choice"><input type="checkbox" checked={settings.capabilities?.[settings.provider]?.vision === false}
        onChange={event => capabilityOverride('vision', event.target.checked ? false : undefined)} />该连接不发送图片（跳过视觉复核）</label>
      <label className="choice"><input type="checkbox" checked={settings.capabilities?.[settings.provider]?.imageApi === true}
        onChange={event => capabilityOverride('imageApi', event.target.checked ? true : undefined)} />该连接提供图像生成</label>
    </div>}
    {settings.reasoningAdvice && <p className="muted">{settings.reasoningAdvice}</p>}
    {openAgents && <button type="button" className="quiet studio-connect-agent" disabled={busy} onClick={openAgents}>前往 Agent 接入管理 →</button>}
  </>;

  const imageSettings = <>
    {imageContext !== 'concept' && <label>自由配图服务
      <select {...field('imageMode')}>
        <option value="diagram">GPT Image</option>
        <option value="minimax">MiniMax</option>
      </select>
    </label>}
    {imageContext !== 'concept' && <div className="studio-settings-fields">
      <label>图像模型
        <input maxLength={120} {...field('imageModel')}
          placeholder={settings.imageMode === 'minimax' ? '默认 image-01，可读取官方模型' : '默认 gpt-image-2.5，可读取官方模型'} />
      </label>
      <button type="button" className="quiet" disabled={busy || imageModelLoading}
        onClick={() => void loadImageModels()}>{imageModelLoading ? '正在读取官方模型…' : '读取官方模型'}</button>
    </div>}
    {imageModels.length > 0 && <label>官方可用模型
      <select value={settings.imageModel || ''}
        onChange={event => setSettings(previous => ({ ...previous, imageModel: event.target.value }))}>
        <option value="">选择模型</option>
        {imageModels.map(id => <option key={id} value={id}>{id}</option>)}
      </select>
    </label>}
    {imageModelError && <p className="muted">{imageModelError}</p>}
    <p className="muted">{imageContext !== 'concept' && settings.imageMode === 'minimax'
      ? settings.hasImageKey ? '已连接 MiniMax 图片服务。' : '请在偏好设置接入 MiniMax（api.minimax.io 或 api.minimax.chat）。'
      : settings.hasGptImage ? '已连接 GPT Image。' : '未配置 OpenAI 图像密钥；若已接入 MiniMax，将自动改用 MiniMax 图片服务。'}</p>
    {openAgents && <button type="button" className="quiet studio-connect-agent" disabled={busy} onClick={openAgents}>前往 Agent 接入管理 →</button>}
  </>;

  return <StudioDialog title="制图与生成引擎设置" close={() => { if (!busy) close(); }}>
    <form className="api-form studio-settings" onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      setError('');
      try { await api.configureStudio(settings); save(await api.getStudioSettings()); }
      catch (failure) { setError(errorText(failure)); }
      finally { setBusy(false); }
    }}>
      <p className="studio-settings-status" role="status">{imageContext
        ? (imageContext === 'illustration' && settings.imageMode === 'minimax' ? settings.hasImageKey : settings.hasGptImage)
          ? '图片服务已就绪' : '请先连接图片服务'
        : config.figureAgent ? '当前主引擎 · ' + config.figureAgent : '请选择已连接的模型，或前往 Agent 接入配置。'}</p>
      {imageContext ? imageSettings : drawingSettings}
      <details className="studio-settings-more">
        <summary>多角色分工与高级模型选项</summary>
        <div className="studio-settings-fields">
          {imageContext && drawingSettings}
          {settings.provider && settings.provider !== 'legacy-custom' && <label>指定生成模型 ID
            <input maxLength={240} placeholder="留空使用该连接的默认模型" {...field('model')} />
          </label>}
          <label>流程图规划与验收 (Leader)
            <select value={settings.leader || ''} onChange={event => chooseRole('leader', 'leaderModel', event)}>
              {connectionOptions('leader', '同主绘图模型')}
            </select>
          </label>
          {connected('leader') && <label>验收模型 ID<input maxLength={240} placeholder="留空使用默认模型" {...field('leaderModel')} /></label>}
          <label>论文选图与视觉审核 (Vision)
            <select value={settings.vision || ''} onChange={event => chooseRole('vision', 'visionModel', event)}>
              {connectionOptions('vision', '同主绘图模型')}
            </select>
          </label>
          {connected('vision') && <label>视觉模型 ID<input maxLength={240} placeholder="留空使用默认模型" {...field('visionModel')} /></label>}
          <p className="muted">论文截图抽取与视觉复核需选用支持图像输入的模型。</p>
        </div>
      </details>
      {!imageContext && <details className="studio-settings-more">
        <summary>栅格配图服务 (GPT Image / MiniMax)</summary>
        <div className="studio-settings-fields">{imageSettings}</div>
      </details>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="studio-dialog-actions">
        <button type="button" className="quiet" disabled={busy} onClick={close}>取消</button>
        <button className="primary" disabled={busy}>{busy ? '正在保存…' : '保存引擎配置'}</button>
      </div>
    </form>
  </StudioDialog>;
}

function ProjectName({ project, save, close }) {
  const [name, setName] = useState(project?.title || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <StudioDialog title={project ? '重命名项目' : '新建制图项目'} close={() => { if (!busy) close(); }}>
    <form className="api-form" onSubmit={async event => {
      event.preventDefault();
      if (busy || !name.trim()) return;
      setBusy(true);
      try { await save(name.trim()); }
      catch (failure) { setError(errorText(failure)); }
      finally { setBusy(false); }
    }}>
      <label>项目名称
        <input autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="例如：方法架构图与组会汇报" />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="studio-dialog-actions">
        <button type="button" className="quiet" disabled={busy} onClick={close}>取消</button>
        <button className="primary" disabled={busy || !name.trim()}>{project ? '保存名称' : '创建项目'}</button>
      </div>
    </form>
  </StudioDialog>;
}

function ProjectPicker({ projects, activeId, choose, create, generating, loading }) {
  const available = projects.filter(item => !item.archived);
  const archived = projects.filter(item => item.archived);
  function option(item) {
    return <option key={item.id} value={item.id}>{item.title}{item.id === generating ? '（生成中）' : ''}</option>;
  }
  return <div className="studio-project-picker" role="group" aria-label="项目管理">
    <label className="studio-project-select">
      <Icon name="layers" />
      <span className="visually-hidden">当前项目</span>
      <select value={activeId} disabled={loading || !projects.length} onChange={event => choose(event.target.value)}>
        {!activeId && <option value="" disabled>{loading ? '正在读取项目…' : projects.length ? '选择制图项目' : '暂无项目'}</option>}
        {available.length > 0 && <optgroup label="进行中项目">{available.map(option)}</optgroup>}
        {archived.length > 0 && <optgroup label="已归档">{archived.map(option)}</optgroup>}
      </select>
    </label>
    <button className="quiet studio-icon-btn" type="button" disabled={loading} onClick={create} title="新建制图项目" aria-label="新建制图项目">
      <Icon name="plus" />
    </button>
  </div>;
}

function DeleteProject({ project, close, remove }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <StudioDialog title="删除项目" close={() => { if (!busy) close(); }}>
    <div className="studio-delete-body">
      <p>确定删除「{project.title}」及其草稿和 {project.versions.length} 个作品版本吗？</p>
      <p className="muted">此操作无法撤销。已在思辨讨论中引用的历史作品快照仍可正常查看。</p>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="studio-dialog-actions inline-actions">
        <button type="button" className="quiet" autoFocus disabled={busy} onClick={close}>取消</button>
        <button type="button" className="studio-danger" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try { await remove(); } catch (failure) { setError(errorText(failure)); }
          finally { setBusy(false); }
        }}>{busy ? '正在删除…' : '确认删除'}</button>
      </div>
    </div>
  </StudioDialog>;
}

function IdeaOptions({ ideas, selected, empty }) {
  return <>
    <option value="">{empty}</option>
    {selected && !ideas.some(item => item.id === selected) && <option value={selected} disabled>讨论已删除</option>}
    {ideas.map(item => <option key={item.id} value={item.id}>{ideaTitle(item)}</option>)}
  </>;
}

function SuperAgentBar({ settings, entries = [], active, onConfigure, onCancel, isLocalData = false, visionRefine = true, onToggleVisionRefine, artifact }) {
  const resolve = (id, fallback) => entries.find(item => item.id === id)?.label || id || fallback;
  const drawer = isLocalData ? '本地矢量引擎' : resolve(settings?.provider, settings?.figureAgent || '默认 Agent');
  const leader = resolve(settings?.leader, isLocalData ? '本地校验' : drawer);
  const visionDisabled = settings?.provider && settings?.capabilities?.[settings.provider]?.vision === false;
  const critic = visionDisabled ? '已关闭' : resolve(settings?.vision, isLocalData ? '几何质检' : drawer);
  const visionReview = artifact?.figure?.visionReview;
  const trace = artifact?.figure?.superAgentTrace;
  const roles = [
    { id: 'router', title: 'Router · 规划', agent: leader, tone: 'cobalt' },
    { id: 'researcher', title: 'Researcher · 核验', agent: isLocalData ? '数据约束' : '文献/规则', tone: 'teal' },
    { id: 'drawer', title: 'Drawer · 出图', agent: drawer, tone: 'indigo' },
    { id: 'critic', title: 'Vision Critic', agent: visionRefine && !visionDisabled ? `${critic} · 闭环精修` : critic, tone: visionDisabled ? 'muted' : 'emerald' },
  ];

  return <div className="superagent-panel" data-active={active || undefined} aria-label="多角色协同编排">
    <div className="superagent-panel-head">
      <div className="superagent-brand">
        <Icon name="agent" />
        <strong>多角色协同</strong>
        {visionReview && <span className="superagent-score-badge" data-valid={visionReview.valid}>
          {visionReview.score != null ? `视觉 ${visionReview.score}/10` : visionReview.valid ? '视觉通过' : '待修订'}
          {visionReview.refined ? ` · 精修 ${visionReview.rounds} 轮` : ''}
        </span>}
      </div>
      <div className="superagent-head-actions">
        {!visionDisabled && onToggleVisionRefine && (
          <button type="button" className="quiet superagent-toggle" aria-pressed={visionRefine}
            title="接入视觉模型时，自动渲染 PNG → Vision Critic 审稿 → 回传自动精修（最多 2 轮）"
            onClick={() => onToggleVisionRefine(!visionRefine)}>
            <span className="superagent-dot" data-on={visionRefine || undefined} />
            视觉精修
          </button>
        )}
        {active && onCancel && <button type="button" className="quiet studio-stop-btn" onClick={onCancel}>停止</button>}
        <button type="button" className="quiet" onClick={onConfigure}>编排</button>
      </div>
    </div>
    <div className="superagent-pipeline">
      {roles.map((role, idx) => {
        const step = trace?.find(item => item.role === role.id);
        return <div key={role.id} className="superagent-node" data-tone={role.tone} data-state={active ? 'running' : step?.status || 'idle'}>
          <span className="superagent-node-head">
            <i className="superagent-node-dot" aria-hidden="true" />
            <small>{role.title}</small>
          </span>
          <strong title={step?.detail || role.agent}>{role.agent}</strong>
          {idx < roles.length - 1 && <span className="superagent-arrow" aria-hidden="true">›</span>}
        </div>;
      })}
    </div>
  </div>;
}

export function Studio({ ideas, defaultIdea, entries, insert, openAgents }) {
  const [shelf, setShelf] = useState(null);
  const [activeId, setActiveId] = useState('');
  const [project, setProject] = useState(null);
  const [version, setVersion] = useState('');
  const [artifact, setArtifact] = useState(null);
  const [workflowPreview, setWorkflowPreview] = useState(null);
  const [liveDataPreview, setLiveDataPreview] = useState(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [settings, setSettings] = useState(null);
  const [dialog, setDialog] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [canvasMat, setCanvasMat] = useState('grid');
  const [canvasTab, setCanvasTab] = useState('preview'); // 'preview' | 'review' | 'revise'
  const [visionRefine, setVisionRefine] = useState(true);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [copiedSvg, setCopiedSvg] = useState(false);
  const [destination, setDestination] = useState('');
  const [figureFormat, setFigureFormat] = useState('svg');
  const drafts = useSyncExternalStore(draftStore.subscribe, draftStore.getSnapshot);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [previousAnswers, setPreviousAnswers] = useState({});
  const [failedRead, setFailedRead] = useState('');
  const [retry, setRetry] = useState(0);
  const [artifactRetry, setArtifactRetry] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draftPreviewProject, setDraftPreviewProject] = useState(null);
  const previewToggle = useRef(null);
  const promptInput = useRef(null);
  const canvas = useRef(null);
  const activeProject = useRef('');

  const saveState = drafts[activeId];
  const current = project?.id === activeId ? { ...project, draft: saveState?.draft || project.draft } : null;
  const mode = current && (current.draft.type === 'slides' ? 'slides' : 'figure');
  const pictureType = pictureTypeOf(current?.draft);
  const pictureWorkflow = pictureWorkflowOf(current?.draft.pictureWorkflow) ||
    (pictureType === 'data' || pictureType === 'flow' ||
      current?.draft.type === 'image' && pictureType === 'illustration' && settings?.imageMode === 'minimax' ? 'hybrid' : 'agent');
  const flow = pictureType === 'flow';
  const conceptVisible = pictureType === 'concept';
  const illustration = mode === 'figure' && pictureType === 'illustration';
  const conceptEngine = pictureWorkflow === 'agent' ? 'agent' : 'gpt';
  const materialKey = flow && (current?.draft.figure?.kind !== 'diagram' || current?.draft.flowFigure) ? 'flowFigure' : 'figure';
  const material = current?.draft[materialKey] || (flow ? { kind: 'diagram' } : undefined);
  const promptKey = mode === 'slides' ? 'slidesPrompt' : 'imagePrompt';
  const prompt = current?.draft[promptKey] ?? current?.draft.prompt ?? '';
  const versions = (current?.versions || []).filter(item => mode === 'figure' ? item.type !== 'slides' : item.type === mode);
  const versionId = versions.find(item => item.id === version)?.id || versions[0]?.id;
  const draftPreview = mode === 'figure' && flow && workflowPreview?.projectId === activeId ? workflowPreview : null;
  const showDraftPreview = Boolean(draftPreview && draftPreviewProject === activeId);
  const selectedArtifact = !showDraftPreview && versionId && artifact?.id === versionId ? artifact : null;
  const revision = current?.draft.revisions?.[versionId] || '';
  const flowWorkspace = mode === 'figure' && flow && !current?.archived;
  const showResults = true;
  const saveLabel = saveState?.status === 'saving' ? '正在保存…' : saveState?.status === 'error' ? '保存失败 · 输入已保留' : '草稿已保存';
  const destinationAvailable = !destination || ideas.some(item => item.id === destination);
  const versionDate = versions.find(item => item.id === versionId)?.created;
  const generating = shelf?.generating || '';
  const generationLocked = Boolean(busy || generating);
  const hasIdea = Boolean(current?.draft.ideaId && ideas.some(item => item.id === current.draft.ideaId));
  const figureBrief = current?.draft.figureBrief || {};
  const briefComplete = figureBriefComplete(figureBrief);
  const figureProject = mode === 'figure';
  const figureTitle = current?.draft.figure?.title || '';
  const generatingHere = generating === activeId && Boolean(activeId) || busy === 'generate';
  const copy = promptCopy[illustration ? 'image' : mode];

  useEffect(() => {
    let active = true;
    void Promise.all([api.listStudioProjects(), api.getStudioSettings()]).then(([result, config]) => {
      if (!active) return;
      setShelf(result);
      setSettings(config);
      const saved = localStorage.getItem(storedProject);
      activeProject.current = result.projects.find(item => item.id === saved)?.id || result.projects.find(item => !item.archived)?.id || '';
      setActiveId(activeProject.current);
    }, failure => { if (active) { setFailedRead('initial'); setError(errorText(failure)); } });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!activeId) return;
    let active = true;
    void api.getStudioProject(activeId).then(result => {
      if (!active) return;
      setProject(result);
      setFailedRead('');
      setDestination(ideas.some(item => item.id === result.draft.ideaId) ? result.draft.ideaId : '');
    }, failure => { if (active) { setFailedRead('project'); setError(errorText(failure)); } });
    return () => { active = false; };
  }, [activeId, retry]);

  useEffect(() => {
    if (!versionId) return;
    let active = true;
    void api.getStudioArtifact(versionId).then(result => {
      if (active) {
        setArtifact(result);
        setFailedRead(result ? '' : 'artifact');
      }
    }, failure => { if (active) { setFailedRead('artifact'); setError(errorText(failure)); } });
    return () => { active = false; };
  }, [versionId, artifactRetry]);

  useEffect(() => {
    let active = true;
    const unsubscribe = api.onStudioChanged(() => {
      void api.listStudioProjects().then(result => { if (active) setShelf(result); },
        failure => { if (active) setError(errorText(failure)); });
      if (activeId) void api.getStudioProject(activeId).then(result => {
        if (active) setProject(previous => previous?.id === result.id ? { ...previous, versions: result.versions } : previous);
      }, failure => { if (active) setError(errorText(failure)); });
    });
    return () => { active = false; unsubscribe(); };
  }, [activeId]);

  function choose(id) {
    if (id === activeProject.current) return;
    activeProject.current = id;
    setActiveId(id);
    setVersion('');
    setWorkflowPreview(null);
    setExpanded(false);
    setHistoryVisible(false);
    setPreviousAnswers({});
    setFailedRead('');
    setFigureFormat('svg');
    setError('');
    setNotice('');
    if (id) localStorage.setItem(storedProject, id);
  }

  async function run(action, operation) {
    if (busy) return;
    setBusy(action);
    setError('');
    setNotice('');
    try { await operation(); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(''); }
  }

  function showPreview(value) {
    setExpanded(value);
    requestAnimationFrame(() => (value ? previewToggle : promptInput.current ? promptInput : previewToggle).current?.focus({ preventScroll: true }));
  }

  function edit(change) {
    const id = current.id;
    const draft = { ...(draftStore.getSnapshot()[id]?.draft || current.draft), ...change };
    draftStore.update(id, draft);
  }

  function setRevision(value) {
    edit({ revisions: { ...current.draft.revisions, [versionId]: value } });
  }

  async function saveBeforeAction() {
    if (!await draftStore.flush(activeId)) throw new Error('草稿尚未保存，请先重试保存再继续。');
  }

  function choosePicture(type) {
    const changes = type === 'slides' ? { type: 'slides' } : { type: 'figure', pictureType: type };
    setVersion('');
    setHistoryVisible(false);
    setFailedRead('');
    setNotice('');
    setError('');
    if (type === 'data' && current.draft.figure?.kind === 'diagram') {
      changes.flowFigure = current.draft.flowFigure || current.draft.figure;
      changes.figure = normalizeFigureDraft();
    }
    edit(changes);
  }

  function generate(variant, revise = false, engine) {
    void run('generate', async () => {
      await saveBeforeAction();
      const result = await api.generateStudio({
        ...current.draft,
        prompt,
        type: variant || (illustration ? 'image' : mode),
        pictureWorkflow: mode === 'figure' ? pictureWorkflow : undefined,
        engine,
        visionRefine,
        ...(flow && !revise ? { figure: material, conceptLayout: overviewDetailLayout } : {}),
        ...(revise ? {
          revision,
          referenceId: selectedArtifact?.id,
          ...(selectedArtifact.figure ? { figure: selectedArtifact.figure.specification, concept: selectedArtifact.figure.concept } : {}),
        } : {}),
        projectId: activeId,
        ideaId: !variant && hasIdea ? current.draft.ideaId : '',
      });
      if (activeProject.current !== activeId) return;
      if (!result) { setNotice('已停止生成。'); return; }
      const saved = await api.getStudioProject(activeId);
      if (activeProject.current !== activeId) return;
      setArtifact(result);
      setFailedRead('');
      setProject(previous => previous?.id === activeId ? { ...previous, versions: saved.versions } : previous);
      setVersion('');
      if (revise) setRevision('');
      setDestination(hasIdea ? current.draft.ideaId : '');
      if (result.figure || result.concept) {
        setNotice('作品已保存，可在右侧画布预览与导出。');
        requestAnimationFrame(() => canvas.current?.scrollIntoView({ block: 'start' }));
      } else showPreview(true);
    });
  }

  async function assembleFlow(input) {
    await saveBeforeAction();
    const result = await api.flowAssembly(activeId, input);
    if (!result || activeProject.current !== activeId) return result;
    if (!result.artifact) {
      if (result.flow) setDraftPreviewProject(activeId);
      return result;
    }
    setDraftPreviewProject(null);
    setHistoryVisible(true);
    const saved = await api.getStudioProject(activeId);
    if (activeProject.current !== activeId) return result;
    setProject(previous => previous?.id === activeId ? { ...previous, versions: saved.versions } : previous);
    setArtifact(result.artifact);
    setVersion(result.artifact.id);
    setNotice('流程图已验收保存，可在作品画布中导出。');
    requestAnimationFrame(() => canvas.current?.scrollIntoView({ block: 'start' }));
    return result;
  }

  async function startFigure(type = 'data') {
    const id = await api.createStudioProject({
      title: creationTypes[type] + '项目',
      ideaId: defaultIdea,
      ...(type !== 'slides' ? { figure: {} } : {}),
    });
    await api.saveStudioDraft(id, { type: type === 'slides' ? 'slides' : 'figure', pictureType: type === 'slides' ? undefined : type, ideaId: defaultIdea });
    setShelf(await api.listStudioProjects());
    choose(id);
  }

  function answerFigure(id, value) {
    if (id === 'purpose') {
      const previous = previousAnswers.purpose;
      if (previous && figureBriefKind({ purpose: previous }) !== figureBriefKind({ purpose: value })) {
        setPreviousAnswers({ source: previousAnswers.source, audience: previousAnswers.audience });
      }
    }
    const answers = { ...figureBrief, [id]: value };
    const changes = { figureBrief: answers };
    if (figureBriefComplete(answers)) {
      const suggested = figureBriefKind(answers);
      const kind = flow ? 'diagram' : suggested && suggested !== 'diagram' ? suggested : current.draft.figure?.kind || 'line';
      const sample = answers.source?.selected.includes(2) && !answers.source.selected.some(index => index < 2);
      if (!conceptVisible && !material?.data) {
        const note = answers.uncertainty?.note || answers.emphasis?.note;
        changes[materialKey] = { ...(sample ? figureExample(kind) : material), kind, ...(note ? { caption: note.slice(0, 450) } : {}) };
      }
      if (answers.purpose?.selected.length > 1) setNotice('已按你最先勾选的目标推荐图型，绘图时可切换。');
      if (conceptVisible && sample && !current.draft.concept) {
        changes.concept = '示例：绘制研究数据工作流。左侧为「数据采集」，中间为「数据质检」，右侧为「结果汇总」。只用箭头表达先后顺序，不展示数值。';
      }
    }
    edit(changes);
  }

  function backFigure() {
    const ids = figureBriefQuestions(figureBrief).map(round => round.id);
    const answers = { ...figureBrief };
    const last = ids.findLast(id => answers[id]);
    if (!last) return;
    const savedAnswer = answers[last];
    setPreviousAnswers(previous => ({ ...previous, [last]: savedAnswer }));
    delete answers[last];
    edit({ figureBrief: answers });
  }

  const rasterVersions = current?.versions.filter(item => item.raster) || [];
  const imageProvider = (illustration || conceptVisible) && pictureWorkflow === 'hybrid';
  const minimaxReady = settings?.hasImageKey && settings?.capabilities?.minimax?.imageApi !== false;
  const openaiReady = settings?.hasGptImage && settings?.capabilities?.openai?.imageApi !== false;
  const rasterProvider = settings?.imageMode === 'minimax' ? (minimaxReady ? 'MiniMax' : '') :
    openaiReady ? 'GPT Image' : minimaxReady ? 'MiniMax' : '';
  const canGenerate = Boolean(imageProvider && rasterProvider || settings?.figureAgent);
  const generatorLabel = imageProvider && rasterProvider ? rasterProvider : settings?.figureAgent;
  const outputHint = imageProvider && !rasterProvider ? '未配置可用图片服务，将使用绘图模型生成可编辑 SVG。' : '';

  return <section className="studio-page" data-mode={mode} data-expanded={expanded} aria-label="图文工作台" onKeyDown={event => {
    if (event.key === 'Escape' && expanded) showPreview(false);
  }}>
    <header className="studio-command-bar academic-command-bar">
      <div className="studio-command-left">
        {!current && <div className="studio-brand-compact">
          <div>
            <h1>科研制图</h1>
            <p>数据图 · 分块流程图 · 概念示意 · 汇报文稿</p>
          </div>
        </div>}

        <ProjectPicker projects={shelf?.projects || []} activeId={activeId} choose={choose}
          generating={generating} loading={!shelf} create={() => setDialog('create')} />

        {current && <>
          <span className="studio-save-state" data-state={saveState?.status || 'saved'} role="status"
            title={current.archived ? '已归档 · 只读' : saveLabel}>
            {current.archived ? '只读' : saveState?.status === 'saving' ? '保存中' : saveState?.status === 'error' ? '未保存' : '已保存'}
          </span>
          <details className="studio-project-menu" key={activeId} onKeyDown={event => {
            if (event.key !== 'Escape' || !event.currentTarget.open) return;
            event.stopPropagation();
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
          }}>
            <summary aria-label="项目操作"><Icon name="sliders" />项目</summary>
            <div className="studio-project-actions" onClick={event => {
              if (event.target.closest('button:not(:disabled)')) event.currentTarget.parentElement.open = false;
            }}>
              <button type="button" className="quiet" disabled={Boolean(busy)} onClick={() => setDialog('rename')}>重命名项目</button>
              <button type="button" className="quiet" disabled={Boolean(busy) || generating === activeId} onClick={() => void run('archive', async () => {
                await saveBeforeAction();
                await api.archiveStudioProject(activeId, !current.archived);
                setProject(previous => previous?.id === activeId ? { ...previous, archived: current.archived ? 0 : 1 } : previous);
                setShelf(await api.listStudioProjects());
                if (activeProject.current === activeId) setNotice(current.archived ? '项目已恢复。' : '项目已归档。');
              })}>{current.archived ? '恢复项目' : '归档项目'}</button>
              <button type="button" className="quiet studio-delete-link" disabled={Boolean(busy) || generating === activeId}
                onClick={() => setDialog('delete')}>删除项目</button>
            </div>
          </details>
        </>}
      </div>

      {current && !current.archived && !expanded && !(flowWorkspace && historyVisible) && (
        <div className="studio-mode-tabs segmented-pills" role="group" aria-label="作品类型">
          {Object.entries(creationTypes).map(([id, label]) => <button type="button" className="quiet icon-label" key={id}
            aria-pressed={(mode === 'slides' ? 'slides' : pictureType) === id} disabled={generationLocked}
            onClick={() => { if ((mode === 'slides' ? 'slides' : pictureType) !== id) choosePicture(id); }}>
            <Icon name={creationIcons[id]} />{label}
          </button>)}
        </div>
      )}

      <div className="inline-actions studio-heading-actions">
        {current && !current.archived && <button type="button" className="quiet studio-model-pill icon-label"
          disabled={!settings} onClick={() => setDialog('settings')}>
          <span className={generatorLabel ? 'connection-dot connected' : 'connection-dot'} aria-hidden="true" />
          <span>{generatorLabel ? generatorLabel : pictureType === 'data' && mode === 'figure' ? '本地绘图引擎' : '连接生成模型'}</span>
        </button>}
        {!current && <button type="button" className="quiet icon-label" disabled={!settings} onClick={() => setDialog('settings')}>
          <Icon name="preferences" />生成设置
        </button>}
        {flowWorkspace && <button type="button" className="quiet icon-label" aria-pressed={historyVisible} onClick={() => {
          setHistoryVisible(!historyVisible);
          if (!historyVisible) requestAnimationFrame(() => canvas.current?.scrollIntoView({ block: 'start' }));
        }}>
          <Icon name="history" />{historyVisible ? '返回分块审核' : `版本 · ${versions.length}`}
        </button>}
      </div>
    </header>

    {(dialog === 'settings' || dialog === 'image-settings') && <StudioSettings config={settings} entries={entries}
      imageContext={dialog === 'image-settings' ? conceptVisible ? 'concept' : 'illustration' : null}
      openAgents={openAgents ? () => { setDialog(''); openAgents(); } : undefined}
      close={() => setDialog('')}
      save={value => {
        setSettings(value);
        setDialog('');
      }} />}

    {(dialog === 'create' || dialog === 'rename') && <ProjectName project={dialog === 'rename' ? current : null}
      close={() => setDialog('')}
      save={async name => {
        if (dialog === 'create') {
          const id = await api.createStudioProject({ title: name, ideaId: defaultIdea });
          setShelf(await api.listStudioProjects());
          choose(id);
        } else {
          await api.renameStudioProject(activeId, name);
          setProject(previous => previous?.id === activeId ? { ...previous, title: name } : previous);
          setShelf(await api.listStudioProjects());
        }
        setDialog('');
      }} />}

    {dialog === 'delete' && current && <DeleteProject project={current} close={() => setDialog('')} remove={async () => {
      await saveBeforeAction();
      const result = await api.removeStudioProject(current.id);
      setShelf(result);
      if (activeProject.current === current.id) choose(result.projects.find(item => !item.archived)?.id || result.projects[0]?.id || '');
      setDialog('');
      setNotice('项目已删除。');
    }} />}

    <div className="studio-layout">
      <div className="studio-work" data-mode={mode} data-flow={flowWorkspace} data-history={historyVisible}
        data-layout={current && !current.archived ? 'editor' : 'single'}>
        {current ? <>
          {saveState?.status === 'error' && <div className="studio-feedback studio-save-error" role="alert">
            <span>草稿未写入磁盘：{errorText(saveState.error)}。输入仍保留在本窗口，请重试后再关闭软件。</span>
            <button type="button" className="quiet" onClick={() => draftStore.update(activeId, current.draft)}>重试保存</button>
          </div>}

          <div className="studio-editor-column" hidden={flowWorkspace && historyVisible && !expanded}>
            {!expanded && !current.archived && (
              <SuperAgentBar
                settings={settings}
                entries={entries}
                active={generatingHere}
                isLocalData={pictureType === 'data' && mode === 'figure' && pictureWorkflow === 'hybrid'}
                visionRefine={visionRefine}
                onToggleVisionRefine={setVisionRefine}
                artifact={selectedArtifact}
                onConfigure={() => setDialog(imageProvider ? 'image-settings' : 'settings')}
                onCancel={() => void api.cancelStudio()}
              />
            )}
            {!expanded && !current.archived && figureProject && !illustration &&
              <section className="studio-glass figure-workflow" aria-label="科研绘图编辑器">
                <div className="studio-spec-bar">
                  <label className="figure-shared-title">
                    <span className="visually-hidden">图稿标题</span>
                    <input value={conceptVisible ? figureTitle : material?.title || ''} maxLength={FIGURE_TEXT_LIMITS.title}
                      placeholder="图稿标题（用于导出与版本管理）" disabled={generationLocked}
                      onChange={event => edit({
                        [conceptVisible ? 'figure' : materialKey]: {
                          ...normalizeFigureDraft(conceptVisible ? current.draft.figure : material),
                          title: event.target.value,
                        },
                      })} />
                  </label>
                  {!flow && (conceptVisible || illustration) && <select className="studio-compact-select" aria-label="输出方式"
                    value={pictureWorkflow} disabled={generationLocked}
                    onChange={event => edit({ pictureWorkflow: event.target.value })}>
                    <option value="agent">可编辑 SVG</option>
                    <option value="hybrid">图片模型</option>
                  </select>}
                  {pictureType === 'data' && <select className="studio-compact-select" aria-label="绘图引擎"
                    value={pictureWorkflow} disabled={generationLocked}
                    onChange={event => edit({ pictureWorkflow: event.target.value })}>
                    <option value="hybrid">本地表格出图</option>
                    <option value="agent">Agent 定制</option>
                  </select>}
                  <button type="button" className="quiet filter-pill" aria-pressed={intakeOpen}
                    onClick={() => setIntakeOpen(v => !v)}>
                    {briefComplete ? '✓ 需求已设' : '需求问答'}
                  </button>
                </div>
                {outputHint && <p className="studio-route-hint">{outputHint}</p>}

                {intakeOpen && <div className="studio-intake-drawer">
                  {briefComplete ? <>
                    <BriefSummary record={figureBriefRecord(figureBrief, { includeSkipped: true })} />
                    <button type="button" className="quiet" disabled={generationLocked} onClick={() => {
                      setPreviousAnswers(figureBrief);
                      edit({ figureBrief: {} });
                    }}>重新填写需求</button>
                  </> : <FigureIntake key={activeId} answers={figureBrief} previous={previousAnswers}
                    answer={answerFigure} back={backFigure} disabled={generationLocked} />}
                  <details className="figure-requirements">
                    <summary>内置绘图技能规范（{builtInFigureSkills.length}）</summary>
                    <ul className="figure-skill-list">{builtInFigureSkills.map(skill => <li key={skill.name}>
                      <button type="button" className="quiet icon-label"
                        onClick={() => void api.openSourceLink(skill.source).catch(failure => setError(errorText(failure)))}>
                        {skill.name}<Icon name="external" />
                      </button>
                    </li>)}</ul>
                    <p className="muted">可在「偏好设置 → 制图技能」导入自定义 SKILL.md。</p>
                  </details>
                </div>}

                {flow ? <FlowAssembly key={activeId} projectId={activeId} draft={current.draft} material={material}
                  edit={changes => {
                    if (Object.hasOwn(changes, 'data')) edit({ [materialKey]: { ...material, data: changes.data } });
                    else edit(changes);
                  }}
                  locked={generationLocked} model={settings?.figureAgent} openSettings={() => setDialog('settings')}
                  cancel={() => void api.cancelStudio()} act={assembleFlow} onPreview={setWorkflowPreview} />
                : conceptVisible ? <FigureConcept draft={current.draft.concept || ''} change={concept => edit({ concept })}
                  layout={current.draft.conceptLayout} setLayout={conceptLayout => edit({ conceptLayout })}
                  engine={conceptEngine} enabled={canGenerate} providerLabel={generatorLabel}
                  openSettings={() => setDialog(conceptEngine === 'gpt' ? 'image-settings' : 'settings')} active={generatingHere}
                  locked={generationLocked} cancel={() => void api.cancelStudio()}
                  generate={() => generate(conceptEngine === 'gpt' ? 'concept' : 'concept-vector')}
                  useSteps={((current.draft.flowFigure || (current.draft.figure?.kind === 'diagram' ? current.draft.figure : null))?.data || '').trim()
                    ? () => edit({ concept: (current.draft.flowFigure || current.draft.figure).data.slice(0, 3000) })
                    : null} />
                : <FigureEditor key={activeId + pictureType} figure={material} change={figure => edit({ [materialKey]: figure })}
                  workflow={pictureWorkflow} flow={flow} canDraftImage={settings?.hasGptImage}
                  splitFlow={flow && settings?.figureAgent ? api.splitStudioFlow : null}
                  flowPrompt={current.draft.flowPrompt} setFlowPrompt={flowPrompt => edit({ flowPrompt })}
                  flowRequirements={current.draft.flowRequirements} flowConstraints={current.draft.flowConstraints} changeFlowNeeds={edit}
                  flowReferenceId={current.draft.flowReferenceId || 'auto'} setFlowReferenceId={flowReferenceId => edit({ flowReferenceId })}
                  generate={engine => generate(undefined, false, engine)}
                  onLivePreview={pictureType === 'data' ? setLiveDataPreview : undefined}
                  model={settings?.figureAgent} openSettings={() => setDialog('settings')} busy={generatingHere}
                  cancel={() => void api.cancelStudio()} disabled={generationLocked}
                  review={settings?.canReviewFigure && briefComplete ? () => api.reviewStudioFigure({ ...current.draft, figure: material }) : null} />}
              </section>}

            {!expanded && !current.archived && (!figureProject || illustration) && <form className="studio-prompt studio-glass studio-composer" onSubmit={event => {
              event.preventDefault();
              if (!generationLocked && canGenerate && (prompt.trim() || hasIdea)) generate();
            }}>
              <div className="studio-prompt-heading">
                <h3><Icon name={modeIcon[mode]} />{copy.heading}</h3>
              </div>
              <div className="studio-composer-label">
                <label htmlFor="studio-prompt-input">{copy.label}</label>
                {!prompt.trim() && <button type="button" className="quiet" disabled={generationLocked} onClick={() => {
                  edit({ [promptKey]: copy.sample });
                  promptInput.current?.focus();
                }}>填入示例模板</button>}
              </div>
              <textarea id="studio-prompt-input" ref={promptInput} value={prompt} maxLength={3000} rows={illustration ? 6 : 5}
                disabled={generationLocked} onChange={event => edit({ [promptKey]: event.target.value })}
                placeholder={copy.placeholder} />
              <div className="studio-input-meta"><span>{saveLabel}</span><span>{prompt.length} / 3000</span></div>
              <div className="studio-composer-sources">
                <label>关联思辨上下文
                  <select value={current.draft.ideaId} disabled={generationLocked} onChange={event => edit({ ideaId: event.target.value })}>
                    <IdeaOptions ideas={ideas} selected={current.draft.ideaId} empty="不附带讨论，仅按上方要求生成" />
                  </select>
                </label>
                {current.draft.type === 'slides' && !!rasterVersions.length && <label>选用项目内配图作封面
                  <select value={current.draft.coverId} disabled={generationLocked} onChange={event => edit({ coverId: event.target.value })}>
                    <option value="">不使用封面图</option>
                    {rasterVersions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                </label>}
              </div>
              <div className="studio-composer-footer">
                <button type="button" className="quiet icon-label" onClick={() => setDialog(imageProvider ? 'image-settings' : 'settings')}
                  disabled={!settings || generationLocked}>
                  <Icon name="preferences" /><span>{generatorLabel || '配置生成模型'}</span>
                </button>
                <div className="studio-generate-actions">
                  <button className="primary icon-label" disabled={generationLocked || !canGenerate || (!prompt.trim() && !hasIdea)}>
                    <Icon name="stars" />{generatingHere ? '正在生成…' : copy.action}
                  </button>
                  {(generating === activeId || busy === 'generate') && <button type="button" className="quiet" onClick={() => void api.cancelStudio()}>停止</button>}
                </div>
              </div>
            </form>}
          </div>

          <div className="studio-results" hidden={!showResults}>
            {(() => {
              const displayArtifact = selectedArtifact || draftPreview || (pictureType === 'data' && mode === 'figure' ? liveDataPreview : null);
              const isLiveOnly = Boolean(!selectedArtifact && !draftPreview && displayArtifact?.live);
              return <section className="studio-canvas studio-glass" data-filled={Boolean(displayArtifact)} ref={canvas} aria-label="作品预览">
              <header className="studio-canvas-heading">
                <div className="studio-canvas-tabs segmented-pills" role="tablist" aria-label="画布视图">
                  <button type="button" role="tab" aria-selected={canvasTab === 'preview'} onClick={() => setCanvasTab('preview')}>
                    {isLiveOnly ? '实时预览' : !selectedArtifact && draftPreview ? draftPreview.title : copy.preview}
                  </button>
                  {selectedArtifact && (selectedArtifact.figure || selectedArtifact.concept) && (
                    <button type="button" role="tab" aria-selected={canvasTab === 'review'} onClick={() => setCanvasTab('review')}>
                      质检与依据
                    </button>
                  )}
                  {!expanded && !current.archived && figureProject &&
                    (selectedArtifact?.concept && settings?.hasGptImage ||
                      selectedArtifact?.figure && selectedArtifact.figure.engine !== 'assembly' && settings?.figureAgent) && (
                    <button type="button" role="tab" aria-selected={canvasTab === 'revise'} onClick={() => setCanvasTab('revise')}>
                      版本迭代
                    </button>
                  )}
                </div>
                <div className="studio-canvas-tools">
                  {canvasTab === 'preview' && displayArtifact && <div className="studio-zoom-bar" role="group" aria-label="画布缩放">
                    <button type="button" className="quiet" aria-label="缩小画布" disabled={canvasZoom <= 0.5}
                      onClick={() => setCanvasZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}>−</button>
                    <button type="button" className="quiet" title="重置缩放" onClick={() => setCanvasZoom(1)}>
                      {Math.round(canvasZoom * 100)}%
                    </button>
                    <button type="button" className="quiet" aria-label="放大画布" disabled={canvasZoom >= 2}
                      onClick={() => setCanvasZoom(z => Math.min(2, +(z + 0.25).toFixed(2)))}>+</button>
                  </div>}
                  {canvasTab === 'preview' && <div className="studio-mat-switch" role="group" aria-label="画布底色">
                    {[['grid', '网格'], ['paper', '白底'], ['dark', '深色']].map(([id, label]) =>
                      <button key={id} type="button" className="quiet" aria-pressed={canvasMat === id}
                        onClick={() => setCanvasMat(id)}>{label}</button>)}
                  </div>}
                  {!!versions.length && <label className="studio-version">
                    <span className="visually-hidden">历史版本</span>
                    <select value={showDraftPreview ? '__draft__' : versionId || ''} disabled={generatingHere} onChange={event => {
                      const id = event.target.value;
                      setDraftPreviewProject(id === '__draft__' ? activeId : null);
                      setFailedRead('');
                      if (id !== '__draft__') setVersion(id);
                    }}>
                      {draftPreview && <option value="__draft__">当前实时草稿</option>}
                      {versions.map((item, index) => <option key={item.id} value={item.id}>
                        {'V' + (versions.length - index) + ' · ' + versionLabel[item.type] + ' · ' + item.title}
                      </option>)}
                    </select>
                  </label>}
                  {displayArtifact && <button ref={previewToggle} type="button" className="quiet icon-label"
                    aria-expanded={expanded} onClick={() => { setCanvasTab('preview'); showPreview(!expanded); }}>
                    <Icon name={expanded ? 'minimize' : 'maximize'} />{expanded ? '恢复双栏' : '全宽'}
                  </button>}
                </div>
                {generatingHere && selectedArtifact && <span className="status-pill" data-status="running" role="status">正在渲染…</span>}
              </header>

              {canvasTab === 'preview' && <div className="studio-stage" data-mat={canvasMat} aria-busy={generatingHere}>
                {displayArtifact
                  ? <div className="studio-stage-zoom" style={{ transform: `scale(${canvasZoom})` }}>
                      <ArtifactPreview key={displayArtifact.id} artifact={displayArtifact} filmstrip={mode === 'slides'} allowZoom />
                    </div>
                  : <div className="studio-stage-empty">
                        {!versionId && !generatingHere ? <PreviewPlaceholder mode={mode} /> :
                          <span className="studio-stage-symbol"><Icon name={generatingHere ? 'layers' : modeIcon[mode]} /></span>}
                        <p>{failedRead === 'artifact' ? '无法读取此作品版本' : versionId ? '正在加载画布作品…' : generatingHere ? '正在为您绘制作品…' : '画布就绪'}</p>
                        {failedRead === 'artifact' && <button type="button" onClick={() => {
                          setFailedRead(''); setError(''); setArtifactRetry(value => value + 1);
                        }}>重试加载</button>}
                        {!versionId && !generatingHere && <small>{copy.empty}</small>}
                      </div>}
              </div>}

              {isLiveOnly && <footer className="studio-output-actions">
                <div className="studio-output-meta">
                  <span className="muted">本地实时渲染 · {displayArtifact.figure?.summary || '修改数据即刻刷新'}</span>
                </div>
                <div className="studio-export">
                  <button type="button" className="quiet icon-label" onClick={async () => {
                    try {
                      const raw = new TextDecoder().decode(Uint8Array.from(atob(displayArtifact.data.split(';base64,')[1]), c => c.charCodeAt(0)));
                      await navigator.clipboard.writeText(raw);
                      setCopiedSvg(true);
                      setTimeout(() => setCopiedSvg(false), 1600);
                    } catch { /* ignore */ }
                  }}>
                    <Icon name={copiedSvg ? 'check' : 'copy'} />{copiedSvg ? '已复制 SVG' : '复制 SVG'}
                  </button>
                  <button type="button" className="primary icon-label" disabled={generationLocked}
                    onClick={() => void generate(undefined, false, 'local')}>
                    <Icon name="check" />保存为正式版本
                  </button>
                </div>
              </footer>}

              {selectedArtifact && <footer className="studio-output-actions">
                <div className="studio-output-meta">
                  {versionDate && <time className="studio-version-date" dateTime={versionDate}>{ideaDates.format(new Date(versionDate))}</time>}
                  {selectedArtifact.concept && <span className="mini-tag accent">AI 示意草案</span>}
                </div>
                <div className="studio-export">
                  {selectedArtifact.figure && <label>
                    <span className="visually-hidden">导出格式</span>
                    <select value={figureFormat === 'zip' && !selectedArtifact.figure.designBrief ? 'svg' : figureFormat}
                      onChange={event => setFigureFormat(event.target.value)}>
                      <option value="svg">SVG 矢量图</option>
                      <option value="pdf">PDF 矢量图</option>
                      <option value="png">PNG（2× 高清）</option>
                      <option value="json">可重绘图稿（JSON）</option>
                      {Array.isArray(selectedArtifact.figure.flowPlan) && <option value="d2">D2 可编辑图源（TALA）</option>}
                      {selectedArtifact.figure.designBrief && <option value="zip">流程图源文件包（ZIP）</option>}
                    </select>
                  </label>}
                  {selectedArtifact.data?.startsWith('data:image/svg+xml') && <button type="button" className="quiet icon-label"
                    title="复制 SVG 源码到剪贴板（可直接粘贴到 Illustrator / Figma）"
                    onClick={async () => {
                      try {
                        const raw = selectedArtifact.data.includes(';base64,')
                          ? new TextDecoder().decode(Uint8Array.from(atob(selectedArtifact.data.split(';base64,')[1]), c => c.charCodeAt(0)))
                          : decodeURIComponent(selectedArtifact.data.split(',')[1] || '');
                        await navigator.clipboard.writeText(raw);
                        setCopiedSvg(true);
                        setTimeout(() => setCopiedSvg(false), 1600);
                      } catch { /* ignore */ }
                    }}>
                    <Icon name={copiedSvg ? 'check' : 'copy'} />{copiedSvg ? '已复制 SVG' : '复制 SVG'}
                  </button>}
                  <button type="button" className="primary icon-label" disabled={Boolean(busy)} onClick={() => void run('export', async () => {
                    const format = figureFormat === 'zip' && !selectedArtifact.figure?.designBrief ? 'svg' : figureFormat;
                    if (await api.exportStudio(selectedArtifact.id, selectedArtifact.figure ? format : undefined)) setNotice('文件已导出保存。');
                  })}>
                    <Icon name="import" />导出{selectedArtifact.figure ? '' : selectedArtifact.type === 'slides' ? ' PPTX' : '图片'}
                  </button>
                </div>
                <div className="studio-insert">
                  <label className="visually-hidden" htmlFor="studio-destination">插入位置</label>
                  <select id="studio-destination" value={destination} onChange={event => setDestination(event.target.value)}>
                    <IdeaOptions ideas={ideas} selected={destination} empty="带入新对话" />
                  </select>
                  <button type="button" className="quiet icon-label" disabled={Boolean(busy) || !destinationAvailable}
                    onClick={() => insert(selectedArtifact, destination)}>
                    <Icon name="discussion" />插入讨论
                  </button>
                </div>
              </footer>}
            </section>;
            })()}

            {canvasTab === 'review' && selectedArtifact?.figure && <div className="studio-canvas-subpanel figure-saved-review">
              {selectedArtifact.figure.superAgentTrace?.length > 0 && <div className="figure-review superagent-trace-card">
                <strong>SuperAgent 多角色执行轨迹</strong>
                <ol className="superagent-trace-list">
                  {selectedArtifact.figure.superAgentTrace.map(step => <li key={step.role} data-status={step.status}>
                    <span className="trace-role">{step.label}</span>
                    <span className="trace-detail">{step.detail}</span>
                  </li>)}
                </ol>
              </div>}
              {selectedArtifact.figure.visionReview && <div className="figure-review">
                <strong>
                  Vision Critic 视觉复核
                  {selectedArtifact.figure.visionReview.score != null ? ` · ${selectedArtifact.figure.visionReview.score}/10` : ''}
                  {selectedArtifact.figure.visionReview.refined ? ` · 已自动精修 ${selectedArtifact.figure.visionReview.rounds} 轮` : ''}
                </strong>
                {selectedArtifact.figure.visionReview.valid
                  ? <p className="muted">视觉审稿通过：布局、层级、标注与可读性均符合科研出版标准。</p>
                  : <ul>{(selectedArtifact.figure.visionReview.issues || []).map((issue, idx) =>
                      <li key={idx}>{issue}{selectedArtifact.figure.visionReview.fixes?.[idx] ? ` → ${selectedArtifact.figure.visionReview.fixes[idx]}` : ''}</li>)}</ul>}
              </div>}
              <FigureReview result={selectedArtifact.figure} />
              {selectedArtifact.figure.structure && <p className="muted">
                结构检查：{selectedArtifact.figure.structure.stages} 个阶段，{selectedArtifact.figure.structure.nodes} 个节点，
                {selectedArtifact.figure.structure.links} 条阶段内连线。
                {selectedArtifact.figure.structure.isolated.length
                  ? ` ${selectedArtifact.figure.structure.isolated.length} 个节点缺少阶段内连线。` : ' 节点连接完整。'}
              </p>}
              {selectedArtifact.figure.flowLayout && <p className="muted">
                自动布局：{selectedArtifact.figure.flowLayout.name} {selectedArtifact.figure.flowLayout.version} · 分层排列与连线路由
              </p>}
              {selectedArtifact.figure.visualReview?.issues?.length > 0 && <div className="figure-review">
                <strong>视觉复核记录</strong>
                <ul>{selectedArtifact.figure.visualReview.issues.map((issue, index) =>
                  <li key={index}>{issue.location} · {issue.problem}{issue.fix ? ` 建议：${issue.fix}` : ''}</li>)}</ul>
              </div>}
              {selectedArtifact.figure.designBrief && !selectedArtifact.figure.visualReview &&
                <p className="muted">本版没有模型视觉复核结果。可将成图与下方要求逐项对照。</p>}
              {selectedArtifact.figure.engine === 'local' && <p className="muted">由原始材料在本机直接绘制。</p>}
              {selectedArtifact.figure.engine === 'assembly' && <div className="figure-review">
                <strong>素材与论文依据</strong>
                <ol>{selectedArtifact.figure.assembly.materials.map((item, index) => <li key={item.id}>
                  <span>{selectedArtifact.figure.assembly.blocks[index].label} · {item.kind === 'paper' ? '论文截取' : 'Agent 绘制'}</span>
                  <p>{item.citation.title} · {item.citation.location}</p>
                  <blockquote>{item.citation.quote}</blockquote>
                </li>)}</ol>
              </div>}
              {selectedArtifact.figure.designBrief && selectedArtifact.figure.engine !== 'assembly' && (() => {
                const design = selectedArtifact.figure.designBrief;
                const saved = current.draft.flowStyleVersion === selectedArtifact.id;
                return <div className="figure-review">
                  <strong>绘图提示词与参考插图</strong>
                  {design.purpose && <p>{design.purpose}</p>}
                  {design.visualDraft && <p className="muted">由 {design.visualDraft.provider} 生成构图草案，再重绘为可编辑 SVG。</p>}
                  {design.composition && <details>
                    <summary>查看全图构图</summary>
                    <p>{design.composition.aspect}</p>
                    <p>{design.composition.readingOrder}</p>
                    <ul>{design.composition.zones.map((zone, index) => <li key={index}>
                      <strong>{zone.label}</strong> · {zone.width}% 宽 × {zone.height}% 高 · {zone.focus}
                    </li>)}</ul>
                  </details>}
                  {design.prompt && <p className="flow-design-prompt">{design.prompt}</p>}
                  {selectedArtifact.figure.flowRequirements && <p className="flow-design-prompt">绘图要求 · {selectedArtifact.figure.flowRequirements}</p>}
                  {selectedArtifact.figure.flowConstraints && <p className="flow-design-prompt">硬性约束 · {selectedArtifact.figure.flowConstraints}</p>}
                  {design.checks?.length > 0 && <><strong>成图核对项</strong><ul>{design.checks.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
                  {design.concerns?.length > 0 && <><strong>待确认项</strong><ul>{design.concerns.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
                  {design.error && <p className="muted">{design.error}</p>}
                  {design.styleVersionId && <p className="muted">本版本复用了项目收藏的画风。</p>}
                  {design.referenceProfileId && (() => {
                    const profile = getFlowReferenceProfile(design.referenceProfileId);
                    return profile ? <div className="flow-gallery-result">
                      <img src={flowReferencePreviewData(profile.id)} alt="" />
                      <div><strong>构图参考 · {profile.label}</strong><p className="muted">{design.referenceProfile?.reason || profile.description}</p></div>
                    </div> : null;
                  })()}
                  {!design.references?.length && <p className="muted">本次未取得可用的论文插图。</p>}
                  {!!design.references?.length && <div className="flow-reference-grid">
                    {design.references.map((item, index) => <figure key={index}>
                      <img src={item.data} alt={item.label} loading="lazy" />
                      <figcaption>
                        {item.url || item.paperId ? <button type="button" className="quiet" onClick={() => {
                          const opening = item.url ? api.openSourceLink(item.url) : api.openPaper(item.paperId);
                          void opening.catch(failure => setError(errorText(failure)));
                        }}>{item.paper} · {item.label}</button> : <span>{item.paper} · {item.label}</span>}
                        <span>{item.used ? '已用于风格分析' : '已检索，未用于风格分析'}</span>
                      </figcaption>
                    </figure>)}
                  </div>}
                  {design.layout && <button type="button" className="quiet" aria-pressed={saved} disabled={generationLocked}
                    onClick={() => edit({ flowStyleVersion: saved ? '' : selectedArtifact.id })}>
                    {saved ? '取消复用此画风' : '在此项目中复用画风'}
                  </button>}
                </div>;
              })()}
              {selectedArtifact.figure.literature && <div className="figure-review">
                <strong>参考论文</strong>
                {selectedArtifact.figure.literature.error && <p>{selectedArtifact.figure.literature.error}</p>}
                {!selectedArtifact.figure.literature.papers.length && <p>本次没有取得可用论文。</p>}
                <ul>{selectedArtifact.figure.literature.papers.map(paper => <li key={paper.id}>
                  {paper.url ? <button type="button" className="quiet" onClick={() => void api.openSourceLink(paper.url).catch(failure => setError(errorText(failure)))}>{paper.title || paper.id}</button> : paper.title || paper.id}
                  {' · '}{paper.pages?.length || paper.sections?.length ? '已读取部分正文' : paper.abstract ? '摘要' : '题录'}
                </li>)}</ul>
              </div>}
              {selectedArtifact.figure.evidence && <div className="figure-review flow-evidence">
                <strong>逐节点原文核验 · {selectedArtifact.figure.evidence.verified}/{selectedArtifact.figure.evidence.total} 个节点已定位原文</strong>
                {selectedArtifact.figure.evidence.error && <p>{selectedArtifact.figure.evidence.error}</p>}
                <p className="muted">只核对引文是否出现在本次读取的论文摘要或正文片段；节点与论文方法的适用关系仍需人工判断。</p>
                <ol>{selectedArtifact.figure.evidence.nodes.map(node => <li key={node.key}>
                  <strong>{node.stage} · {node.label}</strong>
                  {!node.citations.length && <span> · 未找到节点原文</span>}
                  {node.citations.map((citation, index) => <div key={index}>
                    <span>{citation.verified ? '✓ 原文匹配' : `未通过：${citation.reason}`} · </span>
                    {citation.url ? <button type="button" className="quiet" onClick={() => void api.openSourceLink(citation.url).catch(failure => setError(errorText(failure)))}>{citation.title || citation.id}</button> : citation.title || citation.id}
                    {citation.location && ` · ${citation.location}`}
                    {citation.quote && <blockquote lang="en">{citation.quote}</blockquote>}
                  </div>)}
                </li>)}</ol>
              </div>}
              {selectedArtifact.figure.engine === 'hybrid' && <p className="muted">本机按原材料绘制。模型建议如下。</p>}
              {selectedArtifact.figure.suggestions && <div className="figure-review">
                {selectedArtifact.figure.suggestions.title && <p>建议标题：{selectedArtifact.figure.suggestions.title}</p>}
                {selectedArtifact.figure.suggestions.caption && <p>建议图注：{selectedArtifact.figure.suggestions.caption}</p>}
                <ul>{selectedArtifact.figure.suggestions.checks.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </div>}
              {selectedArtifact.figure.renderChecks && (() => {
                const report = selectedArtifact.figure.renderChecks;
                if (report.unavailable) return <p className="muted">版面检查未完成，请查看导出预览。</p>;
                return <p className="muted">版面检查：{report.width} × {report.height} px，{report.labels} 个文字标签。
                  {report.clipped ? ` ${report.clipped} 个疑似越界。` : ' 未发现文字越出画布。'}
                  {report.overlaps ? ` ${report.overlaps} 对文字疑似重叠。` : ''}
                  {report.smallLabels ? ` ${report.smallLabels} 个标签在缩略预览中偏小。` : ''}
                  {report.labelStrokeCollisions ? ` ${report.labelStrokeCollisions} 个标签压线。` : ''}
                  {report.edgeObstructions ? ` ${report.edgeObstructions} 条连线穿过其他节点。` : ''}
                  {report.nodeOverlaps ? ` ${report.nodeOverlaps} 对节点疑似重叠。` : ''}
                  {report.emptyPanels ? ` ${report.emptyPanels} 个详图横向留白偏多。` : ''}
                  {report.sampled ? ' 重叠检查覆盖前 250 个可见标签。' : ''}</p>;
              })()}
              {selectedArtifact.figure.model && <p className="muted">绘图模型：{selectedArtifact.figure.model}</p>}
              {selectedArtifact.figure.revision && <p>修改要求：{selectedArtifact.figure.revision}</p>}
              {selectedArtifact.figure.brief?.length > 0 && <BriefSummary record={selectedArtifact.figure.brief} />}
            </div>}

            {canvasTab === 'review' && selectedArtifact?.concept && <div className="studio-canvas-subpanel figure-saved-review">
              <p>请核对术语、关系和步骤是否与原始材料一致。</p>
              <p>{selectedArtifact.concept.prompt}</p>
              <BriefSummary record={selectedArtifact.concept.brief} />
              {selectedArtifact.concept.revision && <p>本版本的修改要求：{selectedArtifact.concept.revision}</p>}
            </div>}

            {canvasTab === 'revise' && !expanded && !current.archived && figureProject &&
              (selectedArtifact?.concept && settings?.hasGptImage ||
                selectedArtifact?.figure && selectedArtifact.figure.engine !== 'assembly' && settings?.figureAgent) &&
              <form className="studio-prompt figure-concept studio-revision-box" onSubmit={event => {
                event.preventDefault();
                if (revision.trim() && !generationLocked) generate(selectedArtifact.concept ? 'concept' :
                  selectedArtifact.figure.concept ? 'concept-vector' : 'figure', true, 'agent');
              }}>
                <h3><Icon name="compose" />基于当前版本迭代修改</h3>
                <label><span>输入本次修订指令（将另存为新版本，不覆盖当前作品）</span>
                  <textarea value={revision} onChange={event => setRevision(event.target.value)}
                    disabled={generationLocked} rows={3} maxLength={1500} placeholder="例如：保留整体布局，修改第二个节点的术语，补清箭头方向…" />
                </label>
                <div className="studio-composer-footer">
                  <span className="muted">{selectedArtifact.concept ? '连同当前图片发送至图像服务' : '连同当前 SVG 与原始材料发送至绘图 Agent'}</span>
                  <button className="primary icon-label" disabled={generationLocked || !revision.trim()}>
                    <Icon name="layers" />生成修订版
                  </button>
                </div>
              </form>}
          </div>
        </> : <div className="studio-first studio-glass">
          <div className="studio-first-hero">
            <span className="studio-stage-symbol"><Icon name="layers" /></span>
            <h2>{failedRead === 'project' || failedRead === 'initial' ? '无法读取制图项目' :
              activeId || !shelf ? '正在加载制图坊…' : '选择一种科研表达形式，开启新项目'}</h2>
            {(failedRead === 'project' || failedRead === 'initial') &&
              <button type="button" onClick={() => { setFailedRead(''); setError(''); setRetry(value => value + 1); }}>重试读取</button>}
            {!activeId && shelf && <p className="studio-first-lead">所有数据草稿、分块审核素材与作品历史版本均自动保存在本机项目中，随时可溯源或插回讨论。</p>}
          </div>

          {!activeId && shelf && <div className="studio-start-options studio-bento-grid">
            {Object.entries(creationTypes).map(([type, label]) => <button key={type} type="button"
              className="studio-start-option starter-bento-card"
              disabled={Boolean(busy)} onClick={() => void run('figure-start', () => startFigure(type))}>
              <span className="studio-start-top">
                <span className="studio-start-icon"><Icon name={creationIcons[type]} /></span>
                <span className="mini-tag">{creationFormats[type]}</span>
              </span>
              <span className="studio-start-copy">
                <strong>{label}</strong>
                <small>{type === 'slides' ? '结合研究讨论或提纲生成多页幻灯片，逐页预览并导出 PPTX。' : pictureTypes[type].description}</small>
              </span>
              <span className="studio-start-cta">立即创建 <Icon name="forward" /></span>
            </button>)}
          </div>}
        </div>}

        {(error || notice) && <p className={error ? 'error studio-feedback' : 'studio-feedback success'} role={error ? 'alert' : 'status'}>
          {error || notice}
        </p>}
      </div>
    </div>
  </section>;
}
