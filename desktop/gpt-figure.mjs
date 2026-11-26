import { randomUUID } from 'node:crypto';

const endpoint = 'https://api.openai.com/v1/images/generations';
const defaultModel = 'gpt-image-2.5-sunburst';
const size = '1536x1024';
const maxResponseBytes = 24_000_000;
const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function requestError(status) {
  if (status === 401) return new Error('OpenAI API Key 无效，请在生成设置中检查。');
  if (status === 403) return new Error('当前 OpenAI API Key 没有图像生成权限，请检查项目权限和组织验证状态。');
  if (status === 429) return new Error('OpenAI 图像请求受限，请检查 API 额度或稍后重试。');
  if (status === 400) return new Error('OpenAI 无法处理此插图请求，请检查描述并重试。');
  if (status >= 500) return new Error('OpenAI 图像服务暂时不可用，请稍后重试。');
  return new Error('OpenAI 插图请求未成功（HTTP ' + status + '）。');
}

async function readImageResponse(response) {
  if (Number(response.headers.get('content-length')) > maxResponseBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error('OpenAI 返回的插图超过大小上限。');
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body || []) {
    total += chunk.byteLength;
    if (total > maxResponseBytes) throw new Error('OpenAI 返回的插图超过大小上限。');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks, total).toString('utf8')); }
  catch { throw new Error('无法读取 OpenAI 的插图响应。'); }
  return value?.data?.[0]?.b64_json;
}

function isPng(encoded) {
  if (typeof encoded !== 'string' || encoded.length % 4 !== 0 || !/^[a-z\d+/]+={0,2}$/i.test(encoded)) return false;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(pngMagic) ||
      bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') return false;
  if (bytes.readUInt32BE(16) !== 1536 || bytes.readUInt32BE(20) !== 1024) return false;
  let foundPixels = false;
  for (let offset = 33; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return false;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT' && length > 0) foundPixels = true;
    if (type === 'IEND') return foundPixels && length === 0 && end === bytes.length;
    offset = end;
  }
  return false;
}

export async function makeGptFigure({ prompt, title, key, signal, reference, model = defaultModel, request = fetch }) {
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  if (!key) throw new Error('请在偏好设置的 Agent 接入中配置官方 OpenAI 连接，并确认 API Key 有图像生成权限。');
  if (!text || text.length > 32000) throw new Error('请输入不超过 32,000 字符的插图描述。');
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(185000)]) : AbortSignal.timeout(185000);
  let response;
  try {
    requestSignal.throwIfAborted();
    response = await request(reference ? endpoint.replace('/generations', '/edits') : endpoint, {
      method: 'POST',
      signal: requestSignal,
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, prompt: text, quality: 'high', size, output_format: 'png', n: 1,
        ...(reference ? { images: [{ image_url: reference }] } : {}) }),
    });
  } catch {
    signal?.throwIfAborted();
    if (requestSignal.aborted) throw new Error('OpenAI 插图生成超时，请重试。');
    throw new Error('无法连接 OpenAI 图像服务，请检查网络后重试。');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw requestError(response.status);
  }
  let encoded;
  try {
    encoded = await readImageResponse(response);
    requestSignal.throwIfAborted();
  } catch (error) {
    signal?.throwIfAborted();
    if (requestSignal.aborted) throw new Error('OpenAI 插图生成超时，请重试。');
    if (/^(?:OpenAI 返回|无法读取 OpenAI)/.test(error.message)) throw error;
    throw new Error('接收 OpenAI 插图失败，请检查网络后重试。');
  }
  if (!isPng(encoded)) throw new Error('OpenAI 未返回有效的 PNG 插图。');
  return {
    id: randomUUID(), type: 'image', title: (typeof title === 'string' && title.trim().slice(0, 120)) || 'GPT Image 科研插图',
    data: 'data:image/png;base64,' + encoded, description: text.slice(0, 300),
  };
}
