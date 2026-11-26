// 从各服务商 /models 官方列表里挑出最新主推模型：过滤非对话/非图像用途，按旗舰优先级排序。
const nonChat = /(embedding|whisper|tts|transcri|moderation|rerank|dall-e|gpt-image|imagen|flux|stable-diffusion|^sd\d|audio|realtime|^image)/i;
const imageCapable = /(gpt-image|dall-e|image-gen|imagen|flux|stable-diffusion|^sd\d|seedream|kolors|image-01|minimax-h\d|hailuo)/i;
const lessPreferred = /(mini|small|nano|tiny|embedding|guard|8k|4k|32k|1\.5b|7b)/i;

// 每个服务商的官方主推优先级（正则从高到低）。列表仍以官方 /models 实际返回为准，这里只决定展示顺序。
const flagshipHints = {
  openai: ['^gpt-5', '^o[3-9]', '^gpt-4\\.1(?!-mini)', '^gpt-4o$', '^gpt-4o-(?!mini)'],
  deepseek: ['^deepseek-reasoner$', '^deepseek-chat$', '^deepseek-v3'],
  'kimi-api': ['^kimi-k2', '^kimi-latest', '^moonshot-v1-128k', '^moonshot-v1-32k'],
  qwen: ['^qwen-max-latest$', '^qwen-max$', '^qwen3-max', '^qwen-plus-latest$', '^qwen-plus$', '^qwen-turbo-latest$'],
  zhipu: ['^glm-4\\.6', '^glm-4\\.5', '^glm-4-plus'],
  doubao: ['doubao-1\\.5-pro', 'doubao-pro', 'doubao-.*thinking'],
  minimax: ['^MiniMax-M2', '^MiniMax-Text-01', '^abab6\\.5'],
  siliconflow: ['DeepSeek-V3', 'DeepSeek-R1', 'Qwen3', 'Qwen2\\.5-72B'],
  openrouter: ['openai/gpt-5', 'anthropic/claude-opus-4', 'google/gemini-2\\.5-pro', 'openai/gpt-4\\.1'],
  anthropic: ['^claude-opus-4', '^claude-sonnet-4', '^claude-3-7-sonnet', '^claude-3-5'],
  gemini: ['^gemini-2\\.5-pro', '^gemini-2\\.5-flash', '^gemini-2\\.0'],
  xai: ['^grok-3(?!-mini)', '^grok-3-mini', '^grok-2'],
  mistral: ['^mistral-large', '^mistral-medium', '^pixtral-large', '^codestral'],
  groq: ['llama-3\\.3-70b', 'qwen-qwq', 'deepseek-r1', 'llama-3\\.1-70b'],
  together: ['DeepSeek-V3', 'DeepSeek-R1', 'Llama-3\\.3-70B', 'Qwen2\\.5-72B'],
  perplexity: ['^sonar-reasoning-pro', '^sonar-pro', '^sonar-reasoning', '^sonar$'],
  stepfun: ['^step-2-16k', '^step-2', '^step-1o', '^step-1v'],
  yi: ['^yi-lightning', '^yi-large', '^yi-vision'],
  qianfan: ['^ernie-4\\.5', '^ernie-4\\.0', '^ernie-x1'],
  spark: ['^4\\.0Ultra', '^max-32k', '^generalv3\\.5'],
  'custom-anthropic': ['^claude-opus-4', '^claude-sonnet-4', '^deepseek-chat', '^glm-4-plus'],
};

function versionScore(id) {
  const numbers = String(id).match(/\d+(?:\.\d+)?/g) || [];
  return numbers.slice(0, 3).reduce((score, value, index) => score + Number(value) * [100, 10, 1][index], 0);
}

function uniqueStrings(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map(item => typeof item === 'string' ? item.trim() : '')
    .filter(id => id && !seen.has(id) && seen.add(id));
}

export function rankTextModels(presetId, list) {
  const all = uniqueStrings(list);
  const hints = flagshipHints[presetId] || [];
  let pool = all.filter(id => !nonChat.test(id));
  if (!pool.length) pool = all;
  if (!pool.length) return { models: [], recommended: '' };
  const score = id => {
    for (let index = 0; index < hints.length; index++) {
      if (new RegExp(hints[index], 'i').test(id)) {
        return 1000 - index * 10 + versionScore(id) / 100 - (lessPreferred.test(id) ? 5 : 0);
      }
    }
    return versionScore(id) + (/-latest$/i.test(id) ? 5 : 0) - (lessPreferred.test(id) ? 40 : 0);
  };
  const models = [...pool].sort((a, b) => score(b) - score(a));
  return { models, recommended: models[0] };
}

export function rankImageModels(presetId, list) {
  // 未读到官方列表时只推荐已验证可用的模型；H3 等新模型保留为手填候选。
  const fallback = presetId === 'minimax' || presetId === 'minimax-image' ? ['image-01', 'MiniMax-H3'] : ['gpt-image-2.5-sunburst'];
  const pool = uniqueStrings(list).filter(id => imageCapable.test(id));
  const score = id => (/^gpt-image/i.test(id) ? 1000 : /^minimax-h\d/i.test(id) ? 960 : /hailuo/i.test(id) ? 900 :
    /^dall-e/i.test(id) ? 100 : /^image-0/i.test(id) ? 500 : 0)
    + versionScore(id) / 100 - (lessPreferred.test(id) ? 5 : 0);
  const models = pool.length ? pool.sort((a, b) => score(b) - score(a)) : fallback;
  return { models, recommended: models[0] };
}
