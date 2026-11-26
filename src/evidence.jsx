import { useEffect, useMemo, useState } from 'react';
import { Icon } from './icons.jsx';
import './evidence.css';

const api = window.recorder;
const relations = { pending: '待核实', support: '支持', counter: '反例' };
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');

function LinkForm({ link, busy, submit, cancel }) {
  return <form className="evidence-form evidence-subform" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submit({ relation: data.get('relation'), note: data.get('note') });
  }}>
    <label>证据关系
      <select name="relation" defaultValue={link?.relation || 'pending'}>
        {Object.entries(relations).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </label>
    <label>适用条件与备注（选填）
      <textarea name="note" rows={2} maxLength={2000} placeholder="例如：仅在样本量 N<50 时成立…" defaultValue={link?.note || ''} />
    </label>
    <div className="inline-actions">
      <button type="button" className="quiet" disabled={busy} onClick={cancel}>取消</button>
      <button className="primary" disabled={busy}>{busy ? '正在保存…' : '保存证据'}</button>
    </div>
  </form>;
}

export function EvidenceConfirmation({ claim, paper, selection, cancel, save }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <section className="evidence-confirmation" aria-label="确认绑定证据">
    <div className="evidence-confirm-head">
      <span className="evidence-badge" data-relation="support"><Icon name="shield" />绑定原文证据</span>
      <strong>结论：{claim.text}</strong>
    </div>
    <p className="muted">{paper.title} · PDF 第 {selection.page} 页</p>
    <blockquote>{selection.quote}</blockquote>
    {error && <p className="error" role="alert">{error}</p>}
    <LinkForm busy={busy} cancel={cancel} submit={async fields => {
      setBusy(true);
      setError('');
      try { await save({ ...selection, ...fields, paperId: paper.id }); }
      catch (failure) { setError(errorText(failure)); setBusy(false); }
    }} />
  </section>;
}

