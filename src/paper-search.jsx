import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import './paper-search.css';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const sources = [
  ['crossref', 'Crossref', '正式发表题录与 DOI'],
  ['arxiv', 'arXiv', '预印本与开放 PDF'],
  ['openalex', 'OpenAlex', '跨学科覆盖与被引统计'],
  ['semantic', 'Semantic Scholar', '摘要、引用与开放 PDF'],
  ['europepmc', 'Europe PMC', '生物医学开放全文'],
  ['web', '公开网页', '学术主页与公开报告'],
];
const defaults = sources.map(([id]) => id);
const statusText = row => row.status === 'ok' ? row.count + ' 条' : row.status === 'empty' ? '0 条'
  : row.status === 'error' ? '限流/异常' : '检索中';

const HISTORY_KEY = 'sparkseed:paper-search-history';

function matchExistingPaper(item, existingPapers) {
  if (!existingPapers?.length) return null;
  const doi = (item.doi || '').trim().toLowerCase();
  const arxiv = (item.arxiv || '').trim().toLowerCase();
  const title = (item.title || '').trim().toLowerCase();
  return existingPapers.find(p =>
    (doi && (p.doi || '').trim().toLowerCase() === doi)
    || (arxiv && (p.arxiv_id || '').trim().toLowerCase() === arxiv)
    || (title && (p.title || '').trim().toLowerCase() === title)
  ) || null;
}

function Result({ item, existing, open, importing, toggle, collect, openExisting, openLink }) {
  return <article className="search-result" data-open={open || undefined}>
    <div className="search-result-main">
      <div className="search-result-text">
        <button className="search-result-title" type="button" aria-expanded={open} onClick={toggle}>
          {item.title}
        </button>
        <p className="search-result-meta">
          {[item.authors.slice(0, 3).join('、') + (item.authors.length > 3 ? ' 等' : ''), item.year, item.venue]
            .filter(Boolean).join(' · ') || '作者与出处未提供'}
        </p>
        <div className="search-result-tags">
          {(item.sources || [item.source]).map(name => <span className="source-chip" key={name}>{name}</span>)}
          {item.openAccess && <span className="source-chip" data-open="true">开放获取 PDF</span>}
          {existing && <span className="source-chip" data-open="true">已在库中</span>}
          {item.citationCount > 0 && <span className="search-cites">被引 {item.citationCount}</span>}
        </div>
      </div>
      <div className="search-result-actions">
        {item.url && <button className="quiet icon-label" type="button" title="在浏览器打开论文页面"
          onClick={() => openLink(item.url)}><Icon name="external" />原文</button>}
        {existing ? <button className="quiet icon-label" type="button" onClick={() => openExisting(existing)}>
          <Icon name="book" />打开研读
        </button> : <button className="primary icon-label" type="button" disabled={Boolean(importing)} onClick={() => collect(item)}>
          <Icon name="import" />{importing === item.id ? '正在收录…' : item.pdfUrl ? '收录并研读' : '收入题录'}
        </button>}
      </div>
    </div>

    {open && <div className="search-result-detail">
      {item.abstract ? <p>{item.abstract}</p> : <p className="muted">这个来源没有提供摘要预览。</p>}
      <dl>
        {item.doi && <div><dt>DOI</dt><dd>{item.doi}</dd></div>}
        {item.arxiv && <div><dt>arXiv</dt><dd>{item.arxiv}</dd></div>}
        {item.venue && <div><dt>出处</dt><dd>{item.venue}</dd></div>}
      </dl>
      <div className="inline-actions">
        {item.url && <button className="quiet icon-label" type="button" onClick={() => openLink(item.url)}>
          <Icon name="external" />打开详情页
        </button>}
        {item.pdfUrl && <button className="quiet icon-label" type="button" onClick={() => openLink(item.pdfUrl)}>
          <Icon name="document" />浏览器查看 PDF
        </button>}
      </div>
    </div>}
  </article>;
}

