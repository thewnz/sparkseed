// 主流大模型官方兼容接口预设：用户只需填 API Key；custom / custom-anthropic 保留完全自定义。
export const apiPresets = [
  { id: 'openai', label: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o', protocol: 'openai' },
  { id: 'anthropic', label: 'Anthropic Claude', base: 'https://api.anthropic.com', model: 'claude-sonnet-4-5', protocol: 'anthropic' },
  { id: 'gemini', label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', protocol: 'openai' },
  { id: 'xai', label: 'xAI Grok', base: 'https://api.x.ai/v1', model: 'grok-3-mini', protocol: 'openai' },
  { id: 'mistral', label: 'Mistral AI', base: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', protocol: 'openai' },
  { id: 'groq', label: 'Groq', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', protocol: 'openai' },
  { id: 'together', label: 'Together AI', base: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', protocol: 'openai' },
  { id: 'perplexity', label: 'Perplexity', base: 'https://api.perplexity.ai', model: 'sonar-pro', protocol: 'openai' },
  { id: 'openrouter', label: 'OpenRouter', base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o', protocol: 'openai' },
  { id: 'deepseek', label: 'DeepSeek', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', protocol: 'openai' },
  { id: 'kimi-api', label: 'Kimi / Moonshot', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', protocol: 'openai' },
  { id: 'qwen', label: '通义千问 Qwen', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', protocol: 'openai' },
  { id: 'zhipu', label: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus', protocol: 'openai' },
  { id: 'doubao', label: '豆包 / 火山方舟', base: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-pro-32k', protocol: 'openai' },
  { id: 'minimax', label: 'MiniMax', base: 'https://api.minimax.chat/v1', model: 'MiniMax-Text-01', protocol: 'openai' },
  { id: 'siliconflow', label: 'SiliconFlow', base: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3', protocol: 'openai' },
  { id: 'stepfun', label: '阶跃星辰 StepFun', base: 'https://api.stepfun.com/v1', model: 'step-2-16k', protocol: 'openai' },
  { id: 'yi', label: '零一万物 Yi', base: 'https://api.lingyiwanwu.com/v1', model: 'yi-lightning', protocol: 'openai' },
  { id: 'qianfan', label: '百度千帆', base: 'https://qianfan.baidubce.com/v2', model: 'ernie-4.5-turbo-32k', protocol: 'openai' },
  { id: 'spark', label: '讯飞星火', base: 'https://spark-api-open.xf-yun.com/v1', model: '4.0Ultra', protocol: 'openai' },
  { id: 'custom-anthropic', label: '自定义 Anthropic 兼容', base: 'https://api.anthropic.com', model: 'claude-sonnet-4-5', protocol: 'anthropic' },
  { id: 'custom', label: '自定义兼容 API', base: '', model: '', protocol: 'openai' },
];

const byId = new Map(apiPresets.map(preset => [preset.id, preset]));

export function isApiProvider(id) {
  return byId.has(id);
}

export function apiProtocol(id) {
  return byId.get(id)?.protocol || 'openai';
}

export function apiPresetDefaults(id) {
  const preset = byId.get(id);
  return { base: preset?.base || '', model: preset?.model || '' };
}