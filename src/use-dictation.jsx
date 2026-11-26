import { useEffect, useRef, useState } from 'react';

export function useDictation(enabled = true) {
  const request = useRef(null);
  const [listening, setListening] = useState(false);

  function stop() {
    const id = request.current;
    if (!id) return;
    request.current = null;
    setListening(false);
    void window.recorder.stopDictation(id).catch(() => {});
  }

  useEffect(() => {
    if (!enabled) stop();
  }, [enabled]);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      const id = request.current;
      request.current = null;
      if (id) void window.recorder.stopDictation(id).catch(() => {});
    };
  }, []);

  async function listen() {
    if (!enabled || request.current) return '';
    const id = crypto.randomUUID();
    request.current = id;
    setListening(true);
    try {
      const text = await window.recorder.dictate(id);
      return request.current === id ? text.trim() : '';
    } catch (error) {
      if (request.current === id) throw error;
      return '';
    } finally {
      if (request.current === id) {
        request.current = null;
        setListening(false);
      }
    }
  }

  return { listen, listening, stop };
}
