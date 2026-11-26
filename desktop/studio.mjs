import PptxGenJS from 'pptxgenjs';
import { randomUUID } from 'node:crypto';

const clip = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : '';
const svgText = value => value.replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);

export function normalizeStudioSlides(value) {
  const slides = Array.isArray(value?.slides) ? value.slides.slice(0, 10).flatMap(slide => {
    const title = clip(slide?.title, 70);
    const points = Array.isArray(slide?.points) ? slide.points.map(point => clip(point, 120)).filter(Boolean).slice(0, 5) : [];
    return title && points.length ? [{ title, points }] : [];
  }) : [];
  if (!slides.length) throw new Error('模型没有返回可用的幻灯片。');
  return { id: randomUUID(), type: 'slides', title: clip(value.title, 80) || slides[0].title, slides };
}

export function normalizeStudioDiagram(value) {
  const title = clip(value?.title, 45);
  const nodes = Array.isArray(value?.nodes) ? value.nodes.map(node => clip(node, 18)).filter(Boolean).slice(0, 4) : [];
  if (!title || nodes.length < 2) throw new Error('模型没有返回足够的图示节点。');
  const gap = 1050 / nodes.length;
  const content = nodes.map((node, index) => {
    const x = 75 + gap * index;
    return (index < nodes.length - 1 ? `<path d="M${x + gap - 24} 330h24" stroke="#8c8eac" stroke-width="3"/>` : '') +
      `<rect x="${x}" y="260" width="${gap - 24}" height="140" rx="18" fill="#282a46"/><text x="${x + (gap - 24) / 2}" y="336" text-anchor="middle" fill="#f3efff" font-size="19">${svgText(node)}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#14152a"/><g font-family="Microsoft YaHei, Arial, sans-serif"><text x="75" y="155" font-size="39" fill="#f3efff">${svgText(title)}</text>${content}</g></svg>`;
  return { id: randomUUID(), type: 'image', title, description: nodes.join(' → '), data: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') };
}

export async function makeMiniMaxImage(prompt, key, signal, request = fetch, model = 'image-01', base = 'https://api.minimax.io/v1') {
  if (!key) throw new Error('请在偏好设置的 Agent 接入中配置 MiniMax 连接（api.minimax.io 或 api.minimax.chat）的 API Key。');
  const endpoint = base.replace(/\/+$/, '').replace(/\/image_generation$/, '') + '/image_generation';
  const ask = async useModel => {
    const response = await request(endpoint, {
      method: 'POST', signal, redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: useModel, prompt: clip(prompt, 1450), aspect_ratio: '16:9', response_format: 'base64', n: 1 }),
    });
    if (!response.ok) throw new Error('MiniMax 图片请求失败（HTTP ' + response.status + '）。');
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > 20_000_000) throw new Error('图片超过本地预览大小上限。');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const chosen = model || 'image-01';
  let data = await ask(chosen);
  // 账号未开通所选图像模型（服务代码 2013）时回退到通用 image-01，避免整次出图失败。
  if (Number(data.base_resp?.status_code) === 2013 && chosen !== 'image-01') data = await ask('image-01');
  const serviceCode = data.base_resp?.status_code;

  if (serviceCode != null && Number(serviceCode) !== 0) {
    throw new Error('MiniMax 拒绝了图片请求（服务代码 ' + String(serviceCode).replace(/[^0-9-]/g, '').slice(0, 12) + '），请检查账号额度、API Key 和图片服务权限。');
  }
  const encoded = data.data?.image_base64?.[0];
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(encoded)) throw new Error('MiniMax 未返回图片，请检查账号和图片服务权限。');
  const bytes = Buffer.from(encoded, 'base64');
  const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' :
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' : '';
  if (!mime) throw new Error('图片格式不可识别。');
  return { id: randomUUID(), type: 'image', title: 'MiniMax 生成图片', description: clip(prompt, 300), data: 'data:' + mime + ';base64,' + encoded };
}

export async function makePresentation(artifact) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = artifact.title;
  for (const [index, item] of artifact.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: '17182B' };
    slide.addText(item.title, { x: .8, y: .65, w: 11.7, h: 1.3, color: 'F1EDFF', fontSize: 34, bold: true, fontFace: 'Microsoft YaHei', fit: 'shrink' });
    const hasImage = index === 0 && /^data:image\/(png|jpeg);base64,/.test(artifact.cover || '');
    const content = item.points.map(text => ({ text, options: { bullet: true, breakLine: true } }));
    slide.addText(content, { x: .9, y: 2.03, w: hasImage ? 6.0 : 11.3, h: 4.55, color: 'DDD9EE',
      fontSize: 20, fontFace: 'Microsoft YaHei', valign: 'top', breakLine: true, fit: 'shrink', paraSpaceAfterPt: 10 });
    if (hasImage) slide.addImage({ data: artifact.cover, x: 7.3, y: 2.55, w: 5.1, h: 2.87 });
    slide.addText(String(index + 1), { x: 12, y: 6.75, w: .5, h: .3, color: 'AFA6D1', align: 'right', fontSize: 11 });
  }
  return pptx.write({ outputType: 'nodebuffer' });
}
