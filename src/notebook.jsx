import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { cleanHtml } from './note-html.mjs';
import { usePendingSave } from './use-pending-save.jsx';

const api = window.recorder;

export function Notebook({ mode, setMode, ideaId, docked = false }) {
  const editor = useRef(null);
  const selection = useRef(null);
  const pending = usePendingSave(180, ideaId);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState('正在读取…');
  const [charCount, setCharCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const saveVersion = useRef(0);

  useEffect(() => { if (!mode) void pending.flush(); }, [mode]);

  useEffect(() => {
    let active = true;
    selection.current = null;
    saveVersion.current += 1;
    setLoaded(false);
    setError('');
    setSaveState('正在读取…');
    void (ideaId ? api.getIdeaNote(ideaId) : api.getNotebook()).then(value => {
      if (!active) return;
      if (editor.current) {
        editor.current.replaceChildren(...cleanHtml(value.html).childNodes);
        setCharCount((editor.current.innerText || '').trim().length);
      }
      setLoaded(true);
      setSaveState(ideaId ? '自动归档至手稿室' : '已保存草稿');
    }, () => { if (active) { setError('暂时无法读取记录本。'); setSaveState('读取失败'); } });
    return () => { active = false; };
  }, [ideaId]);

  function queueSave() {
    const element = editor.current;
    if (!element || !loaded) return;
    const html = element.innerHTML;
    const text = element.innerText;
    setCharCount(text.trim().length);
    const version = ++saveVersion.current;
    setSaveState('正在保存…');
    pending.queue(async () => {
      try {
        const value = { html: cleanHtml(html).innerHTML, text };
        await (ideaId ? api.saveIdeaNote(ideaId, value) : api.saveNotebook(value));
        if (version !== saveVersion.current) return;
        setError('');
        setSaveState(ideaId ? '已同步至手稿室' : '已保存');
      } catch (err) {
        if (version !== saveVersion.current) return;
        setError(err.message);
        setSaveState('保存失败');
      }
    });
  }

  function remember() {
    const current = document.getSelection();
    if (current?.rangeCount && editor.current?.contains(current.anchorNode) && editor.current.contains(current.focusNode)) {
      selection.current = current.getRangeAt(0).cloneRange();
    }
  }

  function format(command, value) {
    editor.current?.focus();
    if (selection.current && editor.current?.contains(selection.current.commonAncestorContainer)) {
      const current = document.getSelection();
      current.removeAllRanges();
      current.addRange(selection.current);
    }
    document.execCommand(command, false, value);
    remember();
    queueSave();
  }

  async function copyText() {
    const text = editor.current?.innerText || '';
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore clipboard permission issues */ }
  }

  if (!mode) return null;

  return <section className={docked ? 'notebook-panel notebook-docked' : 'notebook-panel'}
    data-mode={mode} aria-label="记录本">
    <header className="workbench-pane-header">
      <div className="workbench-pane-title">
        <span className="workbench-pane-icon"><Icon name="document" /></span>
        <div>
          <h2>随手记录本</h2>
          <p>{ideaId ? '与当前思辨绑定 · 自动归档手稿室' : '新思辨临时速记本'}</p>
        </div>
      </div>
      <div className="inline-actions">
        {!docked && <button type="button" className="quiet" onClick={() => setMode(mode === 'split' ? 'float' : 'split')}>
          {mode === 'split' ? '悬浮窗' : '分栏'}
        </button>}
        <button type="button" className="quiet icon-only-btn" aria-label="关闭记录本" title="关闭记录本"
          onClick={() => { void pending.flush(); setMode(''); }}>
          <Icon name="close" />
        </button>
      </div>
    </header>

    <div className="note-tools rich-toolbar" role="group" aria-label="文本格式">
      <button type="button" className="quiet" aria-label="加粗" title="加粗"
        onMouseDown={event => event.preventDefault()} onClick={() => format('bold')}>B</button>
      <button type="button" className="quiet" aria-label="斜体" title="斜体"
        onMouseDown={event => event.preventDefault()} onClick={() => format('italic')}>I</button>
      <button type="button" className="quiet" aria-label="下划线" title="下划线"
        onMouseDown={event => event.preventDefault()} onClick={() => format('underline')}>U</button>
      <button type="button" className="quiet" aria-label="无序列表" title="项目列表"
        onMouseDown={event => event.preventDefault()} onClick={() => format('insertUnorderedList')}>
        <Icon name="list" />
      </button>
      <select aria-label="字体" defaultValue="" onChange={event => format('fontName', event.target.value)}>
        <option value="" disabled>字体</option>
        <option>Microsoft YaHei</option>
        <option>Arial</option>
        <option>Georgia</option>
      </select>
      <select aria-label="字号" defaultValue="" onChange={event => format('fontSize', event.target.value)}>
        <option value="" disabled>字号</option>
        {[['2', 13], ['3', 16], ['4', 18], ['5', 24], ['6', 32]].map(([id, size]) =>
          <option key={id} value={id}>{size}</option>)}
      </select>
      <input type="color" aria-label="字体颜色" title="文字颜色" defaultValue="#5451b0"
        onInput={event => format('foreColor', event.target.value)} />
      <button type="button" className="quiet" title="复制纯文本" aria-label="复制纯文本" onClick={() => void copyText()}>
        <Icon name={copied ? 'check' : 'copy'} />
      </button>
    </div>

    <div className="note-editor" ref={editor} contentEditable={loaded} suppressContentEditableWarning
      role="textbox" aria-label="记录本正文" aria-multiline="true"
      onInput={queueSave} onBlur={() => { void pending.flush(); }}
      onMouseUp={remember} onKeyUp={remember} onSelect={remember}
      onPaste={event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); }} />

    <footer className="note-save-footer">
      <span className="muted">{charCount} 字</span>
      <span className="note-save-status" role="status">{copied ? '已复制到剪贴板' : saveState}</span>
    </footer>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
