import { createHash } from 'node:crypto';
import { researchNotification } from './research-notifications.mjs';

/**
 * Everything that must happen after a research result is saved, as a durable decision.
 * The delivery effect replays it after a quit, so each part has to be safe to repeat.
 */
export function researchDelivery(job, result, { notifications = true } = {}) {
  const value = result?.result || {};
  const questions = Array.isArray(value.questions) ? value.questions : [];
  const waiting = job.kind === 'initial' && questions.length > 0;
  const significant = researchNotification(value);
  const key = 'notification:' + job.idea_id + ':' + createHash('sha256').update(JSON.stringify(value.cards || [])).digest('hex');
  return {
    status: waiting ? 'waiting' : 'ready',
    summarize: !waiting,
    observations: job.kind === 'synthesis' ? value.observations || [] : null,
    notice: significant && notifications
      ? { key, id: key, title: significant.title, body: significant.body, ideaId: job.idea_id, jobId: job.id }
      : null,
  };
}