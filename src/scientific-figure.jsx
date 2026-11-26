import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FIGURE_EXAMPLES, FIGURE_MAX_DATA, FIGURE_TEXT_LIMITS, FIGURE_THEMES, FIGURE_TYPES, FIGURE_WIDTHS,
  normalizeFigureDraft, inspectFigureInput, planFigure } from '../desktop/scientific-figure.mjs';
import { Icon } from './icons.jsx';
import { flowPromptLimit } from '../desktop/figure-workflow.mjs';
import { FLOW_REFERENCE_AUTO, FLOW_REFERENCE_GALLERY, flowReferencePreviewData } from '../desktop/flow-reference-gallery.mjs';

const JOURNAL_PRESETS = [
  { id: 'nature', label: 'Nature 单栏', theme: 'color', width: 720 },
  { id: 'science', label: 'Science 双栏', theme: 'color', width: 1080 },
  { id: 'ieee', label: 'IEEE 黑白', theme: 'mono', width: 720 },
  { id: 'slides', label: '宽幅演示', theme: 'ink', width: 1440 },
];

function parseGrid(raw) {
  const lines = (raw || '').trim().split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return { sep: ',', rows: [['类别', '系列 A'], ['样本 1', '10']] };
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const rows = lines.map(line => line.split(sep).map(cell => cell.trim()));
  const cols = Math.max(2, ...rows.map(r => r.length));
  return { sep, rows: rows.map(r => Array.from({ length: cols }, (_, i) => r[i] ?? '')) };
}

function serializeGrid(rows, sep = ',') {
  return rows.map(r => r.join(sep)).join('\n');
}

function svgToDataUrl(svg) {
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'data:image/svg+xml;base64,' + btoa(bin);
}

function transposeDelimited(raw) {
  const lines = raw.trim().split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return raw;
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const matrix = lines.map(line => line.split(sep).map(cell => cell.trim()));
  const maxCols = Math.max(...matrix.map(r => r.length));
  const out = [];
  for (let c = 0; c < maxCols; c++) {
    out.push(matrix.map(r => r[c] ?? '').join(sep));
  }
  return out.join('\n');
}

export function figureExample(kind = 'line') {
  return normalizeFigureDraft({ kind, data: FIGURE_EXAMPLES[kind], title: '示例：' + FIGURE_TYPES[kind] });
}

