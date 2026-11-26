import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mapSize } from './idea-map.mjs';
import { NebulaRenderer } from './nebula-renderer.mjs';

function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const starColors = ['179,205,255', '224,230,255', '255,225,186'];
const foregroundRandom = randomSource(44771);
const foregroundStars = Array.from({ length: 35 }, (_, index) => ({
  '--star-x': (5 + foregroundRandom() * 90).toFixed(2) + '%',
  '--star-y': (5 + foregroundRandom() * 90).toFixed(2) + '%',
  '--star-color': starColors[index % starColors.length],
  '--star-size': (index < 9 ? 14 + foregroundRandom() * 12 : 4 + foregroundRandom() * 5).toFixed(1) + 'px',
  '--star-duration': (2.7 + foregroundRandom() * 4.2).toFixed(2) + 's',
  '--star-delay': (-foregroundRandom() * 7).toFixed(2) + 's',
  '--star-peak': index < 9 ? .75 : .61,
}));

function drawStars(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const random = randomSource(42343);
  for (let index = 0; index < 860; index++) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const magnitude = random();
    const radius = .26 + magnitude ** 5 * .69;
    const color = starColors[index % starColors.length];
    ctx.fillStyle = 'rgba(' + color + ',' + (.09 + magnitude * .44) + ')';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}


