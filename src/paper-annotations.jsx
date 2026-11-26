import { useEffect, useMemo, useState } from 'react';
import { Icon } from './icons.jsx';

const labels = { highlight: '划线', underline: '下划线', note: '批注', question: '问题', bookmark: '书签' };
const filters = [
  ['all', '全部'],
  ['mark', '划线'],
  ['note', '批注'],
  ['question', '问题'],
  ['bookmark', '书签'],
];
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');

export function PaperAnnotations({
  annotations,
  activeId,
  editingId,
  setEditingId,
  onSave,
  onRemove,
  onGo,
  currentPage,
  onBookmark,
}) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const editing = annotations.find(annotation => annotation.id === editingId);

  useEffect(() => {
    if (editing) setDraft(editing.note || '');
  }, [editingId, editing?.note]);

  const counts = useMemo(() => ({
    all: annotations.length,
    mark: annotations.filter(a => ['highlight', 'underline'].includes(a.kind)).length,
    note: annotations.filter(a => a.kind === 'note').length,
    question: annotations.filter(a => a.kind === 'question').length,
    bookmark: annotations.filter(a => a.kind === 'bookmark').length,
  }), [annotations]);

  const visible = useMemo(() => annotations.filter(annotation => {
    if (filter === 'mark' && !['highlight', 'underline'].includes(annotation.kind)) return false;
    if (filter !== 'all' && filter !== 'mark' && annotation.kind !== filter) return false;
    const text = (annotation.quote + ' ' + annotation.note).toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  }), [annotations, filter, query]);

  async function save(annotation) {
    if (busy) return;
    setBusy(annotation.id);
    setError('');
    try {
      await onSave({ ...annotation, note: draft });
      setEditingId('');
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  async function remove(annotation) {
    if (busy) return;
    setBusy(annotation.id);
    setError('');
    try { await onRemove(annotation.id); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  async function copyQuote(annotation) {
    const text = [annotation.quote && `「${annotation.quote}」`, annotation.note, `（第 ${annotation.page} 页）`]
      .filter(Boolean).join(' ');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(annotation.id);
      setTimeout(() => setCopiedId(''), 1400);
    } catch { /* ignore */ }
  }

  async function copyAllAnnotations() {
    if (!visible.length) return;
    const lines = visible.map(a => {
      const head = `- **第 ${a.page} 页 · ${labels[a.kind] || a.kind}**`;
      const quote = a.quote ? `\n  > ${a.quote.replace(/\r?\n/g, ' ')}` : '';
      const note = a.note ? `\n  - 批注：${a.note}` : '';
      return head + quote + note;
    });
    try {
      await navigator.clipboard.writeText(lines.join('\n\n'));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1600);
    } catch { /* ignore */ }
  }

  return <section className="paper-annotations-panel" aria-label="批注">
    <div className="annotation-toolbar">
      <div className="chip-filter-bar annotation-filters" role="group" aria-label="批注类型">
        {filters.map(([id, label]) => <button key={id} type="button" className="filter-pill" aria-pressed={filter === id}
          onClick={() => setFilter(id)}>
          {label}{counts[id] > 0 && <small>{counts[id]}</small>}
        </button>)}
      </div>
      <div className="annotation-subbar">
        <label className="search-input-box annotation-search">
          <Icon name="search" />
          <input value={query} maxLength={80} onChange={event => setQuery(event.target.value)} placeholder="搜索原文摘录或批注…" />
        </label>
        <button type="button" className="quiet annotation-bookmark icon-label" disabled={!currentPage}
          onClick={() => onBookmark(currentPage)}>
          <Icon name="location" />书签 P.{currentPage || '–'}
        </button>
        {visible.length > 0 && <button type="button" className="quiet icon-label" title="复制全部可见批注为 Markdown"
          onClick={() => void copyAllAnnotations()}>
          <Icon name={copiedAll ? 'check' : 'copy'} />{copiedAll ? '已复制' : '导出'}
        </button>}
      </div>
    </div>

    {visible.length ? <div className="annotation-list">
      {visible.map(annotation => <article className="annotation-card" key={annotation.id}
        data-kind={annotation.kind} data-active={annotation.id === activeId || undefined}>
        <header className="annotation-card-head">
          <button type="button" className="annotation-jump" onClick={() => onGo(annotation.page, annotation.id)}>
            <span className="annotation-kind">{labels[annotation.kind] || annotation.kind}</span>
            <span>第 {annotation.page} 页</span>
          </button>
          <span className="annotation-actions">
            {(annotation.quote || annotation.note) && <button type="button" title="复制摘录"
              onClick={() => void copyQuote(annotation)}>
              <Icon name={copiedId === annotation.id ? 'check' : 'copy'} />
            </button>}
            <button type="button" title="编辑批注" onClick={() => setEditingId(annotation.id)}>
              <Icon name="compose" />
            </button>
            <button type="button" title="删除" disabled={busy === annotation.id} onClick={() => void remove(annotation)}>
              <Icon name="trash" />
            </button>
          </span>
        </header>

        {annotation.quote && <blockquote onClick={() => onGo(annotation.page, annotation.id)}>{annotation.quote}</blockquote>}

        {editing?.id === annotation.id
          ? <form className="annotation-edit" onSubmit={event => { event.preventDefault(); void save(annotation); }}>
              <textarea autoFocus rows={3} maxLength={6000} value={draft} placeholder="记录你的批注、质疑或推导…"
                onChange={event => setDraft(event.target.value)} />
              <div className="inline-actions">
                <button className="primary" disabled={busy === annotation.id}>{busy === annotation.id ? '正在保存…' : '保存'}</button>
                <button type="button" className="quiet" onClick={() => setEditingId('')}>取消</button>
              </div>
            </form>
          : annotation.note
            ? <p className="annotation-note" onClick={() => onGo(annotation.page, annotation.id)}>{annotation.note}</p>
            : <button type="button" className="annotation-add-note" onClick={() => setEditingId(annotation.id)}>
                + {annotation.kind === 'question' ? '补充具体疑问' : '添加阅读批注'}
              </button>}
      </article>)}
    </div> : <div className="workbench-empty-card annotation-empty">
      <Icon name="excerpt" />
      <strong>{annotations.length ? '没有匹配的批注' : '暂无划线与批注'}</strong>
      <p>{annotations.length ? '试试切换筛选类型或清空关键词。' : '在左侧 PDF 原文中划选句子，即可一键高亮、提问或写批注。'}</p>
    </div>}

    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
