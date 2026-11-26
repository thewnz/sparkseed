import { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';
import { workStageLabel } from '../desktop/work-stage.mjs';
import { mandateLabel, policyNoticeText } from './work-labels.mjs';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const modes = [
  ['off', '关闭', '不创建任何自动任务。'],
  ['record', '只记录', '发现可自动处理的内容时，先建一条待确认任务，不消耗模型额度。'],
  ['act', '自动执行', '按规则直接执行；失败或需要判断时才提醒你。'],
];
const statusLabels = { queued: '排队中', running: '进行中', waiting: '等待你确认', failed: '失败', ended: '已结束' };
const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function AutomationSettings() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => void api.getAutomation().then(value => { if (live) setData(value); },
      error => { if (live) setError(errorText(error)); });
    load();
    const stop = api.onAutomationChanged(load);
    return () => { live = false; stop(); };
  }, []);
  async function save(patch) {
    setBusy('save');
    setError('');
    try { setData(await api.saveAutomation(patch)); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(''); }
  }
  async function act(action, id) {
    if (busy) return;
    setBusy(id);
    setError('');
    try {
      if (action === 'approve') await api.approveAutomation(id);
      else if (action === 'retry') await api.retryAutomation(id);
      else await api.dismissAutomation(id);
      setData(await api.getAutomation());
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(''); }
  }
  async function scan() {
    setBusy('scan');
    setError('');
    try { setData(await api.scanAutomation()); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(''); }
  }
  if (!data) return <p role="status">正在读取自动化设置…</p>;
  return <section className="automation-settings">
    <div className="preference-title"><h2>自动化</h2>
      <button className="quiet icon-label" disabled={Boolean(busy)} onClick={() => void scan()}>
        <Icon name="refresh" />{busy === 'scan' ? '正在扫描…' : '扫描论文'}</button>
    </div>
    <p className="muted">自动任务只在规则允许时执行；只有需要你判断、确认或失败时才出现提醒。</p>
    {data.attention > 0 && <p className="automation-attention" role="status">
      {data.attention} 项需要你处理。处理前不会继续消耗额度。</p>}
    <fieldset className="preference-group automation-modes">
      <legend>运行方式</legend>
      {modes.map(([id, label, description]) => <label key={id} className="automation-mode" data-active={data.mode === id}>
        <input className="visually-hidden" type="radio" name="automation-mode" checked={data.mode === id}
          disabled={Boolean(busy)} onChange={() => void save({ mode: id })} />
        <strong>{label}</strong><span>{description}</span>
        {data.mode === id && <Icon name="check" />}
      </label>)}
    </fieldset>
    <fieldset className="preference-group">
      <legend>规则</legend>
      <label className="general-row">新论文自动生成白话摘要
        <input type="checkbox" checked={data.autoPlain} disabled={Boolean(busy)}
          onChange={event => void save({ autoPlain: event.target.checked })} /></label>
      <label className="general-row">新论文自动生成自测题
        <input type="checkbox" checked={data.autoQuiz} disabled={Boolean(busy)}
          onChange={event => void save({ autoQuiz: event.target.checked })} /></label>
      <p className="muted">白话与自测都要求引用能在原文逐字定位；找不到依据时会停在待确认状态。</p>
    </fieldset>
    <section className="preference-group automation-jobs">
      <div className="preference-title"><h3>任务票据</h3><span className="muted">共 {data.jobs.length} 项</span></div>
      {!data.jobs.length && <p className="muted">还没有自动任务。导入并解析论文后会出现。</p>}
      {data.jobs.map(job => <article className="automation-job" key={job.id} data-status={job.status}>
        <header>
          <div><strong>{job.title}</strong><span className="muted">{job.stage} · 尝试 {job.attempts} 次{job.mandate ? ' · ' + mandateLabel(job.mandate) : ''}</span></div>
          <span className="automation-status" data-status={job.status}>{workStageLabel(job.workStage, 'automation') || statusLabels[job.status] || job.status}</span>
        </header>
        {job.policyNotice && <p className="muted work-policy-notice" role="status">{policyNoticeText(job.policyNotice)}</p>}
        {job.error && <p className="error">{job.error}</p>}
        {job.result?.ok && <p className="muted">已完成，结果可在对应论文中查看。</p>}
        <footer>
          <span className="muted">{dateFormat.format(new Date(job.created))}</span>
          {(job.status === 'waiting' || job.status === 'failed') && <>
            <button type="button" className="primary" disabled={Boolean(busy)} onClick={() => void act(job.status === 'waiting' ? 'approve' : 'retry', job.id)}>
              {job.status === 'waiting' ? '批准执行' : '重试'}</button>
            <button type="button" className="quiet" disabled={Boolean(busy)} onClick={() => void act('dismiss', job.id)}>忽略</button>
          </>}
        </footer>
      </article>)}
    </section>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
