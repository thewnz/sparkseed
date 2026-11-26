import { useEffect } from 'react';

// Pointer motion stays outside React's render cycle and is limited to one frame.
export function useWorkspaceMotion() {
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const selector = '.bento-idea-card, .starter-bento-card, .kpi-bento-tile, .library-card, .research-module, .connection-card, .studio-canvas, .guide-feature-card';
    const layer = document.createElement('div');
    layer.className = 'workspace-motion-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
    let target, frame = 0, point;
    function reset() {
      cancelAnimationFrame(frame); frame = 0;
      target?.removeAttribute('data-pointer-lit');
      target = null;
      layer.replaceChildren();
    }
    function move(event) {
      if (reduced.matches || !fine.matches || event.pointerType === 'touch') return;
      const next = event.target.closest?.(selector);
      if (next !== target) {
        target?.removeAttribute('data-pointer-lit');
        target = next;
      }
      if (!target) return;
      point = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!target?.isConnected) return;
        const rect = target.getBoundingClientRect();
        target.style.setProperty('--pointer-x', `${point.x - rect.left}px`);
        target.style.setProperty('--pointer-y', `${point.y - rect.top}px`);
        target.setAttribute('data-pointer-lit', 'true');
      });
    }
    function press(event) {
      if (reduced.matches || event.button !== 0) return;
      const button = event.target.closest?.('button:not(:disabled)');
      if (!button || button.closest('dialog') || !button.closest('.workspace')) return;
      const ring = document.createElement('i');
      ring.className = 'workspace-click-ring';
      ring.style.left = event.clientX + 'px';
      ring.style.top = event.clientY + 'px';
      if (layer.childElementCount >= 6) layer.firstChild.remove();
      layer.append(ring);
      const animation = ring.animate([
        { transform: 'translate(-50%, -50%) scale(.2)', opacity: .65 },
        { transform: 'translate(-50%, -50%) scale(1.8)', opacity: 0 },
      ], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
      animation.finished.then(() => ring.remove(), () => ring.remove());
    }
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerdown', press, { passive: true });
    document.addEventListener('pointerleave', reset);
    document.addEventListener('visibilitychange', reset);
    window.addEventListener('blur', reset);
    reduced.addEventListener('change', reset);
    return () => {
      reset(); layer.remove();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerdown', press);
      document.removeEventListener('pointerleave', reset);
      document.removeEventListener('visibilitychange', reset);
      window.removeEventListener('blur', reset);
      reduced.removeEventListener('change', reset);
    };
  }, []);
}
