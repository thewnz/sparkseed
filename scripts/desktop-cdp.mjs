// CDP driver for live desktop acceptance. Connects to Electron remote debugging.
const base = 'http://127.0.0.1:9222';

async function connect() {
  const targets = await (await fetch(base + '/json')).json();
  const page = targets.find(t => t.type === 'page' && !/devtools/i.test(t.url) && !/figure-export/i.test(t.title));
  if (!page) throw new Error('未找到应用窗口目标: ' + JSON.stringify(targets.map(t => ({ type: t.type, url: t.url }))));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.method) {
      for (const listener of listeners.get(msg.method) || []) listener(msg.params);
      return;
    }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, msg => msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result));
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  return {
    send,
    on: (event, listener) => listeners.set(event, [...(listeners.get(event) || []), listener]),
    close: () => ws.close(),
  };
}

const [command, ...rest] = process.argv.slice(2);
const cdp = await connect();
try {
  if (command === 'eval') {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: rest[0], awaitPromise: true, returnByValue: true, userGesture: true,
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'reload') {
    await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Page.bringToFront')]);
    const errors = [];
    cdp.on('Runtime.exceptionThrown', event => {
      const detail = event.exceptionDetails;
      errors.push(detail.exception?.description || detail.text);
    });
    await cdp.send('Page.reload', { ignoreCache: true });
    console.log('reloaded without cache');
    if (rest[0] === '--wait') {
      await new Promise(resolve => setTimeout(resolve, Number(rest[1]) || 3000));
      console.log(JSON.stringify({ errors }, null, 2));
    }
  } else if (command === 'shot') {
    await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Page.bringToFront')]);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png', fromSurface: rest[1] !== '--local', captureBeyondViewport: false,
    });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(rest[0], Buffer.from(data, 'base64'));
    console.log('saved ' + rest[0]);
  } else if (command === 'artifact') {
    const [artifactId, output] = rest;
    if (!artifactId || !output) throw new Error('用法: artifact <版本ID> <输出路径>');
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: `(async()=>{const a=await recorder.getStudioArtifact(${JSON.stringify(artifactId)});return {data:a.data,type:a.type}})()`,
      awaitPromise: true, returnByValue: true,
    });
    if (!result.value?.data) throw new Error('作品不可用: ' + JSON.stringify(result));
    const data = result.value.data.startsWith('data:') ? result.value.data.split(',')[1] : result.value.data;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(output, Buffer.from(data, 'base64'));
    console.log('saved ' + output);
  } else if (command === 'click') {
    const expr = `(() => { const wanted = ${JSON.stringify(rest[0])};
      const els = [...document.querySelectorAll('button, [role="button"], a, label, summary, li, span')];
      const hit = els.find(el => (el.textContent || '').trim().includes(wanted) && el.offsetParent !== null);
      if (!hit) return 'no element containing: ' + wanted;
      hit.click(); return 'clicked: ' + (hit.textContent || '').trim().slice(0, 40); })()`;
    const { result } = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, userGesture: true });
    console.log(result.value);
  } else {
    throw new Error('用法: node scripts/desktop-cdp.mjs eval|shot|click|reload|artifact ...');
  }
} finally { cdp.close(); }
