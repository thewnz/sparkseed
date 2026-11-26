import { useEffect, useRef } from 'react';

// Capture the edit before navigation can detach its editor or change its record.
export function usePendingSave(delay, record) {
  const timer = useRef(null);
  const pending = useRef(null);

  function flush() {
    clearTimeout(timer.current);
    const commit = pending.current;
    pending.current = null;
    return commit?.();
  }

  function cancel() {
    clearTimeout(timer.current);
    pending.current = null;
  }

  function queue(commit) {
    pending.current = commit;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }

  useEffect(() => () => { void flush(); }, [record]);
  return { queue, flush, cancel };
}
