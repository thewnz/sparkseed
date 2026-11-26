export function createStudioDrafts(save) {
  let snapshot = {};
  const listeners = new Set();
  const queues = new Map();
  const publish = (id, value) => {
    snapshot = { ...snapshot, [id]: value };
    for (const listener of listeners) listener();
  };
  async function drain(id) {
    for (;;) {
      const current = snapshot[id];
      try {
        await save(id, current.draft);
      } catch (error) {
        if (snapshot[id] !== current) continue;
        queues.delete(id);
        publish(id, { ...current, status: 'error', error });
        return false;
      }
      if (snapshot[id] !== current) continue;
      queues.delete(id);
      publish(id, { ...current, status: 'saved', error: null });
      return true;
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update(id, draft) {
      publish(id, { draft, status: 'saving', error: null });
      if (!queues.has(id)) {
        const queued = Promise.resolve().then(() => drain(id));
        queues.set(id, queued);
      }
    },
    flush(id) { return queues.get(id) || Promise.resolve(snapshot[id]?.status !== 'error'); },
  };
}
