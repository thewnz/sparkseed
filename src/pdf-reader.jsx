import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline';
import './pdf-text-layer.css';

const api = window.recorder;

class LocalPdfResources {
  fetch({ kind, filename }) { return api.readPdfAsset(kind, filename); }
}

export function usePdf(id) {
  const [pdf, setPdf] = useState(null);
  const [outline, setOutline] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    let task;
    let worker;
    async function load() {
      const data = await api.readPaperPdf(id);
      if (!current) return;
      worker = new PdfWorker();
      GlobalWorkerOptions.workerPort = worker;
      try {
        task = getDocument({ data, BinaryDataFactory: LocalPdfResources, useWorkerFetch: false, isEvalSupported: false });
      } finally {
        GlobalWorkerOptions.workerPort = null;
      }
      const document = await task.promise;
      if (!current) return;
      setPdf(document);
      const items = await document.getOutline().catch(() => null);
      if (current) setOutline(items || []);
    }
    void load().catch(error => {
      if (current) setError(error.name === 'PasswordException'
        ? '这份 PDF 受密码保护，可以用系统阅读器打开。'
        : '无法在阅读器中加载这份 PDF。');
    });
    return () => {
      current = false;
      if (task) void task.destroy().catch(() => {}).finally(() => worker?.terminate());
      else worker?.terminate();
    };
  }, [id]);
  return { pdf, outline, error };
}

export function PdfOutline({ pdf, items, onPage }) {
  const [error, setError] = useState('');
  async function follow(destination) {
    try {
      const dest = typeof destination === 'string' ? await pdf.getDestination(destination) : destination;
      if (!dest) return;
      const target = dest[0];
      onPage(1 + (Number.isInteger(target) ? target : await pdf.getPageIndex(target)));
      setError('');
    } catch { setError('无法跳转到这个目录位置。'); }
  }
  function entries(list) {
    return <ul>{list.map((item, index) => <li key={index}>
      {item.dest ? <button className="quiet" onClick={() => void follow(item.dest)}>{item.title}</button> : <span>{item.title}</span>}
      {item.items.length > 0 && entries(item.items)}
    </li>)}</ul>;
  }
  return <nav aria-label="PDF 目录" className="pdf-outline">
    {entries(items)}
    {error && <p className="error" role="alert">{error}</p>}
  </nav>;
}

