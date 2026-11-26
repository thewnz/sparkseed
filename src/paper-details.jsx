import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { PdfOutline, PdfPage, usePdf } from './pdf-reader.jsx';
import { PaperAnnotations } from './paper-annotations.jsx';
import { PaperNote } from './paper-note.jsx';
import { DeskTriage } from './desk-triage.jsx';
import { DeskUnderstand } from './desk-understand.jsx';
import { DeskQuiz } from './desk-quiz.jsx';
import { EvidenceConfirmation } from './evidence.jsx';
import './reader.css';
import './desk.css';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const colors = { highlight: '#f2c94c', underline: '#4a90d9', note: '#7bbf8a', question: '#b07bd9', bookmark: '#c9a227' };
const deckTabs = [
  ['triage', '速读', 'history'],
  ['understand', '理解', 'soul'],
  ['annotations', '批注', 'compose'],
  ['quiz', '自测', 'check'],
];

const readStatusMeta = {
  unread: { label: '未读', next: 'reading' },
  reading: { label: '在读', next: 'done' },
  done: { label: '已读', next: 'unread' },
};
const annotationKindLabel = { highlight: '划线', underline: '下划线', note: '批注', question: '疑问', bookmark: '书签' };

export default function PaperDetails(props) {
  return props.paper.status === 'linked'
    ? <LinkedPaper paper={props.paper} back={props.back} backLabel={props.backLabel || '文献库'} />
    : <ReadablePaper {...props} />;
}

function LinkedPaper({ paper, back, backLabel = '文献库' }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  function open(url) {
    if (url) void api.openSourceLink(url).catch(err => setNotice(errorText(err)));
  }
  async function retry() {
    if (busy || !paper.pdf_url) return;
    setBusy(true);
    setNotice('');
    try {
      const value = await api.importSearchResult({
        retry: true,
        result: {
          title: paper.title, doi: paper.doi, arxiv: paper.arxiv_id, year: paper.year, venue: paper.venue,
          abstract: paper.abstract, url: paper.source_url, pdfUrl: paper.pdf_url,
        },
      });
      setNotice(value.downloaded ? '已下载 PDF，正在切换沉浸研读视图…' : value.reason || '暂时无法下载 PDF。');
    } catch (err) { setNotice(errorText(err)); }
    finally { setBusy(false); }
  }
  return <article className="paper-reader linked-paper-page">
    <header className="desk-bar">
      <button className="desk-back icon-label" onClick={back}><Icon name="back" />{backLabel}</button>
      <div className="desk-title">
        <h1 title={paper.title}>{paper.title}</h1>
        {paper.author && <p>{paper.author}</p>}
      </div>
    </header>
    <div className="paper-page linked-paper">
      <div className="dossier-card">
        <p className="paper-linked-note"><Icon name="notice" />这篇论文目前只收录了题录信息，尚未缓存本地 PDF 文件。</p>
        <div className="linked-paper-meta">
          {[paper.year, paper.venue].filter(Boolean).map(item => <span className="mini-tag" key={item}>{item}</span>)}
          {paper.doi && <span className="mini-tag">DOI · {paper.doi}</span>}
          {paper.arxiv_id && <span className="mini-tag">arXiv · {paper.arxiv_id}</span>}
        </div>
        <div className="linked-paper-actions">
          {paper.source_url && <button className="primary icon-label" onClick={() => open(paper.source_url)}>
            <Icon name="external" />浏览器打开原文
          </button>}
          {paper.pdf_url && <button className="quiet icon-label" onClick={() => open(paper.pdf_url)}>
            <Icon name="document" />查看 PDF 链接
          </button>}
          {paper.pdf_url && <button className="quiet icon-label" disabled={busy} onClick={() => void retry()}>
            <Icon name="refresh" />{busy ? '正在下载…' : '下载到本地馆藏'}
          </button>}
        </div>
        {notice && <p className="success" role="status">{notice}</p>}
        {paper.abstract && <section className="linked-paper-section">
          <h2>论文摘要</h2>
          <p className="linked-paper-abstract">{paper.abstract}</p>
        </section>}
      </div>
    </div>
  </article>;
}