export function PaperSearch({ openPaper, existingPapers = [] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(defaults);
  const [results, setResults] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [onlyOa, setOnlyOa] = useState(false);
  const [yearMin, setYearMin] = useState(0);
  const [resultSort, setResultSort] = useState('relevance'); // 'relevance' | 'citations' | 'year'
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState('');
  const [importing, setImporting] = useState('');
  const [keys, setKeys] = useState({ semantic: '', openalex: '' });
  const [hasKeys, setHasKeys] = useState({ semantic: false, openalex: false });
  const [keyNotice, setKeyNotice] = useState('');
  const request = useRef('');
  const input = useRef(null);

  useEffect(() => {
    let live = true;
    void api.getPaperSearchConfig().then(value => {
      if (!live) return;
      if (value?.sources?.length) setSelected(value.sources);
      setHasKeys({ semantic: Boolean(value?.hasSemanticKey), openalex: Boolean(value?.hasOpenAlexKey) });
    }, () => {});
    input.current?.focus();
    return () => { live = false; };
  }, []);

  useEffect(() => () => { if (request.current) void api.cancelPaperSearch(request.current); }, []);

  function toggleSource(id) {
    const next = selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id];
    if (!next.length) return;
    setSelected(next);
    void api.savePaperSearchConfig({ sources: next }).catch(() => {});
  }

  async function saveKeys(event) {
    event.preventDefault();
    setKeyNotice('');
    try {
      await api.savePaperSearchConfig({
        sources: selected,
        ...(keys.semantic ? { semanticKey: keys.semantic } : {}),
        ...(keys.openalex ? { openalexKey: keys.openalex } : {}),
      });
      setHasKeys(previous => ({
        semantic: previous.semantic || Boolean(keys.semantic),
        openalex: previous.openalex || Boolean(keys.openalex),
      }));
      setKeys({ semantic: '', openalex: '' });
      setKeyNotice('Key 已加密保存，下次检索生效。');
    } catch (err) { setKeyNotice(errorText(err)); }
  }

  async function search(event, overrideQuery) {
    event?.preventDefault();
    const text = (overrideQuery ?? query).trim();
    if (!text || busy) return;
    if (overrideQuery !== undefined) setQuery(overrideQuery);
    const nextHistory = [text, ...history.filter(item => item !== text)].slice(0, 6);
    setHistory(nextHistory);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory)); } catch { /* ignore */ }
    setBusy(true);
    setError('');
    setNotice('');
    setResults([]);
    setStatuses([]);
    setExpanded('');
    const id = crypto.randomUUID();
    request.current = id;
    try {
      const value = await api.searchPapers({ query: text, sources: selected, requestId: id });
      if (request.current !== id) return;
      setResults(value.results);
      setStatuses(value.sources);
      if (!value.results.length) {
        const failed = value.sources.filter(row => row.status === 'error');
        setError(failed.length ? '部分学术数据源暂时受限，可稍后重试或使用底部浏览器检索。' : '没有找到匹配论文，试试英文关键词或缩短短语。');
      }
    } catch (err) {
      if (request.current === id) setError(errorText(err));
    } finally {
      if (request.current === id) { setBusy(false); request.current = ''; }
    }
  }

  function cancel() {
    if (request.current) void api.cancelPaperSearch(request.current);
    request.current = '';
    setBusy(false);
  }

  async function collect(result) {
    if (importing) return;
    setImporting(result.id);
    setError('');
    setNotice('');
    try {
      const value = await api.importSearchResult({ result });
      setNotice(value.reason || (value.downloaded ? '已下载 PDF 并收入馆藏，正在打开研读台…' : '已收入论文题录。'));
      if (value.paperId) openPaper?.(value.paperId, value.downloaded);
    } catch (err) { setError(errorText(err)); }
    finally { setImporting(''); }
  }

  function openLink(url) {
    if (!url) return;
    void api.openSourceLink(url).catch(err => setError(errorText(err)));
  }

  const displayedResults = useMemo(() => {
    let list = results;
    if (onlyOa) list = list.filter(item => item.openAccess || item.pdfUrl);
    if (yearMin > 0) list = list.filter(item => (Number(item.year) || 0) >= yearMin);
    if (resultSort === 'citations') list = [...list].sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
    else if (resultSort === 'year') list = [...list].sort((a, b) => (b.year || 0) - (a.year || 0));
    return list;
  }, [results, onlyOa, yearMin, resultSort]);

  const statusMap = useMemo(() => new Map(statuses.map(item => [item.id, item])), [statuses]);

  return <section className="paper-search" aria-label="论文检索">
    <div className="search-hero-box">
      <form className="paper-search-form" onSubmit={event => void search(event)}>
        <Icon name="search" className="search-form-lead-icon" />
        <label className="visually-hidden" htmlFor="paper-search-query">检索词</label>
        <input id="paper-search-query" ref={input} value={query} maxLength={300}
          placeholder="输入英文/中文研究主题、论文题名、作者或 DOI…" onChange={event => setQuery(event.target.value)} />
        {busy ? <button type="button" onClick={cancel}>停止检索</button>
          : <button className="primary icon-label" type="submit" disabled={!query.trim()}>
              <Icon name="search" />多源检索
            </button>}
      </form>

      {history.length > 0 && <div className="search-history-chips">
        <span className="muted">近期：</span>
        {history.map(term => <button key={term} type="button" className="filter-pill"
          onClick={() => void search(null, term)}>{term}</button>)}
      </div>}

      <div className="source-toggles-row">
        <div className="source-toggles" role="group" aria-label="检索来源">
          {sources.map(([id, label, hint]) => {
            const st = statusMap.get(id);
            return <button className="source-toggle" type="button" key={id}
              aria-pressed={selected.includes(id)} title={st?.message || hint} onClick={() => toggleSource(id)}>
              {selected.includes(id) && <Icon name="check" />}
              <span>{label}</span>
              {st && <em className="source-live-tag" data-status={st.status}>{statusText(st)}</em>}
            </button>;
          })}
        </div>

        <details className="search-advanced">
          <summary><Icon name="sliders" />检索配额 Key（选填）</summary>
          <form className="search-keys" onSubmit={event => void saveKeys(event)}>
            <label>Semantic Scholar Key
              <input type="password" autoComplete="off" value={keys.semantic} maxLength={200}
                placeholder={hasKeys.semantic ? '已保存，留空继续使用' : '公共额度不足时填写'}
                onChange={event => setKeys({ ...keys, semantic: event.target.value })} />
            </label>
            <label>OpenAlex API Key
              <input type="password" autoComplete="off" value={keys.openalex} maxLength={200}
                placeholder={hasKeys.openalex ? '已保存，留空继续使用' : '公共额度不足时填写'}
                onChange={event => setKeys({ ...keys, openalex: event.target.value })} />
            </label>
            <button className="primary" disabled={!keys.semantic && !keys.openalex}>保存 Key</button>
          </form>
          <p className="muted">默认免登录即可跨库检索；配置 Key 可提升高频检索速率上限，仅加密保存在本机。</p>
          {keyNotice && <p className="success" role="status">{keyNotice}</p>}
        </details>
      </div>
    </div>

    {busy && <p className="active-thinking-bar paper-search-progress" role="status">
      正在并行检索 {selected.length} 个学术数据源，去重合并中…
    </p>}

    {results.length > 0 && <div className="search-results-toolbar">
      <span className="muted">共去重合并 {displayedResults.length} / {results.length} 条文献</span>
      <div className="inline-actions">
        <button type="button" className="filter-pill" aria-pressed={onlyOa} onClick={() => setOnlyOa(v => !v)}>
          仅看开放 PDF
        </button>
        <select aria-label="发表年份筛选" value={yearMin} onChange={event => setYearMin(Number(event.target.value))}>
          <option value={0}>不限年份</option>
          <option value={2024}>2024 年以来</option>
          <option value={2021}>2021 年以来</option>
        </select>
        <select aria-label="检索结果排序" value={resultSort} onChange={event => setResultSort(event.target.value)}>
          <option value="relevance">按综合相关度</option>
          <option value="citations">按被引次数优先</option>
          <option value="year">按发表年份最新</option>
        </select>
      </div>
    </div>}

    {notice && <p className="success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}

    {displayedResults.length > 0 && <div className="search-results">
      {displayedResults.map(item => <Result key={item.id} item={item}
        existing={matchExistingPaper(item, existingPapers)}
        open={expanded === item.id} importing={importing}
        toggle={() => setExpanded(previous => previous === item.id ? '' : item.id)}
        collect={collect}
        openExisting={paper => openPaper?.(paper.id, paper.status !== 'linked')}
        openLink={openLink} />)}
    </div>}

    {!busy && !results.length && !error && <div className="page-empty-state" role="status">
      <Icon name="search" />
      <h2>跨六大学术源一键检索</h2>
      <p className="muted">免登录聚合 Crossref、arXiv、OpenAlex、Semantic Scholar 与 Europe PMC，支持直接下载开放 PDF 进入对照研读台。</p>
    </div>}

    <footer className="search-external">
      <span className="muted">外部学术引擎直达：</span>
      <button className="quiet icon-label" type="button" disabled={!query.trim()}
        onClick={() => void api.openScholar(query.trim()).catch(err => setError(errorText(err)))}>
        <Icon name="external" />Google Scholar
      </button>
      <button className="quiet icon-label" type="button" disabled={!query.trim()}
        onClick={() => openLink('https://duckduckgo.com/?q=' + encodeURIComponent(query.trim()))}>
        <Icon name="external" />DuckDuckGo
      </button>
    </footer>
  </section>;
}
