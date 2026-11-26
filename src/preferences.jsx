import { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';
import { ResearchProfileSettings } from './research-profile.jsx';
import { ResearchTools } from './research-tools.jsx';
import { SkillSettings } from './skill-settings.jsx';
import { AutomationSettings } from './automation-settings.jsx';
import { defaultOpenings, defaultTypeface, fontSizes, typefaces } from '../desktop/appearance.mjs';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const themes = [
  ['system', '跟随系统'],
  ['light', '清透浅色'],
  ['paper', '温润纸张'],
  ['graphite', '深空石墨'],
  ['black', '极夜纯黑'],
];
const accents = [
  ['iris', '星雾紫'],
  ['blue', '学术蓝'],
  ['jade', '松石绿'],
  ['amber', '暖琥珀'],
];
const fontLabels = {
  studio: 'Geist / Noto Sans SC',
  system: 'Windows 系统无衬线',
  serif: 'Noto Serif SC 学术衬线',
};

const navGroups = [
  {
    label: '视觉与体验',
    items: [
      ['appearance', '外观与排版', 'appearance'],
      ['general', '全局与存储', 'keyboard'],
    ],
  },
  {
    label: '模型与自治',
    items: [
      ['agents', 'Agent 接入', 'agent'],
      ['automation', '自动化规则', 'bolt'],
    ],
  },
  {
    label: '记忆与扩展',
    items: [
      ['research', '研究记忆库', 'memory'],
      ['tools', '外部检索源', 'search'],
      ['skills', '科研技能', 'skill'],
      ['studio-skills', '制图技能', 'layers'],
    ],
  },
];

function AppearanceSettings({ appearance }) {
  const [openingDraft, setOpeningDraft] = useState(() => (appearance?.openings || defaultOpenings).join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function change(patch) {
    setError('');
    setBusy(true);
    try { await api.saveAppearance({ ...appearance, ...patch }); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  if (!appearance) return <p role="status">正在读取外观设置…</p>;

  return <>
    <div className="preference-section-intro">
      <h2>外观与排版</h2>
      <p className="muted">定制全局色彩质感、强调色与阅读字号，实时同步至所有研究工作舱。</p>
    </div>

    <fieldset disabled={busy} className="preference-group">
      <legend>视觉主题</legend>
      <div className="theme-grid">
        {themes.map(([id, name]) => <label key={id} className="theme-choice" data-active={appearance.mode === id || undefined}>
          <input className="visually-hidden" type="radio" name="theme" checked={appearance.mode === id}
            onChange={() => void change({ mode: id })} />
          <span className="theme-sample" data-sample={id} aria-hidden="true"><i /><b /><em /></span>
          <span className="theme-choice-label">{name}{appearance.mode === id && <Icon name="check" />}</span>
        </label>)}
      </div>
    </fieldset>

    {appearance.mode === 'system' && <section className="preference-group system-options" aria-label="系统配色">
      <label><Icon name="sun" />系统处于浅色模式时使用
        <select value={appearance.light} disabled={busy} onChange={event => void change({ light: event.target.value })}>
          <option value="light">清透浅色</option>
          <option value="paper">温润纸张</option>
        </select>
      </label>
      <label><Icon name="moon" />系统处于深色模式时使用
        <select value={appearance.dark} disabled={busy} onChange={event => void change({ dark: event.target.value })}>
          <option value="graphite">深空石墨</option>
          <option value="black">极夜纯黑</option>
        </select>
      </label>
    </section>}

    <fieldset disabled={busy} className="preference-group">
      <legend>品牌强调色</legend>
      <div className="accent-grid">
        {accents.map(([id, name]) => <label key={id} className="accent-choice" data-swatch={id}
          data-active={appearance.accent === id || undefined}>
          <input className="visually-hidden" type="radio" name="accent" checked={appearance.accent === id}
            onChange={() => void change({ accent: id })} />
          <span className="swatch" aria-hidden="true">{appearance.accent === id && <Icon name="check" />}</span>
          <span>{name}</span>
        </label>)}
      </div>
    </fieldset>

    <fieldset disabled={busy} className="preference-group typography-settings">
      <legend>字体与阅读尺度</legend>
      <div className="typography-controls">
        <label>界面与正文字体
          <select value={appearance.typeface} onChange={event => void change({ typeface: event.target.value })}>
            {typefaces.map(id => <option key={id} value={id}>{fontLabels[id]}{id === defaultTypeface ? '（默认）' : ''}</option>)}
          </select>
        </label>
        <label>基准字号
          <select value={appearance.fontSize} onChange={event => void change({ fontSize: Number(event.target.value) })}>
            {fontSizes.map(size => <option key={size} value={size}>{size} px{size === 14 ? '（默认）' : ''}</option>)}
          </select>
        </label>
        <label className="weight-control">
          <span>正文增强字重</span>
          <input type="checkbox" role="switch" checked={appearance.bold} onChange={event => void change({ bold: event.target.checked })} />
        </label>
      </div>
      <div className="typography-preview" aria-label="字体预览">
        <strong>从半句话的怀疑开始，直到每一条结论都能锚定原文证据。</strong>
        <span>Sparkseed · 火种科研工作站 · ABC abc 0123456789</span>
      </div>
      {(appearance.typeface !== defaultTypeface || appearance.fontSize !== 14 || appearance.bold) &&
        <button type="button" className="quiet" onClick={() => void change({ typeface: defaultTypeface, fontSize: 14, bold: false })}>
          恢复默认字体与字号
        </button>}
    </fieldset>

    <form className="preference-group opening-preferences" onSubmit={event => {
      event.preventDefault();
      void change({ openings: openingDraft.split(/\r?\n/) });
    }}>
      <h3>新对话开场提示</h3>
      <label>每行一句，新建对话时随机展示
        <textarea rows={5} maxLength={2000} value={openingDraft}
          onChange={event => setOpeningDraft(event.target.value)} />
      </label>
      <div className="inline-actions">
        <button className="primary" disabled={busy}>{busy ? '正在保存…' : '保存开场语'}</button>
        <button type="button" className="quiet" disabled={busy} onClick={() => {
          setOpeningDraft(defaultOpenings.join('\n'));
          void change({ openings: defaultOpenings });
        }}>恢复默认</button>
      </div>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}

const customTemplates = {
  custom: [
    { label: 'Ollama 本地', base: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:14b' },
    { label: 'LM Studio', base: 'http://127.0.0.1:1234/v1', model: 'local-model' },
    { label: 'vLLM 本地', base: 'http://127.0.0.1:8000/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
    { label: 'OneAPI / 聚合网关', base: 'https://api.example.com/v1', model: 'gpt-4o' },
  ],
  'custom-anthropic': [
    { label: 'DeepSeek Anthropic', base: 'https://api.deepseek.com/anthropic', model: 'deepseek-chat' },
    { label: '智谱 GLM Anthropic', base: 'https://open.bigmodel.cn/api/anthropic', model: 'glm-4-plus' },
    { label: 'MiniMax Anthropic', base: 'https://api.minimaxi.com/anthropic', model: 'MiniMax-Text-01' },
  ],
};

function ApiForm({ entry, save, close }) {
  const [form, setForm] = useState({ base: entry.base, model: entry.model, key: '', clearKey: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const templates = customTemplates[entry.id] || [];
  function field(key) {
    return { value: form[key], onChange: event => setForm(previous => ({ ...previous, [key]: event.target.value })) };
  }
  return <form className="api-form" onSubmit={async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try { await api.configureApi(entry.id, form); await save(); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }}>
    <h3>配置 {entry.label}</h3>
    {entry.preset
      ? <p className="muted">已预填官方接口地址与推荐模型，填入 API Key 即可使用；地址与模型支持自定义修改。</p>
      : <p className="muted">可填写任意 {entry.id === 'custom-anthropic' ? 'Anthropic' : 'OpenAI'} 兼容网关或本机服务地址（本机支持 http://127.0.0.1，免密钥服务可留空 API Key）。</p>}
    {templates.length > 0 && <div className="api-chips" aria-label="常用地址模板">
      {templates.map(item => <button key={item.label} type="button" className="api-chip"
        onClick={() => setForm(previous => ({ ...previous, base: item.base, model: item.model }))}>
        {item.label}
      </button>)}
    </div>}
    <label>API Base URL<input type="url" autoFocus={!entry.preset} required placeholder="https://api.example.com/v1" {...field('base')} /></label>
    <label>默认模型 ID<input required placeholder="例如 gpt-4.1" {...field('model')} /></label>
    <label>API Key<input type="password" autoComplete="off" disabled={form.clearKey} autoFocus={entry.preset && !entry.hasKey}
      placeholder={entry.hasKey ? '密钥已加密存储，留空则继续沿用' : (entry.preset ? '输入服务商提供的 API Key' : '输入 API Key（本机 Ollama/vLLM 可留空）')} {...field('key')} /></label>
    {entry.hasKey && <label className="choice"><input type="checkbox" checked={form.clearKey}
      onChange={event => setForm({ ...form, clearKey: event.target.checked, key: '' })} />移除已保存的 API Key</label>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions">
      <button type="button" className="quiet" disabled={busy} onClick={close}>取消</button>
      <button className="primary" disabled={busy}>{busy ? '正在保存…' : '保存连接'}</button>
    </div>
  </form>;
}

const modelPresets = [
  'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini',
  'claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5',
  'gemini-2.0-flash', 'gemini-2.5-pro', 'grok-3-mini', 'mistral-large-latest',
  'deepseek-chat', 'deepseek-reasoner', 'qwen-plus', 'qwen-max',
  'glm-4-plus', 'moonshot-v1-8k', 'doubao-pro-32k', 'MiniMax-Text-01',
];

function ApiModelForm({ entry, save, close }) {
  const [model, setModel] = useState(entry.model);
  const [models, setModels] = useState([]);
  const [recommended, setRecommended] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api.listApiModels(entry.id).then(result => {
      if (!active) return;
      const list = Array.isArray(result) ? result : result?.models || [];
      const top = Array.isArray(result) ? '' : result?.recommended || '';
      setModels([...new Set(list)]);
      setRecommended(top);
      setModel(current => current && current.trim() ? current : top);
    }, () => { if (active) setError('无法在线拉取模型列表，可直接输入模型 ID。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entry.id, reloadKey]);

  const choices = models.length ? models : modelPresets;

  return <form className="api-form cli-model-form" onSubmit={async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.configureApi(entry.id, { base: entry.base, model, key: '', clearKey: false });
      await save();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }}>
    <h3>切换 {entry.label} 模型</h3>
    <div className="actions">
      <button type="button" className="quiet" disabled={busy || loading}
        onClick={() => setReloadKey(value => value + 1)}>
        <Icon name="refresh" />{loading ? '正在拉取模型列表…' : '刷新官方模型列表'}
      </button>
    </div>
    {recommended && <p className="muted">官方主推：{recommended}</p>}
    <label>可用模型
      <select value={choices.includes(model) ? model : ''} onChange={event => setModel(event.target.value)}>
        <option value="">{loading ? '正在读取模型…' : '从列表中选择'}</option>
        {choices.map(id => <option key={id} value={id}>{id === recommended ? id + '（官方主推）' : id}</option>)}
      </select>
    </label>
    <label>模型 ID
      <input autoFocus maxLength={240} value={model} onChange={event => setModel(event.target.value)}
        placeholder="可直接手动填写模型 ID" />
    </label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions">
      <button type="button" className="quiet" disabled={busy} onClick={close}>取消</button>
      <button className="primary" disabled={busy || !model.trim()}>{busy ? '正在保存…' : '保存模型'}</button>
    </div>
  </form>;
}

function CliModelForm({ entry, save, close }) {
  const [model, setModel] = useState(entry.model);
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api.listCliModels(entry.id).then(result => { if (active) setModels([...new Set(result)]); }, () => {});
    return () => { active = false; };
  }, [entry.id]);

  return <form className="api-form cli-model-form" onSubmit={async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try { await api.configureCliModel(entry.id, model); await save(); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }}>
    <h3>{entry.label} 模型配置</h3>
    {models.length > 0 && <label>检测到的可用模型
      <select value={models.includes(model) ? model : ''} onChange={event => setModel(event.target.value)}>
        <option value="">使用 CLI 默认模型</option>
        {models.map(id => <option key={id} value={id}>{id}</option>)}
      </select>
    </label>}
    <label>模型名或别名
      <input autoFocus maxLength={200} value={model} onChange={event => setModel(event.target.value)}
        placeholder="留空则跟随 CLI 默认配置" />
    </label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions">
      <button type="button" className="quiet" disabled={busy} onClick={close}>取消</button>
      <button className="primary" disabled={busy}>保存模型</button>
    </div>
  </form>;
}

function ConnectionCard({ entry, primary, local, pending, onTest, onStop, onDefault, onEdit, onModel }) {
  const available = local ? entry.installed : entry.preset ? Boolean(entry.base) && entry.hasKey : Boolean(entry.base);
  const testing = pending || entry.test?.status === 'running';
  const status = testing ? '连接诊断中…' : !available ? local ? '未检测到本机 CLI' : '尚未配置' :
    entry.test?.status === 'ready' ? '连接就绪' : entry.test?.status === 'failed' ? '部分检测未通过' :
      entry.test?.status === 'cancelled' ? '诊断已中止' : local ? '已安装 · 待诊断' : '已配置 · 待诊断';

  return <article className="connection-card" data-primary={primary || undefined}>
    <header>
      <span className="connection-icon"><Icon name={local ? 'agent' : 'connection'} /></span>
      {primary && <span className="default-tag">默认主引擎</span>}
    </header>
    <h3>{entry.label}</h3>
    <p className="connection-status" aria-live="polite" data-status={available ? entry.test?.status : undefined}>
      <span aria-hidden="true" />{status}
    </p>
    {entry.model && <p className="connection-model" title={entry.model}>{entry.model}</p>}
    {entry.test?.stages && <dl className="agent-diagnostic">
      {Object.entries({ availability: local ? '安装' : '配置', auth: local ? '登录' : '鉴权', generation: '实际生成', cancel: '中断响应' }).map(([key, label]) => {
        const stage = entry.test.stages[key];
        return <div key={key}>
          <dt>{label}</dt>
          <dd data-status={stage?.status}>{stage?.message ||
            ({ running: '检测中', passed: '通过', failed: '失败', cancelled: '已停止' }[stage?.status] || '待检')}</dd>
        </div>;
      })}
    </dl>}
    {entry.test?.message && !testing && <p role="status" className="connection-message">{entry.test.message}</p>}
    <footer>
      {!local && <button className="quiet" disabled={testing} onClick={onEdit}>{available ? '编辑' : '配置'}</button>}
      {!local && available && <button className="quiet" disabled={testing} onClick={onModel}>模型</button>}
      {local && available && <button className="quiet" disabled={testing} onClick={onEdit}>模型</button>}
      {available && (testing ? <button className="quiet" onClick={onStop}>停止</button> : <button className="quiet" onClick={onTest}>诊断测试</button>)}
      {available && !primary && <button className="primary" disabled={testing} onClick={onDefault}>设为默认</button>}
    </footer>
  </article>;
}

function AgentSettings({ data, reload }) {
  const [editing, setEditing] = useState('');
  const [modelEditing, setModelEditing] = useState('');
  const [pending, setPending] = useState({});
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const entry = data.entries.find(item => item.id === editing);
  const modelEntry = data.entries.find(item => item.id === modelEditing);
  const isLocal = item => !item.api;

  const apiGroups = [
    { label: '国际模型', ids: ['openai', 'anthropic', 'gemini', 'xai', 'mistral', 'groq', 'together', 'perplexity', 'openrouter'] },
    { label: '国内模型', ids: ['deepseek', 'kimi-api', 'qwen', 'zhipu', 'doubao', 'minimax', 'siliconflow', 'stepfun', 'yi', 'qianfan', 'spark'] },
    { label: '自建与协议兼容', ids: ['custom', 'custom-anthropic'] },
  ];

  const configuredApi = data.entries.filter(item => item.api && (item.hasKey || (!item.preset && Boolean(item.base))));
  const statusText = item => pending[item.id] || item.test?.status === 'running' ? '测试中…'
    : item.test?.status === 'ready' ? '连接可用' : item.test?.status === 'failed' ? '部分未通过'
    : item.test?.status === 'cancelled' ? '测试已停止' : '已配置 · 待测试';

  useEffect(() => api.onAgentDiagnostic(() => { void reload().catch(err => setError(errorText(err))); }), [reload]);

  async function test(id) {
    setPending(previous => ({ ...previous, [id]: true }));
    setError('');
    try {
      await api.testConnection(id);
      await reload();
    } catch (err) { setError(errorText(err)); }
    finally { setPending(previous => ({ ...previous, [id]: false })); }
  }

  async function choose(id) {
    if (switching) return;
    setSwitching(true);
    setError('');
    try { await api.setDefaultAgent(id); await reload(); }
    catch (err) { setError(errorText(err)); }
    finally { setSwitching(false); }
  }

  return <>
    <div className="preference-title">
      <div>
        <h2>Agent 与大模型接入</h2>
        <p className="muted">支持复用本机 CLI 登录态或接入 OpenAI / Anthropic 兼容 API，API 密钥使用系统级加密存储。</p>
      </div>
      <button className="quiet icon-label" disabled={refreshing} onClick={async () => {
        setRefreshing(true);
        setError('');
        try { await reload(); } catch (err) { setError(errorText(err)); }
        finally { setRefreshing(false); }
      }}><Icon name="refresh" />{refreshing ? '正在扫描…' : '扫描本机 CLI'}</button>
    </div>

    <div className="default-row">
      <div>
        <span>当前默认思辨与研究引擎</span>
        <strong>{data.entries.find(item => item.id === data.provider)?.label || '纯本地记录模式（不调用模型）'}</strong>
      </div>
      {data.provider && <button className="quiet" disabled={switching} onClick={() => void choose('')}>切回纯本地模式</button>}
    </div>

    <section className="preference-group connection-group">
      <h3>本机命令行 Agent (CLI)</h3>
      <p className="muted">直接调用本机已安装并登录的 CLI 工具，无需重复填写密钥。</p>
      <div className="connection-grid">
        {data.entries.filter(isLocal).map(item => <ConnectionCard key={item.id} entry={item}
          primary={data.provider === item.id} local pending={pending[item.id]}
          onTest={() => void test(item.id)} onStop={() => void api.stopConnectionTest(item.id)}
          onDefault={() => void choose(item.id)} onEdit={() => setEditing(item.id)}
          onModel={() => setModelEditing(item.id)} />)}
      </div>
      {entry && isLocal(entry) && <CliModelForm key={entry.id} entry={entry} close={() => setEditing('')}
        save={async () => { await reload(); setEditing(''); }} />}
    </section>

    <section className="preference-group connection-group">
      <h3>云端与兼容 API 预设</h3>
      <p className="muted">点击服务商徽章即可填写 API Key；也可选「自定义」接入本地 Ollama / vLLM 或企业网关。</p>
      <div className="api-picker">
        {apiGroups.map(group => (
          <div className="api-picker-group" key={group.label}>
            <span className="api-picker-label">{group.label}</span>
            <div className="api-chips">
              {group.ids.map(id => data.entries.find(item => item.id === id)).filter(Boolean).map(item => (
                <button key={item.id} type="button" className="api-chip" data-active={editing === item.id || undefined}
                  data-configured={(item.hasKey || (!item.preset && Boolean(item.base))) || undefined}
                  onClick={() => setEditing(editing === item.id ? '' : item.id)}>
                  {item.label}{(item.hasKey || (!item.preset && Boolean(item.base))) && <i aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {entry && !isLocal(entry) && <ApiForm key={entry.id} entry={entry} close={() => setEditing('')}
        save={async () => { await reload(); setEditing(''); }} />}

      {configuredApi.length > 0 && <div className="api-configured">
        <h4>已接入的 API 服务</h4>
        {configuredApi.map(item => (
          <div className="api-configured-row" key={item.id} data-primary={data.provider === item.id || undefined}>
            <span className="api-configured-name">{item.label}{data.provider === item.id && <em>默认</em>}</span>
            <span className="api-configured-model" title={item.model}>{item.model}</span>
            <span className="api-configured-status" data-status={item.test?.status}>{statusText(item)}</span>
            <span className="api-configured-actions">
              {pending[item.id] || item.test?.status === 'running'
                ? <button className="quiet" onClick={() => void api.stopConnectionTest(item.id)}>停止</button>
                : <button className="quiet" onClick={() => void test(item.id)}>测试</button>}
              {data.provider !== item.id && <button className="quiet" disabled={switching} onClick={() => void choose(item.id)}>设为默认</button>}
              <button className="quiet" onClick={() => setModelEditing(item.id)}>模型</button>
              <button className="quiet" onClick={() => setEditing(item.id)}>编辑</button>
            </span>
          </div>
        ))}
      </div>}

      {modelEntry && !isLocal(modelEntry) && <ApiModelForm key={'model-' + modelEntry.id} entry={modelEntry}
        close={() => setModelEditing('')} save={async () => { await reload(); setModelEditing(''); }} />}
    </section>

    {error && <p className="error" role="alert">{error}</p>}
  </>;
}

function ReleaseSettings({ data }) {
  const [source, setSource] = useState(data.updateSource || '');
  const [savedSource, setSavedSource] = useState(data.updateSource || '');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  return <form className="preference-group" onSubmit={async event => {
    event.preventDefault();
    setChecking(true);
    setResult(null);
    setError('');
    try {
      setResult(await api.checkRelease(source));
      setSavedSource(source.trim());
    } catch (failure) { setError(errorText(failure)); }
    finally { setChecking(false); }
  }}>
    <h3>版本检查与更新源</h3>
    <p className="muted">当前客户端版本：v{data.appVersion || '0.1.0-beta'}</p>
    <label>更新清单地址 (updates.json)
      <input type="url" maxLength={2048} required disabled={checking} value={source}
        placeholder="https://…/updates.json" onChange={event => { setSource(event.target.value); setResult(null); setError(''); }} />
    </label>
    <div className="inline-actions">
      <button className="quiet" type="submit" disabled={checking || !source.trim()}>{checking ? '正在检查…' : '检查更新'}</button>
      {savedSource && <button className="quiet" type="button" disabled={checking} onClick={async () => {
        setChecking(true);
        setError('');
        try { await api.clearReleaseSource(); setSource(''); setSavedSource(''); setResult(null); }
        catch (failure) { setError(errorText(failure)); }
        finally { setChecking(false); }
      }}>清除更新源</button>}
      {result?.available && <button type="button" className="primary" onClick={() => void api.openSourceLink(result.downloadUrl).catch(failure => setError(errorText(failure)))}>打开下载页</button>}
    </div>
    {result && <p role="status">{result.available ? '发现新版本 ' + result.latest : result.status === 'older'
      ? '更新源版本 ' + result.latest + ' 低于当前版本。' : '当前已是更新源中的最新版本。'}</p>}
    {result?.notes && <p className="muted">{result.notes}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}

function GeneralSettings({ data, reload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  return <>
    <div className="preference-section-intro">
      <h2>全局快捷键与数据存储</h2>
      <p className="muted">配置系统级全局唤醒热键、后台文献初查开关及本地数据库目录。</p>
    </div>

    <section className="preference-group">
      <h3>系统全局热键</h3>
      <label className="general-row">快速捕捉灵感热键
        <select value={data.shortcutChoice} disabled={busy} onChange={async event => {
          setBusy(true);
          setError('');
          try { await api.setShortcut(event.target.value); await reload(); }
          catch (err) { setError(errorText(err)); }
          finally { setBusy(false); }
        }}>
          {Object.entries(data.shortcuts).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
        </select>
      </label>
      {!data.shortcut && <p className="error" role="alert">当前快捷键被其他软件占用，请切换另一组组合键。</p>}
      <p className="muted">{data.voiceShortcut ? `全局语音快记热键：${data.voiceShortcut}（说完自动落库保存）。` : '也可从系统托盘菜单随时唤起语音快记。'}</p>
      <p className="muted">应用内快捷键：<kbd>Ctrl+K</kbd> 全域指令面板 · <kbd>Ctrl+N</kbd> 新建思辨 · <kbd>Ctrl+/</kbd> 折叠会话栏。</p>
    </section>

    <section className="preference-group">
      <h3>后台自动初查</h3>
      <label className="general-row">新想法保存后自动启动文献初查与关联分析
        <input type="checkbox" checked={data.automaticResearch} disabled={busy} onChange={async event => {
          setBusy(true);
          setError('');
          try { await api.setAutomaticResearch(event.target.checked); await reload(); }
          catch (err) { setError(errorText(err)); }
          finally { setBusy(false); }
        }} />
      </label>
      <p className="muted">开启并配置默认 Agent 后，新记录的想法会在后台静默检索相近文献并生成深查建议。</p>
    </section>

    <section className="preference-group">
      <h3>系统桌面通知</h3>
      <label className="general-row">后台查证发现关键证据或需确认时推送通知
        <input type="checkbox" checked={data.researchNotifications !== false} disabled={busy} onChange={async event => {
          setBusy(true);
          setError('');
          try { await api.setResearchNotifications(event.target.checked); await reload(); }
          catch (err) { setError(errorText(err)); }
          finally { setBusy(false); }
        }} />
      </label>
      <div className="inline-actions">
        <button type="button" className="quiet" disabled={busy} onClick={async () => {
          setBusy(true);
          setError('');
          setNotice('');
          try {
            await api.testNotification();
            setNotice('测试通知已发出。若未弹出，请检查 Windows 专注助手设置。');
          } catch (err) { setError(errorText(err)); }
          finally { setBusy(false); }
        }}>{busy ? '正在发送…' : '发送测试通知'}</button>
      </div>
      {notice && <p className="success" role="status">{notice}</p>}
    </section>

    <section className="preference-group">
      <h3>窗口驻留机制</h3>
      <p className="muted">点击窗口右上角关闭按钮时，Sparkseed 会退驻至 Windows 系统托盘继续守护热键与后台研究；彻底退出请右键托盘图标。</p>
    </section>

    <ReleaseSettings data={data} />

    {data.dataFolder && <section className="preference-group">
      <h3>本地研究资料库</h3>
      <p className="muted">所有 SQLite 数据库、PDF 原文、批注与制图版本均离线存储在此目录：</p>
      <p className="settings-data-path">{data.dataFolder}</p>
      <button type="button" className="quiet icon-label" onClick={() => void api.openDataFolder().catch(err => setError(errorText(err)))}>
        <Icon name="external" />在资源管理器中打开
      </button>
    </section>}
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}

export function Preferences({
  section,
  onSection,
  data,
  appearance,
  reload,
  close,
  researchDrafts,
  setResearchDrafts,
  onUseSource,
  openIdea,
  skillDraft,
  setSkillDraft,
}) {
  const activeAgentLabel = data.entries.find(e => e.id === data.provider)?.label || '纯本地模式';

  return <div className="preferences control-center-shell">
    <header className="preferences-header academic-command-bar">
      <div className="page-heading">
        <div>
          <div className="academic-heading-row">
            <h1>偏好设置</h1>
            <span className="academic-progress-pill">
              v{data.appVersion || '0.1.0-beta'} · 引擎：{activeAgentLabel}
            </span>
          </div>
          <p>管理视觉外观、Agent 连接、研究记忆、科研技能与后台任务规则</p>
        </div>
      </div>
      <button className="quiet icon-label" onClick={close}><Icon name="back" />返回</button>
    </header>

    <div className="preferences-layout">
      <nav aria-label="设置分类" className="preferences-nav">
        {navGroups.map(group => <div className="preferences-nav-group" key={group.label}>
          <span className="paper-side-section-label">{group.label}</span>
          {group.items.map(([id, label, icon]) => <button key={id} type="button" className="quiet icon-label"
            aria-current={section === id ? 'page' : undefined}
            onClick={() => onSection(id)}>
            <Icon name={icon} />{label}
          </button>)}
        </div>)}
      </nav>

      <div className="preferences-content" key={section}>
        {section === 'appearance' ? <AppearanceSettings appearance={appearance} />
          : section === 'general' ? <GeneralSettings data={data} reload={reload} />
          : section === 'research' ? <ResearchProfileSettings drafts={researchDrafts} setDrafts={setResearchDrafts} openIdea={openIdea} />
          : section === 'tools' ? <ResearchTools onUse={onUseSource} />
          : section === 'skills' ? <SkillSettings draft={skillDraft} setDraft={setSkillDraft} provider={data.provider} />
          : section === 'studio-skills' ? <SkillSettings draft={skillDraft} setDraft={setSkillDraft}
              provider={data.provider} initialScope="studio" />
          : section === 'automation' ? <AutomationSettings />
          : <AgentSettings data={data} reload={reload} />}
      </div>
    </div>
  </div>;
}
