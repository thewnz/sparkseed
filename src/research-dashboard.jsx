import { useEffect, useMemo, useRef, useState } from 'react';
import { ideaDates, ideaTitle } from './idea-text.mjs';
import { workKinds, workStages, workStates } from './research-work.jsx';
import { workStageGroup, workStageLabel } from '../desktop/work-stage.mjs';
import { mandateLabel, policyNoticeText } from './work-labels.mjs';
import { Icon } from './icons.jsx';
import { ResearchTaskDelete } from './research-task-delete.jsx';

const groups = [
  { id: 'attention', label: '待你处理', empty: '当前没有需要你拍板或确认的研究任务。' },
  { id: 'active', label: '运行与队列', empty: '当前没有排队或正在执行的研究任务。' },
  { id: 'ready', label: '已完成报告', empty: '完成的文献查证与关联报告会归档在这里。' },
  { id: 'all', label: '全部任务', empty: '还没有创建任何研究任务。在思辨中发起查证即可。' },
];

const stageOrder = ['plan', 'search', 'read', 'review'];
const groupOf = row => workStageGroup(row.workStage);
const stageText = row => workStageLabel(row.workStage) || workStates[row.status] || row.status;

function JobPipelineTrack({ job }) {
  if (job.kind === 'synthesis') {
    const done = job.status === 'ready';
    return <div className="job-pipeline-mini">
      <span className="pipeline-step" data-state={done ? 'done' : 'active'}>跨轮摘要整理</span>
      <span className="pipeline-step" data-state={done ? 'done' : ''}>互补关联发掘</span>
      <span className="pipeline-step" data-state={done ? 'done' : ''}>记忆提议</span>
    </div>;
  }
  const currentIdx = stageOrder.indexOf(job.stage);
  const doneAll = job.status === 'ready';
  return <div className="job-pipeline-mini" aria-label="任务阶段管线">
    {stageOrder.map((key, idx) => {
      const state = doneAll || (currentIdx > idx) ? 'done' : currentIdx === idx ? 'active' : '';
      return <span key={key} className="pipeline-step" data-state={state}>{workStages[key]}</span>;
    })}
  </div>;
}

