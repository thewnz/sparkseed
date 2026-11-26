import { useEffect, useMemo, useState } from 'react';
import { Icon } from './icons.jsx';

function buildTree(categories) {
  const map = new Map(categories.map(category => [category.id, { ...category, children: [] }]));
  const roots = [];
  for (const category of map.values()) {
    if (category.parentId && map.has(category.parentId)) map.get(category.parentId).children.push(category);
    else roots.push(category);
  }
  return roots;
}

function descendantIds(categories, rootId) {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        grew = true;
      }
    }
  }
  return ids;
}

const presetColors = ['#635bff', '#2563eb', '#0d9488', '#d97706', '#dc2626', '#7c3aed'];

export function PaperSidebar({
  papers,
  categories,
  filter,
  setFilter,
  onSaveCategory,
  onRemoveCategory,
  onAssign,
  ratingConfig,
  onRatingConfig,
}) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [dragOverId, setDragOverId] = useState('');
  const [error, setError] = useState('');
  const [secret, setSecret] = useState('');
  const [keyNotice, setKeyNotice] = useState('');

  const tree = useMemo(() => buildTree(categories), [categories]);
  const counts = useMemo(() => {
    const map = new Map();
    for (const category of categories) {
      const ids = descendantIds(categories, category.id);
      map.set(category.id, papers.filter(paper => paper.categoryIds?.some(id => ids.has(id))).length);
    }
    return map;
  }, [categories, papers]);

  const smart = [
    ['all', '全部馆藏', 'library', papers.length],
    ['unread', '待读文献', 'document', papers.filter(paper => paper.read_status === 'unread' || !paper.read_status).length],
    ['reading', '正在精读', 'book', papers.filter(paper => paper.read_status === 'reading').length],
    ['done', '已读归档', 'check', papers.filter(paper => paper.read_status === 'done').length],
    ['starred', '星标精选', 'star', papers.filter(paper => paper.favorite).length],
    ['uncat', '未归分类', 'tag', papers.filter(paper => !paper.categoryIds?.length).length],
  ];

  useEffect(() => {
    setExpanded(previous => {
      const next = new Set(previous);
      for (const category of categories) if (!category.parentId) next.add(category.id);
      return next;
    });
  }, [categories.length]);

  async function save(event) {
    event.preventDefault();
    if (!editing?.name?.trim()) return;
    setError('');
    try {
      await onSaveCategory({
        id: editing.id,
        name: editing.name.trim(),
        parentId: editing.parentId || null,
        color: editing.color || '',
      });
      setEditing(null);
    } catch (err) { setError(err.message); }
  }

  async function remove(category) {
    if (!window.confirm('删除「' + category.name + '」及其子分类？论文不会被删除。')) return;
    setError('');
    try { await onRemoveCategory(category.id); }
    catch (err) { setError(err.message); }
  }

  async function saveKey(event) {
    event.preventDefault();
    setKeyNotice('');
    try {
      await onRatingConfig({ secret });
      setSecret('');
      setKeyNotice('已保存密钥。');
    } catch (err) { setKeyNotice(err.message); }
  }

  function renderNodes(nodes, depth = 0) {
    return nodes.map(category => {
      const open = expanded.has(category.id);
      const hasChildren = category.children.length > 0;
      const active = filter === 'cat:' + category.id;
      return <div className="category-node" key={category.id}>
        <div className="category-row"
          data-active={active || undefined}
          data-dragover={dragOverId === category.id || undefined}
          style={{ '--depth': depth }}
          onDragOver={event => {
            event.preventDefault();
            if (dragOverId !== category.id) setDragOverId(category.id);
          }}
          onDragLeave={() => { if (dragOverId === category.id) setDragOverId(''); }}
          onDrop={event => {
            const paperId = event.dataTransfer.getData('text/paper-id');
            event.preventDefault();
            setDragOverId('');
            if (paperId) void onAssign(paperId, category.id, true).catch(err => setError(err.message));
          }}>
          <button className="category-twisty" type="button" aria-label={open ? '收起子分类' : '展开子分类'}
            disabled={!hasChildren} onClick={() => setExpanded(previous => {
              const next = new Set(previous);
              if (next.has(category.id)) next.delete(category.id);
              else next.add(category.id);
              return next;
            })}>
            {hasChildren ? <Icon name={open ? 'chevronDown' : 'chevronRight'} /> : <span className="twisty-placeholder" />}
          </button>
          <button className="category-main" type="button" onClick={() => setFilter('cat:' + category.id)}>
            <span className="color-dot" style={{ background: category.color || 'var(--accent)' }} />
            <span className="category-name">{category.name}</span>
            <span className="category-count">{counts.get(category.id) || 0}</span>
          </button>
          <span className="category-actions">
            <button type="button" title="新建子分类" onClick={() => setEditing({ name: '', parentId: category.id, color: presetColors[0] })}>
              <Icon name="plus" />
            </button>
            <button type="button" title="编辑分类" onClick={() => setEditing({
              id: category.id,
              name: category.name,
              parentId: category.parentId || '',
              color: category.color || presetColors[0],
            })}>
              <Icon name="compose" />
            </button>
            <button type="button" title="删除分类" onClick={() => void remove(category)}>
              <Icon name="trash" />
            </button>
          </span>
        </div>
        {hasChildren && open && renderNodes(category.children, depth + 1)}
      </div>;
    });
  }

  return <aside className="paper-library-side" aria-label="论文库导航">
    <nav className="paper-nav" aria-label="论文筛选">
      <div className="paper-side-section-label">馆藏过滤</div>
      {smart.map(([id, label, icon, count]) => <button key={id} type="button" className="paper-nav-item"
        aria-current={filter === id ? 'page' : undefined} onClick={() => setFilter(id)}>
        <Icon name={icon} />
        <span>{label}</span>
        <span className="paper-nav-count">{count}</span>
      </button>)}
    </nav>

    <section className="paper-categories" aria-label="分类">
      <header className="paper-categories-head">
        <span className="paper-side-section-label">学科目录树</span>
        <button type="button" className="quiet icon-label" title="新建顶级分类"
          onClick={() => setEditing({ name: '', parentId: '', color: presetColors[0] })}>
          <Icon name="plus" />新建
        </button>
      </header>

      {editing && <form className="category-form" onSubmit={event => void save(event)}>
        <label>分类名称
          <input autoFocus maxLength={60} value={editing.name}
            onChange={event => setEditing({ ...editing, name: event.target.value })} placeholder="例如：小样本估计" />
        </label>
        <label>上级目录
          <select value={editing.parentId || ''}
            onChange={event => setEditing({ ...editing, parentId: event.target.value })}>
            <option value="">无（顶级分类）</option>
            {categories.filter(category => category.id !== editing.id).map(category =>
              <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <div className="category-color-row">
          <div className="color-preset-dots" role="group" aria-label="快捷颜色">
            {presetColors.map(hex => <button key={hex} type="button" className="preset-color-btn"
              style={{ background: hex }} aria-pressed={(editing.color || presetColors[0]) === hex}
              onClick={() => setEditing({ ...editing, color: hex })} />)}
          </div>
          <input type="color" aria-label="自定义分类颜色" value={editing.color || presetColors[0]}
            onChange={event => setEditing({ ...editing, color: event.target.value })} />
        </div>
        <div className="inline-actions">
          <button className="primary" disabled={!editing.name.trim()}>保存</button>
          <button type="button" className="quiet" onClick={() => { setEditing(null); setError(''); }}>取消</button>
        </div>
      </form>}

      {tree.length
        ? <div className="category-tree-list">{renderNodes(tree)}</div>
        : <p className="sidebar-empty">暂无分类。新建后可直接拖拽论文归档。</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>

    <details className="library-category-settings">
      <summary><Icon name="sliders" />期刊分区密钥</summary>
      <p className="muted">
        {ratingConfig?.hasEasyScholar ? '已配置 easyScholar 密钥，可在右侧详情查询中科院 / JCR 分区。' : '选填 easyScholar 密钥，用于自动查询期刊分区与影响因子。'}
      </p>
      <form className="easyscholar-form" onSubmit={event => void saveKey(event)}>
        <label className="visually-hidden" htmlFor="easyscholar-secret">easyScholar 密钥</label>
        <input id="easyscholar-secret" type="password" autoComplete="off" maxLength={200} value={secret}
          placeholder={ratingConfig?.hasEasyScholar ? '已保存，输入新密钥可替换' : '填写 easyScholar Secret'}
          onChange={event => setSecret(event.target.value)} />
        <div className="inline-actions">
          <button className="quiet" disabled={!secret}>保存</button>
          {ratingConfig?.hasEasyScholar && <button type="button" className="quiet"
            onClick={() => void onRatingConfig({ clear: true }).catch(err => setKeyNotice(err.message))}>移除密钥</button>}
        </div>
      </form>
      {keyNotice && <p className="success" role="status">{keyNotice}</p>}
    </details>
  </aside>;
}