export function PdfPage({ pdf, page, zoom, annotations = [], activeAnnotation = '', onSelect, onCreate,
  onTranslate, onAttach, onAnnotationClick, onDefineTerm, onBindEvidence, evidenceLink }) {
  const surface = useRef(null);
  const stack = useRef(null);
  const layer = useRef(null);
  const latest = useRef({ annotations, activeAnnotation, onAnnotationClick, page });
  latest.current = { annotations, activeAnnotation, onAnnotationClick, page };
  const [width, setWidth] = useState(0);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState('');
  const [anchor, setAnchor] = useState(null);
  const evidenceLocated = Boolean(evidenceLink?.sameSource && evidenceLink.rects?.length);

  useEffect(() => {
    if (!rendered || !evidenceLink || evidenceLink.page !== page) return;
    if (!evidenceLocated) return;
    const sheet = stack.current?.querySelector('.pdf-sheet');
    if (!sheet) return;
    const rect = evidenceLink.rects[0];
    surface.current.scrollTop += sheet.getBoundingClientRect().top - surface.current.getBoundingClientRect().top +
      rect.y * sheet.clientHeight - surface.current.clientHeight * .33;
  }, [rendered, evidenceLink, evidenceLocated, page]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(surface.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { surface.current.scrollTo(0, 0); }, [page]);

  function syncAnnotations() {
    const target = layer.current;
    if (!target) return;
    target.replaceChildren();
    const current = latest.current;
    const visible = current.annotations.filter(item => item.page === current.page);
    if (evidenceLink?.page === current.page && evidenceLink.sameSource) visible.push({ ...evidenceLink, kind: 'highlight' });
    for (const annotation of visible) {
      for (const rect of annotation.rects || []) {
        const mark = document.createElement('span');
        mark.className = 'pdf-annotation-mark';
        mark.dataset.kind = annotation.kind;
        mark.dataset.active = annotation.id === current.activeAnnotation || annotation.id === evidenceLink?.id ? 'true' : '';
        mark.style.left = rect.x * 100 + '%';
        mark.style.top = rect.y * 100 + '%';
        mark.style.width = rect.w * 100 + '%';
        mark.style.height = rect.h * 100 + '%';
        if (annotation.color) mark.style.setProperty('--annotation-color', annotation.color);
        target.append(mark);
      }
    }
  }

  useEffect(() => { syncAnnotations(); }, [annotations, page, activeAnnotation, evidenceLink]);

  useEffect(() => {
    if (!pdf || !width) return;
    let active = true;
    let renderTask;
    let textLayer;
    setRendered(false);
    setError('');
    setAnchor(null);
    const container = stack.current;
    container.replaceChildren();
    layer.current = null;

    async function draw() {
      const sheet = await pdf.getPage(page);
      if (!active) return;
      const unit = sheet.getViewport({ scale: 1 });
      const viewport = sheet.getViewport({ scale: Math.max(1, width - 36) / unit.width * zoom });
      const ratio = Math.min(devicePixelRatio || 1, 2, 4096 / Math.max(viewport.width, viewport.height));
      const paper = document.createElement('div');
      paper.className = 'pdf-sheet';
      paper.style.width = viewport.width + 'px';
      paper.style.height = viewport.height + 'px';
      paper.style.setProperty('--total-scale-factor', String(viewport.scale * viewport.userUnit));
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.setAttribute('aria-label', 'PDF 第 ' + page + ' 页');
      paper.append(canvas);
      const overlay = document.createElement('div');
      overlay.className = 'pdf-annotation-layer';
      paper.append(overlay);
      renderTask = sheet.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await renderTask.promise;
      if (!active) return;
      container.replaceChildren(paper);
      layer.current = overlay;
      syncAnnotations();
      setRendered(true);
      const text = document.createElement('div');
      text.className = 'textLayer';
      paper.append(text);
      textLayer = new TextLayer({ textContentSource: sheet.streamTextContent(), container: text, viewport });
      await textLayer.render();
    }
    void draw().catch(() => { if (active && !container.childElementCount) setError('这一页暂时无法显示。'); });
    return () => {
      active = false;
      renderTask?.cancel();
      textLayer?.cancel();
      container.replaceChildren();
      layer.current = null;
    };
  }, [pdf, page, width, zoom]);

  function selectionPayload() {
    const selected = window.getSelection();
    const text = stack.current?.querySelector('.textLayer');
    const sheet = stack.current?.querySelector('.pdf-sheet');
    if (!selected?.rangeCount || !text || !sheet || !text.contains(selected.anchorNode) || !text.contains(selected.focusNode)) return null;
    const quote = selected.toString().trim();
    if (!quote) return null;
    const range = selected.getRangeAt(0);
    const bounds = sheet.getBoundingClientRect();
    const rects = Array.from(range.getClientRects()).map(rect => ({
      x: (rect.left - bounds.left) / bounds.width, y: (rect.top - bounds.top) / bounds.height,
      w: rect.width / bounds.width, h: rect.height / bounds.height,
    })).filter(rect => rect.w > 0.001 && rect.h > 0.001);
    if (!rects.length) return null;
    const before = document.createRange();
    before.selectNodeContents(text);
    before.setEnd(range.startContainer, range.startOffset);
    const after = document.createRange();
    after.selectNodeContents(text);
    after.setStart(range.endContainer, range.endOffset);
    return {
      page, quote, rects,
      prefix: before.toString().slice(-40).trim(),
      suffix: after.toString().slice(0, 40).trim(),
      viewport: range.getBoundingClientRect(),
    };
  }

  function hitAnnotation(x, y) {
    const sheet = stack.current?.querySelector('.pdf-sheet');
    if (!sheet) return null;
    const bounds = sheet.getBoundingClientRect();
    const px = (x - bounds.left) / bounds.width;
    const py = (y - bounds.top) / bounds.height;
    return latest.current.annotations.find(annotation => annotation.page === latest.current.page &&
      (annotation.rects || []).some(rect => px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h)) || null;
  }

  function pick(event) {
    const payload = selectionPayload();
    if (payload) {
      const bounds = surface.current.getBoundingClientRect();
      setAnchor({ ...payload,
        left: Math.max(8, Math.min(payload.viewport.left - bounds.left, bounds.width - 250)),
        top: Math.max(4, payload.viewport.top - bounds.top - 38) });
      const { page: currentPage, quote, prefix, suffix, rects } = payload;
      onSelect?.({ page: currentPage, quote, prefix, suffix, rects });
      return;
    }
    setAnchor(null);
    onSelect?.(null);
    const annotation = event ? hitAnnotation(event.clientX, event.clientY) : null;
    if (annotation) onAnnotationClick?.(annotation);
  }

  return <div className="pdf-page-surface" ref={surface} onScroll={() => setAnchor(null)}>
    <div className="pdf-page-stack" ref={stack} onPointerUp={pick} onKeyUp={() => pick()} />
    {anchor && <div className="pdf-selection-tools" style={{
      left: anchor.left + (surface.current?.scrollLeft || 0), top: anchor.top + (surface.current?.scrollTop || 0),
    }}>
      <button onPointerDown={event => event.preventDefault()} onClick={() => { setAnchor(null); onCreate?.('highlight', anchor); }}>高亮</button>
      <button onPointerDown={event => event.preventDefault()} onClick={() => { setAnchor(null); onCreate?.('underline', anchor); }}>下划线</button>
      <button onPointerDown={event => event.preventDefault()} onClick={() => { setAnchor(null); onCreate?.('note', anchor); }}>批注</button>
      <button onPointerDown={event => event.preventDefault()} onClick={() => { setAnchor(null); onCreate?.('question', anchor); }}>问题</button>
      <button onPointerDown={event => event.preventDefault()} onClick={() => { setAnchor(null); onDefineTerm?.(anchor.quote); }}>术语</button>
      <button onPointerDown={event => event.preventDefault()} onClick={() => { setAnchor(null); onTranslate?.(anchor.quote); }}>翻译</button>
      {onAttach && <button onPointerDown={event => event.preventDefault()} onClick={() => { setAnchor(null); onAttach(anchor.quote); }}>引用</button>}
      {onBindEvidence && <button onPointerDown={event => event.preventDefault()} onClick={() => {
        const { page, quote, prefix, suffix, rects } = anchor;
        setAnchor(null);
        onBindEvidence({ page, quote, prefix, suffix, rects });
      }}>绑定证据</button>}
    </div>}
    {pdf && !rendered && <p className={error ? 'error pdf-loading' : 'muted pdf-loading'} role={error ? 'alert' : 'status'}>{error || '正在渲染原文…'}</p>}
    {rendered && evidenceLink?.page === page && !evidenceLocated && <p className="evidence-reader-hint" role="status">已打开证据页，未能定位原句。</p>}
  </div>;
}
