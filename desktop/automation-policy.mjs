export function automationDecision(globalMode, jobMode) {
  const explicit = jobMode === 'act';
  if (globalMode === 'off' && !explicit) return 'skip';
  if (globalMode !== 'act' && !explicit) return 'wait';
  return 'run';
}
