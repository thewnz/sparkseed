import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildIdeaMap, ideaUsability, mapSize } from './idea-map.mjs';
import { ideaDates, ideaPreview, ideaTitle } from './idea-text.mjs';
import { Icon } from './icons.jsx';
import { useIdeaRelations } from './research-work.jsx';

const initial = { x: 0, y: 0, scale: 1 };
export const initialStarView = { camera: initial, selectedId: '' };
const minZoom = .65;
const maxZoom = 2.4;
const panKeys = { ArrowLeft: [38, 0], ArrowRight: [-38, 0], ArrowUp: [0, 38], ArrowDown: [0, -38] };

function limitOffset(value, size) {
  return Math.max(-size, Math.min(size, value));
}

function mapScale(rect) {
  return Math.min(rect.width / mapSize.width, rect.height / mapSize.height) || 1;
}

function shortTitle(idea) {
  const letters = [...ideaTitle(idea)];
  return letters.length > 17 ? letters.slice(0, 17).join('') + '…' : letters.join('');
}

export function IdeaInspector({ idea, related = [], confirmed = [], choose, close, open, openDiscussion, id }) {
  const score = ideaUsability(idea);
  return <section className="map-inspector" id={id} aria-label="选中的 Idea">
    <div className="map-inspector-head">
      <div>
        <h2>{ideaTitle(idea)}</h2>
        <p className="map-detail-meta">
          <time dateTime={idea.created}>{ideaDates.format(new Date(idea.created))}</time>
          {idea.paper && <span>· {idea.paper}</span>}
        </p>
      </div>
      <button type="button" className="quiet map-inspector-close icon-only-btn"
        aria-label="关闭 Idea 预览" title="关闭预览" onClick={close}>
        <Icon name="close" />
      </button>
    </div>

    {ideaPreview(idea) && <p className="map-preview">{ideaPreview(idea)}</p>}

    <div className="map-inspector-scores">
      <span className="mini-tag accent">可用度 {score === null ? '未评' : score + '/5'}</span>
      {idea.importance && <span className="mini-tag">重要 {idea.importance}/5</span>}
      {idea.research_value && <span className="mini-tag">价值 {idea.research_value}/5</span>}
    </div>

    {confirmed.length > 0 && <div className="map-nearby map-relations">
      <span>已确认关联</span>
      {confirmed.map(({ idea: other, kind, reason }) => <button type="button" className="quiet" key={other.id + kind}
        title={reason} onClick={() => choose(other.id)}>{kind} · {shortTitle(other)}</button>)}
    </div>}

    {related.length > 0 && <div className="map-nearby">
      <span>邻近灵感</span>
      {related.map(other => <button type="button" className="quiet" key={other.id}
        onClick={() => choose(other.id)}>{shortTitle(other)}</button>)}
    </div>}

    <div className="map-inspector-actions">
      <button type="button" className="primary icon-label" onClick={() => open(idea.id)}>
        查看完整档案 <Icon name="forward" />
      </button>
      {openDiscussion && <button type="button" className="quiet icon-label" onClick={() => openDiscussion(idea.id)}>
        <Icon name="discussion" />继续思辨
      </button>}
    </div>
  </section>;
}

