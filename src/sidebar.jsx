import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { IdeaRecordActions } from './idea-record-actions.jsx';
import { ideaDates, ideaDisplayStatus, ideaPreview, ideaTitle } from './idea-text.mjs';
import { ideaUsability } from './idea-map.mjs';
import { normalizeSidebarWidth, sidebarSize } from '../desktop/window-layout.mjs';

const narrowDrawerMedia = '(max-width: 960px)';

export function WorkspaceBrand({ compact = false }) {
  return <div className="brand-lockup" data-compact={compact || undefined}>
    <span className="brand-mark"><img src={import.meta.env.BASE_URL + 'brand-mark.png'} alt="" /></span>
    <span className="brand-name">
      <strong>Sparkseed</strong>
      <span>火种</span>
    </span>
  </div>;
}

export function SidebarResizer({ saved, onSave }) {
  const [width, setWidth] = useState(() => normalizeSidebarWidth(saved));
  const handle = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    if (Number.isFinite(saved)) setWidth(normalizeSidebarWidth(saved));
  }, [saved]);

  useEffect(() => {
    const host = handle.current?.closest('.workspace') || handle.current?.parentElement;
    host?.style.setProperty('--session-rail-width', width + 'px');
  }, [width]);

  function finish(event, commit) {
    if (drag.current?.id !== event.pointerId) return;
    const { initial, current } = drag.current;
    drag.current = null;
    const host = handle.current?.closest('.workspace') || handle.current?.parentElement;
    host?.removeAttribute('data-sidebar-resizing');
    if (commit) onSave(current);
    else setWidth(initial);
  }

  return <button ref={handle} type="button" className="sidebar-resizer" role="separator" aria-label="调整会话栏宽度"
    aria-orientation="vertical" aria-valuemin={sidebarSize.min} aria-valuemax={sidebarSize.max} aria-valuenow={width}
    onPointerDown={event => {
      if (event.button !== 0) return;
      drag.current = { id: event.pointerId, x: event.clientX, initial: width, current: width };
      const host = event.currentTarget.closest('.workspace') || event.currentTarget.parentElement;
      if (host) host.dataset.sidebarResizing = '';
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (current?.id !== event.pointerId) return;
      current.current = normalizeSidebarWidth(current.initial + event.clientX - current.x);
      setWidth(current.current);
    }}
    onPointerUp={event => finish(event, true)}
    onLostPointerCapture={event => finish(event, false)}
    onPointerCancel={event => finish(event, false)}
    onDoubleClick={() => { setWidth(sidebarSize.initial); onSave(sidebarSize.initial); }}
    onKeyDown={event => {
      const choices = { ArrowLeft: width - 12, ArrowRight: width + 12, Home: sidebarSize.min, End: sidebarSize.max };
      if (!Object.hasOwn(choices, event.key)) return;
      event.preventDefault();
      const next = normalizeSidebarWidth(choices[event.key]);
      setWidth(next);
      onSave(next);
    }} />;
}

