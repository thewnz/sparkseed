import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { cleanHtml } from './note-html.mjs';
import { usePendingSave } from './use-pending-save.jsx';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');

export function PaperNote({ paperId, annotations }) {
  const editor = useRef(null);
  const selection = useRef(null);
  const pending = usePendingSave(240, paperId);
  const version = useRef(0);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState('正在读取…');
  const [charCount, setCharCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    selection.current = null;
    version.current += 1;
    setLoaded(false);
    setSaveState('正在读取…');
    setError('');
    void api.getPaperNote(paperId).then(value => {
      if (!live) return;
      if (editor.current) {
        editor.current.replaceChildren(...cleanHtml(value.html).childNodes);
        setCharCount((editor.current.innerText || '').trim().length);
      }
      setLoaded(true);
      setSaveState(value.updated ? '已保存' : '尚未落笔');
    }, err => {
      if (!live) return;
      setError(errorText(err));
      setSaveState('读取失败');
    });
    return () => { live = false; };
  }, [paperId]);

  function queueSave() {
    const element = editor.current;
    if (!element || !loaded) return;
    const html = element.innerHTML;
    const text = element.innerText;
    setCharCount(text.trim().length);
    const current = ++version.current;
    setSaveState('正在保存…');
    pending.queue(async () => {
      try {
        await api.savePaperNote(paperId, { html: cleanHtml(html).innerHTML, text });
        if (current === version.current) { setSaveState('已保存'); setError(''); }
      } catch (err) {
        if (current === version.current) { setSaveState('保存失败'); setError(errorText(err)); }
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

  function excerpt() {
    const rows = annotations.filter(annotation => annotation.kind !== 'bookmark' && annotation.quote);
    if (!rows.length) { setError('还没有可摘录的划线或批注。'); return; }
    const existing = editor.current.innerText || '';
    const lines = rows.filter(annotation => !existing.includes('「' + annotation.quote + '」')).map(annotation =>
      '• 「' + annotation.quote + '」' + (annotation.note ? ' — 批注：' + annotation.note : '') + '（P.' + annotation.page + '）');
    if (!lines.length) { setError('所有批注都已汇总到笔记中。'); return; }
    editor.current.focus();
    const range = document.createRange();
    range.selectNodeContents(editor.current);
    range.collapse(false);
    const current = document.getSelection();
    current.removeAllRanges();
    current.addRange(range);
    document.execCommand('insertText', false, (existing.trim() ? '\n\n' : '') + lines.join('\n'));
    setError('');
    queueSave();
  }

  async function copyText() {
    const text = editor.current?.innerText || '';
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  return <section className="paper-note-panel" aria-label="论文笔记">
    <div className="paper-note-tools rich-toolbar" role="group" aria-label="笔记格式">
      {['bold', 'italic', 'underline'].map((command, index) => <button type="button" className="quiet" key={command}
        aria-label={['加粗', '斜体', '下划线'][index]} title={['加粗', '斜体', '下划线'][index]}
        onMouseDown={event => event.preventDefault()} onClick={() => format(command)}>{['B', 'I', 'U'][index]}</button>)}
      <button type="button" className="quiet" aria-label="项目列表" title="项目列表"
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
        {[['2', 13], ['3', 16], ['4', 18], ['5', 24]].map(([id, size]) =>
          <option key={id} value={id}>{size}</option>)}
      </select>
      <input type="color" aria-label="字体颜色" defaultValue="#5451b0" onInput={event => format('foreColor', event.target.value)} />
      <button type="button" className="quiet icon-label" disabled={!loaded} onClick={excerpt} title="一键将全篇划线批注汇总到笔记">
        <Icon name="excerpt" />汇总批注
      </button>
      <button type="button" className="quiet" title="复制纯文本" aria-label="复制纯文本" onClick={() => void copyText()}>
        <Icon name={copied ? 'check' : 'copy'} />
      </button>
    </div>

    <div ref={editor} className="paper-note-editor" contentEditable={loaded} suppressContentEditableWarning
      role="textbox" aria-label="论文笔记正文" aria-multiline="true"
      data-placeholder="记录这篇论文的核心假设、方法优劣与可借鉴之处…"
      onInput={queueSave} onBlur={() => { void pending.flush(); }}
      onMouseUp={remember} onKeyUp={remember} onSelect={remember}
      onPaste={event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); }} />

    <footer className="paper-note-status" role="status">
      <span className="muted">{charCount} 字</span>
      <span>{copied ? '已复制到剪贴板' : saveState}</span>
    </footer>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