export function IdeaStarMap({ ideas, openIdea, openDiscussion, view, setView, preferences, changePreferences, reducedMotion }) {
  const [minScore, setMinScore] = useState(0);
  const visibleIdeas = useMemo(
    () => minScore ? ideas.filter(item => (ideaUsability(item) || 0) >= minScore) : ideas,
    [ideas, minScore]
  );
  const graph = useMemo(() => buildIdeaMap(visibleIdeas), [visibleIdeas]);
  const positions = useMemo(() => new Map(graph.positions.map(point => [point.idea.id, point])), [graph]);
  const { camera, selectedId } = view;
  const [hoveredId, setHoveredId] = useState('');
  const pointers = useRef(new Map());
  const moved = useRef(0);
  const stage = useRef(null);
  const activeId = hoveredId || selectedId;
  const selected = positions.get(selectedId)?.idea;
  const nearby = graph.neighbors.get(selectedId) || [];
  const relations = useIdeaRelations().filter(row => row.status === 'confirmed' && positions.has(row.first_id) && positions.has(row.second_id));
  const selectedRelations = relations.filter(row => row.first_id === selectedId || row.second_id === selectedId);
  const hasIdeas = ideas.length > 0;

  const edges = useMemo(() => {
    const pairs = new Map();
    for (const [id, neighbors] of graph.neighbors) {
      for (const { id: other, similarity } of neighbors) {
        const key = id < other ? id + ':' + other : other + ':' + id;
        pairs.set(key, { key, first: positions.get(id), second: positions.get(other), similarity });
      }
    }
    return [...pairs.values()];
  }, [graph, positions]);

  const zoom = useCallback((factor, anchorX = 0, anchorY = 0) => {
    setView(previous => {
      const before = previous.camera;
      const scale = Math.max(minZoom, Math.min(maxZoom, before.scale * factor));
      if (scale === before.scale) return previous;
      const factorAtAnchor = scale / before.scale;
      return {
        ...previous,
        camera: {
          scale,
          x: limitOffset(anchorX + (before.x - anchorX) * factorAtAnchor, mapSize.width),
          y: limitOffset(anchorY + (before.y - anchorY) * factorAtAnchor, mapSize.height),
        },
      };
    });
  }, [setView]);

  useEffect(() => {
    if (!hasIdeas) return;
    const element = stage.current;
    function wheel(event) {
      if (event.target.closest('button') && !event.target.closest('.star-node')) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const ratio = mapScale(rect);
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      zoom(Math.exp(-Math.max(-150, Math.min(150, delta)) * .002),
        (event.clientX - rect.left - rect.width / 2) / ratio,
        (event.clientY - rect.top - rect.height / 2) / ratio);
    }
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [hasIdeas, zoom]);

  function flyToStar(id) {
    const point = positions.get(id);
    if (!point) return;
    setView(previous => ({
      selectedId: id,
      camera: {
        scale: Math.max(1.15, previous.camera.scale),
        x: limitOffset((mapSize.width / 2 - point.x) * Math.max(1.15, previous.camera.scale), mapSize.width),
        y: limitOffset((mapSize.height / 2 - point.y) * Math.max(1.15, previous.camera.scale), mapSize.height),
      },
    }));
  }

  function closeInspector() {
    stage.current?.querySelector('.star-node[aria-pressed="true"]')?.focus({ preventScroll: true });
    setSelectedId('');
  }

  function setSelectedId(id) {
    setView(previous => ({ ...previous, selectedId: id }));
  }

  function pan(x, y) {
    setView(previous => ({
      ...previous,
      camera: {
        ...previous.camera,
        x: limitOffset(previous.camera.x + x, mapSize.width),
        y: limitOffset(previous.camera.y + y, mapSize.height),
      },
    }));
  }

  function reset() {
    setView(previous => ({ ...previous, camera: initial }));
  }

  function release(event) {
    if (!pointers.current.delete(event.pointerId)) return;
    if (!pointers.current.size && moved.current < 4 && event.type === 'pointerup') setSelectedId('');
  }

  function keyboard(event) {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    if (Object.hasOwn(panKeys, event.key)) pan(...panKeys[event.key]);
    else if (event.key === '+' || event.key === '=') zoom(1.2);
    else if (event.key === '-') zoom(1 / 1.2);
    else if (event.key === '0') reset();
    else if (event.key === ' ' && !reducedMotion) changePreferences({ motion: !preferences.motion });
    else return;
    event.preventDefault();
  }

  return <section className="idea-map" aria-label="Idea 星图" onKeyDown={event => {
    if (event.key === 'Escape' && selected) { event.stopPropagation(); closeInspector(); }
  }}>
    <div className="map-stage" ref={stage} data-interactive={hasIdeas} tabIndex={hasIdeas ? 0 : undefined}
      aria-label={hasIdeas ? '星图画布，方向键平移，加减键缩放，0 键复位' : '暂无 Idea 的星空'} onKeyDown={keyboard}
      onPointerDown={event => {
        if (!hasIdeas || event.button !== 0 || event.target.closest('button, select') || pointers.current.size >= 2) return;
        if (!pointers.current.size) {
          moved.current = 0;
          event.currentTarget.focus({ preventScroll: true });
        } else moved.current = 4;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const previous = pointers.current.get(event.pointerId);
        if (!previous) return;
        const next = { x: event.clientX, y: event.clientY };
        const deltaX = next.x - previous.x, deltaY = next.y - previous.y;
        moved.current += Math.hypot(deltaX, deltaY);
        pointers.current.set(event.pointerId, next);
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = mapScale(rect);
        if (pointers.current.size === 1) { pan(deltaX / ratio, deltaY / ratio); return; }
        const other = [...pointers.current].find(([id]) => id !== event.pointerId)[1];
        const distance = Math.hypot(previous.x - other.x, previous.y - other.y);
        if (distance > 1) zoom(Math.hypot(next.x - other.x, next.y - other.y) / distance,
          ((next.x + other.x) / 2 - rect.left - rect.width / 2) / ratio,
          ((next.y + other.y) / 2 - rect.top - rect.height / 2) / ratio);
        pan(deltaX / (2 * ratio), deltaY / (2 * ratio));
      }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>

      <div className="map-world" style={{
        '--map-aspect': mapSize.width / mapSize.height,
        '--map-x': camera.x / mapSize.width * 100 + '%',
        '--map-y': camera.y / mapSize.height * 100 + '%',
        '--map-zoom': camera.scale,
      }}>
        {preferences.links && <svg className="map-links" viewBox={`0 0 ${mapSize.width} ${mapSize.height}`} aria-hidden="true">
          {relations.map(row => {
            const first = positions.get(row.first_id);
            const second = positions.get(row.second_id);
            return <line className="map-confirmed-link" key={row.first_id + row.second_id + row.kind} data-kind={row.kind}
              x1={first.x} y1={first.y} x2={second.x} y2={second.y}
              opacity={!activeId || [row.first_id, row.second_id].includes(activeId) ? .85 : .24}
              aria-hidden="true" />;
          })}
          {edges.map(({ key, first, second, similarity }) => <path className="map-link" key={key}
            d={`M${first.x} ${first.y} Q${(first.x + second.x) / 2} ${(first.y + second.y) / 2 - 10} ${second.x} ${second.y}`}
            opacity={[first.idea.id, second.idea.id].includes(activeId) ? .48 + similarity * .52 : .2} />)}
        </svg>}

        {graph.positions.map((point, index) => {
          const { idea, x, y } = point;
          const rating = ideaUsability(idea);
          const light = rating === null ? .57 : .65 + (rating - 1) * .085;
          const tone = [1, 0, .43][index % 3];
          const isSelected = idea.id === selectedId;
          const focus = idea.id === activeId;
          return <button type="button" className="star-node" key={idea.id}
            data-light={light} data-tone={tone}
            style={{
              left: x / mapSize.width * 100 + '%',
              top: y / mapSize.height * 100 + '%',
              '--idea-light': light,
              '--idea-twinkle-delay': -(index * 1.73 % 9) + 's',
              '--idea-twinkle-duration': (3.6 + index * .53 % 3.7) + 's',
            }}
            aria-label={ideaTitle(idea) + (rating === null ? '，可用程度未评分' : '，可用程度 ' + rating + ' 分')}
            aria-pressed={isSelected}
            onClick={() => {
              setSelectedId(idea.id);
              requestAnimationFrame(() => stage.current?.parentElement?.querySelector('.map-inspector-close')?.focus({ preventScroll: true }));
            }}
            onFocus={event => {
              setHoveredId(idea.id);
              if (!event.target.matches(':focus-visible')) return;
              const rect = stage.current.getBoundingClientRect();
              const target = event.target.getBoundingClientRect();
              if (target.left < rect.left || target.right > rect.right || target.top < rect.top + 70 || target.bottom > rect.bottom - 65) {
                setView(previous => ({
                  ...previous,
                  camera: {
                    ...previous.camera,
                    x: (mapSize.width / 2 - x) * previous.camera.scale,
                    y: (mapSize.height / 2 - y) * previous.camera.scale,
                  },
                }));
              }
            }}
            onBlur={() => setHoveredId('')}
            onPointerEnter={() => setHoveredId(idea.id)}
            onPointerLeave={() => setHoveredId('')}>
            <span className="star-radiance" aria-hidden="true">
              <i className="star-halo" /><i className="star-rays" /><i className="star-core" />
            </span>
            {focus && <span className="map-label" aria-hidden="true">{shortTitle(idea)}</span>}
          </button>;
        })}
      </div>

      {!hasIdeas && <p className="map-empty">保存第一个 Idea 后，它会在深空中点亮。</p>}

      {hasIdeas && <div className="map-hud-bottom-left">
        <div className="map-status">
          <span>{visibleIdeas.length} / {ideas.length} 个节点</span>
          <span>拖拽漫游 · 滚轮缩放 · 亮度=评分</span>
        </div>
        <div className="map-score-filter" role="group" aria-label="按可用度过滤">
          {[[0, '全部'], [3, '≥3分'], [4, '≥4分']].map(([score, label]) =>
            <button key={score} type="button" className="quiet" aria-pressed={minScore === score}
              onClick={() => setMinScore(score)}>{label}</button>)}
        </div>
        {visibleIdeas.length > 1 && <label className="map-star-locator">
          <Icon name="center" />
          <select aria-label="快速定位节点" value={selectedId} onChange={event => {
            if (event.target.value) flyToStar(event.target.value);
            else setSelectedId('');
          }}>
            <option value="">定位到指定节点…</option>
            {visibleIdeas.map(item => <option key={item.id} value={item.id}>{shortTitle(item)}</option>)}
          </select>
        </label>}
      </div>}

      <div className="map-controls" role="group" aria-label="星图控制">
        {hasIdeas && <>
          <button type="button" aria-label="缩小" title="缩小 (-)" disabled={camera.scale <= minZoom}
            onClick={() => zoom(1 / 1.2)}><Icon name="minus" /></button>
          <span className="map-zoom-value">{Math.round(camera.scale * 100)}%</span>
          <button type="button" aria-label="重置视野" title="重置视野 (0)" onClick={reset}><Icon name="center" /></button>
          <button type="button" aria-label="放大" title="放大 (+)" disabled={camera.scale >= maxZoom}
            onClick={() => zoom(1.2)}><Icon name="plus" /></button>
        </>}
        <button type="button" className="map-motion" aria-label={preferences.motion ? '暂停星空动画' : '播放星空动画'}
          title={preferences.motion ? '暂停星空动画' : '播放星空动画'}
          onClick={() => changePreferences({ motion: !preferences.motion })}>
          <Icon name={preferences.motion ? 'pause' : 'play'} />
        </button>
      </div>
    </div>

    {selected && <IdeaInspector idea={selected}
      related={nearby.map(item => positions.get(item.id)?.idea).filter(Boolean)}
      confirmed={selectedRelations.map(row => ({ ...row, idea: positions.get(row.first_id === selectedId ? row.second_id : row.first_id)?.idea })).filter(item => item.idea)}
      choose={flyToStar} close={closeInspector} open={openIdea} openDiscussion={openDiscussion} />}
  </section>;
}
