/** A parsed paper is a source fact keyed by file content, so a re-scan or a restart cannot duplicate it. */
export function recordPaperParsed(store, paper) {
  if (!paper || paper.status !== 'ready') return null;
  const event = store.work.recordEvent({ source: 'paper', subjectType: 'paper', subjectId: paper.id,
    kind: 'paper:parsed', actor: 'system', payload: { sha256: paper.sha256 } });
  if (!event.duplicate) store.work.effects.enqueue('paper-trigger', event.id, { paperId: paper.id, eventId: event.id });
  return event;
}

export function paperTriggerAction({ mode, provider }) {
  if (mode === 'off') return 'drop';
  return provider ? 'schedule' : 'hold';
}