export function FigureReview({ result }) {
  return <div className="figure-review">
    {result.summary && <p>{result.summary}</p>}
    {result.recommendation && <p className="muted">{result.recommendation}</p>}
    {result.warnings?.length > 0 && <ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
  </div>;
}

export function FigureEditor({ figure, change, generate, busy, disabled, review, model, openSettings, cancel, workflow, flow, splitFlow,
  flowPrompt = '', setFlowPrompt, flowRequirements = '', flowConstraints = '', changeFlowNeeds,
  flowReferenceId = 'auto', setFlowReferenceId, canDraftImage = false, onLivePreview }) {
  const draft = useMemo(() => normalizeFigureDraft(figure), [figure]);
  const deferred = useDeferredValue(draft);
  const [dataView, setDataView] = useState('table'); // 'table' | 'csv'
  const [fileError, setFileError] = useState('');
  const importGeneration = useRef(0);
  useEffect(() => () => { importGeneration.current++; }, []);
  const [importing, setImporting] = useState(false);
  const [reviewResult, setReviewResult] = useState(null);
  const [reviewError, setReviewError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [flowInput, setFlowInput] = useState(() => flow && flowPrompt.trim() && !draft.data.trim() ? 'prompt' : 'steps');
  const [flowError, setFlowError] = useState('');
  const [flowNotice, setFlowNotice] = useState('');
  const [splitting, setSplitting] = useState(false);
  const currentDraft = useRef(draft);
  useEffect(() => { currentDraft.current = draft; }, [draft]);
  const diagram = draft.kind === 'diagram';
  const hasFlowDescription = flow && Boolean(flowPrompt.trim());
  const exampleTitle = '示例：' + FIGURE_TYPES[draft.kind];
  const plan = useMemo(() => {
    if (!deferred.data.trim()) return null;
    try {
      return inspectFigureInput(deferred);
    } catch (error) { return { error: error.message }; }
  }, [deferred]);

  const liveSvg = useMemo(() => {
    if (diagram || !deferred.data.trim() || !plan || plan.error) return null;
    try {
      const rendered = planFigure(deferred);
      return { data: svgToDataUrl(rendered.svg), title: deferred.title || FIGURE_TYPES[deferred.kind], summary: rendered.summary, warnings: rendered.warnings };
    } catch { return null; }
  }, [diagram, deferred, plan]);

  useEffect(() => {
    if (!onLivePreview) return;
    if (liveSvg) {
      onLivePreview({
        id: 'live-data-svg',
        type: 'image',
        live: true,
        title: liveSvg.title,
        data: liveSvg.data,
        figure: { specification: deferred, summary: liveSvg.summary, warnings: liveSvg.warnings },
      });
    } else {
      onLivePreview(null);
    }
    return () => onLivePreview(null);
  }, [liveSvg, deferred, onLivePreview]);

  const grid = useMemo(() => parseGrid(draft.data), [draft.data]);

  function updateCell(rIdx, cIdx, val) {
    const next = grid.rows.map((row, r) => r === rIdx ? row.map((cell, c) => c === cIdx ? val : cell) : row);
    update({ data: serializeGrid(next, grid.sep) });
  }
  function addRow() {
    const cols = grid.rows[0]?.length || 2;
    const next = [...grid.rows, [`样本 ${grid.rows.length}`, ...Array(cols - 1).fill('0')]];
    update({ data: serializeGrid(next, grid.sep) });
  }
  function addCol() {
    const next = grid.rows.map((row, r) => [...row, r === 0 ? `系列 ${row.length}` : '0']);
    update({ data: serializeGrid(next, grid.sep) });
  }
  function removeRow(rIdx) {
    if (grid.rows.length <= 2) return;
    update({ data: serializeGrid(grid.rows.filter((_, r) => r !== rIdx), grid.sep) });
  }
  const ready = Boolean(plan && !plan.error && deferred === draft);
  const update = partial => change({ ...draft, ...partial,
    ...(Object.hasOwn(partial, 'data') && partial.data !== FIGURE_EXAMPLES[draft.kind] && draft.title === exampleTitle ? { title: '' } : {}) });
  async function splitPrompt() {
    const description = flowPrompt.trim();
    if (!splitFlow || !description || disabled || importing || splitting) return;
    if (draft.data.trim() && !window.confirm('用 AI 拆出的步骤替换当前步骤？')) return;
    const generation = ++importGeneration.current;
    setSplitting(true);
    setFlowError('');
    setFlowNotice('');
    try {
      const steps = await splitFlow(description);
      if (generation !== importGeneration.current) return;
      const latest = currentDraft.current;
      if (latest.data !== draft.data) {
        setFlowError('流程步骤已在拆分期间更新。请重新拆分后再替换。');
        return;
      }
      change({ ...latest, data: steps.join('\n'), ...(latest.title === exampleTitle ? { title: '' } : {}) });
      setFlowInput('steps');
      setFlowNotice(`已填入 ${steps.length} 个步骤，可继续编辑。`);
    } catch (error) {
      if (generation === importGeneration.current) setFlowError(error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
    } finally {
      if (generation === importGeneration.current) setSplitting(false);
    }
  }
  async function askReview() {
    setReviewing(true);
    setReviewResult(null);
    setReviewError('');
    try { setReviewResult({ draft, value: await review() }); }
    catch (error) { setReviewError(error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { setReviewing(false); }
  }
  function field(key, maxLength) {
    return { value: draft[key], maxLength, onChange: event => update({ [key]: event.target.value }) };
  }
  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const generation = ++importGeneration.current;
    setImporting(true);
    setFileError('');
    try {
      const isJSON = /\.json$/i.test(file.name);
      if (!isJSON && !/\.(csv|tsv|txt)$/i.test(file.name)) throw new Error('请选择 CSV、TSV、TXT 或 Sparkseed 图稿。');
      if (file.size > FIGURE_MAX_DATA * 6 + 20000) throw new Error('文件太大，请先保留需要绘制的数据。');
      const data = await file.text();
      let next;
      if (isJSON) {
        let value;
        try { value = JSON.parse(data); } catch { /* handled below */ }
        if (value?.format !== 'sparkseed-scientific-figure' || value.version !== 1 ||
            typeof value.specification?.data !== 'string' || !Object.hasOwn(FIGURE_TYPES, value.specification.kind)) {
          throw new Error('请选择由 Sparkseed 导出的科研图稿。');
        }
        if (value.specification.data.length > FIGURE_MAX_DATA) throw new Error('图稿中的数据超出长度上限。');
        if (flow !== (value.specification.kind === 'diagram')) throw new Error('请先切换到与导入图稿相同的图片类型。');
        next = normalizeFigureDraft(value.specification);
      } else {
        if (data.length > FIGURE_MAX_DATA) throw new Error('文件太大，请先保留需要绘制的数据。');
        if (data.includes('\uFFFD') || data.includes('\0')) throw new Error('请将表格另存为 UTF-8 CSV 或 TSV 后再导入。');
        next = { ...draft, data, ...(draft.title === exampleTitle ? { title: '' } : {}) };
      }
      if (generation === importGeneration.current) change(next);
    } catch (error) {
      if (generation === importGeneration.current) setFileError(error.message);
    } finally {
      if (generation === importGeneration.current) setImporting(false);
    }
  }
  return <form className="figure-editor" onSubmit={event => {
    event.preventDefault();
    const engine = event.nativeEvent.submitter?.value;
    if (disabled || importing || splitting) return;
    if (engine === 'image-draft') {
      if (flow && model && canDraftImage && (ready || hasFlowDescription)) generate('image-draft');
      return;
    }
    if (engine !== 'local' && hasFlowDescription && (flowInput === 'prompt' || !ready)) {
      if (model) generate('detailed');
      return;
    }
    if (!ready) return;
    const offline = event.nativeEvent.submitter?.value === 'local';
    if (offline || model) generate(offline ? 'local' : undefined);
  }}>
    <div className="figure-editor-grid">
      <fieldset disabled={disabled || importing || splitting}>
        {!flow && <div className="figure-kind-pills" role="group" aria-label="选择图表类型">
          {Object.entries(FIGURE_TYPES).filter(([key]) => key !== 'diagram').map(([key, label]) =>
            <button key={key} type="button" className="filter-pill" aria-pressed={draft.kind === key}
              onClick={() => {
                if (draft.data === FIGURE_EXAMPLES[draft.kind]) {
                  const sample = figureExample(key);
                  change({ ...draft, kind: key, data: sample.data, title: draft.title === exampleTitle ? sample.title : draft.title });
                } else update({ kind: key });
              }}>{label}</button>)}
        </div>}
        {flow && <label>录入方式<select value={flowInput} onChange={event => {
          setFlowInput(event.target.value);
          setFlowError('');
          setFlowNotice('');
        }}>
          <option value="steps">手动填写步骤</option>
          <option value="prompt">输入描述，由 AI 拆分</option>
        </select></label>}
        {flow && flowInput === 'prompt' ? <div className="figure-flow-prompt">
          <label>流程描述<textarea value={flowPrompt} maxLength={flowPromptLimit} rows={4}
            placeholder="例如：先采集样本，检查数据质量，最后汇总结果。" onChange={event => setFlowPrompt(event.target.value)} /></label>
          <p className="muted">{splitFlow ? '可先拆分并编辑步骤，或直接按描述中的画布、图元和文字要求绘制 SVG。' : '连接绘图模型后可使用 AI 拆分和详细绘制。'}</p>
          {splitFlow ? <button type="button" className="quiet icon-label" disabled={!flowPrompt.trim() || splitting} onClick={() => void splitPrompt()}>
            <Icon name="stars" />{splitting ? '正在拆分…' : '拆分并填入步骤'}
          </button> : <button type="button" className="quiet" onClick={openSettings}>连接绘图模型</button>}
        </div> : <>
        <div className="figure-data-heading">
          <div className="inline-actions">
            <label htmlFor="figure-data">{diagram ? '流程步骤' : '数据源'}</label>
            {!diagram && <div className="figure-data-mode-switch" role="group" aria-label="数据编辑视图">
              <button type="button" className="filter-pill" aria-pressed={dataView === 'table'} onClick={() => setDataView('table')}>表格</button>
              <button type="button" className="filter-pill" aria-pressed={dataView === 'csv'} onClick={() => setDataView('csv')}>CSV</button>
            </div>}
          </div>
          <div className="inline-actions">
            {!diagram && draft.data.trim() && <button type="button" className="quiet" title="行列转置（互换横纵轴维度）"
              onClick={() => update({ data: transposeDelimited(draft.data) })}>转置</button>}
            <button type="button" className="quiet" onClick={() => {
              if (draft.data.trim() && !Object.values(FIGURE_EXAMPLES).includes(draft.data) &&
                  !window.confirm('用示例替换当前数据？已保存的作品不会改变。')) return;
              setFileError('');
              change(figureExample(draft.kind));
            }}>示例</button>
            <label className="figure-file"><Icon name="import" />导入
              <input type="file" accept=".csv,.tsv,.txt,.json" onChange={importFile} aria-label="导入 CSV、TSV 或科研图稿" />
            </label>
          </div>
        </div>
        {!diagram && dataView === 'table' ? <div className="figure-grid-editor">
          <div className="figure-grid-scroll">
            <table>
              <thead>
                <tr>
                  {grid.rows[0]?.map((cell, cIdx) => <th key={cIdx}>
                    <input value={cell} aria-label={`第 ${cIdx + 1} 列标题`}
                      onChange={e => updateCell(0, cIdx, e.target.value)} />
                  </th>)}
                  <th className="grid-action-col" />
                </tr>
              </thead>
              <tbody>
                {grid.rows.slice(1).map((row, idx) => {
                  const rIdx = idx + 1;
                  return <tr key={rIdx}>
                    {row.map((cell, cIdx) => <td key={cIdx}>
                      <input value={cell} aria-label={`第 ${rIdx} 行第 ${cIdx + 1} 列`}
                        onChange={e => updateCell(rIdx, cIdx, e.target.value)} />
                    </td>)}
                    <td className="grid-action-col">
                      <button type="button" className="quiet" title="删除此行" disabled={grid.rows.length <= 2}
                        onClick={() => removeRow(rIdx)}>×</button>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="figure-grid-actions">
            <button type="button" className="quiet" onClick={addRow}>+ 添加行</button>
            <button type="button" className="quiet" onClick={addCol}>+ 添加列</button>
            {plan && !plan.error && plan.summary && <span className="muted">{plan.summary}</span>}
          </div>
        </div> : <>
          <textarea id="figure-data" {...field('data', FIGURE_MAX_DATA)} rows={7} spellCheck={false}
            placeholder={diagram ? '写下步骤、输入输出和分支关系' : FIGURE_EXAMPLES[draft.kind]} aria-describedby="figure-data-hint" />
          <p className="muted" id="figure-data-hint">{diagram ? '每行一个步骤，保留必要术语和条件。' :
            '可直接从 Excel 复制粘贴。首行为列名，第一列为横轴或类别，其余列为数值；空值请留空。'}</p>
          {plan && !plan.error && !diagram && plan.summary && <p className="figure-data-summary">
            <Icon name="check" />{plan.summary}
          </p>}
        </>}
        </>}
        {flow && <div className="figure-flow-prompt">
          <label>绘图要求（选填）<textarea value={flowRequirements} rows={3} maxLength={flowPromptLimit}
            placeholder="例如：用于论文方法图，突出三个降维阶段，用彩色光谱条表示输入输出。"
            onChange={event => changeFlowNeeds({ flowRequirements: event.target.value })} /></label>
          <label>必须遵守的约束（选填）<textarea value={flowConstraints} rows={3} maxLength={flowPromptLimit}
            placeholder="例如：英文标签，画布 2:1，保留公式下标和全部分支。"
            onChange={event => changeFlowNeeds({ flowConstraints: event.target.value })} /></label>
          {workflow === 'hybrid' && (flowRequirements.trim() || flowConstraints.trim()) &&
            <p className="muted">绘图要求和约束用于 AI 生成，顺序草图仅使用已填步骤。</p>}
        </div>}
        {flow && <details className="figure-options flow-gallery-options">
          <summary>构图参考库 · 选填</summary>
          <p className="muted">选择适合本领域的构图范式。参考图只提供布局思路，论文证据和硬性约束仍单独处理。</p>
          <div className="flow-gallery-grid" role="group" aria-label="流程图构图参考">
            {[FLOW_REFERENCE_AUTO, ...FLOW_REFERENCE_GALLERY].map(profile => <button key={profile.id} type="button"
              className="flow-gallery-option" aria-pressed={(flowReferenceId || 'auto') === profile.id}
              onClick={() => setFlowReferenceId?.(profile.id)}>
              <img src={flowReferencePreviewData(profile.id)} alt="" loading="lazy" />
              <strong>{profile.label}</strong>
              <span>{profile.description}</span>
            </button>)}
          </div>
        </details>}
        {flowNotice && <p className="muted" role="status">{flowNotice}</p>}
        {flowError && <p className="error" role="alert">{flowError}</p>}
        {fileError && <p className="error" role="alert">{fileError}</p>}
        {!diagram && <div className="figure-quick-style-bar">
          <div className="figure-style-group" role="group" aria-label="顶刊一键预设">
            <span className="muted">期刊</span>
            {JOURNAL_PRESETS.map(preset => <button key={preset.id} type="button" className="filter-pill"
              aria-pressed={draft.theme === preset.theme && Number(draft.width) === preset.width}
              onClick={() => update({ theme: preset.theme, width: preset.width })}>{preset.label}</button>)}
          </div>
          <div className="figure-style-group" role="group" aria-label="配色与幅宽">
            <span className="muted">配色</span>
            {Object.entries(FIGURE_THEMES).map(([id, label]) => <button key={id} type="button" className="filter-pill"
              aria-pressed={draft.theme === id} onClick={() => update({ theme: id })}>{label}</button>)}
            <span className="muted">幅宽</span>
            {Object.entries(FIGURE_WIDTHS).map(([width, label]) => <button key={width} type="button" className="filter-pill"
              aria-pressed={Number(draft.width) === Number(width)} onClick={() => update({ width: Number(width) })}>{label}</button>)}
          </div>
        </div>}
        <details className="figure-options"><summary>坐标轴标签与图注</summary>
          <div className="figure-option-grid">
            {!diagram && <><label><span>横轴名称与单位</span><input {...field('xLabel', FIGURE_TEXT_LIMITS.xLabel)} /></label>
              <label><span>纵轴名称与单位</span><input {...field('yLabel', FIGURE_TEXT_LIMITS.yLabel)} /></label></>}
            <label className="figure-caption"><span>图注</span><textarea {...field('caption', FIGURE_TEXT_LIMITS.caption)} rows={2}
              placeholder="可注明数据来源、样本量或误差含义。" /></label>
          </div>
        </details>
      </fieldset>
      <div className="figure-proof">
        {plan?.error ? <p className="error" role="alert">{plan.error}</p> : plan && <FigureReview result={plan} />}
        <p className="muted">{flow ? '正式出图前会核验论文插图和各阶段的原文依据。Agent 绘制时会先规划整张图的阅读顺序和各区域大小。' :
          workflow === 'agent' ? '绘图材料和需求会发送给 Agent，由它生成 SVG。' :
          '表格数据可以直接在本机绘图，模型建议为选填。'}</p>
        <div className="inline-actions">
          {model ? <button className={workflow === 'hybrid' && !flow ? 'quiet icon-label' : 'primary icon-label'} disabled={disabled || importing || splitting || !(ready || hasFlowDescription)}>
            <Icon name="stars" />{busy ? '正在生成…' : flow ? '分析并生成流程图' : workflow === 'hybrid' ? '绘图并获取模型建议' : '生成图稿'}
          </button> : workflow === 'agent' || flow ? <button type="button" className="quiet" disabled={disabled} onClick={openSettings}>连接绘图模型</button> : null}
          {flow && model && canDraftImage && <button className="quiet" value="image-draft"
            disabled={disabled || importing || splitting || !(ready || hasFlowDescription)}>先生成视觉草案，再绘制 SVG</button>}
          {workflow === 'hybrid' && <button className={flow && model ? 'quiet' : 'primary'} value="local"
            disabled={disabled || importing || splitting || !plan || !!plan.error || deferred !== draft}>{flow ? '生成顺序草图' : '绘制数据图'}</button>}
          {busy && <button type="button" className="quiet" onClick={cancel}>停止</button>}
        </div>
        {review && plan && !plan.error && <details className="figure-options">
          <summary>请 Agent 给出绘图建议</summary>
          <p className="muted">发送需求回答、标题、图注和检查摘要，不发送图形或原始数据表。</p>
          <button className="quiet" type="button" disabled={disabled || importing || reviewing || deferred !== draft} onClick={() => void askReview()}>
            {reviewing ? '正在评审…' : '发送并获取建议'}
          </button>
          {reviewError && <p className="error" role="alert">{reviewError}</p>}
          {reviewResult?.draft === draft && <div className="figure-review" role="status">
            {reviewResult.value.title && <p>建议标题：{reviewResult.value.title}</p>}
            {reviewResult.value.caption && <p>建议图注：{reviewResult.value.caption}</p>}
            <ul>{reviewResult.value.checks.map((item, index) => <li key={index}>{item}</li>)}</ul>
            {(reviewResult.value.title || reviewResult.value.caption) && <button className="quiet" type="button" disabled={disabled || importing}
              onClick={() => update({
                ...(reviewResult.value.title ? { title: reviewResult.value.title } : {}),
                ...(reviewResult.value.caption ? { caption: reviewResult.value.caption } : {}),
              })}>采用标题和图注建议</button>}
          </div>}
        </details>}
      </div>
    </div>
  </form>;
}
