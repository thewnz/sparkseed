import { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';
import { PaperRating } from './paper-rating.jsx';

const api = window.recorder;
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' });
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');

function flatten(categories, parentId = null, depth = 0) {
  return categories.filter(category => (category.parentId || null) === parentId)
    .flatMap(category => [{ ...category, depth }, ...flatten(categories, category.id, depth + 1)]);
}

export function PaperDetailPanel({
  paper,
  categories,
  use,
  onClose,
  onRead,
  onRate,
  onFavorite,
  onReadStatus,
  onAssign,
  onApplySuggestions,
  hasEasyScholar,
  onJournal,
  onReload,
}) {
  const [inspectorTab, setInspectorTab] = useState('overview'); // 'overview' | 'taxonomy' | 'network'
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [journal, setJournal] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [copiedDoi, setCopiedDoi] = useState(false);
  const [copiedCite, setCopiedCite] = useState('');
  const [network, setNetwork] = useState(null);
  const [networkTab, setNetworkTab] = useState('references');
  const [networkBusy, setNetworkBusy] = useState('');
  const [networkError, setNetworkError] = useState('');
  const [networkNotice, setNetworkNotice] = useState('');

  const assigned = new Set(paper.categoryIds || []);
  const rows = flatten(categories);

  useEffect(() => {
    setSuggestions([]);
    setError('');
    setExpanded(false);
    setCopiedDoi(false);
    setCopiedCite('');
    setNetwork(null);
    setNetworkTab('references');
    setNetworkBusy('');
    setNetworkError('');
    setNetworkNotice('');
    try { setJournal(paper.journal_rating ? JSON.parse(paper.journal_rating) : null); }
    catch { setJournal(null); }
  }, [paper.id, paper.journal_rating]);

  async function classify() {
    if (busy) return;
    setBusy('classify');
    setError('');
    try {
      const value = await api.classifyPaper(paper.id);
      setSuggestions(value.categories || []);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  async function applySuggestions() {
    if (busy) return;
    setBusy('apply');
    setError('');
    try {
      await onApplySuggestions(paper.id, suggestions);
      setSuggestions([]);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  async function queryJournal(refresh) {
    if (busy) return;
    setBusy('journal');
    setError('');
    try {
      const value = await onJournal(paper.id, refresh);
      if (value) setJournal(value);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  async function retryDownload() {
    if (busy) return;
    setBusy('retry');
    setError('');
    try {
      const value = await api.importSearchResult({
        retry: true,
        result: {
          title: paper.title, doi: paper.doi, arxiv: paper.arxiv_id, year: paper.year, venue: paper.venue,
          abstract: paper.abstract, url: paper.source_url, pdfUrl: paper.pdf_url,
        },
      });
      if (value.downloaded) onReload?.();
      else setError(value.reason || '暂时无法下载 PDF。');
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  async function openNetwork(refresh = false) {
    if (network && !refresh) return;
    setNetworkBusy('load');
    setNetworkError('');
    setNetworkNotice('');
    try {
      const value = await api.getPaperCitations(paper.id, { refresh, direction: networkTab });
      setNetwork(value);
      if (value.error) setNetworkError(value.error);
    } catch (err) { setNetworkError(errorText(err)); }
    finally { setNetworkBusy(''); }
  }

  useEffect(() => {
    if (inspectorTab === 'network' && !network && !networkBusy) {
      void openNetwork(false);
    }
  }, [inspectorTab, paper.id]);

  async function importCandidate(row) {
    if (networkBusy) return;
    setNetworkBusy(row.key);
    setNetworkError('');
    setNetworkNotice('');
    try {
      const value = await api.importSearchResult({
        result: {
          title: row.title, doi: row.doi, arxiv: row.arxiv, year: row.year, venue: row.venue,
          abstract: row.abstract, url: row.url, pdfUrl: row.pdfUrl,
          authors: row.author ? row.author.split(',').map(name => name.trim()).filter(Boolean) : [],
        },
      });
      setNetwork(previous => previous ? {
        ...previous,
        [networkTab]: previous[networkTab].map(item => item.key === row.key
          ? { ...item, inLibraryId: value.paperId } : item),
      } : previous);
      setNetworkNotice(value.downloaded ? '已收录并下载 PDF。' : value.reason || '已收录题录信息。');
      void onReload?.();
    } catch (err) { setNetworkError(errorText(err)); }
    finally { setNetworkBusy(''); }
  }

  const networkRows = network ? (network[networkTab] || []) : [];
  const networkMeta = network?.meta || {};
  const networkSource = networkTab === 'references' ? networkMeta.referenceSource : networkMeta.citationSource;
  const networkFetched = networkTab === 'references' ? networkMeta.referenceAt : networkMeta.citationAt;
  const networkMessage = networkTab === 'references' ? networkMeta.referenceError : networkMeta.citationError;

  function formatBibtex() {
    const firstAuthor = (paper.author || 'unknown').split(/[,，、;；]/)[0].trim().replace(/\s+/g, '') || 'ref';
    const key = `${firstAuthor}${paper.year || ''}`.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
    const fields = [
      paper.title && `  title={${paper.title}}`,
      paper.author && `  author={${paper.author}}`,
      paper.year && `  year={${paper.year}}`,
      paper.venue && `  journal={${paper.venue}}`,
      paper.doi && `  doi={${paper.doi}}`,
      paper.arxiv_id && `  eprint={${paper.arxiv_id}}`,
      paper.source_url && `  url={${paper.source_url}}`,
    ].filter(Boolean);
    return `@article{${key || 'paper'},\n${fields.join(',\n')}\n}`;
  }

  function formatStandardCitation() {
    const authors = paper.author || 'Unknown Author';
    const year = paper.year ? ` (${paper.year}).` : '.';
    const venue = paper.venue ? ` ${paper.venue}.` : '';
    const doi = paper.doi ? ` https://doi.org/${paper.doi}` : '';
    return `${authors}${year} ${paper.title}.${venue}${doi}`.trim();
  }

  async function copyCitation(kind) {
    const text = kind === 'bibtex' ? formatBibtex() : formatStandardCitation();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCite(kind);
      setTimeout(() => setCopiedCite(''), 1500);
    } catch { /* ignore */ }
  }

  return <aside className="paper-detail-panel" aria-label="论文详情">
    <header className="paper-detail-head">
      <div>
        <h2>{paper.title}</h2>
        <p>{[paper.author, paper.year, paper.venue].filter(Boolean).join(' · ') || '未填写作者与出处'}</p>
      </div>
      {onClose && <button type="button" className="quiet icon-only-btn" title="关闭详情" aria-label="关闭详情" onClick={onClose}>
        <Icon name="close" />
      </button>}
    </header>

    <div className="paper-detail-hero-bar">
      <div className="paper-detail-actions">
        <button className="primary icon-label" type="button" onClick={() => onRead(paper.id)}>
          <Icon name="book" />{paper.status === 'linked' ? '查看题录页' : '开始研读'}
        </button>
        <button className="quiet icon-label" type="button" title="复制 BibTeX 引文" onClick={() => void copyCitation('bibtex')}>
          <Icon name={copiedCite === 'bibtex' ? 'check' : 'bibtex'} />{copiedCite === 'bibtex' ? '已复制 BibTeX' : 'BibTeX'}
        </button>
        <button className="quiet icon-label" type="button" title="复制标准引文" onClick={() => void copyCitation('text')}>
          <Icon name={copiedCite === 'text' ? 'check' : 'copy'} />{copiedCite === 'text' ? '已复制引文' : '引文'}
        </button>
        {paper.source_url && <button className="quiet icon-label" type="button"
          onClick={() => void api.openSourceLink(paper.source_url).catch(err => setError(errorText(err)))}>
          <Icon name="external" />原文
        </button>}
        {paper.pdf_url && paper.status === 'linked' && <button className="quiet icon-label" type="button"
          disabled={Boolean(busy)} onClick={() => void retryDownload()}>
          <Icon name="refresh" />{busy === 'retry' ? '下载中…' : '下载 PDF'}
        </button>}
        {use && <button className="quiet icon-label" type="button" onClick={() => use({
          title: paper.title, page: 1, excerpt: paper.abstract || paper.title,
        })}>
          <Icon name="excerpt" />带入讨论
        </button>}
      </div>

      <div className="paper-detail-ratings">
        <PaperRating value={paper.rating || 0} onChange={value => onRate(paper.id, value)} />
        <button type="button" className="quiet favorite-button" aria-pressed={Boolean(paper.favorite)}
          aria-label={paper.favorite ? '取消星标' : '加星标'}
          onClick={() => onFavorite(paper.id, !paper.favorite)}>
          <Icon name="star" />{paper.favorite ? '已星标' : '星标'}
        </button>
        <label className="read-status">
          <span className="visually-hidden">阅读状态</span>
          <select value={paper.read_status || 'unread'} onChange={event => onReadStatus(paper.id, event.target.value)}>
            <option value="unread">未读</option>
            <option value="reading">在读</option>
            <option value="done">已读</option>
          </select>
        </label>
      </div>
    </div>

    <div className="inspector-subtabs" role="tablist" aria-label="论文详情分栏">
      <button type="button" role="tab" aria-selected={inspectorTab === 'overview'}
        onClick={() => setInspectorTab('overview')}>摘要与题录</button>
      <button type="button" role="tab" aria-selected={inspectorTab === 'taxonomy'}
        onClick={() => setInspectorTab('taxonomy')}>分类与分区</button>
      <button type="button" role="tab" aria-selected={inspectorTab === 'network'}
        onClick={() => setInspectorTab('network')}>引文脉络</button>
    </div>

    <div className="paper-detail-scroll">
      {paper.status === 'linked' && <p className="paper-linked-note">
        <Icon name="notice" />当前仅收录了题录信息，尚未缓存本地 PDF 文件。
      </p>}

      {inspectorTab === 'overview' && <>
        <section className="paper-detail-section">
          <div className="paper-detail-section-title">
            <h3>论文摘要</h3>
            {paper.abstract?.length > 260 && <button type="button" className="quiet"
              onClick={() => setExpanded(!expanded)}>{expanded ? '收起' : '展开全文'}</button>}
          </div>
          <p className={expanded ? 'paper-abstract expanded' : 'paper-abstract'}>
            {paper.abstract || '这篇论文还没有收录摘要。'}
          </p>
        </section>

        <section className="paper-detail-section">
          <div className="paper-detail-section-title"><h3>文献标识与元数据</h3></div>
          <dl className="paper-meta-grid">
            {paper.doi && <div>
              <dt>DOI</dt>
              <dd className="meta-copy-row">
                <span>{paper.doi}</span>
                <button type="button" className="quiet" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(paper.doi);
                    setCopiedDoi(true);
                    setTimeout(() => setCopiedDoi(false), 1400);
                  } catch { /* ignore */ }
                }}>{copiedDoi ? '已复制' : '复制'}</button>
              </dd>
            </div>}
            {paper.arxiv_id && <div><dt>arXiv</dt><dd>{paper.arxiv_id}</dd></div>}
            {paper.venue && <div><dt>发表</dt><dd>{paper.venue}</dd></div>}
            {paper.page_count > 0 && <div><dt>页数</dt><dd>{paper.page_count} 页</dd></div>}
            <div><dt>收录</dt><dd>{paper.imported ? dateFormat.format(new Date(paper.imported)) : '—'}</dd></div>
          </dl>
        </section>

        <section className="paper-detail-section">
          <div className="paper-detail-section-title">
            <h3>期刊与会议等级</h3>
            <button type="button" className="quiet" disabled={Boolean(busy) || !paper.venue}
              onClick={() => void queryJournal(true)}>
              <Icon name="refresh" />{busy === 'journal' ? '查询中…' : journal ? '刷新' : '查询'}
            </button>
          </div>
          {journal?.entries?.length ? <div className="rank-chips">
            {journal.entries.slice(0, 6).map((entry, index) => <span className="rank-chip" key={index}>
              <strong>{entry.key}</strong>{entry.value}
            </span>)}
          </div> : <p className="muted">{!paper.venue ? '这篇论文未记录期刊或会议名称。'
            : hasEasyScholar ? '点击右上角「查询」获取分区与影响因子。' : '可在左侧分类栏底部配置 easyScholar 密钥后查询分区。'}</p>}
        </section>
      </>}

      {inspectorTab === 'taxonomy' && <>
        <section className="paper-detail-section">
          <div className="paper-detail-section-title">
            <h3>归属分类</h3>
            <button type="button" className="quiet icon-label" disabled={Boolean(busy)} onClick={() => void classify()}>
              <Icon name="stars" />{busy === 'classify' ? '正在分析…' : 'Agent 智能归类'}
            </button>
          </div>
          {rows.length ? <div className="category-checks">
            {rows.map(category => <label key={category.id} style={{ '--depth': category.depth }}>
              <input type="checkbox" checked={assigned.has(category.id)}
                onChange={event => onAssign(paper.id, category.id, event.target.checked)} />
              <span className="color-dot" style={{ background: category.color || 'var(--edge)' }} />
              {category.name}
            </label>)}
          </div> : <p className="muted">还没有分类目录。可在左侧分类栏新建，或点击「Agent 智能归类」自动生成。</p>}

          {suggestions.length > 0 && <div className="classify-suggestions" role="status">
            <p>Agent 推荐归入：</p>
            <div className="rank-chips">{suggestions.map(name => <span className="rank-chip" key={name}>{name}</span>)}</div>
            <div className="inline-actions">
              <button className="primary" type="button" disabled={Boolean(busy)} onClick={() => void applySuggestions()}>
                {busy === 'apply' ? '正在应用…' : '一键采纳分类'}
              </button>
              <button className="quiet" type="button" onClick={() => setSuggestions([])}>忽略</button>
            </div>
          </div>}
        </section>
      </>}

      {inspectorTab === 'network' && <section className="paper-detail-section paper-network">
        <div className="network-panel">
          <div className="network-tabs" role="tablist" aria-label="引文方向">
            <button type="button" role="tab" aria-selected={networkTab === 'references'}
              onClick={() => setNetworkTab('references')}>参考文献 · {network?.references.length || 0}</button>
            <button type="button" role="tab" aria-selected={networkTab === 'citations'}
              onClick={() => setNetworkTab('citations')}>被引文献 · {network?.citations.length || 0}</button>
            <button type="button" className="quiet network-refresh" title="刷新引文脉络"
              disabled={Boolean(networkBusy)} onClick={() => void openNetwork(true)}>
              <Icon name="refresh" />
            </button>
          </div>
          {networkSource && <p className="network-source">{networkSource}
            {networkFetched ? ' · ' + dateFormat.format(new Date(networkFetched)) : ''}</p>}
          {networkRows.length ? <div className="network-list">
            {networkRows.slice(0, 14).map(row => <article className="network-row" key={row.key}
              data-shared={row.sharedBy > 0 || undefined}>
              <div className="network-main">
                <p className="network-title">
                  {row.url ? <button type="button" className="link-button"
                    onClick={() => void api.openSourceLink(row.url).catch(err => setNetworkError(errorText(err)))}>
                    {row.title}
                  </button> : row.title}
                </p>
                <p className="network-meta">{[row.author, row.year, row.venue].filter(Boolean).join(' · ') || '未提供作者与出处'}</p>
                <div className="network-badges">
                  {row.inLibraryId && <span className="network-badge">已在馆藏</span>}
                  {row.sharedBy > 0 && <span className="network-badge strong">另 {row.sharedBy} 篇共同引用</span>}
                  {Number.isFinite(row.citationCount) && <span className="network-badge">被引 {row.citationCount}</span>}
                </div>
              </div>
              {!row.inLibraryId && <button type="button" className="quiet" disabled={Boolean(networkBusy)}
                onClick={() => void importCandidate(row)}>{networkBusy === row.key ? '收录中…' : '收录'}</button>}
            </article>)}
          </div> : <p className="muted">{networkBusy === 'load' ? '正在连接学术引文网络…'
            : network ? '这篇论文暂时没有查询到引文记录。' : '点击右上角刷新获取引文关系。'}</p>}
          {networkRows.length > 14 && <p className="muted">另有 {networkRows.length - 14} 条关联文献未展开。</p>}
          {networkNotice && <p className="success" role="status">{networkNotice}</p>}
          {(networkError || (!networkRows.length && networkMessage)) &&
            <p className="error" role="alert">{networkError || networkMessage}</p>}
        </div>
      </section>}

      {error && <p className="error" role="alert">{error}</p>}
    </div>
  </aside>;
}
