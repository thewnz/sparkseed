import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Icon } from './icons.jsx';
import { PaperSearch } from './paper-search.jsx';
import { PaperSidebar } from './paper-sidebar.jsx';
import { PaperDetailPanel } from './paper-detail-panel.jsx';
import { PaperRating } from './paper-rating.jsx';
import { PaperCompare } from './paper-compare.jsx';
import './paper-library.css';

const PaperDetails = lazy(() => import('./paper-details.jsx'));
const api = window.recorder;
const labels = { queued: '待解析', running: '提取中', ready: '已解析', empty: '无文字层', failed: '解析失败', linked: '仅题录' };
const readLabels = { unread: '未读', reading: '在读', done: '已读' };
const nextReadState = { unread: 'reading', reading: 'done', done: 'unread' };
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');

function matches(paper, query) {
  const text = query.trim().toLowerCase();
  return !text || [paper.title, paper.author, paper.venue, paper.filename, paper.doi, paper.abstract]
    .some(value => String(value || '').toLowerCase().includes(text));
}

function sorted(rows, sort) {
  const direction = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((first, second) => {
    const a = first[sort.key];
    const b = second[sort.key];
    if (a === b) return 0;
    if (a === null || a === undefined || a === '') return 1;
    if (b === null || b === undefined || b === '') return -1;
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;
    return String(a).localeCompare(String(b), 'zh-CN') * direction;
  });
}

