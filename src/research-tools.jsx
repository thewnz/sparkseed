import { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const sources = {
  github: { icon: 'repository', description: '查找公开仓库与参考实现', browser: '在 GitHub 搜索' },
  scholar: { icon: 'book', description: 'Crossref、arXiv 和 Europe PMC', browser: '在 Google Scholar 搜索' },
  web: { icon: 'web', description: '查找评审、资料与公开讨论', browser: '在浏览器搜索' },
};

function SourceForm({ source, save, cancel }) {
  const [form, setForm] = useState({ endpoint: source.endpoint, tool: source.tool, queryField: source.queryField, token: '', clearToken: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function field(key) {
    return { value: form[key], onChange: event => setForm(previous => ({ ...previous, [key]: event.target.value })) };
  }
  return <form className="api-form" onSubmit={async event => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try { await api.saveSource(source.id, form); await save(); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }}>
    <h3>{source.label} · MCP 连接</h3>
    <label>MCP 地址<input type="url" autoFocus required placeholder="https://example.com/mcp" {...field('endpoint')} /></label>
    <label>搜索工具名<input required placeholder="例如 web_search" {...field('tool')} /></label>
    <label>查询字段<input placeholder="自动识别 query、q 等字段" {...field('queryField')} /></label>
    <label>访问令牌<input type="password" autoComplete="off" disabled={form.clearToken}
      placeholder={source.hasToken ? '已保存，留空继续使用' : '按服务要求填写'} {...field('token')} /></label>
    {source.hasToken && <label className="choice"><input type="checkbox" checked={form.clearToken}
      onChange={event => setForm(previous => ({ ...previous, token: '', clearToken: event.target.checked }))} />移除已保存的令牌</label>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button type="button" className="quiet" disabled={busy} onClick={cancel}>取消</button>
      <button className="primary" disabled={busy}>{busy ? '正在保存…' : '保存连接'}</button></div>
  </form>;
}

export function ResearchTools({ onUse }) {
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState('github');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('public');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void api.listSources().then(setList, error => setError(errorText(error))); }, []);
  const source = list.find(item => item.id === selected);

  async function run(operation) {
    if (busy) return;
    setBusy(operation);
    setError('');
    setNotice('');
    if (operation === 'search') setResult(null);
    try {
      if (operation === 'browser') await api.openSourceSearch(selected, query.trim());
      else {
        const value = await api.runSource(selected, operation === 'test' ? undefined : query,
          operation === 'test' ? 'mcp' : mode);
        if (operation === 'test') setNotice('连接可用 · ' + value.tool);
        else {
          setResult({ ...value, query: query.trim(), source: value.source || source.label + ' · MCP' });
          if (value.notice) setNotice(value.notice);
        }
      }
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(''); }
  }

  return <section className="tools-settings">
    <h2>研究工具</h2>
    <div className="connection-grid">
      {list.map(item => <button key={item.id} type="button" className="connection-card source-card" data-primary={item.id === selected}
        disabled={Boolean(busy)} aria-pressed={item.id === selected} onClick={() => {
          setSelected(item.id); setMode('public'); setEditing(false); setResult(null); setError(''); setNotice('');
        }}>
        <span className="connection-icon"><Icon name={sources[item.id].icon} /></span>
        <strong>{item.label}</strong>
        <span>{sources[item.id].description}</span>
        <span>免登录搜索{item.configured && ' · 已配置 MCP'}</span>
      </button>)}
    </div>
    {source && <div className="tools-panel preference-group">
      <div className="preference-title"><h3>{source.label}</h3>
        <div className="inline-actions">
          <button className="quiet" disabled={Boolean(busy)} aria-expanded={editing}
            onClick={() => setEditing(!editing)}>{editing ? '返回搜索' : source.configured ? '编辑 MCP' : '自定义 MCP'}</button>
          {source.configured && <button className="quiet" disabled={Boolean(busy) || editing} onClick={() => void run('test')}>
            {busy === 'test' ? '正在测试…' : '测试连接'}</button>}
        </div>
      </div>
      {editing ? <SourceForm key={selected} source={source} cancel={() => setEditing(false)} save={async () => {
        setList(await api.listSources());
        setEditing(false); setResult(null); setNotice('已保存 MCP 连接。'); setError('');
      }} /> : <>
        {source.configured && <label className="choice">搜索方式
          <select value={mode} disabled={Boolean(busy)} onChange={event => {
            setMode(event.target.value); setResult(null); setError(''); setNotice('');
          }}>
            <option value="public">公开搜索（免登录）</option>
            <option value="mcp">自定义 MCP</option>
          </select>
        </label>}
        <form className="tool-search" onSubmit={event => {
          event.preventDefault();
          if (!busy && query.trim()) void run('search');
        }}>
          <label className="visually-hidden" htmlFor="source-query">检索词</label>
          <input id="source-query" value={query} onChange={event => setQuery(event.target.value)} disabled={Boolean(busy)}
            maxLength={mode === 'mcp' ? 600 : 300}
            placeholder={selected === 'github' ? '项目名称、关键词或 GitHub 搜索条件' : '关键词、标题或作者'} />
          <button className="primary icon-label" disabled={Boolean(busy) || !query.trim()}><Icon name="search" />
            {busy === 'search' ? '检索中…' : '检索'}</button>
        </form>
        <button type="button" className="quiet" disabled={Boolean(busy) || !query.trim()}
          onClick={() => void run('browser')}>{sources[selected].browser}</button>
      </>}
    </div>}
    {notice && <p role="status" className="success">{notice}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {result && <section className="source-results">
      <div className="preference-title"><h3>检索结果</h3>
        {(result.entries.length > 0 || result.text) && <button className="quiet" onClick={() => onUse(result)}>带入新讨论</button>}</div>
      <p className="muted">{result.source} · {result.query}</p>
      {result.entries.map((item, index) => <article key={index} className="source-result">
        {item.url ? <button className="quiet" title={item.url} onClick={() => void api.openSourceLink(item.url).catch(error => setError(errorText(error)))}>{item.title}</button>
          : <strong>{item.title}</strong>}
        {item.description && <p>{item.description}</p>}
      </article>)}
      {result.text && <pre>{result.text}</pre>}
      {!result.entries.length && !result.text && <p className="muted">这次检索没有返回结果。</p>}
    </section>}
  </section>;
}
