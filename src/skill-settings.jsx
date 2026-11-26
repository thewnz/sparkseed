import { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';
import { skillTextLimit, studioSkillTextLimit } from '../desktop/skill-limits.mjs';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const blankSkill = { name: '', description: '', text: '', enabled: false, origin: '' };

export function SkillSettings({ draft, setDraft, provider, initialScope = 'research' }) {
  const [skills, setSkills] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState('');
  const [scope, setScope] = useState(draft?.scope || initialScope);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(null);
  const scoped = skills.filter(skill => (skill.scope || 'research') === scope);
  const limit = scope === 'studio' ? studioSkillTextLimit : skillTextLimit;
  const overLimit = draft?.text?.length > limit;
  useEffect(() => { void api.listSkills().then(setSkills, error => setError(errorText(error))); }, []);
  useEffect(() => {
    setScope(initialScope);
    setDraft(null);
    setFound(null);
    setError('');
    setNotice('');
  }, [initialScope, setDraft]);

  async function perform(action, operation) {
    if (busy) return;
    setBusy(action); setError(''); setNotice('');
    try { await operation(); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(''); }
  }
  function field(key) {
    return { value: draft[key] || '', onChange: event => {
      const value = event.target.value;
      setDraft(previous => ({ ...previous, [key]: value }));
    } };
  }
  return <section className="skill-settings">
    <div className="library-views segmented-pills" role="group" aria-label="技能用途">
      {[['research','科研讨论'], ['studio','图文生成']].map(([id,label]) => <button key={id} type="button" className="quiet"
        disabled={Boolean(draft) || Boolean(busy)} aria-pressed={scope === id}
        onClick={() => { setScope(id); setFound(null); setError(''); setNotice(''); }}>{label}</button>)}
    </div>
    <div className="preference-title"><h2>技能管理</h2>
      {!draft && <div className="inline-actions">
        <button className="quiet icon-label" disabled={Boolean(busy)} onClick={() => void perform('import', async () => {
          const value = await api.importSkill();
          if (value) setDraft(previous => previous || { ...value, scope });
        })}><Icon name="import" />导入 SKILL.md</button>
        <button className="icon-label" disabled={Boolean(busy)} onClick={() => setDraft({ ...blankSkill, scope })}><Icon name="compose" />新建技能</button>
      </div>}
    </div>
    {!draft && <form className="inline-actions skill-search" onSubmit={event => {
      event.preventDefault();
      void perform('search', async () => { setFound(null); setFound(await api.findSkills(scope, query)); });
    }}>
      <input aria-label="技能检索方向" placeholder={scope === 'studio' ? '例如：科研汇报 PPT 或配图' : '例如：文献综述或论文查证'} value={query} onChange={event => setQuery(event.target.value)} />
      <button disabled={Boolean(busy)}>{busy === 'search' ? '正在检索…' : 'AI 在 GitHub 检索技能'}</button>
    </form>}
    {!draft && found && <div className="skill-search-results">
      {!found.length && <p className="muted">没有找到匹配的 SKILL.md，可以换一个关键词。</p>}
      {found.map(item => <div key={item.url}><button className="quiet" onClick={() => void api.openSourceLink(item.url).catch(error => setError(errorText(error)))}>{item.title}</button>
        {item.description && <p className="muted">{item.description}</p>}
        {!!item.files?.length && <ul className="skill-file-list">{item.files.map(file =>
          <li key={file.url}>
            <button className="quiet skill-file-name" title={file.name}
              onClick={() => void api.openSourceLink(file.url).catch(error => setError(errorText(error)))}>{file.name}</button>
            <button type="button" className="quiet icon-label" disabled={Boolean(busy)} onClick={() => void perform(file.url, async () => {
              setDraft({ ...await api.downloadSkill(file.url), scope });
            })}><Icon name="import" />{busy === file.url ? '正在下载…' : '导入'}</button>
          </li>)}</ul>}
      </div>)}
    </div>}
    <p className="muted">启用后，技能会随对应的请求发送给所选 Agent。请先核对导入内容。</p>
    {draft ? <form className="api-form skill-form" onSubmit={event => {
      event.preventDefault();
      void perform('save', async () => {
        setSkills(await api.saveSkill(draft));
        setDraft(previous => previous === draft ? null : previous);
        setNotice('技能已保存。');
      });
    }}>
      <div className="preference-title"><h3>{draft.id ? '编辑技能' : '技能草稿'}</h3>
        {draft.origin && !draft.id && provider && <button type="button" className="quiet icon-label" disabled={Boolean(busy)}
          onClick={() => void perform('draft', async () => {
            const result = await api.draftSkill(draft.origin);
            setDraft(previous => previous === draft ? result : previous);
            setNotice('已生成草稿，请检查适用条件与步骤。');
          })}><Icon name="soul" />{busy === 'draft' ? '正在提炼…' : '交给 Agent 提炼'}</button>}
      </div>
      {draft.source && <button type="button" className="quiet icon-label skill-source" onClick={() => void api.openSourceLink(draft.source).catch(error => setError(errorText(error)))}>
        <Icon name="repository" />查看 GitHub 原文
      </button>}
      <label>技能名称<input required maxLength={80} disabled={Boolean(busy)} {...field('name')} /></label>
      <label>适用情境<input maxLength={280} disabled={Boolean(busy)} {...field('description')} /></label>
      <label>技能正文<textarea required rows={9} maxLength={limit} disabled={Boolean(busy)}
        placeholder="写下适用条件、工作步骤和检查项。" {...field('text')} /></label>
      {overLimit && <p className="error">原文有 {draft.text.length.toLocaleString()} 字符，精简到 {limit.toLocaleString()} 字符以内即可保存。</p>}
      <label className="choice"><input type="checkbox" checked={draft.enabled === true} disabled={Boolean(busy)}
        onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />保存后启用</label>
      <div className="actions"><button type="button" className="quiet" disabled={Boolean(busy)} onClick={() => setDraft(null)}>取消编辑</button>
        <button className="primary" disabled={Boolean(busy) || overLimit}>{busy === 'save' ? '正在保存…' : '保存技能'}</button></div>
    </form> : <div className="skill-list">
      {!scoped.length && <p className="muted">可以导入已有技能，也可以从 Idea 详情提炼一段讨论。</p>}
      {scoped.map(skill => <article key={skill.id} className="skill-item">
        <span className="connection-icon"><Icon name="skill" /></span>
        <div><h3>{skill.name}</h3><p className="muted">{skill.description || (skill.origin ? '来自已保存的讨论' : skill.source ? '来自 GitHub' : '自定义技能')}</p></div>
        <div className="inline-actions">
          {removing === skill.id ? <>
            <button className="quiet" disabled={Boolean(busy)} onClick={() => setRemoving('')}>取消</button>
            <button className="quiet error" disabled={Boolean(busy)} onClick={() => void perform('remove', async () => {
              setSkills(await api.removeSkill(skill.id)); setRemoving('');
            })}>确认删除</button>
          </> : <>
            <button className="quiet" disabled={Boolean(busy)} aria-pressed={skill.enabled}
              onClick={() => void perform('toggle', async () => setSkills(await api.saveSkill({ ...skill, enabled: !skill.enabled })))}>
              {skill.enabled ? '已启用' : '启用'}</button>
            <button className="quiet" disabled={Boolean(busy)} onClick={() => setDraft(skill)}>编辑</button>
            <button className="quiet" disabled={Boolean(busy)} onClick={() => setRemoving(skill.id)}>删除</button>
          </>}
        </div>
      </article>)}
    </div>}
    {notice && <p className="success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