function ReadablePaper({ paper, back, use, initialPage = 1, backLabel = '文献库', evidenceClaim, saveEvidence, evidenceLink }) {
  const { pdf, outline, error: loadError } = usePdf(paper.id);
  const [page, setPage] = useState(Math.min(initialPage, paper.page_count || initialPage));
  const [zoom, setZoom] = useState(1);
  const [content, setContent] = useState(null);
  const [selection, setSelection] = useState(null);
  const [evidenceSelection, setEvidenceSelection] = useState(null);
  const [readingView, setReadingView] = useState(() => {
    const value = localStorage.getItem('sparkseed:paper-reading-view');
    return evidenceClaim || evidenceLink || !['original', 'parallel', 'translated'].includes(value) ? 'original' : value;
  });
  const [translationLayout, setTranslationLayout] = useState(() =>
    localStorage.getItem('sparkseed:paper-translation-layout') === 'stacked' ? 'stacked' : 'side');
  const [translationFirst, setTranslationFirst] = useState(() =>
    localStorage.getItem('sparkseed:paper-translation-first') === 'true');
  const [dockMode, setDockMode] = useState(() => {
    const savedMode = localStorage.getItem('sparkseed:desk-dock-mode');
    return ['right', 'bottom'].includes(savedMode) ? savedMode : 'right';
  });
  const [deckWidth, setDeckWidth] = useState(() => {
    const val = Number(localStorage.getItem('sparkseed:desk-deck-width'));
    return Number.isFinite(val) && val >= 320 && val <= 560 ? val : 392;
  });
  const deckDrag = useRef(null);
  const forceOriginal = Boolean(evidenceClaim || evidenceLink);
  const [saved, setSaved] = useState(null);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');
  const [deckTab, setDeckTab] = useState('triage');
  const [deckOpen, setDeckOpen] = useState(() => !evidenceClaim);
  const [annotationTab, setAnnotationTab] = useState('annotations');
  const [outlineOpen, setOutlineOpen] = useState(() => localStorage.getItem('sparkseed:desk-outline-pinned') === 'true');
  const [outlinePinned, setOutlinePinned] = useState(() => localStorage.getItem('sparkseed:desk-outline-pinned') === 'true');
  const [outlineTab, setOutlineTab] = useState('outline');
  const [readStatus, setReadStatus] = useState(paper.read_status || 'unread');
  const [favorite, setFavorite] = useState(Boolean(paper.favorite));
  const [translationFont, setTranslationFont] = useState(() => {
    const savedSize = Number(localStorage.getItem('sparkseed:desk-trans-font'));
    return Number.isFinite(savedSize) && savedSize >= 12 && savedSize <= 20 ? savedSize : 14;
  });
  const [copiedPara, setCopiedPara] = useState('');
  const [annotations, setAnnotations] = useState([]);
  const [activeAnnotation, setActiveAnnotation] = useState('');
  const [editingAnnotation, setEditingAnnotation] = useState('');
  const [glossaryVersion, setGlossaryVersion] = useState(0);
  const [glossaryFocus, setGlossaryFocus] = useState(0);
  const active = useRef(null);
  const mounted = useRef(true);
  const currentPageNumber = useRef(page);
  const translationPane = useRef(null);
  const ready = paper.status === 'ready' || paper.status === 'empty';
  const total = pdf?.numPages || paper.page_count || 0;
  const currentPage = content?.page === page ? content : null;

  useEffect(() => {
    let live = true;
    const load = () => void api.listAnnotations(paper.id).then(rows => { if (live) setAnnotations(rows); },
      err => { if (live) setError(errorText(err)); });
    load();
    const stop = api.onAnnotationsChanged(id => { if (id === paper.id) load(); });
    return () => { live = false; stop(); };
  }, [paper.id]);

  useEffect(() => {
    if (total > 0 && page > total) {
      currentPageNumber.current = total;
      setPage(total);
    }
  }, [page, total]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (active.current) {
        active.current.stopped = true;
        if (active.current.request) void api.stopPaperTranslation(active.current.request);
      }
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let current = true;
    void Promise.all([
      api.getPaperPage(paper.id, page),
      api.translatePaper({ id: paper.id, page, lookup: true }),
    ]).then(([row, text]) => {
      if (current) {
        setContent(row);
        setSaved(prev => (text || prev?.page !== page ? { page, text } : prev));
      }
    }, err => { if (current) setError(errorText(err)); });
    return () => { current = false; };
  }, [paper.id, page, ready, Boolean(progress)]);

  function go(number, annotationId = '') {
    const target = Math.max(1, Math.min(total, number));
    currentPageNumber.current = target;
    setPage(target);
    setSelection(null);
    setEvidenceSelection(null);
    setResult(null);
    translationPane.current?.scrollTo(0, 0);
    if (annotationId) {
      setActiveAnnotation(annotationId);
      setDeckTab('annotations');
      setDeckOpen(true);
    }
  }

  function attach(source, translationText = '') {
    const excerpt = (source || '').slice(0, 8000);
    use?.({ title: paper.title, page, excerpt, ...(translationText ? { translation: translationText.slice(0, 8000) } : {}) });
  }

  function stop() {
    const job = active.current;
    if (!job) return;
    job.stopped = true;
    if (job.request) void api.stopPaperTranslation(job.request);
    setProgress(previous => previous && { ...previous, stopping: true });
  }

  async function translate(scope, source) {
    if (active.current) return;
    const job = { stopped: false, request: '' };
    active.current = job;
    const range = scope === 'paper' ? total : 1;
    const first = scope === 'paper' ? 1 : page;
    setError('');
    setProgress({ scope, done: 0, total: range });
    if (scope === 'selection') setResult({ page, source, text: '' });
    try {
      for (let offset = 0; offset < range && !job.stopped; offset++) {
        const target = first + offset;
        job.request = crypto.randomUUID();
        const text = await api.translatePaper({ id: paper.id, page: target, selection: source, request: job.request });
        if (!mounted.current || job.stopped) break;
        if (scope === 'selection') {
          if (!text) throw new Error('该选区暂时无法翻译。');
          setResult(previous => previous?.page === target && previous.source === source ? { ...previous, text } : previous);
        } else if (text && target === currentPageNumber.current) {
          setSaved({ page: target, text });
        }
        setProgress({ scope, done: offset + 1, total: range });
      }
    } catch (err) {
      if (mounted.current && !job.stopped) setError(errorText(err));
    } finally {
      active.current = null;
      if (mounted.current) setProgress(null);
    }
  }

  async function reloadAnnotations() {
    const rows = await api.listAnnotations(paper.id);
    setAnnotations(rows);
  }

  async function createAnnotation(kind, payload = {}) {
    const quote = payload.quote || '';
    if (!quote && kind !== 'bookmark') return;
    try {
      const row = await api.saveAnnotation({
        paperId: paper.id, kind, page: payload.page || page, quote,
        prefix: payload.prefix || '', suffix: payload.suffix || '', rects: payload.rects || [],
        color: colors[kind] || '',
      });
      await reloadAnnotations();
      setActiveAnnotation(row.id);
      setDeckTab('annotations');
      setDeckOpen(true);
      if (kind === 'note' || kind === 'question') setEditingAnnotation(row.id);
    } catch (err) { setError(errorText(err)); }
  }

  async function saveAnnotation(row) {
    const savedRow = await api.saveAnnotation(row);
    await reloadAnnotations();
    return savedRow;
  }

  async function removeAnnotation(id) {
    await api.removeAnnotation(id);
    await reloadAnnotations();
    if (activeAnnotation === id) setActiveAnnotation('');
  }

  function openAnnotation(annotation) {
    go(annotation.page, annotation.id);
  }

  async function defineTerm(text) {
    if (!text?.trim()) return;
    setError('');
    try {
      await api.defineGlossary({ paperId: paper.id, page, term: text.trim().slice(0, 80) });
      setGlossaryVersion(previous => previous + 1);
      setGlossaryFocus(previous => previous + 1);
      setDeckTab('understand');
      setDeckOpen(true);
    } catch (err) { setError(errorText(err)); }
  }

  const translation = {
    saved, result, progress, onTranslate: translate, onStop: stop, onAttach: attach,
    currentText: currentPage?.text || '',
  };
  const pickedTranslation = result?.page === page ? result : null;
  const pageTranslation = saved?.page === page ? saved.text : '';

  function cycleDockPosition() {
    const next = dockMode === 'right' ? 'bottom' : 'right';
    setDockMode(next);
    localStorage.setItem('sparkseed:desk-dock-mode', next);
    setDeckOpen(true);
  }

  useEffect(() => {
    setReadStatus(paper.read_status || 'unread');
    setFavorite(Boolean(paper.favorite));
  }, [paper.id, paper.read_status, paper.favorite]);

  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setOutlineTab('search');
        setOutlineOpen(true);
        return;
      }
      if (inInput) return;
      if (event.key === 'ArrowLeft' && page > 1) { event.preventDefault(); go(page - 1); }
      else if (event.key === 'ArrowRight' && page < total) { event.preventDefault(); go(page + 1); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [page, total]);

  async function cycleReadStatus() {
    const next = (readStatusMeta[readStatus] || readStatusMeta.unread).next;
    setReadStatus(next);
    try { await api.setPaperReadStatus?.(paper.id, next); }
    catch (err) { setError(errorText(err)); }
  }

  async function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    try { await api.setPaperFavorite?.(paper.id, next); }
    catch (err) { setError(errorText(err)); }
  }

  function toggleOutlinePin() {
    const next = !outlinePinned;
    setOutlinePinned(next);
    if (next) setOutlineOpen(true);
    localStorage.setItem('sparkseed:desk-outline-pinned', String(next));
  }

  function changeTranslationFont(delta) {
    const next = Math.max(13, Math.min(20, translationFont + delta));
    setTranslationFont(next);
    localStorage.setItem('sparkseed:desk-trans-font', String(next));
  }

  async function copyParagraph(text, key) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPara(key);
      setTimeout(() => setCopiedPara(''), 1400);
    } catch { /* ignore */ }
  }

  async function appendToPaperNote(text) {
    if (!text?.trim()) return;
    try {
      const existing = await api.getPaperNote(paper.id);
      const block = `\n\n> **第 ${page} 页译文摘录**\n${text.trim()}`;
      const nextText = (existing?.text || '').trim() + block;
      const escaped = block.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
      await api.savePaperNote(paper.id, { text: nextText, html: (existing?.html || '') + escaped });
      setCopiedPara('note-' + page);
      setTimeout(() => setCopiedPara(''), 1600);
    } catch (err) { setError(errorText(err)); }
  }

  const progressPct = total > 0 ? Math.round((page / total) * 100) : 0;
  const pageBookmarked = annotations.some(a => a.page === page && a.kind === 'bookmark');
  const sortedMarks = [...annotations].sort((a, b) => a.page - b.page);
  const translatedParagraphs = (pickedTranslation?.text || (!pickedTranslation && pageTranslation) || '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  return <article className="paper-reader reader-workspace desk-reader"
    data-dock={deckOpen ? dockMode : 'closed'}
    data-outline-pinned={outlineOpen && outlinePinned ? 'true' : undefined}
    style={{ '--desk-deck-width': deckWidth + 'px', '--desk-trans-font': translationFont + 'px' }}>
    <header className="desk-bar">
      <button className="desk-back icon-label" type="button" onClick={back}><Icon name="back" />{backLabel}</button>

      <div className="desk-title">
        <h1 title={paper.title}>{paper.title}</h1>
        <p>{[paper.venue, paper.year].filter(Boolean).join(' · ') || paper.author}</p>
      </div>

      <div className="desk-status-actions">
        <button type="button" className="quiet desk-read-status" data-status={readStatus}
          title="点击切换阅读状态（未读 → 在读 → 已读）" onClick={() => void cycleReadStatus()}>
          {(readStatusMeta[readStatus] || readStatusMeta.unread).label}
        </button>
        <button type="button" className="quiet icon-only-btn desk-fav-btn" aria-pressed={favorite}
          title={favorite ? '取消收藏' : '收藏论文'} aria-label="收藏论文" onClick={() => void toggleFavorite()}>
          <Icon name="star" />
        </button>
      </div>

      <div className="desk-reading-views segmented-pills" role="group" aria-label="阅读显示模式">
        {[['original', '原文'], ['parallel', '双语对照'], ['translated', '译文']].map(([id, label]) =>
          <button key={id} type="button" className="quiet" aria-pressed={readingView === id} onClick={() => {
            setReadingView(id);
            if (!forceOriginal) localStorage.setItem('sparkseed:paper-reading-view', id);
          }}>{label}</button>)}
      </div>

      {readingView === 'parallel' && <div className="desk-parallel-controls">
        <button type="button" className="quiet desk-reading-layout-toggle" onClick={() => {
          const value = translationLayout === 'side' ? 'stacked' : 'side';
          setTranslationLayout(value);
          localStorage.setItem('sparkseed:paper-translation-layout', value);
        }}>{translationLayout === 'side' ? '上下排' : '左右排'}</button>
        <button type="button" className="quiet" onClick={() => {
          setTranslationFirst(!translationFirst);
          localStorage.setItem('sparkseed:paper-translation-first', String(!translationFirst));
        }}>换序</button>
      </div>}

      <div className="desk-nav">
        <button type="button" className="quiet" aria-label="上一页" disabled={page <= 1} onClick={() => go(page - 1)}><Icon name="back" /></button>
        <select aria-label="PDF 页码" value={page} onChange={event => go(Number(event.target.value))}>
          {Array.from({ length: total }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
        </select>
        <span>/ {total || '–'}</span>
        <button type="button" className="quiet" aria-label="下一页" disabled={page >= total} onClick={() => go(page + 1)}><Icon name="forward" /></button>
      </div>

      <div className="desk-zoom">
        <button type="button" className="quiet" aria-label="缩小" disabled={zoom <= .5} onClick={() => setZoom(Math.max(.5, zoom - .25))}><Icon name="minus" /></button>
        <button type="button" className="quiet" title="适应宽度 (100%)" onClick={() => setZoom(1)}>{zoom === 1 ? '适宽' : Math.round(zoom * 100) + '%'}</button>
        <button type="button" className="quiet" aria-label="放大" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + .25))}><Icon name="plus" /></button>
      </div>

      <div className="desk-bar-actions">
        <button type="button" className="quiet icon-label" aria-pressed={deckOpen}
          title={deckOpen ? '收起研读台' : '展开研读台'} onClick={() => setDeckOpen(v => !v)}>
          <Icon name="split" /><span>研读台</span>
        </button>
        {use && <button type="button" className="primary desk-attach icon-label" disabled={!pdf}
          onClick={() => attach(selection?.quote || currentPage?.text, '')}>
          <Icon name="excerpt" /><span>带入讨论</span>
        </button>}
        <button type="button" className="quiet icon-only-btn" title="用系统阅读器打开" aria-label="用系统阅读器打开"
          onClick={() => void api.openPaper(paper.id).catch(err => setError(errorText(err)))}>
          <Icon name="external" />
        </button>
      </div>
    </header>
    <div className="desk-progress-rail" aria-hidden="true">
      <div className="desk-progress-fill" style={{ width: `${progressPct}%` }} />
    </div>

    {(loadError || error || paper.status === 'failed') && <div className="desk-error">
      <p role="alert">{loadError || error || paper.error}</p>
      {paper.status === 'failed' && <button type="button" onClick={() => void api.retryPaper(paper.id).catch(err => setError(errorText(err)))}>重新解析</button>}
    </div>}

    <div className="desk-main-split">
      <div className="desk-stage">
        <aside className="desk-ribbon" aria-label="阅读导航">
          <button type="button" aria-pressed={outlineOpen && outlineTab === 'outline'} title="文档目录"
            onClick={() => { setOutlineTab('outline'); setOutlineOpen(!(outlineOpen && outlineTab === 'outline')); }}>
            <Icon name="list" /><span>目录</span>
          </button>
          <button type="button" aria-pressed={outlineOpen && outlineTab === 'marks'} title="书签与标注索引"
            onClick={() => { setOutlineTab('marks'); setOutlineOpen(!(outlineOpen && outlineTab === 'marks')); }}>
            <Icon name="location" /><span>标注{annotations.length > 0 ? ` ${annotations.length}` : ''}</span>
          </button>
          <button type="button" aria-pressed={outlineOpen && outlineTab === 'search'} title="正文搜索 (Ctrl+F)"
            onClick={() => { setOutlineTab('search'); setOutlineOpen(!(outlineOpen && outlineTab === 'search')); }}>
            <Icon name="search" /><span>搜索</span>
          </button>
          <span className="desk-ribbon-page">{progressPct}%</span>
        </aside>

        {outlineOpen && <aside className="desk-outline" data-pinned={outlinePinned || undefined} aria-label="文档导航">
          <div className="desk-outline-head">
            <div className="desk-subtabs" role="group">
              <button type="button" aria-pressed={outlineTab === 'outline'} onClick={() => setOutlineTab('outline')}>目录</button>
              <button type="button" aria-pressed={outlineTab === 'marks'} onClick={() => setOutlineTab('marks')}>标注</button>
              <button type="button" aria-pressed={outlineTab === 'search'} onClick={() => setOutlineTab('search')}>搜索</button>
            </div>
            <div className="inline-actions">
              <button type="button" className="quiet icon-only-btn" aria-pressed={outlinePinned}
                title={outlinePinned ? '取消固定侧栏' : '固定在左侧（不遮挡正文）'} aria-label="固定侧栏"
                onClick={toggleOutlinePin}>
                <Icon name="pin" />
              </button>
              <button type="button" className="quiet icon-only-btn" aria-label="关闭目录" onClick={() => { setOutlineOpen(false); setOutlinePinned(false); localStorage.setItem('sparkseed:desk-outline-pinned', 'false'); }}>
                <Icon name="close" />
              </button>
            </div>
          </div>
          {outlineTab === 'search' ? <>
            <form className="desk-search" onSubmit={async event => {
              event.preventDefault();
              try { setMatches(query.trim() ? await api.searchPaper(paper.id, query) : null); }
              catch (err) { setError(errorText(err)); }
            }}>
              <input value={query} aria-label="搜索正文" maxLength={160} placeholder="输入关键词搜索全篇…"
                onChange={event => { setQuery(event.target.value); if (!event.target.value.trim()) setMatches(null); }} />
              <button type="submit" aria-label="查找"><Icon name="search" /></button>
            </form>
            {matches && <div className="desk-matches">
              {matches.length ? matches.map(match => <button key={match.page} type="button" onClick={() => go(match.page)}>
                <strong>第 {match.page} 页</strong><span>{match.preview}</span>
              </button>) : <p className="muted">没有找到匹配的文字。</p>}
            </div>}
          </> : outlineTab === 'marks' ? (
            sortedMarks.length ? <div className="desk-marks-list">
              {sortedMarks.map(mark => <button key={mark.id} type="button" className="desk-mark-jump"
                data-active={mark.id === activeAnnotation || undefined}
                onClick={() => openAnnotation(mark)}>
                <span className="mark-jump-meta">
                  <i className="mark-dot" style={{ background: mark.color || colors[mark.kind] || 'var(--accent)' }} />
                  <strong>第 {mark.page} 页</strong>
                  <small>{annotationKindLabel[mark.kind] || mark.kind}</small>
                </span>
                {(mark.quote || mark.note) && <span className="mark-jump-text">{mark.note || mark.quote}</span>}
              </button>)}
            </div> : <p className="muted">还没有书签或划线标注。在 PDF 中划选文字或点击底部「加书签」即可记录。</p>
          ) : (outline.length ? <PdfOutline pdf={pdf} items={outline} onPage={go} />
            : <p className="muted">{pdf ? '原 PDF 未内嵌章节目录。' : '正在加载目录…'}</p>)}
        </aside>}

        <div className="desk-reading-panes" data-view={readingView} data-layout={translationLayout} data-translation-first={translationFirst}>
          <div className="desk-paper" hidden={readingView === 'translated'}>
            {!pdf && !loadError && <p className="muted pdf-loading-inline" role="status">正在渲染 PDF 原文…</p>}
            <PdfPage pdf={pdf} page={page} zoom={zoom} annotations={annotations} activeAnnotation={activeAnnotation} evidenceLink={evidenceLink}
              onSelect={setSelection} onCreate={createAnnotation} onAnnotationClick={openAnnotation}
              onDefineTerm={text => void defineTerm(text)}
              onTranslate={text => { if (readingView === 'original') setReadingView('parallel'); void translate('selection', text); }}
              onAttach={use ? attach : undefined}
              onBindEvidence={evidenceClaim ? setEvidenceSelection : undefined} />
            {evidenceClaim && !evidenceSelection && <p className="evidence-reader-hint">划选原文文字，在弹出工具条点击「绑定证据」</p>}
            {evidenceClaim && evidenceSelection && <EvidenceConfirmation claim={evidenceClaim} paper={paper}
              selection={evidenceSelection} cancel={() => setEvidenceSelection(null)} save={saveEvidence} />}
            <div className="desk-bottom-pill" role="toolbar" aria-label="快捷翻页与书签">
              <button type="button" className="quiet" disabled={page <= 1} onClick={() => go(page - 1)} title="上一页 (←)">
                <Icon name="back" />
              </button>
              <span className="pill-page-stat">{page} / {total || '–'} · {progressPct}%</span>
              <button type="button" className="quiet" disabled={page >= total} onClick={() => go(page + 1)} title="下一页 (→)">
                <Icon name="forward" />
              </button>
              <span className="pill-divider" aria-hidden="true" />
              <button type="button" className="quiet icon-label" aria-pressed={pageBookmarked}
                onClick={() => void createAnnotation('bookmark')} title="为当前页添加书签">
                <Icon name="location" /><span>{pageBookmarked ? '已加书签' : '书签'}</span>
              </button>
            </div>
          </div>

          {readingView !== 'original' && <section ref={translationPane} className="desk-translated-page" aria-label="当前页译文">
            <header className="translated-pane-head">
              <div>
                <h2>{pickedTranslation ? '划选片段译文' : '双语精排译文'}</h2>
                <span>PDF 第 {page} 页{total ? ` / 共 ${total} 页` : ''}</span>
              </div>
              <div className="inline-actions">
                <div className="desk-font-stepper" role="group" aria-label="译文字号">
                  <button type="button" className="quiet" onClick={() => changeTranslationFont(-1)} disabled={translationFont <= 13}>A-</button>
                  <button type="button" className="quiet" onClick={() => changeTranslationFont(1)} disabled={translationFont >= 20}>A+</button>
                </div>
                {translatedParagraphs.length > 0 && <button type="button" className="quiet icon-label"
                  onClick={() => void copyParagraph(translatedParagraphs.join('\n\n'), 'all')}>
                  <Icon name={copiedPara === 'all' ? 'check' : 'copy'} />{copiedPara === 'all' ? '已复制' : '复制译文'}
                </button>}
                <button type="button" className="primary" disabled={Boolean(progress) || !currentPage?.text}
                  onClick={() => { setResult(null); void translate('page'); }}>翻译本页</button>
                <button type="button" className="quiet" disabled={Boolean(progress) || !ready || !total}
                  onClick={() => { setResult(null); void translate('paper'); }}>翻译全文</button>
                {progress && <button type="button" className="quiet" disabled={progress.stopping} onClick={stop}>停止</button>}
                {pickedTranslation && <button type="button" className="quiet" onClick={() => setResult(null)}>返回整页译文</button>}
              </div>
            </header>
            {progress && <p role="status" className="active-thinking-bar" aria-live="polite">
              {progress.stopping ? '正在停止…' : `正在翻译 · ${progress.done} / ${progress.total} 页`}
            </p>}
            {pickedTranslation?.source && <blockquote>{pickedTranslation.source}</blockquote>}
            {translatedParagraphs.length > 0
              ? <div className="desk-bilingual-blocks">
                  {translatedParagraphs.map((para, idx) => <article key={idx} className="desk-bilingual-card">
                    <div className="bilingual-card-head">
                      <span className="para-index">¶{idx + 1}</span>
                      <div className="bilingual-card-actions">
                        <button type="button" className="quiet" onClick={() => void copyParagraph(para, `p-${idx}`)}>
                          {copiedPara === `p-${idx}` ? '已复制' : '复制'}
                        </button>
                        <button type="button" className="quiet" onClick={() => void appendToPaperNote(para)}>
                          {copiedPara === `note-${page}` ? '已存入' : '存入笔记'}
                        </button>
                      </div>
                    </div>
                    <p className="desk-translation-text">{para}</p>
                  </article>)}
                </div>
              : !progress && <div className="workbench-empty-card">
                  <Icon name="book" />
                  <strong>当前页尚未生成双语译文</strong>
                  <p>{currentPage?.text ? '点击上方「翻译本页」由默认 Agent 生成并缓存分段译文，或在左侧 PDF 划选任意句子局部翻译。' : '当前页没有可提取的文字层。'}</p>
                  {currentPage?.text && <button type="button" className="primary" onClick={() => { setResult(null); void translate('page'); }}>
                    立即翻译第 {page} 页
                  </button>}
                </div>}
          </section>}
        </div>
      </div>

      {deckOpen && dockMode === 'right' && <div className="desk-resizer" role="separator" aria-orientation="vertical"
        aria-label="调整右侧研读台宽度"
        onPointerDown={e => {
          if (e.button !== 0) return;
          deckDrag.current = { id: e.pointerId, x: e.clientX, initial: deckWidth };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          if (deckDrag.current?.id !== e.pointerId) return;
          const next = Math.max(320, Math.min(560, deckDrag.current.initial + (deckDrag.current.x - e.clientX)));
          setDeckWidth(next);
        }}
        onPointerUp={e => {
          if (deckDrag.current?.id !== e.pointerId) return;
          deckDrag.current = null;
          localStorage.setItem('sparkseed:desk-deck-width', String(deckWidth));
        }} />}

      <section className="desk-deck" data-open={deckOpen}>
        <div className="desk-deck-tabs" role="tablist" aria-label="研读台">
          {deckTabs.map(([id, label, icon]) => <button key={id} type="button" role="tab"
            aria-selected={deckTab === id} onClick={() => { setDeckTab(id); setDeckOpen(true); }}>
            <Icon name={icon} />
            <span>{label}</span>
            {id === 'annotations' && annotations.length > 0 && <small>{annotations.length}</small>}
          </button>)}
          <div className="desk-deck-controls">
            {deckOpen && <button type="button" className="quiet desk-layout-btn" title="切换右侧分栏 / 底部分栏"
              onClick={cycleDockPosition}>
              {dockMode === 'right' ? '移至底部' : '移至右侧'}
            </button>}
            <button type="button" className="desk-deck-toggle" onClick={() => setDeckOpen(!deckOpen)}>
              {deckOpen ? '收起' : '展开研读台'}
              <Icon name={deckOpen ? 'close' : 'plus'} />
            </button>
          </div>
        </div>

        <div className="desk-deck-body" hidden={!deckOpen}>
          {deckTab === 'triage' && <DeskTriage paperId={paper.id} onDecision={value => {
            if (value.decision === 'continue') { setDeckTab('understand'); setDeckOpen(true); }
          }} />}
          {deckTab === 'understand' && <DeskUnderstand paper={paper} page={page} translation={translation}
            onGo={go} glossaryVersion={glossaryVersion} focusGlossary={glossaryFocus} onClear={() => setResult(null)} />}
          {deckTab === 'annotations' && <div className="desk-annotations">
            <div className="desk-subtabs" role="group">
              <button type="button" aria-pressed={annotationTab === 'annotations'} onClick={() => setAnnotationTab('annotations')}>
                划线与批注 ({annotations.length})
              </button>
              <button type="button" aria-pressed={annotationTab === 'note'} onClick={() => setAnnotationTab('note')}>
                整篇读书笔记
              </button>
            </div>
            {annotationTab === 'annotations'
              ? <PaperAnnotations annotations={annotations} activeId={activeAnnotation}
                  editingId={editingAnnotation} setEditingId={setEditingAnnotation} onSave={saveAnnotation}
                  onRemove={removeAnnotation} onGo={(target, id) => go(target, id)} currentPage={page}
                  onBookmark={() => void createAnnotation('bookmark')} />
              : <PaperNote paperId={paper.id} annotations={annotations} />}
          </div>}
          {deckTab === 'quiz' && <DeskQuiz paperId={paper.id} onGo={go} />}
        </div>
      </section>
    </div>
  </article>;
}
