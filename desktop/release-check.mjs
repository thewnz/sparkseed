function versionParts(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})$/.test(value)) {
    throw new Error('更新源版本必须使用数字格式，例如 0.1.3。');
  }
  return value.split('.').map(Number);
}

export function updateUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('请输入有效的 HTTPS 更新地址。');
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error('请输入有效的 HTTPS 更新地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('更新地址需要使用 HTTPS，且不能包含账户信息或片段。');
  }
  return url.href;
}

export async function checkRelease(source, current, request = fetch) {
  const url = updateUrl(source);
  const signal = AbortSignal.timeout(10_000);
  const timeout = () => new Error('检查更新超时，请稍后重试。');
  const response = await request(url, {
    headers: { Accept: 'application/json' }, redirect: 'error', signal,
  }).catch(() => { throw signal.aborted ? timeout() : new Error('无法连接更新源，请检查地址和网络。'); });
  if (!response.ok || !response.body) throw new Error('更新源暂不可用（HTTP ' + response.status + '）。');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read().catch(() => {
        throw signal.aborted ? timeout() : new Error('更新清单下载中断，请重试。');
      });
      if (done) break;
      size += value.byteLength;
      if (size > 64 * 1024) throw new Error('更新清单过大。');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  let manifest;
  try { manifest = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('更新源未返回有效 JSON。'); }
  const next = versionParts(manifest?.version);
  const installed = versionParts(current);
  const firstDifference = next.findIndex((part, index) => part !== installed[index]);
  const status = firstDifference < 0 ? 'current' : next[firstDifference] > installed[firstDifference] ? 'available' : 'older';
  const available = status === 'available';
  return {
    current, latest: manifest.version, status, available,
    ...(available ? { downloadUrl: updateUrl(manifest.downloadUrl),
      notes: typeof manifest.notes === 'string' ? manifest.notes.trim().slice(0, 1000) : '' } : {}),
  };
}
