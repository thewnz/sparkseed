import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeMiniMaxImage, makePresentation, normalizeStudioDiagram, normalizeStudioSlides } from '../desktop/studio.mjs';
import { defaultOpenings, normalizeAppearance } from '../desktop/appearance.mjs';

test('开场语保留四条默认文案，允许编辑、去重及全部删除', () => {
  assert.equal(defaultOpenings.length, 4);
  assert.deepEqual(normalizeAppearance({}).openings, defaultOpenings);
  assert.deepEqual(normalizeAppearance({ openings: [' 自定义 ', '自定义', '', null] }).openings, ['自定义']);
  assert.deepEqual(normalizeAppearance({ openings: [] }).openings, []);
});

test('图文输出拒绝空内容，并限制页数和每页要点', async () => {
  assert.throws(() => normalizeStudioSlides({ slides: [{ title: '无正文', points: [] }] }), /没有返回/);
  assert.throws(() => normalizeStudioDiagram({ title: '流程', nodes: ['仅一个节点'] }), /足够/);
  const deck = normalizeStudioSlides({ title: '研究汇报', slides: Array.from({ length: 12 }, () => ({
    title: '研究方法', points: Array.from({ length: 7 }, (_, i) => '要点 ' + i),
  })) });
  assert.equal(deck.slides.length, 10);
  assert.equal(deck.slides[0].points.length, 5);
  const file = await makePresentation(deck);
  assert.equal(file.subarray(0, 2).toString(), 'PK');
  assert.ok(file.includes(Buffer.from('ppt/presentation.xml')));
  assert.ok(file.includes(Buffer.from('ppt/slides/slide10.xml')));
});

test('模型输出进入 SVG 前转义可执行标签', () => {
  const image = normalizeStudioDiagram({ title: '<script>alert(1)</script>', nodes: ['<img onload=x>', '正常节点'] });
  const svg = Buffer.from(image.data.split(',')[1], 'base64').toString();
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.equal(svg.includes('<script>'), false);
  assert.equal(svg.includes('<img'), false);
});

test('图片服务处理凭据缺失、HTTP 错误、错误格式和成功响应', async () => {
  await assert.rejects(makeMiniMaxImage('图', '', undefined), /API Key/);
  await assert.rejects(makeMiniMaxImage('图', 'test', undefined, async () => new Response('', { status: 401 })), /401/);
  const result = body => async () => Response.json(body);
  await assert.rejects(makeMiniMaxImage('图', 'test', undefined, result({ data: { image_base64: ['aGVsbG8='] } })), /格式/);
  await assert.rejects(makeMiniMaxImage('图', 'test', undefined, result({ base_resp: { status_code: 1004 } })), /服务代码 1004/);
  await assert.rejects(makeMiniMaxImage('图', 'test', undefined, result({ data: {} })), /未返回图片/);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEJkAAAAASUVORK5CYII=';
  const image = await makeMiniMaxImage('图', 'test', undefined, result({ data: { image_base64: [png] } }));
  assert.equal(image.data, 'data:image/png;base64,' + png);
});

test('MiniMax 图片端点与模型跟随连接配置', async () => {
  let seen;
  await assert.rejects(makeMiniMaxImage('图', 'test', undefined, async (url, options) => {
    seen = { url, body: JSON.parse(options.body) };
    return new Response('', { status: 401 });
  }, 'MiniMax-H3', 'https://api.minimax.chat/v1'), /401/);
  assert.equal(seen.url, 'https://api.minimax.chat/v1/image_generation');
  assert.equal(seen.body.model, 'MiniMax-H3');
});

test('所选图像模型不可用时回退到 image-01', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEJkAAAAASUVORK5CYII=';
  const models = [];
  const image = await makeMiniMaxImage('图', 'test', undefined, async (url, options) => {
    const body = JSON.parse(options.body);
    models.push(body.model);
    return Response.json(body.model === 'image-01'
      ? { data: { image_base64: [png] } }
      : { base_resp: { status_code: 2013 } });
  }, 'MiniMax-H3', 'https://api.minimax.chat/v1');
  assert.deepEqual(models, ['MiniMax-H3', 'image-01']);
  assert.equal(image.data, 'data:image/png;base64,' + png);
  await assert.rejects(makeMiniMaxImage('图', 'test', undefined, async () => Response.json({ base_resp: { status_code: 2013 } })), /服务代码 2013/);
});
