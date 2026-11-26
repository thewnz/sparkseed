import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');

export function PaperCompare({ papers, onOpen }) {
  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const version = useRef(0);

  const selectionKey = selected.join('|');
  useEffect(() => {
    if (selected.length < 2) { setResult(null); setError(''); return; }
    const request = ++version.current;
    setBusy('load');
    setError('');
    void api.comparePapers(selected).then(value => {
      if (request === version.current) setResult(value);
    }, reason => {
      if (request === version.current) { setError(errorText(reason)); setResult(null); }
    }).finally(() => {
      if (request === version.current) setBusy('');
    });
  }, [selectionKey, papers]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return papers.filter(paper => !text || [paper.title, paper.author, paper.venue, paper.year]
      .some(value => String(value || '').toLowerCase().includes(text)));
  }, [papers, query]);

  function toggle(id) {
    setSelected(previous => previous.includes(id) ? previous.filter(item => item !== id)
      : previous.length >= 4 ? previous : [...previous, id]);
  }

  async function generate() {
    if (selected.length < 2 || busy) return;
    setBusy('generate');
    setError('');
    try { setResult(await api.comparePapers(selected, { generate: true })); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(''); }
  }

  const columns = result?.papers || [];
  const metaRows = result?.metadata || [];
  const agentRows = result?.rows || [];
  const titles = new Map(papers.map(paper => [paper.id, paper]));

  function buildMarkdownLines() {
    if (!result || !columns.length) return [];
    const escapeCell = text => String(text || '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    const head = ['维度', ...columns.map(col => escapeCell(col.title))];
    const sep = head.map(() => '---');
    return [
      '| ' + head.join(' | ') + ' |',
      '| ' + sep.join(' | ') + ' |',
      ...metaRows.map(row => '| ' + [escapeCell(row.label), ...row.values.map(escapeCell)].join(' | ') + ' |'),
      ...agentRows.map(row => '| ' + [escapeCell(row.label), ...row.values.map(escapeCell)].join(' | ') + ' |'),
    ];
  }

  async function copyMarkdown() {
    const lines = buildMarkdownLines();
    if (!lines.length) return;
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  }

  async function saveToNotes() {
    const lines = buildMarkdownLines();
    if (!lines.length || !api.saveNote) return;
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const title = `文献对比：${columns.map(c => c.title.slice(0, 18)).join(' vs ')}`.slice(0, 100);
    const text = lines.join('\n');
    const html = `<p><strong>${esc(title)}</strong></p>` + [
      ...metaRows.map(r => `<p><strong>${esc(r.label)}</strong>：${r.values.map(esc).join(' ｜ ')}</p>`),
      ...agentRows.map(r => `<p><strong>${esc(r.label)}</strong>：${r.values.map(esc).join(' ｜ ')}</p>`),
    ].join('');
    try {
      await api.saveNote({ title, html, text, tags: ['文献对比'] });
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 2000);
    } catch (reason) { setError(errorText(reason)); }
  }

  return <div className="paper-compare-page">
    <aside className="compare-picker" aria-label="选择对比论文">
      <div className="compare-picker-head">
        <h2>挑选 2–4 篇文献 ({selected.length}/4)</h2>
        <div className="inline-actions">
          {selected.length === 0 && papers.length >= 2 && <button type="button" className="quiet"
            onClick={() => setSelected(papers.slice(0, Math.min(3, papers.length)).map(p => p.id))}>选前 {Math.min(3, papers.length)} 篇</button>}
          {selected.length > 0 && <button type="button" className="quiet" onClick={() => setSelected([])}>清空</button>}
        </div>
      </div>

      <label className="paper-filter search-input-box">
        <span className="visually-hidden">筛选论文</span><Icon name="search" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="筛选馆藏文献…" />
      </label>

      <div className="compare-picks">
        {visible.map(paper => <label key={paper.id} className="compare-pick"
          data-active={selected.includes(paper.id) || undefined}>
          <input type="checkbox" checked={selected.includes(paper.id)}
            disabled={!selected.includes(paper.id) && selected.length >= 4}
            onChange={() => toggle(paper.id)} />
          <span>
            <strong>{paper.title}</strong>
            <small>{[paper.author, paper.year, paper.venue].filter(Boolean).join(' · ') || '未填写作者与出处'}</small>
          </span>
        </label>)}
        {!visible.length && <p className="muted">{papers.length ? '没有匹配的论文。' : '论文库还是空的。'}</p>}
      </div>
    </aside>

    <section className="compare-stage" aria-busy={Boolean(busy)}>
      <header className="compare-stage-head">
        <div>
          <h2>跨篇文献对比矩阵</h2>
          <p>横向对齐研究问题、方法路径、实验基准与局限性；对比结果自动缓存在本机</p>
        </div>
        <div className="inline-actions">
          {result && <button type="button" className="quiet icon-label" onClick={() => void copyMarkdown()}>
            <Icon name={copied ? 'check' : 'copy'} />{copied ? '已复制 Markdown' : '复制表格'}
          </button>}
          {result && <button type="button" className="quiet icon-label" onClick={() => void saveToNotes()}>
            <Icon name={savedNote ? 'check' : 'document'} />{savedNote ? '已存入笔记库' : '存入笔记库'}
          </button>}
          <button type="button" className="primary icon-label" disabled={selected.length < 2 || Boolean(busy)}
            onClick={() => void generate()}>
            <Icon name="socratic" />{busy === 'generate' ? '正在提炼…' : result?.generated ? '重新生成对比' : '生成深度对比'}
          </button>
        </div>
      </header>

      {selected.length > 0 && <div className="compare-selected">
        {selected.map((id, idx) => {
          const item = titles.get(id);
          return item ? <button type="button" key={item.id} className="compare-chip" title="移出对比" onClick={() => toggle(item.id)}>
            <span className="compare-slot-num">{idx + 1}</span>
            <span>{item.title.slice(0, 24)}{item.title.length > 24 ? '…' : ''}</span>
            <Icon name="close" />
          </button> : null;
        })}
      </div>}

      {error && <p className="error" role="alert">{error}</p>}

      {selected.length < 2
        ? <div className="compare-empty page-empty-state">
            <Icon name="split" />
            <h3>{selected.length ? '再勾选 1 篇即可生成对比矩阵' : '勾选 2–4 篇同方向或竞争方法论文'}</h3>
            <p className="muted">从左侧列表挑选论文，即可先对比题录元数据，再由 Agent 归纳核心方法与局限。</p>
          </div>
        : busy === 'load' ? <p className="muted" role="status">正在读取已保存的对比矩阵…</p>
        : result && <div className="compare-table-wrap">
            <table className="compare-table">
              <caption className="visually-hidden">{columns.map(paper => paper.title).join('、')} 的跨篇对比</caption>
              <thead><tr>
                <th scope="col">对比维度</th>
                {columns.map(paper => <th scope="col" key={paper.id}>
                  <button type="button" className="compare-paper-title" onClick={() => onOpen?.(paper.id)}>
                    {paper.title}
                  </button>
                  <span>{paper.year || '—'}</span>
                </th>)}
              </tr></thead>
              <tbody>
                {metaRows.map(row => <tr key={row.label} className="compare-meta-row">
                  <th scope="row">{row.label}</th>
                  {row.values.map((value, index) => <td key={index}>{value}</td>)}
                </tr>)}
                {agentRows.length > 0 && <>
                  <tr className="compare-divider"><th colSpan={columns.length + 1}>Agent 深度归纳维度</th></tr>
                  {agentRows.map(row => <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {row.values.map((value, index) => <td key={index}>{value || '—'}</td>)}
                  </tr>)}
                </>}
              </tbody>
            </table>
            {result.notice && <p className="muted compare-notice">{result.notice}</p>}
            {result.updated && result.generated && <p className="compare-stamp">
              {result.model ? '由 ' + result.model + ' 生成 · ' : ''}
              {new Date(result.updated).toLocaleString('zh-CN')}
            </p>}
          </div>}
    </section>
  </div>;
}
