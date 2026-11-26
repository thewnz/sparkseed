import { useMemo } from 'react';
import './universe.css';

function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

export function UniverseBackground() {
  const { stars, lines } = useMemo(() => {
    const random = seeded(20261113);
    const stars = Array.from({ length: 150 }, (_, index) => ({
      id: index,
      x: random() * 100,
      y: random() * 100,
      size: 0.8 + random() * 1.9,
      delay: -random() * 10,
      duration: 5 + random() * 8,
      opacity: 0.22 + random() * 0.62,
      layer: index % 3,
    }));
    const anchors = stars.filter(star => star.layer === 2).slice(0, 16);
    const lines = anchors.slice(1).map((star, index) => ({
      x1: anchors[index].x, y1: anchors[index].y, x2: star.x, y2: star.y,
    }));
    return { stars, lines };
  }, []);
  return <div className="universe-background" aria-hidden="true">
    <div className="universe-nebula one" />
    <div className="universe-nebula two" />
    <div className="universe-nebula three" />
    <svg className="universe-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
      {lines.map((line, index) => <line key={index} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />)}
    </svg>
    <div className="universe-stars">
      {stars.map(star => <span key={star.id} data-layer={star.layer} style={{
        left: star.x + '%', top: star.y + '%', width: star.size + 'px', height: star.size + 'px',
        opacity: star.opacity, animationDelay: star.delay + 's', animationDuration: star.duration + 's',
      }} />)}
    </div>
    <div className="universe-grain" />
  </div>;
}