function descendantIds(categories, rootId) {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function PaperLibrary({ use, close, target, evidenceClaim, saveEvidence, initialPaperId = '' }) {
  const [papers, setPapers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ratingConfig, setRatingConfig] = useState({ hasEasyScholar: false });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('mine');
  const [view, setView] = useState('list'); // 'list' | 'shelf' | 'table'
  const [filter, setFilter] = useState('all');
  const [quickKind, setQuickKind] = useState('all'); // 'all' | 'pdf' | 'linked' | 'high'
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'imported', dir: 'desc' });
  const [selectedId, setSelectedId] = useState(target?.id || initialPaperId || '');
  const [reading, setReading] = useState(target ? { id: target.id, page: target.page || 1 } : null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialPaperId) {
      setTab('mine');
      setSelectedId(initialPaperId);
    }
  }, [initialPaperId]);

  useEffect(() => {
    let active = true;
    let version = 0;
    async function reload() {
      const request = ++version;
      try {
        const [rows, list] = await Promise.all([api.listPapers(), api.listPaperCategories()]);
        if (active && request === version) { setPapers(rows); setCategories(list); }
      } catch (err) {
        if (active && request === version) setError(errorText(err));
      } finally {
        if (active && request === version) setLoading(false);
      }
    }
    const off = api.onPapersChanged(() => void reload());
    void reload();
    void api.getPaperRatingConfig().then(value => { if (active) setRatingConfig(value); }, () => {});
    return () => { active = false; off(); };
  }, []);

  const paper = papers.find(row => row.id === selectedId);
  const readingPaper = papers.find(row => row.id === reading?.id);

  const progressStats = useMemo(() => ({
    done: papers.filter(row => row.read_status === 'done').length,
    reading: papers.filter(row => row.read_status === 'reading').length,
    pdf: papers.filter(row => row.status !== 'linked').length,
  }), [papers]);

  const visible = useMemo(() => {
    let rows = papers.filter(row => matches(row, query));
    if (filter === 'unread') rows = rows.filter(row => row.read_status === 'unread' || !row.read_status);
    else if (filter === 'reading') rows = rows.filter(row => row.read_status === 'reading');
    else if (filter === 'done') rows = rows.filter(row => row.read_status === 'done');
    else if (filter === 'starred') rows = rows.filter(row => row.favorite);
    else if (filter === 'uncat') rows = rows.filter(row => !row.categoryIds?.length);
    else if (filter.startsWith('cat:')) {
      const ids = descendantIds(categories, filter.slice(4));
      rows = rows.filter(row => row.categoryIds?.some(id => ids.has(id)));
    }
    if (quickKind === 'pdf') rows = rows.filter(row => row.status !== 'linked');
    else if (quickKind === 'linked') rows = rows.filter(row => row.status === 'linked');
    else if (quickKind === 'high') rows = rows.filter(row => (row.rating || 0) >= 4);
    return sorted(rows, sort);
  }, [papers, categories, filter, quickKind, query, sort]);

  function changeSort(key) {
    setSort(previous => previous.key === key
      ? { key, dir: previous.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: ['title', 'venue'].includes(key) ? 'asc' : 'desc' });
  }

  function chooseFilter(next) {
    setFilter(next);
    setSelectedId('');
    setFiltersOpen(false);
  }

  function openReading(id) {
    setReading({ id, page: 1 });
  }

  function rate(id, value) {
    setPapers(previous => previous.map(row => row.id === id ? { ...row, rating: value } : row));
    void api.setPaperRating(id, value).catch(err => setError(errorText(err)));
  }

  function favorite(id, value) {
    setPapers(previous => previous.map(row => row.id === id ? { ...row, favorite: value ? 1 : 0 } : row));
    void api.setPaperFavorite(id, value).catch(err => setError(errorText(err)));
  }

  function readStatus(id, value) {
    setPapers(previous => previous.map(row => row.id === id ? { ...row, read_status: value } : row));
    void api.setPaperReadStatus(id, value).catch(err => setError(errorText(err)));
  }

  async function assign(paperId, categoryId, value) {
    try {
      await api.assignPaperCategory(paperId, categoryId, value);
      setPapers(previous => previous.map(row => {
        if (row.id !== paperId) return row;
        const ids = new Set(row.categoryIds || []);
        if (value) ids.add(categoryId); else ids.delete(categoryId);
        return { ...row, categoryIds: [...ids] };
      }));
    } catch (err) { setError(errorText(err)); }
  }

  async function saveCategory(input) {
    const list = await api.savePaperCategory(input);
    setCategories(list);
    return list;
  }

  async function removeCategory(id) {
    const list = await api.removePaperCategory(id);
    setCategories(list);
    setFilter(previous => previous === 'cat:' + id ? 'all' : previous);
    setPapers(previous => previous.map(row => ({ ...row, categoryIds: (row.categoryIds || []).filter(item => item !== id) })));
  }

  async function applySuggestions(paperId, names) {
    let list = categories;
    for (const name of names) {
      if (!list.some(row => row.name.toLowerCase() === name.toLowerCase())) list = await api.savePaperCategory({ name });
    }
    for (const name of names) {
      const category = list.find(row => row.name.toLowerCase() === name.toLowerCase());
      if (category) await api.assignPaperCategory(paperId, category.id, true);
    }
    setCategories(list);
    const rows = await api.listPapers();
    setPapers(rows);
  }

  async function journal(id, refresh) {
    const value = await api.getJournalRating(id, refresh);
    setPapers(previous => previous.map(row => row.id === id ? {
      ...row,
      journal_rating: JSON.stringify(value),
      journal_rating_at: value.fetchedAt,
    } : row));
    return value;
  }

  async function saveRatingConfig(input) {
    await api.savePaperRatingConfig(input);
    setRatingConfig(await api.getPaperRatingConfig());
  }

  async function importFiles() {
    setImporting(true);
    setNotice('');
    setError('');
    try {
      const report = await api.importPapers();
      if (report.added || report.duplicates) {
        setNotice([
          report.added > 0 && '已导入 ' + report.added + ' 份 PDF',
          report.duplicates > 0 && '跳过 ' + report.duplicates + ' 份重复文件',
        ].filter(Boolean).join('，'));
      }
      if (report.errors.length) setError(report.errors.join('\n'));
    } catch (err) { setError(errorText(err)); }
    finally { setImporting(false); }
  }

  function openFromSearch(id, downloaded) {
    setTab('mine');
    setSelectedId(id);
    if (downloaded) setReading({ id, page: 1 });
  }

  if (reading) {
    if (readingPaper) return <Suspense fallback={<p className="paper-page muted" role="status">正在打开沉浸研读台…</p>}>
      <PaperDetails key={readingPaper.id} paper={readingPaper} initialPage={reading.page}
        back={() => { setReading(null); if (target && close) close(); }}
        backLabel={target && close ? target.link ? '返回证据台' : '返回研究工作' : '文献库'} use={use}
        evidenceClaim={evidenceClaim} saveEvidence={saveEvidence} evidenceLink={target?.link} />
    </Suspense>;
    if (target && close) return <section className="paper-page">
      <button className="quiet icon-label" onClick={close}><Icon name="back" />返回研究工作</button>
      {loading ? <p className="muted" role="status">正在定位论文原文…</p>
        : <p className="error" role="alert">{error || '这篇论文已不在本地论文库中。'}</p>}
    </section>;
  }

  return <section className="paper-library-shell">
    <header className="library-shell-header academic-command-bar">
      <div className="page-heading">
        <div>
          <div className="academic-heading-row">
            <h1>文献库</h1>
            {papers.length > 0 && <span className="academic-progress-pill">
              已读 {progressStats.done} · 在读 {progressStats.reading} · PDF {progressStats.pdf}
            </span>}
          </div>
          <p>{evidenceClaim ? '请打开一篇本地 PDF，划选原文后绑定证据' : '多源检索、层级归档、矩阵对比与原译对照精读'}</p>
          {evidenceClaim && <p className="evidence-target"><Icon name="shield" />待证结论 · {evidenceClaim.text}</p>}
        </div>
      </div>

      <div className="library-tabs segmented-pills" role="tablist" aria-label="论文库视图">
        <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>
          <Icon name="library" />馆藏{papers.length > 0 && <em className="mini-badge">{papers.length}</em>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'search'} onClick={() => setTab('search')}>
          <Icon name="search" />多源检索
        </button>
        <button type="button" role="tab" aria-selected={tab === 'compare'} onClick={() => setTab('compare')}>
          <Icon name="split" />跨篇对比
        </button>
      </div>

      <div className="inline-actions">
        {close && <button className="quiet icon-label" onClick={close}><Icon name="back" />返回对话</button>}
        {tab === 'mine' && <>
          <div className="view-switch" role="group" aria-label="论文视图">
            <button type="button" className="quiet" aria-pressed={view === 'list'} aria-label="列表视图" title="卡片列表视图"
              onClick={() => setView('list')}><Icon name="list" /></button>
            <button type="button" className="quiet" aria-pressed={view === 'shelf'} aria-label="书架视图" title="双栏书架视图"
              onClick={() => setView('shelf')}><Icon name="grid" /></button>
            <button type="button" className="quiet" aria-pressed={view === 'table'} aria-label="表格视图" title="紧凑表格视图"
              onClick={() => setView('table')}><Icon name="library" /></button>
          </div>
          <button className="primary icon-label" disabled={importing} onClick={() => void importFiles()}>
            <Icon name="import" />{importing ? '正在导入…' : '导入 PDF'}
          </button>
        </>}
      </div>
    </header>

    {tab === 'search' ? <div className="paper-search-page"><PaperSearch openPaper={openFromSearch} existingPapers={papers} /></div>
      : tab === 'compare' ? <div className="paper-search-page"><PaperCompare papers={papers} onOpen={openReading} /></div>
      : <div className="paper-library-body" data-detail={Boolean(paper)} data-filters={filtersOpen} data-side-collapsed={sidebarCollapsed || undefined}>
          {!sidebarCollapsed && <PaperSidebar papers={papers} categories={categories} filter={filter} setFilter={chooseFilter}
            onSaveCategory={saveCategory} onRemoveCategory={removeCategory} onAssign={assign}
            ratingConfig={ratingConfig} onRatingConfig={saveRatingConfig} />}

          <section className="paper-library-center">
            <div className="paper-library-toolbar">
              <button type="button" className="quiet desktop-side-toggle icon-only-btn"
                title={sidebarCollapsed ? '展开分类栏' : '收起分类栏'} aria-label={sidebarCollapsed ? '展开分类栏' : '收起分类栏'}
                onClick={() => setSidebarCollapsed(v => !v)}>
                <Icon name="sidebar" />
              </button>
              <button type="button" className="quiet compact-paper-filter icon-label" aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(value => !value)}>
                <Icon name="filter" />{filtersOpen ? '收起分类' : '分类'}
              </button>

              <label className="paper-filter search-input-box">
                <span className="visually-hidden">筛选论文</span><Icon name="search" />
                <input value={query} onChange={event => setQuery(event.target.value)}
                  placeholder="按题名、作者、期刊/会议、摘要或 DOI 筛选…" />
              </label>

              <div className="chip-filter-bar paper-quick-chips" role="group" aria-label="馆藏类型快筛">
                {[
                  ['all', '全部'],
                  ['pdf', '含 PDF'],
                  ['linked', '仅题录'],
                  ['high', '≥4 星'],
                ].map(([id, label]) => <button key={id} type="button" className="filter-pill"
                  aria-pressed={quickKind === id} onClick={() => setQuickKind(id)}>{label}</button>)}
              </div>

              <label className="paper-sort-select">
                <span className="visually-hidden">排序</span>
                <select value={sort.key} onChange={event => changeSort(event.target.value)}>
                  <option value="imported">最近导入</option>
                  <option value="year">发表年份</option>
                  <option value="rating">个人评分</option>
                  <option value="title">题名字母</option>
                </select>
              </label>

              <span className="pill-counter">{visible.length} / {papers.length}</span>
            </div>

            {visible.length ? (view === 'table'
              ? <PaperTable rows={visible} categories={categories} sort={sort} changeSort={changeSort}
                  active={selectedId} onSelect={setSelectedId} onOpen={openReading}
                  onRate={rate} onFavorite={favorite} onReadStatus={readStatus} />
              : <div className={view === 'shelf' ? 'paper-rows paper-shelf-grid' : 'paper-rows'}>
                  {visible.map(item => <PaperRow key={item.id} paper={item} categories={categories} shelf={view === 'shelf'}
                    active={item.id === selectedId} onSelect={() => setSelectedId(current => current === item.id ? '' : item.id)}
                    onOpen={() => openReading(item.id)} onRate={rate} onFavorite={favorite} onReadStatus={readStatus} />)}
                </div>)
              : <div className="page-empty-state" role="status">
                  <Icon name="book" />
                  <h2>{loading ? '正在读取文献馆藏…' : papers.length ? '没有匹配的文献' : '你的学术馆藏还是空的'}</h2>
                  {!loading && <p className="muted">{papers.length
                    ? '换一个关键词、分类或清除顶部快筛。' : '导入本地 PDF，或在「多源检索」从 arXiv / Crossref / OpenAlex 一键收录。'}</p>}
                  {!loading && (!papers.length
                    ? <div className="inline-actions">
                        <button type="button" className="primary icon-label" onClick={() => void importFiles()}><Icon name="import" />导入本地 PDF</button>
                        <button type="button" className="quiet icon-label" onClick={() => setTab('search')}><Icon name="search" />去多源检索</button>
                      </div>
                    : <button type="button" className="quiet" onClick={() => { setQuery(''); setFilter('all'); setQuickKind('all'); }}>清除全部筛选</button>)}
                </div>}
          </section>

          {paper && <PaperDetailPanel paper={paper} categories={categories} use={use}
            hasEasyScholar={ratingConfig.hasEasyScholar} onClose={() => setSelectedId('')}
            onRead={openReading} onRate={rate} onFavorite={favorite} onReadStatus={readStatus}
            onAssign={assign} onApplySuggestions={applySuggestions} onJournal={journal}
            onReload={async () => setPapers(await api.listPapers())} />}
        </div>}

    {(notice || error) && <div className="paper-library-notices">
      {notice && <p className="success" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>}
  </section>;
}