export function ResearchDashboard({ ideas, entries, openJob }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('attention');
  const [kindFilter, setKindFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [health, setHealth] = useState(null);
  const filters = useRef(null);

  useEffect(() => {
    let live = true;
    void window.recorder.workHealth?.().then(value => { if (live) setHealth(value); }, () => {});
    return () => { live = false; };
  }, []);

  const problems = health?.effects?.filter(row => row.state === 'error') || [];

  useEffect(() => {
    let live = true;
    let version = 0;
    async function reload() {
      const request = ++version;
      try {
        const jobs = await window.recorder.researchDashboard();
        if (live && version === request) { setRows(jobs); setError(''); }
      } catch (err) {
        if (live && version === request) setError(err.message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
      }
    }
    const unsubscribe = window.recorder.onResearchWorkChanged(() => void reload());
    void reload();
    return () => { live = false; unsubscribe(); };
  }, []);

  const byId = useMemo(() => new Map(ideas.map(idea => [idea.id, idea])), [ideas]);
  const available = useMemo(() => rows?.filter(row => byId.has(row.idea_id)) || null, [rows, byId]);

  const counts = useMemo(() => ({
    attention: available?.filter(row => groupOf(row) === 'attention').length || 0,
    active: available?.filter(row => groupOf(row) === 'active').length || 0,
    ready: available?.filter(row => groupOf(row) === 'ready').length || 0,
    all: available?.length || 0,
  }), [available]);

  // Auto-switch from 'attention' to 'active' or 'ready' on initial load if attention is empty
  const autoSwitched = useRef(false);
  useEffect(() => {
    if (!autoSwitched.current && available) {
      autoSwitched.current = true;
      if (counts.attention === 0 && counts.active > 0) setFilter('active');
      else if (counts.attention === 0 && counts.ready > 0) setFilter('ready');
    }
  }, [available, counts]);

  const group = groups.find(item => item.id === filter) || groups[0];
  const visible = useMemo(() => {
    if (!available) return null;
    const term = query.trim().toLowerCase();
    return available.filter(row => {
      if (filter !== 'all' && groupOf(row) !== filter) return false;
      if (kindFilter !== 'all' && row.kind !== kindFilter) return false;
      if (!term) return true;
      const ideaText = ideaTitle(byId.get(row.idea_id));
      return (ideaText + ' ' + (row.question || '') + ' ' + (workKinds[row.kind] || '')).toLowerCase().includes(term);
    });
  }, [available, filter, kindFilter, query, byId]);

  return <section className="library-page research-dashboard mission-control-page">
    <header className="library-toolbar">
      <div className="page-heading">
        <div>
          <div className="academic-heading-row">
            <h1>多角色后台任务</h1>
            <span className="academic-progress-pill">
              待确认 {counts.attention} · 运行中 {counts.active} · 已完成 {counts.ready}
            </span>
            <span className={`academic-progress-pill ${problems.length ? 'error' : ''}`}>
              {problems.length ? `队列异常 (${problems.length})` : '守护正常'}
            </span>
          </div>
          <p>智能路由分配文献初查、深度查证与跨轮整理，关键节点暂停等待你拍板</p>
        </div>
      </div>
    </header>

    <div className="superagent-workers-strip" aria-label="多角色协同任务状态">
      {[
        { id: 'router', tone: 'cobalt', title: '调度路由 · 规划', meta: counts.attention ? `${counts.attention} 项待拍板` : '自动路由中', active: counts.active > 0 || counts.attention > 0 },
        { id: 'initial', tone: 'teal', title: '文献初查 · 检索', meta: `${available?.filter(r => r.kind === 'initial').length || 0} 项任务`, active: available?.some(r => r.kind === 'initial' && groupOf(r) === 'active') },
        { id: 'deep', tone: 'indigo', title: '深度查证 · 核验', meta: `${available?.filter(r => r.kind === 'deep').length || 0} 项任务`, active: available?.some(r => r.kind === 'deep' && groupOf(r) === 'active') },
        { id: 'synthesis', tone: 'emerald', title: '跨轮守护 · 整理', meta: problems.length ? `异常 ${problems.length}` : `${available?.filter(r => r.kind === 'synthesis').length || 0} 项整理`, active: !problems.length },
      ].map(worker => <button key={worker.id} type="button" className="superagent-worker-card"
        data-tone={worker.tone} data-active={worker.active || undefined}
        aria-pressed={kindFilter === worker.id}
        onClick={() => setKindFilter(worker.id === 'router' ? 'all' : (kindFilter === worker.id ? 'all' : worker.id))}>
        <span className="worker-card-head">
          <i className="worker-dot" aria-hidden="true" />
          <strong>{worker.title}</strong>
        </span>
        <small>{worker.meta}</small>
      </button>)}
    </div>

    <div className="dashboard-control-bar">
      <div className="library-views segmented-pills" role="group" aria-label="研究任务状态" ref={filters}>
        {groups.map(item => <button type="button" className="quiet" key={item.id} aria-pressed={filter === item.id}
          onClick={() => { setFilter(item.id); setNotice(''); }}>
          {item.label}
          {available && <span className="task-count">{counts[item.id]}</span>}
        </button>)}
      </div>

      <div className="chip-filter-bar" role="group" aria-label="按任务类型筛选">
        {[
          ['all', '全部类型'],
          ['initial', '文献初查'],
          ['deep', '文献深查'],
          ['synthesis', '研究整理'],
        ].map(([id, label]) => <button key={id} type="button" className="filter-pill"
          aria-pressed={kindFilter === id} onClick={() => setKindFilter(id)}>{label}</button>)}
      </div>

      <label className="search-input-box dashboard-search">
        <Icon name="search" />
        <input type="search" value={query} maxLength={120} placeholder="搜索关联想法或查证问题…"
          aria-label="搜索研究任务" onChange={event => setQuery(event.target.value)} />
      </label>
    </div>

    {error && <p className="error" role="alert">{error}</p>}
    {problems.length > 0 && <p className="error" role="alert">
      后台队列异常：{problems.map(row => row.kind + '（' + (row.error || '等待重试') + '）').join('；')}
    </p>}
    {notice && <p className="muted" role="status">{notice}</p>}
    {rows === null && !error && <p role="status" className="muted">正在扫描任务雷达…</p>}

    {visible?.length === 0 && <div className="page-empty-state">
      <Icon name="radar" />
      <h2>{filter === 'attention' ? '当前没有待处理事项' : filter === 'active' ? '当前没有运行中的任务' : '暂无匹配的研究任务'}</h2>
      <p className="muted">{group.empty}</p>
    </div>}

    <div className="dashboard-jobs-grid">
      {visible?.map(row => <article className="work-job dashboard-job" key={row.id} data-stage-group={groupOf(row)}>
        <header className="dashboard-job-head">
          <div className="dashboard-job-title-wrap">
            <span className="mini-tag accent">{workKinds[row.kind]}</span>
            <h3>{ideaTitle(byId.get(row.idea_id))}</h3>
          </div>
          <div className="dashboard-job-badges">
            {row.mandate && <span className="mini-tag">{mandateLabel(row.mandate)}</span>}
            <span className="status-pill" data-status={row.status}>{stageText(row)}</span>
          </div>
        </header>

        <JobPipelineTrack job={row} />

        {row.attention?.question && row.status === 'waiting' && <div className="job-attention-callout">
          <Icon name="notice" />
          <span>待你确认：{row.attention.question}</span>
        </div>}

        {row.policyNotice && <p className="muted work-policy-notice" role="status">{policyNoticeText(row.policyNotice)}</p>}
        {row.question && <p className="job-question-line"><strong>查证焦点：</strong>{row.question}</p>}

        {(row.summary || row.findings?.length > 0) && <details className="job-inline-preview">
          <summary>展开结果摘要</summary>
          {row.summary && <p>{row.summary}</p>}
          {row.findings?.length > 0 && <ul>
            {row.findings.slice(0, 4).map((item, idx) => <li key={idx}>{typeof item === 'string' ? item : item.claim || item.summary || item.title}</li>)}
          </ul>}
        </details>}

        <p className="muted dashboard-job-meta">
          {[
            entries.find(item => item.id === row.provider)?.label || row.provider || '未指定模型',
            row.paper_count !== null && row.paper_count !== undefined && `已检索 ${row.paper_count} 篇文献`,
          ].filter(Boolean).join(' · ')}
          {' · '}
          <time dateTime={row.created}>{ideaDates.format(new Date(row.created))}</time>
        </p>

        {row.error && <p className="error">{row.error}</p>}

        <footer className="inline-actions dashboard-job-actions">
          <button type="button" className={row.status === 'waiting' ? 'primary icon-label' : 'quiet icon-label'}
            onClick={() => openJob({ ideaId: row.idea_id, jobId: row.id })}>
            {row.status === 'waiting' ? '前往确认查证问题' : row.status === 'ready' ? '查看查证报告' : '打开对应思辨'}
            <Icon name="forward" />
          </button>
          <ResearchTaskDelete job={row} title={workKinds[row.kind] + ' · ' + (row.question || ideaTitle(byId.get(row.idea_id)))}
            onDeleted={() => {
              setNotice('研究任务已删除。');
              filters.current?.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
            }} />
        </footer>
      </article>)}
    </div>
  </section>;
}
