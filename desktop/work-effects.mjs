export class Later extends Error {}

/**
 * Durable side-effect runner for work items. Rows live in SQLite, so a quit or crash keeps them;
 * handlers may throw Later to hold a row without counting a failure.
 */
export class WorkEffects {
  constructor(work, { now = () => Date.now(), interval = 1200 } = {}) {
    this.work = work;
    this.now = now;
    this.interval = interval;
    this.handlers = new Map();
    this.tasks = new Set();
    this.timer = null;
    this.started = false;
    this.stopped = false;
    this.scheduled = false;
  }

  handle(kind, run, { limit = () => 1, retry = [2000, 60_000] } = {}) {
    if (this.handlers.has(kind)) throw new Error(`The ${kind} effects already have a handler`);
    this.handlers.set(kind, { run, limit, retry });
  }

  start() {
    if (this.started || this.stopped) return;
    this.started = true;
    this.timer = setInterval(() => this.dispatch(), this.interval);
    this.dispatch();
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = null;
  }

  kick() {
    if (this.scheduled || !this.started || this.stopped) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; this.dispatch(); });
  }

  async idle(kind) {
    for (;;) {
      this.dispatch();
      const running = [...this.tasks].filter(task => !kind || task.kind === kind).map(task => task.done);
      if (!running.length) return;
      await Promise.allSettled(running);
    }
  }

  health() {
    return this.work.effects.health();
  }

  dispatch() {
    if (!this.started || this.stopped) return;
    for (const [kind, handler] of this.handlers) {
      const running = [...this.tasks].filter(task => task.kind === kind);
      const room = handler.limit() - running.length;
      if (room <= 0) continue;
      for (const row of this.work.effects.due(kind, room)) this.run(kind, handler, row);
    }
  }

  run(kind, handler, row) {
    const task = { kind, key: row.key, done: null };
    task.done = this.attempt(kind, handler, row)
      .finally(() => { this.tasks.delete(task); this.kick(); });
    this.tasks.add(task);
  }

  async attempt(kind, handler, row) {
    try {
      await handler.run(row.payload, row.key);
      this.work.effects.complete(kind, row.key);
    } catch (error) {
      if (this.stopped) return;
      if (error instanceof Later) {
        this.work.effects.reschedule(kind, row.key, this.now() + handler.retry[0]);
      } else {
        const delay = Math.min(handler.retry[1], handler.retry[0] * 2 ** Math.min(row.attempts || 0, 16));
        this.work.effects.fail(kind, row.key, error, this.now() + delay);
      }
    }
  }
}
