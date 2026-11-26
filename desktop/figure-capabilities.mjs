// 供应商与模型能力推断：视觉输入、图像生成、推理型。未知模型按纯文本处理，可被设置覆盖。

const visionModel = /(gpt-4o|gpt-4\.1|gpt-5|^o[3-9]|claude|gemini|qwen[\w.-]*vl|glm-4v|glm-4\.5v|doubao[\w.-]*vision|deepseek[\w.-]*vl|kimi-latest|moonshot-v1-vision|step-1[ov]|yi-vision|pixtral|grok-2-vision|ernie[\w.-]*vl|llama-4|vision|multimodal|internvl|llava|minimax-m3|minimax-vl)/i;
const imageModel = /(gpt-image|dall-e|image-01|minimax-h\d|hailuo|seedream|flux|imagen)/i;
const reasoningModel = /(^o[3-9]|deepseek-reasoner|minimax-m3|qwq|glm-z1|ernie-x1|sonar-reasoning|grok-3-mini|thinking|reasoner|r1)/i;
const visionProviders = new Set(['openai', 'anthropic', 'gemini']);
const imageProviders = new Set(['openai', 'minimax', 'minimax-image']);

export function detectCapability(provider, model = '', overrides = {}) {
  const override = overrides?.[provider] || {};
  return {
    vision: override.vision ?? (visionProviders.has(provider) || visionModel.test(String(model))),
    imageApi: override.imageApi ?? (imageProviders.has(provider) || imageModel.test(String(model))),
    reasoning: override.reasoning ?? reasoningModel.test(String(model)),
  };
}

export function normalizeCapabilityOverrides(value) {
  const input = value && typeof value === 'object' ? value : {};
  const output = {};
  for (const [provider, capability] of Object.entries(input)) {
    if (!provider || !capability || typeof capability !== 'object') continue;
    const entry = {};
    for (const key of ['vision', 'imageApi']) {
      if (typeof capability[key] === 'boolean') entry[key] = capability[key];
    }
    if (Object.keys(entry).length) output[provider] = entry;
  }
  return output;
}

export function reasoningAdvice(capability) {
  return capability?.reasoning
    ? '该模型属于推理型，绘图较慢且容易超时，建议改用非推理型绘图模型（如 DeepSeek-Chat、GPT-4.1、Qwen-Plus）。'
    : '';
}
