import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { withCliRpc } from '../desktop/cli-rpc.mjs';

function fixture(handle) {
  const child = new EventEmitter();
  Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
  const reader = createInterface({ input: child.stdin });
  let closed = false;
  child.kill = () => {
    if (closed) return;
    closed = true;
    reader.close();
    child.stdin.end();
    child.stdout.end();
    child.stderr.end();
    queueMicrotask(() => child.emit('close', 0));
  };
  const send = message => child.stdout.write(JSON.stringify(message) + '\n');
  reader.on('line', line => handle(JSON.parse(line), send, child.kill));
  return child;
}

test('CLI RPC 保留先于请求确认到达的完成通知，并拒绝未声明的工具调用', async () => {
  const replies = [];
  const child = fixture((request, send) => {
    if (request.method === 'turn/start') {
      send({ method: 'item/tool/call', id: 99, params: {} });
      send({ method: 'turn/completed', params: { status: 'completed' } });
      send({ id: request.id, result: { id: 'turn' } });
    } else replies.push(request);
  });
  await withCliRpc(child, new AbortController().signal, { failure: () => new Error('fixture failed') }, async rpc => {
    let complete;
    const outcome = new Promise(resolve => { complete = resolve; });
    rpc.events(message => complete(message.params.status));
    const accepted = await rpc.call('turn/start', {});
    assert.equal(accepted.id, 'turn');
    assert.equal(await rpc.wait(outcome), 'completed');
  });
  assert.equal(replies.find(message => message.id === 99)?.error.code, -32601);
});

test('取消在途 ACP 请求会先发送协议通知，并向调用方传播取消', async () => {
  const cancel = new AbortController();
  let sent;
  const child = fixture((request, send, close) => {
    if (request.method === 'session/new') send({ id: request.id, result: { sessionId: 's' } });
    if (request.method === 'session/prompt') queueMicrotask(() => cancel.abort());
    if (request.method === 'session/cancel') { sent = request; close(); }
  });
  await assert.rejects(withCliRpc(child, cancel.signal, { envelope: { jsonrpc: '2.0' }, failure: () => new Error('fixture failed') },
    async rpc => {
      const session = await rpc.call('session/new', {});
      rpc.cancelWith('session/cancel', session);
      await rpc.call('session/prompt', session);
    }), { name: 'AbortError' });
  assert.deepEqual(sent, { jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: 's' } });
});
