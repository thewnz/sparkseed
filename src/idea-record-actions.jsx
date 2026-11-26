import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { ideaTitle } from './idea-text.mjs';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');

export function IdeaRecordActions({ idea }) {
  const id = useId();
  const dialog = useRef(null);
  const pin = useRef(null);
  const restorePinFocus = useRef(false);
  const [pinning, setPinning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pinError, setPinError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const title = ideaTitle(idea);
  const pinned = Boolean(idea.pinned_at);

  useLayoutEffect(() => {
    if (restorePinFocus.current && document.activeElement === document.body) pin.current?.focus();
    restorePinFocus.current = false;
  }, [pinned]);

  async function togglePin() {
    if (pinning) return;
    restorePinFocus.current = document.activeElement === pin.current;
    setPinError('');
    setPinning(true);
    try { await api.pinIdea(idea.id, !pinned); }
    catch (error) { restorePinFocus.current = false; setPinError(errorText(error)); }
    finally { setPinning(false); }
  }

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.removeIdea(idea.id);
      dialog.current?.close();
    } catch (error) { setDeleteError(errorText(error)); }
    finally { setDeleting(false); }
  }

  return <div className="record-actions" data-pinned={pinned}>
    <button ref={pin} type="button" className="quiet record-pin" aria-label={'置顶 ' + title} aria-pressed={pinned}
      aria-disabled={pinning} title={pinned ? '取消置顶' : '置顶'} onClick={() => void togglePin()}><Icon name="pin" /></button>
    <button type="button" className="quiet record-remove" title="删除" aria-label={'删除 ' + title} onClick={() => {
      setDeleteError('');
      dialog.current.showModal();
    }}><Icon name="trash" /></button>
    {pinError && <span className="error" role="alert">{pinError}</span>}
    <dialog ref={dialog} className="research-warning idea-delete" aria-labelledby={id} onCancel={event => {
      if (deleting) event.preventDefault();
    }}>
      <span className="research-symbol"><Icon name="trash" /></span>
      <h2 id={id}>删除这条 Idea？</h2>
      <p className="delete-idea-title">{title}</p>
      <p>这条 Idea 的讨论、评分和研究结果将被删除。已导入论文和已确认的 Memory 条目会保留。</p>
      {deleteError && <p className="error" role="alert">{deleteError}</p>}
      <div className="actions">
        <button type="button" autoFocus disabled={deleting} onClick={() => dialog.current.close()}>取消</button>
        <button type="button" className="delete-confirm" disabled={deleting} onClick={() => void remove()}>{deleting ? '正在删除…' : '确认删除'}</button>
      </div>
    </dialog>
  </div>;
}
