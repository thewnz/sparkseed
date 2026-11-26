import { useId, useRef, useState } from 'react';
import { Icon } from './icons.jsx';

export function ResearchTaskDelete({ job, title, disabled = false, onDeleted }) {
  const labelId = useId();
  const dialog = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = job.status === 'running' || job.status === 'queued';

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await window.recorder.removeResearchWork(job.id);
      dialog.current?.close();
      onDeleted?.();
    } catch (failure) {
      setError(failure.message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
    } finally { setBusy(false); }
  }

  return <>
    <button type="button" className="quiet icon-label record-remove" disabled={disabled || busy}
      aria-label={'删除任务：' + title} onClick={() => { setError(''); dialog.current.showModal(); }}>
      <Icon name="trash" />删除
    </button>
    <dialog ref={dialog} className="research-warning idea-delete" aria-labelledby={labelId} onCancel={event => {
      if (busy) event.preventDefault();
    }}>
      <span className="research-symbol"><Icon name="trash" /></span>
      <h2 id={labelId}>删除这项研究任务？</h2>
      <p className="delete-idea-title">{title}</p>
      <p>{active && '删除后，此任务将停止或移出队列。'}此任务及其结果将被永久删除。原 Idea、已收录论文和已确认的记忆会保留。</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" autoFocus disabled={busy} onClick={() => dialog.current.close()}>取消</button>
        <button type="button" className="delete-confirm" disabled={busy} onClick={() => void remove()}>
          {busy ? '正在删除…' : '确认删除'}
        </button>
      </div>
    </dialog>
  </>;
}