export function SpaceBackground({ camera, preferences, mapActive, selectedId, ideas, onRenderInfo }) {
  const canvas = useRef(null);
  const fallback = useRef(null);
  const options = useRef(null);
  const invalidate = useRef(null);
  const [gpu, setGpu] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const depth = {
    '--space-x': Math.tanh(camera.x / 420) * 3 + '%',
    '--space-y': Math.tanh(camera.y / 280) * 3 + '%',
    '--space-scale': 1 + (camera.scale - 1) * .12,
    '--space-brightness': preferences.brightness,
  };

  useLayoutEffect(() => {
    options.current = { camera, preferences, mapActive };
    invalidate.current?.();
  }, [camera, preferences, mapActive, selectedId, ideas]);

  useEffect(() => {
    drawStars(fallback.current);
    const element = canvas.current;
    const surface = element.parentElement;
    const workspace = surface.closest('.workspace');
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const lights = new Float32Array(12 * 4);
    let renderer;
    let observer;
    let renderId = 0;
    let resizePending = true;
    let lightsPending = true;
    let lightCount = 0;
    let lastFrame = 0;
    let time = 0;
    let fpsSince = 0;
    let frames = 0;
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;
    let quality = '';
    let litNode = null;
    let previousReport = '';
    let alive = true;
    const image = new Image();

    function report(fps = null) {
      const info = renderer ? { width: renderer.width, height: renderer.height, hdr: renderer.hdr, fps } : null;
      const signature = JSON.stringify(info);
      if (signature !== previousReport) {
        previousReport = signature;
        onRenderInfo(info);
      }
    }

    function stop() {
      cancelAnimationFrame(renderId);
      renderId = 0;
      lastFrame = 0;
      fpsSince = 0;
      frames = 0;
    }

    function fail() {
      stop();
      renderer?.dispose();
      renderer = null;
      observer?.disconnect();
      setGpu(false);
      report();
    }

    function request() {
      if (renderer && !renderId && !document.hidden) renderId = requestAnimationFrame(draw);
    }

    function lightPositions() {
      lightCount = 0;
      if (!options.current.mapActive) return;
      const frame = surface.getBoundingClientRect();
      const map = workspace.querySelector('.map-stage');
      if (!map || !frame.width || !frame.height) return;
      const bounds = map.getBoundingClientRect();
      for (const node of map.querySelectorAll('button.star-node')) {
        const rect = node.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (x < bounds.left || x > bounds.right || y < bounds.top + 35 || y > bounds.bottom - 30) continue;
        const offset = lightCount * 4;
        lights[offset] = (x - frame.left) / frame.width;
        lights[offset + 1] = 1 - (y - frame.top) / frame.height;
        lights[offset + 2] = Number(node.dataset.light) * .7 + (node.ariaPressed === 'true' ? .65 : node === litNode ? .35 : 0);
        lights[offset + 3] = Number(node.dataset.tone);
        lightCount++;
        if (lightCount === 12) break;
      }
    }

    function draw(now) {
      renderId = 0;
      if (!renderer || document.hidden) return;
      const { camera, preferences } = options.current;
      const playing = preferences.motion && !media.matches;
      const interval = preferences.quality === 'cinematic' ? 1000 / 60 : 1000 / 30;
      if (playing && lastFrame && now - lastFrame < interval - 1 && !resizePending && !lightsPending) {
        request();
        return;
      }
      if (resizePending || quality !== preferences.quality) {
        try {
          renderer.resize(surface.clientWidth, surface.clientHeight, preferences.quality);
          quality = preferences.quality;
          resizePending = false;
          lightsPending = true;
          report();
        } catch {
          fail();
          return;
        }
      }
      if (lightsPending) {
        lightPositions();
        lightsPending = false;
      }
      const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .1) : 1 / 30;
      lastFrame = now;
      const pointerEase = media.matches || !playing ? 1 : 1 - Math.exp(-dt * 9);
      pointerX += (targetX - pointerX) * pointerEase;
      pointerY += (targetY - pointerY) * pointerEase;
      if (playing) time += dt;
      renderer.draw({ time, brightness: preferences.brightness, zoom: camera.scale,
        panX: camera.x / mapSize.width, panY: camera.y / mapSize.height,
        pointerX, pointerY, lights, lightCount });
      if (playing) {
        if (!fpsSince) fpsSince = now;
        frames++;
        if (now - fpsSince > 1500) {
          report(Math.round(frames * 1000 / (now - fpsSince)));
          fpsSince = now;
          frames = 0;
        }
        request();
      } else {
        lastFrame = 0;
      }
    }

    function pointer(event) {
      const isMap = options.current.mapActive && event.target.closest('.map-stage') && !media.matches;
      if (!isMap && !litNode && targetX === 0 && targetY === 0) return;
      const node = isMap ? event.target.closest('.star-node') : null;
      if (node !== litNode) {
        litNode = node;
        lightsPending = true;
      }
      if (isMap) {
        const rect = surface.getBoundingClientRect();
        targetX = (event.clientX - rect.left) / rect.width - .5;
        targetY = (event.clientY - rect.top) / rect.height - .5;
      } else {
        targetX = 0;
        targetY = 0;
      }
      request();
    }

    function motionChanged() {
      stop();
      report();
      request();
    }

    function visibility() {
      setVisible(!document.hidden);
      if (document.hidden) stop();
      else request();
    }

    function contextLost(event) {
      event.preventDefault();
      fail();
    }

    invalidate.current = () => {
      lightsPending = true;
      if (!options.current.preferences.motion && lastFrame) {
        stop();
        report();
      }
      request();
    };
    document.addEventListener('visibilitychange', visibility);
    try {
      renderer = new NebulaRenderer(element);
      observer = new ResizeObserver(() => { resizePending = true; request(); });
      observer.observe(surface);
      element.addEventListener('webglcontextlost', contextLost);
      workspace.addEventListener('pointermove', pointer, { passive: true });
      media.addEventListener('change', motionChanged);
      image.onload = () => {
        if (!alive || !renderer) return;
        try { renderer.loadBackdrop(image); }
        catch { /* Keep the procedural nebula if the texture cannot load. */ }
        request();
      };
      image.src = './star-nebula.png';
      setGpu(true);
      request();
    } catch { fail(); }

    return () => {
      alive = false;
      invalidate.current = null;
      stop();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      element.removeEventListener('webglcontextlost', contextLost);
      workspace.removeEventListener('pointermove', pointer);
      media.removeEventListener('change', motionChanged);
      image.onload = null;
      renderer?.dispose();
    };
  }, [onRenderInfo]);

  return <div className="space-background" data-renderer={gpu ? 'webgl' : 'fallback'} data-visible={visible} aria-hidden="true">
    <div className="space-depth" style={depth}>
      <img className="space-nebula" src="./star-nebula.png" alt="" />
      <canvas className="space-stars" ref={fallback} width={1440} height={920} />
      {foregroundStars.map((style, index) => <span key={index} className="space-twinkle" data-flare={index < 9} style={style} />)}
    </div>
    <i className="space-meteor" />
    <i className="space-meteor" />
    <canvas className="space-webgl" ref={canvas} />
  </div>;
}
