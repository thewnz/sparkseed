import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { cleanHtml } from './note-html.mjs';
import { ideaTitle } from './idea-text.mjs';
import { usePendingSave } from './use-pending-save.jsx';
import './notes-library.css';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' });
const sourceLabels = { manual: '独立笔记', idea: '讨论归档' };
const parseTags = value => [...new Set(value.split(/[,，\s]+/).map(tag => tag.trim()).filter(Boolean))].slice(0, 12);

const noteTemplates = [
  {
    id: 'paper-reading',
    label: '文献精读',
    title: '文献精读笔记',
    html: '<p><strong>1. 核心问题与动机</strong></p><p>本文试图解决什么具体问题？现有方法为何失效？</p><p><strong>2. 方法与关键假设</strong></p><ul><li>核心机制：</li><li>前提条件：</li></ul><p><strong>3. 实验结论与局限</strong></p><ul><li>主要基线对比：</li><li>可复现性与边界：</li></ul>',
  },
  {
    id: 'experiment',
    label: '实验记录',
    title: '实验记录与观察',
    html: '<p><strong>实验目标</strong></p><p>本轮需要验证的假设或对照条件：</p><p><strong>变量与设置</strong></p><ul><li>自变量 / 采样策略：</li><li>对照组：</li></ul><p><strong>结果观察与异常</strong></p><p></p>',
  },
  {
    id: 'meeting',
    label: '组会提纲',
    title: '组会讨论提纲',
    html: '<p><strong>一、本周进展</strong></p><ul><li></li></ul><p><strong>二、卡点与待讨论问题</strong></p><ul><li></li></ul><p><strong>三、下周计划</strong></p><ul><li></li></ul>',
  },
  {
    id: 'rebuttal',
    label: '审稿回复',
    title: '审稿意见逐条回复',
    html: '<p><strong>审稿人意见 #1</strong></p><p>原话摘录：</p><p><strong>回复要点与补充证据</strong></p><ul><li>核心回应：</li><li>对应修改位置 / 实验：</li></ul>',
  },
];

