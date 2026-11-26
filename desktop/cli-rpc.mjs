import { createInterface } from 'node:readline';

// CLI protocols use one JSON object per line. Server-initiated requests never
// inherit the desktop's filesystem, terminal or approval capabilities.
export async function withCliRpc(child, signal, { envelope = {}, failure, permission }, work) {
  let nextId = 0;
  let stderr = '';
  let onEvent = () => {};
  let abortMessage;
  let abortTimer;
  let terminal;
  let closing = false;
  const pending = new Map();
  const lines = createInterface({ input: child.stdout });
  const closed = new Promise(resolve => child.once('close', resolve));
  function terminate() {
    child.kill();
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
  }
  const send = message => {
    if (!child.stdin.destroyed) child.stdin.write(JSON.stringify({ ...envelope, ...message }) + '\n');
  };
  function fail(error) {
    terminal ??= error;
    for (const call of pending.values()) call.reject(terminal);
    pending.clear();
  }
  function abort() {
    if (abortMessage) {
      send(abortMessage);
      abortTimer = setTimeout(terminate, 400);
    } else terminate();
    fail(signal.reason);
  }
  signal.addEventListener('abort', abort, { once: true });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
  child.stdin.on('error', error => { if (!closing) fail(signal.aborted ? signal.reason : failure(error.message)); });
  child.once('error', error => fail(failure(error.message)));
  child.once('close', () => { if (!closing) fail(signal.aborted ? signal.reason : failure(stderr)); });
  lines.on('line', line => {
    if (signal.aborted || terminal) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message?.method && message.id != null) {
      send({ id: message.id, ...(permission?.(message) ||
        { error: { code: -32601, message: 'Operation unavailable' } }) });
    } else if (message?.method) {
      try { onEvent(message); } catch (error) { fail(error); }
    } else if (pending.has(message?.id)) {
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call.reject(failure(message.error.message));
      else call.resolve(message.result);
    }
  });
  const reject = () => {
    signal.throwIfAborted();
    if (terminal) throw terminal;
  };
  const rpc = {
    async call(method, params) {
      reject();
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ id, method, params });
      });
    },
    notify(method, params) { reject(); send({ method, params }); },
    events(callback) { onEvent = callback; },
    cancelWith(method, params) { abortMessage = { method, params }; },
    async wait(completion) {
      reject();
      const id = Symbol();
      const ended = new Promise((_, reject) => pending.set(id, { reject }));
      try { return await Promise.race([completion, ended]); }
      finally { pending.delete(id); }
    },
  };
  try {
    reject();
    return await work(rpc);
  } finally {
    closing = true;
    signal.removeEventListener('abort', abort);
    lines.close();
    if (!abortTimer) terminate();
    await closed;
    clearTimeout(abortTimer);
  }
}