function CategoryChips({ paper, categories }) {
  const rows = (paper.categoryIds || []).map(id => categories.find(category => category.id === id)).filter(Boolean);
  if (!rows.length) return null;
  return <span className="row-tags">{rows.map(category => <span className="category-chip" key={category.id}>
    <span className="color-dot" style={{ background: category.color || 'var(--edge)' }} />{category.name}
  </span>)}</span>;
}

function PaperRow({ paper, categories, shelf = false, active, onSelect, onOpen, onRate, onFavorite, onReadStatus }) {
  const readKey = paper.read_status || 'unread';
  return <div className={shelf ? 'paper-row paper-folio-card' : 'paper-row'} data-active={active || undefined} draggable
    onDragStart={event => event.dataTransfer.setData('text/paper-id', paper.id)}
    onClick={onSelect} onDoubleClick={onOpen}>
    <button type="button" className="row-favorite" aria-pressed={Boolean(paper.favorite)}
      aria-label={paper.favorite ? '取消星标' : '加星标'}
      onClick={event => { event.stopPropagation(); onFavorite(paper.id, !paper.favorite); }}>
      <Icon name="star" />
    </button>

    <div className="row-main">
      <div className="row-title-line">
        <button type="button" className="row-title" onClick={event => { event.stopPropagation(); onSelect(); }}>
          {paper.title}
        </button>
      </div>
      <p className="row-byline">{[paper.author, paper.year, paper.venue].filter(Boolean).join(' · ') || paper.filename || '未填写作者与出处'}</p>
      {shelf && paper.abstract && <p className="row-abstract-snippet">{paper.abstract}</p>}
      <div className="row-badges-line">
        <CategoryChips paper={paper} categories={categories} />
        {paper.page_count > 0 && <span className="mini-tag">{paper.page_count} 页</span>}
        {paper.arxiv_id && <span className="mini-tag">arXiv</span>}
      </div>
    </div>

    <div className="row-right">
      <div className="row-status-cluster">
        <button type="button" className="read-cycle-pill" data-read={readKey}
          title="点击切换阅读状态（未读 → 在读 → 已读）"
          onClick={event => { event.stopPropagation(); onReadStatus(paper.id, nextReadState[readKey] || 'reading'); }}>
          {readLabels[readKey] || '未读'}
        </button>
        <span className="row-status" data-status={paper.status}>{labels[paper.status]}</span>
      </div>
      <div className="row-actions-cluster">
        <PaperRating compact value={paper.rating || 0} onChange={value => onRate(paper.id, value)} />
        <button type="button" className="quiet row-read-cta icon-label" title="打开沉浸研读台"
          onClick={event => { event.stopPropagation(); onOpen(); }}>
          <Icon name="book" />研读
        </button>
      </div>
    </div>
  </div>;
}