export function EvidencePanel({ ideaId, visible, selectedText, onClose, onBind, onOpen }) {
  const [rows, setRows] = useState([]);
  const [text, setText] = useState(selectedText || '');
  const [claimQuery, setClaimQuery] = useState('');
  const [editing, setEditing] = useState('');
  const [editLink, setEditLink] = useState('');
  const [remove, setRemove] = useState('');
  const [relationFilter, setRelationFilter] = useState('all');
  const [copiedTable, setCopiedTable] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedText) {
      setText(selectedText);
      setEditing('');
    }
  }, [selectedText]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const result = await api.listEvidence(ideaId);
        const list = Array.isArray(result) ? result : Array.isArray(result?.claims) ? result.claims : [];
        if (active) setRows(list);
      } catch (failure) { if (active) setError(errorText(failure)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [ideaId, visible]);

  async function change(input, done) {
    setBusy(true);
    setError('');
    try {
      await api.changeEvidence(ideaId, input);
      done?.();
      const updated = await api.listEvidence(ideaId);
      setRows(Array.isArray(updated) ? updated : Array.isArray(updated?.claims) ? updated.claims : []);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  const stats = useMemo(() => {
    const counts = { total: 0, support: 0, counter: 0, pending: 0, unlinked: 0 };
    for (const claim of rows) {
      const links = claim.links || [];
      if (!links.length) counts.unlinked += 1;
      for (const link of links) {
        counts.total += 1;
        if (counts[link.relation] !== undefined) counts[link.relation] += 1;
      }
    }
    return counts;
  }, [rows]);

  const filteredClaims = useMemo(() => {
    const term = claimQuery.trim().toLowerCase();
    return rows.filter(claim => {
      if (relationFilter === 'unlinked' && (claim.links || []).length > 0) return false;
      if (!['all', 'unlinked'].includes(relationFilter) && !(claim.links || []).some(link => link.relation === relationFilter)) return false;
      if (!term) return true;
      return claim.text.toLowerCase().includes(term)
        || (claim.links || []).some(link => (link.title + ' ' + link.quote + ' ' + (link.note || '')).toLowerCase().includes(term));
    });
  }, [rows, relationFilter, claimQuery]);

  async function copyEvidenceMarkdown() {
    if (!rows.length) return;
    const lines = ['| 结论 | 关系 | 来源文献 | 页码 | 原文摘录 | 备注 |', '| --- | --- | --- | --- | --- | --- |'];
    const esc = s => String(s || '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    for (const claim of rows) {
      if (!claim.links?.length) {
        lines.push(`| ${esc(claim.text)} | 未绑定 | — | — | — | — |`);
      } else {
        for (const link of claim.links) {
          lines.push(`| ${esc(claim.text)} | ${relations[link.relation] || link.relation} | ${esc(link.title)} | P.${link.page} | ${esc(link.quote)} | ${esc(link.note)} |`);
        }
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedTable(true);
      setTimeout(() => setCopiedTable(false), 1600);
    } catch { /* ignore */ }
  }

  const coveragePct = rows.length ? Math.round(((rows.length - stats.unlinked) / rows.length) * 100) : 0;

  return <aside className="evidence-panel" aria-label="证据台" onKeyDown={event => {
    if (event.key === 'Escape' && !busy) onClose();
  }}>
    <header className="workbench-pane-header">
      <div className="workbench-pane-title">
        <div>
          <h2>证据核验台</h2>
          <p>{rows.length} 条结论 · {stats.total} 处绑定 · 覆盖率 {coveragePct}%</p>
        </div>
      </div>
      <div className="inline-actions">
        {rows.length > 0 && <button type="button" className="quiet icon-label" title="复制为 Markdown 证据表"
          onClick={() => void copyEvidenceMarkdown()}>
          <Icon name={copiedTable ? 'check' : 'copy'} />{copiedTable ? '已复制' : '导出表'}
        </button>}
        <button type="button" className="quiet icon-only-btn" aria-label="关闭证据台" title="关闭证据台" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
    </header>

    <div className="evidence-composer-card">
      <form className="evidence-form" onSubmit={event => {
        event.preventDefault();
        void change({ action: editing ? 'rename' : 'create', claimId: editing, text }, () => { setText(''); setEditing(''); });
      }}>
        <label>
          <span>{editing ? '编辑待核对结论' : '登记待核对结论'}</span>
          <textarea rows={2} maxLength={2000} value={text}
            onChange={event => setText(event.target.value)}
            placeholder="在左侧划选讨论文字自动带入，或在此手写一条结论…" />
        </label>
        <div className="inline-actions">
          {editing && <button type="button" className="quiet" onClick={() => { setEditing(''); setText(''); }}>取消编辑</button>}
          <button className="primary icon-label" disabled={busy || !text.trim()}>
            <Icon name="plus" />{editing ? '更新结论' : '保存结论'}
          </button>
        </div>
      </form>
    </div>

    {rows.length > 0 && <div className="evidence-filter-stack">
      <label className="search-input-box">
        <Icon name="search" />
        <input type="search" value={claimQuery} maxLength={100} placeholder="筛选结论或引文…"
          aria-label="筛选结论或引文" onChange={e => setClaimQuery(e.target.value)} />
      </label>
      <div className="chip-filter-bar" role="group" aria-label="按证据关系筛选">
        {[
          ['all', `全部 ${rows.length}`],
          ['support', `支持 ${stats.support}`],
          ['counter', `反例 ${stats.counter}`],
          ['pending', `待核实 ${stats.pending}`],
          ['unlinked', `未绑 ${stats.unlinked}`],
        ].map(([id, label]) => <button key={id} type="button" className="filter-pill"
          aria-pressed={relationFilter === id} onClick={() => setRelationFilter(id)}>{label}</button>)}
      </div>
    </div>}

    {error && <p className="error" role="alert">{error}</p>}

    <div className="evidence-claims-scroll">
      {loading ? <p className="muted" role="status">正在读取证据链…</p> :
        !rows.length ? <div className="workbench-empty-card">
          <Icon name="shield" />
          <strong>用原文锚定判断</strong>
          <p>保存一条结论后，点击「添加论文证据」即可在本地 PDF 中划选支持或反驳的原句。</p>
        </div> : !filteredClaims.length ? <p className="muted">当前筛选下没有匹配的结论。</p> : null}

      {filteredClaims.map(claim => <section className="evidence-claim" key={claim.id}>
        <div className="evidence-claim-head">
          <h3>{claim.text}</h3>
          <span className="pill-counter">{claim.links.length} 证</span>
        </div>
        <div className="inline-actions evidence-claim-tools">
          <button type="button" className="quiet icon-label accent-text" onClick={event => onBind(claim, event.currentTarget)}>
            <Icon name="plus" />添加论文证据
          </button>
          <button type="button" className="quiet" onClick={() => { setEditing(claim.id); setText(claim.text); }}>编辑结论</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => setRemove(claim.id)}>删除</button>
        </div>

        {remove === claim.id && <div className="evidence-delete-confirm">
          <span>确认删除此结论及其 {claim.links.length} 条绑定？</span>
          <div className="inline-actions">
            <button type="button" className="quiet" onClick={() => setRemove('')}>取消</button>
            <button type="button" className="delete-confirm" disabled={busy} onClick={() => void change({ action: 'delete', claimId: claim.id }, () => {
              setRemove('');
              if (editing === claim.id) { setEditing(''); setText(''); }
            })}>确认删除</button>
          </div>
        </div>}

        {claim.links.length > 0 && <div className="evidence-links-stack">
          {claim.links
            .filter(link => ['all', 'unlinked'].includes(relationFilter) || link.relation === relationFilter)
            .map(link => <article className="evidence-link" key={link.id} data-relation={link.relation}>
              <div className="evidence-source">
                <span className="evidence-badge" data-relation={link.relation}>{relations[link.relation]}</span>
                <small>{link.title} · 第 {link.page} 页</small>
              </div>
              <blockquote>{link.quote}</blockquote>
              {link.note && <p className="evidence-link-note">{link.note}</p>}
              {!link.available && <p className="muted evidence-missing-tag">原 PDF 已移出本地库，已保留引文快照</p>}
              {editLink === link.id ? <LinkForm link={link} busy={busy} cancel={() => setEditLink('')}
                submit={fields => void change({ action: 'edit', claimId: claim.id, linkId: link.id, ...fields }, () => setEditLink(''))} />
                : <div className="inline-actions evidence-link-actions">
                  <button type="button" className="quiet icon-label" disabled={!link.available}
                    onClick={() => onOpen(link.paper_id, link.page, link)}>
                    <Icon name="eye" />查看原文
                  </button>
                  <button type="button" className="quiet" onClick={() => setEditLink(link.id)}>编辑</button>
                  <button type="button" className="quiet" disabled={busy}
                    onClick={() => void change({ action: 'unlink', claimId: claim.id, linkId: link.id })}>解绑</button>
                </div>}
            </article>)}
        </div>}
      </section>)}
    </div>
  </aside>;
}
