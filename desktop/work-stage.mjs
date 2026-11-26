const ENDED = Object.freeze({ stage: 'ended' });

/**
 * Classifies a persisted research task by what it is waiting for.
 * Status strings stay as stored; the stage is derived so UI and scheduling share one definition.
 */
export function researchWorkStage(job) {
  if (!job) return { ...ENDED };
  switch (job.status) {
    case 'ready': return { stage: 'person', action: 'review' };
    case 'waiting': return { stage: 'person', action: 'answer' };
    case 'failed': return { stage: 'person', action: 'failed' };
    case 'paused': return { stage: 'person', action: 'blocked' };
    case 'running': return { stage: 'working' };
    case 'queued': return { stage: 'working', action: 'queued' };
    case 'superseded':
    case 'deleted': return { ...ENDED };
    default: return { stage: 'idle' };
  }
}

/** Same classification for automation tickets (approval instead of an open question). */
export function automationWorkStage(job) {
  if (!job) return { ...ENDED };
  switch (job.status) {
    case 'waiting': return { stage: 'person', action: 'answer' };
    case 'failed': return { stage: 'person', action: 'failed' };
    case 'queued': return { stage: 'working', action: 'queued' };
    case 'running': return { stage: 'working' };
    case 'ended': return { ...ENDED };
    default: return { stage: 'idle' };
  }
}

export function workStage(job, source = 'research') {
  return source === 'automation' ? automationWorkStage(job) : researchWorkStage(job);
}

/** Panel grouping used by the research dashboard: attention, active, or ready/history. */
export function workStageGroup(stage) {
  if (!stage) return 'ready';
  if (stage.stage === 'person') return stage.action === 'review' ? 'ready' : 'attention';
  if (stage.stage === 'working') return 'active';
  if (stage.stage === 'ended') return 'ready';
  return 'active';
}

/** Whether the item waits for an explicit person action before it can continue. */
export function canRetryWork(job, source = 'research') {
  if (!job) return false;
  if (source === 'automation') return ['waiting', 'failed'].includes(job.status);
  return ['paused', 'failed'].includes(job.status);
}

/** At most one concrete question per item, mirroring the SuperAgent attention rule. */
export function attentionOf(job, source = 'research') {
  if (!job) return null;
  if (source === 'automation') {
    if (job.status === 'waiting') return { kind: 'approval', question: job.title || job.stage || '有一项自动任务等待确认。', options: [] };
    if (job.status === 'failed') return { kind: 'retry', question: job.error || '自动任务失败，可以重试。', options: [] };
    return null;
  }
  const raw = job.progress?.attention;
  if (raw && typeof raw === 'object' && typeof raw.question === 'string' && raw.question.trim()) {
    return {
      kind: typeof raw.kind === 'string' ? raw.kind : 'question',
      question: raw.question,
      options: Array.isArray(raw.options) ? raw.options.filter(option => typeof option === 'string') : [],
    };
  }
  if (job.status === 'waiting') {
    const questions = Array.isArray(job.progress?.result?.questions) ? job.progress.result.questions : [];
    if (questions.length) return { kind: 'question', question: String(questions[0]), options: questions.map(String) };
  }
  if (job.status === 'failed') return { kind: 'retry', question: job.error || '任务失败，可以重试。', options: [] };
  if (job.status === 'paused') return { kind: 'blocked', question: job.error || '任务已暂停，可以继续。', options: [] };
  return null;
}

const LABELS = {
  'person/delivery': '输入未送达',
  'person/answer': '待你回答',
  'person/review': '待查看',
  'person/blocked': '已暂停',
  'person/failed': '失败，待重试',
  'working/queued': '排队中',
  working: '进行中',
  idle: '等待触发',
  ended: '已完成',
};

export function workStageLabel(stage, source = 'research') {
  if (!stage) return '';
  if (stage.stage === 'person' && stage.action === 'answer') return source === 'automation' ? '待你确认' : '待你回答';
  if (stage.stage === 'ended') return source === 'automation' ? '已结束' : '已完成';
  return LABELS[stage.stage + (stage.action ? '/' + stage.action : '')] || '进行中';
}