function PaperTable({ rows, categories, sort, changeSort, active, onSelect, onOpen, onRate, onFavorite, onReadStatus }) {
  const header = (key, text) => <button type="button" className="quiet" onClick={() => changeSort(key)}>
    {text}{sort.key === key && (sort.dir === 'asc' ? ' ↑' : ' ↓')}
  </button>;
  return <div className="paper-table-wrap"><table className="paper-table">
    <thead><tr>
      <th aria-label="星标" />
      <th>{header('title', '论文题名')}</th>
      <th>{header('year', '年份')}</th>
      <th>{header('venue', '期刊 / 会议')}</th>
      <th>进度</th>
      <th>{header('rating', '评分')}</th>
      <th>状态</th>
      <th />
    </tr></thead>
    <tbody>{rows.map(paper => {
      const readKey = paper.read_status || 'unread';
      return <tr key={paper.id} data-active={paper.id === active || undefined}
        onClick={() => onSelect(paper.id)} onDoubleClick={() => onOpen(paper.id)}>
        <td><button type="button" className="row-favorite" aria-label={paper.favorite ? '取消星标' : '加星标'}
          aria-pressed={Boolean(paper.favorite)} onClick={event => { event.stopPropagation(); onFavorite(paper.id, !paper.favorite); }}>
          <Icon name="star" /></button></td>
        <td><span className="table-title">{paper.title}</span><CategoryChips paper={paper} categories={categories} /></td>
        <td>{paper.year || '—'}</td>
        <td className="table-venue">{paper.venue || '—'}</td>
        <td>
          <button type="button" className="read-cycle-pill" data-read={readKey}
            onClick={event => { event.stopPropagation(); onReadStatus(paper.id, nextReadState[readKey] || 'reading'); }}>
            {readLabels[readKey]}
          </button>
        </td>
        <td><PaperRating compact value={paper.rating || 0} onChange={value => onRate(paper.id, value)} /></td>
        <td><span className="row-status" data-status={paper.status}>{labels[paper.status]}</span></td>
        <td><button type="button" className="row-open" title="打开研读" onClick={event => { event.stopPropagation(); onOpen(paper.id); }}>
          <Icon name="book" /></button></td>
      </tr>;
    })}</tbody>
  </table></div>;
}
