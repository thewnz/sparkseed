// 按图片类型在矢量与位图之间自动路由；位图不可用时回退矢量。

export const VECTOR = 'vector';
export const RASTER = 'raster';
const rasterTypes = new Set(['illustration', 'concept']);

export function resolveFigureRoute({ pictureType, agentProvider = '', imageProvider = '', capabilities = {} }) {
  if (!rasterTypes.has(pictureType)) {
    return { engine: VECTOR, provider: agentProvider, reason: '流程图与数据图使用可编辑矢量，保证文字准确。' };
  }
  if (imageProvider && capabilities?.[imageProvider]?.imageApi !== false) {
    return { engine: RASTER, provider: imageProvider, reason: '插画与概念示意使用图片服务生成位图。' };
  }
  return { engine: VECTOR, provider: agentProvider, reason: '未配置图像服务，改用可编辑矢量。' };
}

export function vectorFallback(agentProvider, reason) {
  return { engine: VECTOR, provider: agentProvider, reason: reason || '位图未成功，已改用可编辑矢量重试。' };
}
