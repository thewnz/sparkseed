import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { ideaDates, ideaDisplayStatus, ideaPreview, ideaTitle } from './idea-text.mjs';

const api = window.recorder;
const scopes = [
  ['all', '全部'],
  ['ideas', '想法'],
  ['papers', '文献'],
  ['notes', '笔记'],
  ['actions', '操作'],
];

export function CommandPalette({
  open,
  onClose,
  ideas = [],
  onOpenIdea,
  onOpenLibraryIdea,
  onNavigate,
  onQuickCapture,
  onVoiceCapture,
  onCycleTheme,
  onOpenSettings,
}) {
  const dialog = useRef(null);
  const input = useRef(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [papers, setPapers] = useState([]);
  const [notes, setNotes] = useState([]);

  useLayoutEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    setQuery('');
    setScope('all');
    setActiveIndex(0);
    requestAnimationFrame(() => input.current?.focus());
    return () => { if (element?.open) element.close(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void api.listPapers?.().then(rows => { if (live && Array.isArray(rows)) setPapers(rows); }, () => {});
    void api.listNotes?.().then(rows => { if (live && Array.isArray(rows)) setNotes(rows); }, () => {});
    return () => { live = false; };
  }, [open]);

  const commands = useMemo(() => {
    const term = query.trim().toLowerCase();
    const actions = [
      {
        id: 'act:new', scope: 'actions', group: '快捷操作', icon: 'compose',
        title: '新建对话', subtitle: '从一句想法、引文或问题开始追问', kbd: 'Ctrl+N',
        previewTitle: '新建研究对话',
        previewBody: '支持文字、语音听写、剪贴板引文与论文页码定位，随时发起新一轮追问或记录。',
        run: () => onNavigate('new'),
      },
      {
        id: 'act:capture', scope: 'actions', group: '快捷操作', icon: 'bolt',
        title: '快速记录（不离开当前页）', subtitle: '弹出轻量记录窗，保存后自动回到原位置', kbd: 'Ctrl+Shift+Space',
        previewTitle: '全局快速记录',
        previewBody: '适合阅读或思考过程中快速记录片段灵感、粘贴引文或语音速记。',
        run: () => onQuickCapture(false),
      },
      {
        id: 'act:voice', scope: 'actions', group: '快捷操作', icon: 'microphone',
        title: '语音快记（说完即存）', subtitle: '调用本机语音听写并自动保存为新想法',
        previewTitle: '语音速记',
        previewBody: '通过 Windows 本机语音识别转写并直接保存，不打断当前工作流。',
        run: () => onVoiceCapture(),
      },
      {
        id: 'nav:library', scope: 'actions', group: '切换工作区', icon: 'constellation',
        title: '打开灵感库', subtitle: `卡片画廊、清单与关联星图 · 共 ${ideas.length} 条`,
        previewTitle: '灵感库',
        previewBody: '按可用度、重要性和研究价值评估想法，支持画廊、列表和关系星图三种视图。',
        run: () => onNavigate('library'),
      },
      {
        id: 'nav:papers', scope: 'actions', group: '切换工作区', icon: 'book',
        title: '打开文献库', subtitle: `本地 PDF、多源检索与跨篇对比 · 共 ${papers.length} 篇`,
        previewTitle: '文献库',
        previewBody: '管理本地 PDF 与题录，支持原译对照精读、划词批注、引文追踪和跨篇矩阵对比。',
        run: () => onNavigate('papers'),
      },
      {
        id: 'nav:notes', scope: 'actions', group: '切换工作区', icon: 'document',
        title: '打开笔记库', subtitle: `结构化研究笔记与讨论归档 · 共 ${notes.length} 篇`,
        previewTitle: '笔记库',
        previewBody: '汇总讨论中的随手记与独立撰写的研究手稿，支持专注写作模式与学术模板。',
        run: () => onNavigate('notes'),
      },
      {
        id: 'nav:tasks', scope: 'actions', group: '切换工作区', icon: 'queue',
        title: '打开任务队列', subtitle: '查看文献初查、深查与整理进度',
        previewTitle: '研究任务队列',
        previewBody: '追踪后台文献查证、跨轮整理任务及待确认的查证问题。',
        run: () => onNavigate('tasks'),
      },
      {
        id: 'nav:studio', scope: 'actions', group: '切换工作区', icon: 'layers',
        title: '打开科研制图', subtitle: '数据图、流程图、概念图与演示文稿',
        previewTitle: '科研制图工作台',
        previewBody: '支持本地数据出图、分步审核流程图、概念示意图及汇报 PPTX 制作。',
        run: () => onNavigate('studio'),
      },
      {
        id: 'act:theme', scope: 'actions', group: '外观与设置', icon: 'appearance',
        title: '切换界面主题', subtitle: '在浅色、纸张、石墨、纯黑之间切换',
        previewTitle: '外观主题切换',
        previewBody: '即时切换 4 套低疲劳主题配色，保持内容与草稿状态不变。',
        run: () => onCycleTheme(),
      },
      {
        id: 'set:agents', scope: 'actions', group: '外观与设置', icon: 'agent',
        title: 'Agent 与模型设置', subtitle: '管理本机 CLI 与兼容 API 连接',
        previewTitle: 'Agent 接入管理',
        previewBody: '配置 Codex、Claude Code、DeepSeek、OpenAI 等兼容接口。',
        run: () => onOpenSettings('agents'),
      },
      {
        id: 'set:memory', scope: 'actions', group: '外观与设置', icon: 'memory',
        title: '管理研究记忆', subtitle: '长期研究背景（Memory）与行为准则（Soul）',
        previewTitle: '研究记忆与准则',
        previewBody: '集中管理长期研究方向卡片与 Agent 协作规则，支持溯源与撤回。',
        run: () => onOpenSettings('research'),
      },
      {
        id: 'nav:guide', scope: 'actions', group: '外观与设置', icon: 'guide',
        title: '查看使用指南', subtitle: '分步功能演示与工作流说明',
        previewTitle: '使用指南',
        previewBody: '包含所有核心模块的交互式演示与操作说明。',
        run: () => onNavigate('guide'),
      },
    ];

    const ideaItems = ideas.map(item => {
      const state = ideaDisplayStatus(item);
      return {
        id: 'idea:' + item.id,
        scope: 'ideas',
        group: '想法与对话',
        icon: item.pinned_at ? 'pin' : 'discussion',
        title: ideaTitle(item),
        subtitle: ideaPreview(item) || item.paper || '点击进入对话',
        badge: state.label,
        previewTitle: ideaTitle(item),
        previewMeta: [ideaDates.format(new Date(item.created)), item.paper, `${item.discussion?.length || 0} 轮`].filter(Boolean).join(' · '),
        previewBody: item.analysis?.abstract || item.body || ideaPreview(item) || '暂无详细正文',
        run: () => onOpenIdea(item.id),
        secondary: () => onOpenLibraryIdea(item.id),
      };
    });

    const paperItems = papers.map(paper => ({
      id: 'paper:' + paper.id,
      scope: 'papers',
      group: '文献库',
      icon: 'book',
      title: paper.title,
      subtitle: [paper.author, paper.year, paper.venue].filter(Boolean).join(' · ') || '打开文献详情',
      badge: paper.status === 'linked' ? '题录' : 'PDF',
      previewTitle: paper.title,
      previewMeta: [paper.author, paper.year, paper.venue, paper.doi].filter(Boolean).join(' · '),
      previewBody: paper.abstract || '该文献暂未收录摘要，点击即可进入文献详情或研读台。',
      run: () => onNavigate('papers', paper.id),
    }));

    const noteItems = notes.map(note => ({
      id: 'note:' + note.id,
      scope: 'notes',
      group: '笔记库',
      icon: 'document',
      title: note.title || '未命名笔记',
      subtitle: (note.text || '').slice(0, 72) || '空白笔记',
      badge: note.sourceType === 'idea' ? '讨论归档' : '笔记',
      previewTitle: note.title || '未命名笔记',
      previewMeta: (note.tags || []).map(t => `#${t}`).join(' ') || '无标签',
      previewBody: (note.text || '').slice(0, 420) || '空白笔记',
      run: () => onNavigate('notes', note.id),
    }));

    const scopedPool = scope === 'ideas' ? ideaItems
      : scope === 'papers' ? paperItems
        : scope === 'notes' ? noteItems
          : scope === 'actions' ? actions
            : term ? [...ideaItems, ...paperItems, ...noteItems, ...actions]
              : [...actions.slice(0, 8), ...ideaItems.slice(0, 5), ...actions.slice(8)];

    if (!term) return scopedPool.slice(0, 28);
    return scopedPool.filter(item =>
      (item.title + ' ' + item.subtitle + ' ' + item.group + ' ' + (item.previewMeta || '')).toLowerCase().includes(term)
    ).slice(0, 32);
  }, [query, scope, ideas, papers, notes, onNavigate, onQuickCapture, onVoiceCapture, onCycleTheme, onOpenSettings, onOpenIdea, onOpenLibraryIdea]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, scope]);

  if (!open) return null;

  const grouped = [];
  for (const item of commands) {
    const last = grouped.at(-1);
    if (!last || last.group !== item.group) grouped.push({ group: item.group, items: [item] });
    else last.items.push(item);
  }

  const activeItem = commands[activeIndex] || commands[0];

  function execute(item) {
    if (!item) return;
    onClose();
    item.run();
  }

  function cycleScope() {
    const idx = scopes.findIndex(([id]) => id === scope);
    setScope(scopes[(idx + 1) % scopes.length][0]);
  }

  let flatCursor = -1;

  return <dialog ref={dialog} className="command-palette-dialog" aria-label="全局检索与命令面板"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
    <div className="command-palette-shell" onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key === 'Tab') { event.preventDefault(); cycleScope(); return; }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(current => commands.length ? (current + 1) % commands.length : 0);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(current => commands.length ? (current - 1 + commands.length) % commands.length : 0);
      } else if (event.key === 'Enter' && activeItem) {
        event.preventDefault();
        execute(activeItem);
      }
    }}>
      <header className="command-palette-search">
        <Icon name="search" />
        <input ref={input} type="search" value={query} maxLength={160}
          placeholder="搜索想法、论文、笔记，或输入命令…"
          aria-label="搜索想法、论文、笔记或命令"
          onChange={event => setQuery(event.target.value)} />
        <kbd>ESC</kbd>
      </header>

      <div className="command-palette-scopes" role="tablist" aria-label="检索范围">
        {scopes.map(([id, label]) => <button key={id} type="button" role="tab"
          aria-selected={scope === id} className="filter-pill"
          onClick={() => { setScope(id); input.current?.focus(); }}>{label}</button>)}
      </div>

      <div className="command-palette-body">
        <div className="command-palette-list" role="listbox" aria-label="检索与命令结果">
          {grouped.length ? grouped.map(section => <div className="command-palette-group" key={section.group}>
            <div className="command-palette-group-label">{section.group}</div>
            {section.items.map(item => {
              flatCursor += 1;
              const index = flatCursor;
              const selected = index === activeIndex;
              return <button key={item.id} type="button" role="option" aria-selected={selected}
                className="command-palette-item" data-selected={selected}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => execute(item)}>
                <span className="command-item-icon"><Icon name={item.icon} /></span>
                <span className="command-item-body">
                  <strong>{item.title}</strong>
                  {item.subtitle && <small>{item.subtitle}</small>}
                </span>
                {item.badge && <span className="command-item-badge">{item.badge}</span>}
                {item.kbd && <kbd>{item.kbd}</kbd>}
              </button>;
            })}
          </div>) : <div className="command-palette-empty">
            <Icon name="search" />
            <p>没有匹配的条目或命令</p>
          </div>}
        </div>

        <aside className="command-palette-preview" aria-label="条目预览">
          {activeItem ? <>
            <div className="command-preview-head">
              <span className="command-preview-group">{activeItem.group}</span>
              {activeItem.badge && <span className="command-item-badge">{activeItem.badge}</span>}
            </div>
            <h3>{activeItem.previewTitle || activeItem.title}</h3>
            {activeItem.previewMeta && <p className="command-preview-meta">{activeItem.previewMeta}</p>}
            <p className="command-preview-body">{activeItem.previewBody || activeItem.subtitle}</p>
            <div className="command-preview-actions">
              <button type="button" className="primary icon-label" onClick={() => execute(activeItem)}>
                打开 <Icon name="forward" />
              </button>
              {activeItem.secondary && <button type="button" className="quiet icon-label" onClick={() => {
                onClose();
                activeItem.secondary();
              }}>
                <Icon name="constellation" />在灵感库查看
              </button>}
            </div>
          </> : <p className="muted">选择左侧条目可在此预览详情。</p>}
        </aside>
      </div>

      <footer className="command-palette-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span><kbd>Tab</kbd> 切换范围</span>
        <span><kbd>Enter</kbd> 执行</span>
        <span><kbd>Ctrl+K</kbd> 随时唤起</span>
      </footer>
    </div>
  </dialog>;
}
