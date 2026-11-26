import { useLayoutEffect, useRef } from 'react';
import { Icon } from './icons.jsx';

const storageKey = 'sparkseed.star.preferences';
const qualities = { performance: '流畅', balanced: '精细', cinematic: '电影' };
const defaults = { quality: 'cinematic', brightness: 1, motion: true, links: true };

export function loadStarPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return {
      quality: Object.hasOwn(qualities, saved?.quality) ? saved.quality : defaults.quality,
      brightness: Number.isFinite(saved?.brightness) ? Math.max(.3, Math.min(1.5, saved.brightness)) : 1,
      motion: saved?.motion !== false,
      links: saved?.links !== false,
    };
  } catch { return { ...defaults }; }
}

export function saveStarPreferences(value) {
  localStorage.setItem(storageKey, JSON.stringify(value));
}

export function StarPreferences({ value, onChange, close, info, reducedMotion }) {
  const dialog = useRef(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    element.showModal();
    element.querySelector('select').focus();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="star-preferences" aria-labelledby="star-preferences-title"
    onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
      if (event.target === event.currentTarget) {
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) close();
      }
    }}>
    <header><h2 id="star-preferences-title">星图偏好</h2><button type="button" className="quiet"
      onClick={close} aria-label="关闭星图偏好"><Icon name="close" /></button></header>
    <label>渲染画质<select autoFocus value={value.quality} onChange={event => onChange({ quality: event.target.value })}>
      {Object.entries(qualities).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    <label>星云亮度<span className="star-brightness">
      <input type="range" min=".3" max="1.5" step=".05" value={value.brightness}
        onChange={event => onChange({ brightness: Number(event.target.value) })} />
      <output>{Math.round(value.brightness * 100)}%</output>
    </span></label>
    <label>动态星空<input type="checkbox" role="switch" checked={value.motion && !reducedMotion} disabled={reducedMotion}
      onChange={event => onChange({ motion: event.target.checked })} /></label>
    <label>灵感连线<input type="checkbox" role="switch" checked={value.links} onChange={event => onChange({ links: event.target.checked })} /></label>
    {reducedMotion && <p>系统已开启减少动态效果。</p>}
    <p className="star-render-info">{info === undefined ? '正在初始化渲染器…' : info
      ? [info.width + ' × ' + info.height, info.hdr ? 'HDR' : 'SDR', info.fps !== null && info.fps + ' fps'].filter(Boolean).join(' · ')
      : '兼容星空渲染 · 星点可用'}</p>
  </dialog>;
}