export function SessionRail({
  ideas = [],
  active,
  mode,
  open,
  onToggle,
  openNew,
  openDiscussion,
  savedWidth,
  onSaveWidth,
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [narrow, setNarrow] = useState(() => matchMedia(narrowDrawerMedia).matches);

  useEffect(() => {
    const media = matchMedia(narrowDrawerMedia);
    const sync = () => setNarrow(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = ideas.filter(item => {
      const state = ideaDisplayStatus(item);
      if (filter === 'pinned' && !item.pinned_at) return false;
      if (filter === 'waiting' && state.key !== 'waiting') return false;
      if (filter === 'running' && !['queued', 'running'].includes(state.key)) return false;
      if (!term) return true;
      return [ideaTitle(item), ideaPreview(item), item.body, item.paper].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
    if (sortBy === 'score') {
      return [...list].sort((a, b) => (ideaUsability(b) || 0) - (ideaUsability(a) || 0));
    }
    if (sortBy === 'waiting') {
      const rank = row => (ideaDisplayStatus(row).key === 'waiting' ? 0 : 1);
      return [...list].sort((a, b) => rank(a) - rank(b));
    }
    return list;
  }, [ideas, query, filter, sortBy]);

  const pinned = filtered.filter(item => item.pinned_at);
  const regular = filtered.filter(item => !item.pinned_at);

  function selectIdea(id) {
    openDiscussion(id);
    if (narrow) onToggle(false);
  }

  function renderSession(row) {
    const selected = mode === 'inbox' && active === row.id;
    const state = ideaDisplayStatus(row);
    const preview = ideaPreview(row);

    return <div className="session-card-wrap" key={row.id} data-selected={selected || undefined}>
      <button type="button" className="session-card inbox-item" title={ideaTitle(row)}
        aria-current={selected ? 'page' : undefined}
        onClick={() => selectIdea(row.id)}>
        <span className="session-card-top">
          <span className="session-status-dot" data-status={state.key} aria-hidden="true" />
          <strong className="session-card-title">{ideaTitle(row)}</strong>
        </span>
        {preview && <span className="session-card-snippet">{preview}</span>}
        <span className="session-card-meta">
          <time dateTime={row.created}>{ideaDates.format(new Date(row.created))}</time>
          <span className="history-status" data-status={state.key}>{state.label}</span>
        </span>
      </button>
      <IdeaRecordActions idea={row} />
    </div>;
  }

  if (!open) return null;

  return <>
    {narrow && <button type="button" className="session-rail-backdrop" tabIndex={-1} aria-label="收起会话列表"
      onClick={() => onToggle(false)} />}
    <aside className="session-rail" id="discussion-history" data-narrow={narrow || undefined} aria-label="对话记录">
      <header className="session-rail-head">
        <div className="session-rail-title">
          <strong>对话记录</strong>
          <span className="pill-counter">{ideas.length}</span>
        </div>
        <div className="inline-actions">
          <button type="button" className="primary session-new-btn icon-label" onClick={() => {
            openNew();
            if (narrow) onToggle(false);
          }}>
            <Icon name="plus" />新建
          </button>
          <button type="button" className="quiet icon-only-btn" title="收起侧栏 (Ctrl+/)" aria-label="收起侧栏"
            onClick={() => onToggle(false)}>
            <Icon name="sidebar" />
          </button>
        </div>
      </header>

      <div className="session-rail-controls">
        <label className="search-input-box">
          <Icon name="search" />
          <input type="search" value={query} maxLength={120} placeholder="筛选对话或论文…"
            aria-label="筛选对话" onChange={event => setQuery(event.target.value)} />
        </label>
        <div className="session-filter-row">
          <div className="chip-filter-bar" role="group" aria-label="状态筛选">
            {[
              ['all', '全部'],
              ['pinned', '置顶'],
              ['waiting', '待答'],
              ['running', '进行中'],
            ].map(([id, label]) => <button key={id} type="button" className="filter-pill"
              aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
          </div>
          <select className="session-sort-select" aria-label="排序方式" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="recent">最新</option>
            <option value="score">高分</option>
            <option value="waiting">待答优先</option>
          </select>
        </div>
      </div>

      <nav className="session-stream inbox" id="discussion-list" aria-label="讨论列表">
        {pinned.length > 0 && <div className="session-group">
          <div className="session-group-heading"><Icon name="pin" />置顶 · {pinned.length}</div>
          {pinned.map(renderSession)}
        </div>}
        {regular.length > 0 && <div className="session-group">
          {pinned.length > 0 && <div className="session-group-heading">全部 · {regular.length}</div>}
          {regular.map(renderSession)}
        </div>}
        {!filtered.length && <div className="session-empty">
          <Icon name="discussion" />
          <p>{ideas.length ? '没有匹配的对话' : '还没有研究记录'}</p>
          {ideas.length > 0 && (query || filter !== 'all') && <button type="button" className="quiet"
            onClick={() => { setQuery(''); setFilter('all'); }}>重置筛选</button>}
        </div>}
      </nav>
      {!narrow && <SidebarResizer saved={savedWidth} onSave={onSaveWidth} />}
    </aside>
  </>;
}

export function Sidebar({
  ideas = [],
  mode,
  counts = {},
  openDiscussion,
  openLibrary,
  openPapers,
  openNew,
  openSettings,
  quickCapture,
  openTasks,
  openStudio,
  openNotes,
  openGuide,
}) {
  const waitingCount = ideas.filter(row => {
    const last = row.discussion?.at(-1);
    return ['queued', 'running'].includes(row.status) || Boolean(last?.question && !last.answer);
  }).length;

  const primaryItems = [
    {
      id: 'dialogue',
      active: mode === 'inbox' || mode === 'new',
      icon: 'socratic',
      label: '对话',
      title: '研究对话与追问',
      dot: waitingCount > 0,
      onClick: () => {
        if (ideas.length && mode !== 'inbox') openDiscussion(ideas[0].id);
        else openNew();
      },
    },
    {
      id: 'library',
      active: mode === 'library',
      icon: 'constellation',
      label: '灵感库',
      title: '灵感库 · 卡片与关系星图',
      onClick: openLibrary,
    },
    {
      id: 'papers',
      active: mode === 'papers',
      icon: 'book',
      label: '文献',
      title: '文献库 · 检索、阅读与对比',
      onClick: openPapers,
    },
    {
      id: 'notes',
      active: mode === 'notes',
      icon: 'document',
      label: '笔记',
      title: '笔记库 · 研究笔记与归档',
      onClick: openNotes,
    },
    {
      id: 'tasks',
      active: mode === 'tasks',
      icon: 'queue',
      label: '任务',
      title: '后台任务 · 文献查证与整理队列',
      dot: counts.attention > 0,
      onClick: openTasks,
    },
    {
      id: 'studio',
      active: mode === 'studio',
      icon: 'layers',
      label: '制图',
      title: '科研制图 · 数据图、流程图与演示文稿',
      onClick: openStudio,
    },
  ];

  return <aside className="app-dock sidebar" aria-label="主导航">
    <button type="button" className="dock-compose-cta new" aria-label="新讨论" title="新建对话 (Ctrl+N)"
      aria-current={mode === 'new' ? 'page' : undefined} onClick={openNew}>
      <Icon name="compose" />
      <span>新建</span>
    </button>

    <nav className="dock-primary-nav sidebar-nav" aria-label="工作区模块">
      {primaryItems.map(item => <button key={item.id} type="button"
        className={`dock-item nav-entry ${item.id}-link`}
        aria-label={item.title} title={item.title}
        aria-current={item.active ? 'page' : undefined}
        onClick={item.onClick}>
        <span className="dock-icon-frame">
          <Icon name={item.icon} />
          {item.dot && <em className="dock-status-dot" aria-hidden="true" />}
        </span>
        <span className="dock-label sidebar-label">{item.label}</span>
      </button>)}
    </nav>

    <footer className="dock-utility-nav sidebar-footer" aria-label="工具与设置">
      <button type="button" className="dock-item nav-entry capture-link" aria-label="快速记录"
        title="快速记录 (Ctrl+Shift+Space)" aria-current={mode === 'capture' ? 'page' : undefined}
        onClick={() => quickCapture(false)}>
        <span className="dock-icon-frame"><Icon name="bolt" /></span>
        <span className="dock-label sidebar-label">快记</span>
      </button>
      <button type="button" className="dock-item nav-entry" aria-label="用户指南" title="使用指南与功能演示"
        aria-current={mode === 'guide' ? 'page' : undefined} onClick={openGuide}>
        <span className="dock-icon-frame"><Icon name="guide" /></span>
        <span className="dock-label sidebar-label">指南</span>
      </button>
      <button type="button" className="dock-item nav-entry" aria-label="偏好设置" title="偏好设置与模型接入"
        aria-current={mode === 'settings' ? 'page' : undefined} onClick={openSettings}>
        <span className="dock-icon-frame"><Icon name="preferences" /></span>
        <span className="dock-label sidebar-label">设置</span>
      </button>
    </footer>
  </aside>;
}
