import { useEffect, useState } from 'react';
import './startup-splash.css';

const logo = import.meta.env.BASE_URL + 'brand-mark.png';

export function StartupSplash({ finish }) {
  const [logoReady, setLogoReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState('ready');

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let nativeVisible = false;
    let active = true;
    let receivedVisibility = false;
    const sync = () => {
      cancelAnimationFrame(frame);
      if (motion.matches) {
        finish();
      } else if (!logoReady || !nativeVisible || document.hidden) {
        setPlaying(false);
      } else {
        // Give the native window a paint before starting or resuming the animation.
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            setPhase(current => current === 'ready' ? 'enter' : current);
            setPlaying(true);
          });
        });
      }
    };
    const unsubscribe = window.recorder.onWindowVisibility(visible => {
      receivedVisibility = true;
      nativeVisible = visible;
      sync();
    });
    void window.recorder.getWindowVisibility().then(visible => {
      if (!active || receivedVisibility) return;
      nativeVisible = visible;
      sync();
    }, () => { if (active) finish(); });
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
    sync();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      unsubscribe();
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
    };
  }, [finish, logoReady]);

  function nextPhase(event) {
    if (event.animationName === 'startup-title') setPhase('hold');
    if (event.animationName === 'startup-hold') setPhase('exit');
    if (event.animationName === 'startup-leave') finish();
  }

  return <div className="startup-splash" data-phase={phase} data-playing={playing} onAnimationEnd={nextPhase}>
    <div className="startup-lockup" role="status" aria-label="正在启动 Sparkseed">
      <img className="startup-mark" src={logo} alt="" onLoad={() => setLogoReady(true)}
        onError={event => { event.currentTarget.hidden = true; setLogoReady(true); }} />
      <span className="startup-wordmark">Sparkseed <small>火种</small></span>
    </div>
  </div>;
}