export function NotesLibrary({ ideas, openIdea, initialNoteId = '' }) {
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(initialNoteId || '');
  const [source, setSource] = useState('all');
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('updated');
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState('已保存');
  const [error, setError] = useState('');

  const editor = useRef(null);
  const selection = useRef(null);
  const version = useRef(0);
  const loadedId = useRef('');
  const creating = useRef(false);
  const autoSelected = useRef(Boolean(initialNoteId));

  const selected = notes.find(note => note.id === selectedId);
  const pending = usePendingSave(260, selectedId);
  const allTags = useMemo(() => [...new Set(notes.flatMap(note => note.tags || []))].sort(), [notes]);

  useEffect(() => {
    if (initialNoteId) {
      setSelectedId(initialNoteId);
    }
  }, [initialNoteId]);

  useEffect(() => {
    let live = true;
    let requestSeq = 0;
    function load() {
      const request = ++requestSeq;
      void api.listNotes().then(rows => {
        if (!live || requestSeq !== request) return;
        setNotes(rows);
        setSelectedId(previous => {
          if (rows.some(note => note.id === previous)) return previous;
          if (!autoSelected.current && rows.length > 0 && window.innerWidth > 900) {
            autoSelected.current = true;
            return rows[0].id;
          }
          return '';
        });
      }, err => { if (live && requestSeq !== request) setError(errorText(err)); });
    }
    load();
    const stop = api.onNotesChanged(load);
    return () => { live = false; stop(); };
  }, []);

  useEffect(() => {
    if (!selectedId) { loadedId.current = ''; return; }
    const note = notes.find(item => item.id === selectedId);
    if (!note || loadedId.current === selectedId) return;
    loadedId.current = selectedId;
    setTitle(note.title);
    setTags((note.tags || []).join(', '));
    setCharCount((note.text || '').trim().length);
    setSaveState('已保存');
    selection.current = null;
    if (editor.current) editor.current.replaceChildren(...cleanHtml(note.html).childNodes);
  }, [selectedId, notes]);

  const visible = useMemo(() => {
    const list = notes.filter(note => {
      if (source === 'pinned' && !note.pinned) return false;
      if (source !== 'all' && source !== 'pinned' && note.sourceType !== source) return false;
      if (tag && !(note.tags || []).includes(tag)) return false;
      const text = query.trim().toLowerCase();
      return !text || (note.title + '\n' + note.text).toLowerCase().includes(text);
    });
    if (sortBy === 'created') return [...list].sort((a, b) => new Date(b.created || b.updated) - new Date(a.created || a.updated));
    if (sortBy === 'length') return [...list].sort((a, b) => (b.text || '').length - (a.text || '').length);
    if (sortBy === 'title') return [...list].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-CN'));
    return list;
  }, [notes, source, tag, query, sortBy]);

  function queueSave(fields = {}) {
    const element = editor.current;
    if (!selected || !element) return;
    const current = ++version.current;
    const rawText = element.innerText;
    setCharCount(rawText.trim().length);
    const payload = {
      id: selected.id,
      title: (fields.title ?? title).trim() || '未命名笔记',
      html: element.innerHTML,
      text: rawText,
      tags: parseTags(fields.tags ?? tags),
      sourceType: selected.sourceType,
      sourceId: selected.sourceId,
    };
    setSaveState('正在保存…');
    pending.queue(async () => {
      try {
        const row = await api.saveNote({ ...payload, html: cleanHtml(payload.html).innerHTML });
        setNotes(previous => previous.map(note => note.id === row.id ? row : note));
        if (current !== version.current) return;
        setSaveState('已保存');
        setError('');
      } catch (err) {
        if (current !== version.current) return;
        setSaveState('保存失败');
        setError(errorText(err));
      }
    });
  }

  function select(id) {
    if (id === selectedId) return;
    void pending.flush();
    version.current += 1;
    loadedId.current = '';
    setSelectedId(id);
  }

  async function create() {
    if (creating.current) return;
    creating.current = true;
    await pending.flush();
    setError('');
    try {
      const row = await api.saveNote({ title: '未命名笔记', html: '', text: '' });
      setNotes(previous => previous.some(note => note.id === row.id) ? previous : [row, ...previous]);
      select(row.id);
      requestAnimationFrame(() => editor.current?.focus());
    } catch (err) { setError(errorText(err)); }
    finally { creating.current = false; }
  }

  async function remove() {
    if (!selected || !window.confirm('删除「' + selected.title + '」？此操作不可撤销。')) return;
    pending.cancel();
    try {
      await api.removeNote(selected.id);
      setSelectedId('');
      setError('');
    } catch (err) { setError(errorText(err)); }
  }

  async function pin() {
    if (!selected) return;
    try { await api.pinNote(selected.id, !selected.pinned); }
    catch (err) { setError(errorText(err)); }
  }

  function remember() {
    const current = document.getSelection();
    if (current?.rangeCount && editor.current?.contains(current.anchorNode) && editor.current.contains(current.focusNode)) {
      selection.current = current.getRangeAt(0).cloneRange();
    }
  }

  function format(command, value) {
    editor.current?.focus();
    if (selection.current && editor.current?.contains(selection.current.commonAncestorContainer)) {
      const current = document.getSelection();
      current.removeAllRanges();
      current.addRange(selection.current);
    }
    document.execCommand(command, false, value);
    remember();
    queueSave();
  }

  async function copyContent() {
    if (!selected) return;
    const text = `# ${title || selected.title}\n\n${editor.current?.innerText || selected.text || ''}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  function applyTemplate(tpl) {
    if (!selected || !editor.current) return;
    const cleaned = cleanHtml(tpl.html);
    editor.current.replaceChildren(...cleaned.childNodes);
    const nextTitle = !title.trim() || title === '未命名笔记' ? tpl.title : title;
    setTitle(nextTitle);
    queueSave({ title: nextTitle });
    editor.current.focus();
  }

  const parsedTagList = parseTags(tags);

  return <section className="notes-library-shell">
    <header className="notes-library-header academic-command-bar">
      <div className="page-heading">
        <div>
          <div className="academic-heading-row">
            <h1>笔记库</h1>
            {notes.length > 0 && <span className="academic-progress-pill">
              共 {notes.length} 篇 · 讨论归档 {notes.filter(n => n.sourceType === 'idea').length}
            </span>}
          </div>
          <p>对话中的记录本会自动归档于此，也可独立撰写文献精读、实验记录与备忘</p>
        </div>
      </div>

      <div className="inline-actions">
        {!focusMode && <button type="button" className="quiet desktop-side-toggle icon-label"
          onClick={() => setSideCollapsed(v => !v)}>
          <Icon name="sidebar" />{sideCollapsed ? '展开分类' : '收起分类'}
        </button>}
        {selected && <button type="button" className="quiet icon-label" aria-pressed={focusMode}
          onClick={() => setFocusMode(v => !v)}>
          <Icon name="focus" />{focusMode ? '退出专注' : '专注写作'}
        </button>}
        <button className="primary icon-label" type="button" onClick={() => void create()}>
          <Icon name="compose" />新建笔记
        </button>
      </div>
    </header>

    <div className="notes-library-body" data-editing={Boolean(selected) || undefined}
      data-side-collapsed={sideCollapsed || undefined} data-focus={focusMode || undefined}>
      {!sideCollapsed && !focusMode && <aside className="notes-side" aria-label="笔记筛选">
        <nav className="notes-nav" aria-label="笔记来源">
          <div className="paper-side-section-label">笔记分类</div>
          {[
            ['all', '全部笔记', 'library', notes.length],
            ['pinned', '置顶精选', 'pin', notes.filter(note => note.pinned).length],
            ['idea', '讨论归档', 'discussion', notes.filter(note => note.sourceType === 'idea').length],
            ['manual', '独立笔记', 'compose', notes.filter(note => note.sourceType === 'manual').length],
          ].map(([id, label, icon, count]) =>
            <button key={id} type="button" className="notes-nav-item" aria-current={source === id ? 'page' : undefined}
              onClick={() => setSource(id)}>
              <Icon name={icon} />
              <span>{label}</span>
              <span className="paper-nav-count">{count}</span>
            </button>)}
        </nav>

        <section className="notes-tag-filter">
          <div className="paper-side-section-label">主题标签</div>
          <div className="notes-tag-list">
            <button type="button" className="filter-pill" aria-pressed={!tag} onClick={() => setTag('')}>全部</button>
            {allTags.map(item => <button key={item} type="button" className="filter-pill" aria-pressed={tag === item}
              onClick={() => setTag(tag === item ? '' : item)}>#{item}</button>)}
            {!allTags.length && <p className="sidebar-empty">为笔记添加标签后可按主题聚合。</p>}
          </div>
        </section>
      </aside>}

      {!focusMode && <section className="notes-list-pane">
        {error && !selected && <p className="notes-list-error error" role="alert">{error}</p>}
        <div className="notes-list-toolbar">
          <label className="paper-filter search-input-box">
            <span className="visually-hidden">搜索笔记</span><Icon name="search" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="检索笔记标题或正文…" />
          </label>
          <select className="notes-sort-select" aria-label="笔记排序" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="updated">最近更新</option>
            <option value="created">创建时间</option>
            <option value="length">按字数</option>
            <option value="title">按标题</option>
          </select>
          <div className="compact-notes-filters" role="group" aria-label="笔记筛选">
            <select aria-label="按笔记来源筛选" value={source} onChange={event => setSource(event.target.value)}>
              <option value="all">全部来源</option>
              <option value="pinned">置顶精选</option>
              <option value="idea">讨论归档</option>
              <option value="manual">独立笔记</option>
            </select>
            {allTags.length > 0 && <select aria-label="按标签筛选" value={tag} onChange={event => setTag(event.target.value)}>
              <option value="">全部标签</option>
              {allTags.map(item => <option key={item} value={item}>#{item}</option>)}
            </select>}
          </div>
        </div>

        {visible.length ? <div className="notes-cards">
          {visible.map(note => <button type="button" className="note-card" key={note.id}
            data-active={note.id === selectedId || undefined} onClick={() => void select(note.id)}>
            <span className="note-card-head">
              <strong>{note.title || '未命名笔记'}</strong>
              {note.pinned ? <Icon name="pin" /> : null}
            </span>
            <span className="note-card-preview">{(note.text || '').trim().slice(0, 110) || '空白笔记，点击编辑…'}</span>
            <span className="note-card-meta">
              <span className="note-source" data-source={note.sourceType}>{sourceLabels[note.sourceType] || '笔记'}</span>
              <span>{dateFormat.format(new Date(note.updated))}</span>
              {(note.tags || []).slice(0, 2).map(item => <span className="note-tag" key={item}>#{item}</span>)}
            </span>
          </button>)}
        </div> : <div className="page-empty-state" role="status">
          <Icon name="document" />
          <h2>{notes.length ? '没有匹配的笔记' : '笔记库还是空的'}</h2>
          <p className="muted">{notes.length ? '换一个关键词、来源或标签。' : '在对话中打开右侧记录本，或点击右上角「新建笔记」。'}</p>
          {!notes.length && <button type="button" className="primary icon-label" onClick={() => void create()}>
            <Icon name="compose" />创建第一篇笔记
          </button>}
        </div>}
      </section>}

      {selected ? <section className="notes-editor-pane" aria-label="笔记编辑">
        <div className="notes-editor-head">
          <button type="button" className="quiet notes-mobile-back icon-label" onClick={() => select('')}>
            <Icon name="back" />列表
          </button>
          <input className="notes-title-input" value={title} maxLength={120} placeholder="输入手稿标题…"
            aria-label="笔记标题" onChange={event => { setTitle(event.target.value); queueSave({ title: event.target.value }); }} />
          <div className="notes-editor-actions">
            <button type="button" className="quiet icon-only-btn" title="复制整篇文本" aria-label="复制整篇文本"
              onClick={() => void copyContent()}>
              <Icon name={copied ? 'check' : 'copy'} />
            </button>
            <button type="button" className="quiet icon-only-btn" title={selected.pinned ? '取消置顶' : '置顶手稿'}
              aria-pressed={Boolean(selected.pinned)} onClick={() => void pin()}>
              <Icon name="pin" />
            </button>
            <button type="button" className="quiet icon-only-btn" title="删除笔记" aria-label="删除笔记"
              onClick={() => void remove()}>
              <Icon name="trash" />
            </button>
          </div>
        </div>

        <div className="notes-editor-meta">
          <span className="note-source" data-source={selected.sourceType}>{sourceLabels[selected.sourceType] || '手稿'}</span>
          {selected.sourceType === 'idea' && (() => {
            const idea = ideas.find(item => item.id === selected.sourceId);
            return <button type="button" className="quiet note-source-link icon-label" onClick={() => openIdea?.(selected.sourceId)}>
              <Icon name="discussion" />{idea ? ideaTitle(idea) : '查看来源讨论'}
            </button>;
          })()}
          <label className="notes-tags-input">
            <Icon name="tag" />
            <input value={tags} placeholder="输入标签，逗号或空格分隔…" maxLength={160}
              aria-label="笔记标签"
              onChange={event => { setTags(event.target.value); queueSave({ tags: event.target.value }); }} />
          </label>
          {parsedTagList.length > 0 && <div className="notes-active-tags" aria-hidden="true">
            {parsedTagList.slice(0, 4).map(t => <span key={t} className="mini-tag">#{t}</span>)}
          </div>}
        </div>

        <div className="notes-editor-toolbar rich-toolbar" role="group" aria-label="笔记格式">
          {['bold', 'italic', 'underline'].map((command, index) => <button type="button" className="quiet" key={command}
            aria-label={['加粗', '斜体', '下划线'][index]} title={['加粗', '斜体', '下划线'][index]}
            onMouseDown={event => event.preventDefault()} onClick={() => format(command)}>{['B', 'I', 'U'][index]}</button>)}
          <button type="button" className="quiet" aria-label="无序列表" title="无序列表"
            onMouseDown={event => event.preventDefault()} onClick={() => format('insertUnorderedList')}>
            <Icon name="list" />
          </button>
          <button type="button" className="quiet" aria-label="有序列表" title="编号列表"
            onMouseDown={event => event.preventDefault()} onClick={() => format('insertOrderedList')}>1.</button>
          <button type="button" className="quiet" aria-label="清除格式" title="清除选中文字格式"
            onMouseDown={event => event.preventDefault()} onClick={() => format('removeFormat')}>Tx</button>
          <select aria-label="字体" defaultValue="" onChange={event => format('fontName', event.target.value)}>
            <option value="" disabled>字体</option>
            <option>Microsoft YaHei</option>
            <option>Arial</option>
            <option>Georgia</option>
          </select>
          <select aria-label="字号" defaultValue="" onChange={event => format('fontSize', event.target.value)}>
            <option value="" disabled>字号</option>
            {[['2', 13], ['3', 16], ['4', 18], ['5', 24]].map(([id, size]) =>
              <option key={id} value={id}>{size}</option>)}
          </select>
          <input type="color" aria-label="字体颜色" defaultValue="#5451b0" onInput={event => format('foreColor', event.target.value)} />
        </div>

        {charCount === 0 && <div className="notes-template-bar" role="group" aria-label="插入结构化模板">
          <span className="muted"><Icon name="template" />套用模板：</span>
          {noteTemplates.map(tpl => <button key={tpl.id} type="button" className="filter-pill"
            onClick={() => applyTemplate(tpl)}>{tpl.label}</button>)}
        </div>}

        <div ref={editor} className="notes-editor" contentEditable suppressContentEditableWarning
          role="textbox" aria-label="笔记正文" aria-multiline="true"
          data-placeholder="在这里记录你的推导思路、实验观察或阅读摘要…"
          onInput={() => { remember(); queueSave(); }} onBlur={() => { void pending.flush(); }}
          onMouseUp={remember} onKeyUp={remember} onSelect={remember}
          onPaste={event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); }} />

        <footer className="notes-editor-footer" role="status">
          <span className="muted">{charCount} 字 · 约 {Math.max(1, Math.ceil(charCount / 400))} 分钟阅读 · 更新于 {dateFormat.format(new Date(selected.updated))}</span>
          <span>{copied ? '已复制 Markdown 到剪贴板' : saveState}</span>
        </footer>
        {error && <p className="error" role="alert">{error}</p>}
      </section> : notes.length > 0 && <section className="notes-editor-placeholder">
        <div className="workbench-empty-card">
          <Icon name="document" />
          <strong>从左侧选择一篇手稿开始编辑</strong>
          <p>或点击右上角「新建手稿」记录新的研究进展。</p>
        </div>
      </section>}
    </div>
  </section>;
}
