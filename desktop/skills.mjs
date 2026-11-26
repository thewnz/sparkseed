import { randomUUID } from 'node:crypto';
import { skillTextLimit, studioSkillTextLimit } from './skill-limits.mjs';

export { skillTextLimit } from './skill-limits.mjs';
const enabledTextLimit = 32000;
const githubHeaders = { Accept: 'application/vnd.github+json', 'User-Agent': 'Sparkseed' };

export function listSkills(store) {
  return store.setting('skills') || [];
}

export function saveSkill(store, input) {
  const skills = listSkills(store);
  const existing = input?.id ? skills.find(skill => skill.id === input.id) : undefined;
  if (input?.id && !existing) throw new Error('这项技能已不存在。');
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const description = typeof input?.description === 'string' ? input.description.trim() : '';
  const text = typeof input?.text === 'string' ? input.text.trim() : '';
  const scope = input.scope === 'studio' ? 'studio' : 'research';
  const limit = scope === 'studio' ? studioSkillTextLimit : skillTextLimit;
  if (!name || name.length > 80 || description.length > 280 || !text || text.length > limit) {
    throw new Error('请填写技能名称与内容，并检查长度。');
  }
  const item = {
    id: existing?.id || randomUUID(), name, description, text,
    enabled: input.enabled === true, origin: existing?.origin || input.origin || '',
    source: existing?.source || githubSkillLocation(input.source)?.href || '',
    scope,
  };
  const next = [item, ...skills.filter(skill => skill.id !== item.id)];
  if (next.filter(skill => skill.enabled).reduce((sum, skill) => sum + skill.text.length, 0) > enabledTextLimit) {
    throw new Error('启用的技能内容合计最多 32,000 字符。请先停用或精简部分技能。');
  }
  store.set('skills', next);
  return next;
}

export function enabledSkills(store, scope = 'research') {
  return listSkills(store).filter(skill => skill.enabled && (skill.scope || 'research') === scope);
}

export async function findGitHubSkills(query, signal, request = fetch) {
  const url = new URL('https://api.github.com/search/repositories');
  url.search = new URLSearchParams({ q: query + ' archived:false', sort: 'stars', per_page: '10' });
  const result = await request(url, { signal, redirect: 'error', headers: githubHeaders });
  if (!result.ok) throw new Error(result.status === 403 || result.status === 429 ? 'GitHub 暂时限制搜索请求，请稍后重试。' : 'GitHub 搜索失败。');
  const data = await result.json();
  const repositories = (data.items || []).slice(0, 7).map(item => ({
    title: String(item.full_name || '').slice(0, 150), description: String(item.description || '').slice(0, 450),
    url: /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/i.test(item.html_url) ? item.html_url : '',
    branch: String(item.default_branch || ''),
  })).filter(item => item.title && item.url);
  return Promise.all(repositories.map(async ({ branch, ...item }) => {
    const path = new URL(item.url).pathname;
    const budget = AbortSignal.any([signal, AbortSignal.timeout(3500)]);
    let files = [];
    try {
      const tree = await request('https://api.github.com/repos' + path + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1',
        { signal: budget, redirect: 'error', headers: githubHeaders });
      if (tree.ok) files = ((await tree.json()).tree || []).filter(entry =>
        entry.type === 'blob' && typeof entry.path === 'string' && /(^|\/)SKILL\.md$/i.test(entry.path)).slice(0, 4).map(entry => ({
          name: entry.path, url: item.url + '/blob/' + encodeURIComponent(branch) + '/' + entry.path.split('/').map(encodeURIComponent).join('/'),
        }));
    } catch { signal.throwIfAborted(); }
    return { ...item, files };
  }));
}

function githubSkillLocation(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash) return null;
    const [owner, repo, route, ref, ...path] = url.pathname.slice(1).split('/').map(decodeURIComponent);
    if (![owner, repo].every(name => /^[\w.-]+$/.test(name) && name !== '.' && name !== '..') ||
        route !== 'blob' || !ref || !/^SKILL\.md$/i.test(path.at(-1) || '') ||
        path.some(part => !part || part === '.' || part === '..' || /[/\\\x00-\x1f]/.test(part))) return null;
    return { href: url.href, owner, repo, ref, path };
  } catch { return null; }
}

export async function downloadGitHubSkill(value, signal, request = fetch) {
  const location = githubSkillLocation(value);
  if (!location) throw new Error('请选择 GitHub 上的 SKILL.md 文件。');
  const { href, owner, repo, ref, path } = location;
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/${path.map(encodeURIComponent).join('/')}`);
  url.searchParams.set('ref', ref);
  const response = await request(url, { signal, redirect: 'error', headers: { ...githubHeaders, Accept: 'application/vnd.github.raw+json' } });
  if (!response.ok || !response.body) {
    throw new Error([403, 429].includes(response.status) ? 'GitHub 暂时限制下载请求，请稍后重试。' : '无法读取该 SKILL.md，请检查文件是否仍然公开。');
  }
  const decoder = new TextDecoder();
  let markdown = '';
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > 64000) throw new Error('技能文件过大。');
    markdown += decoder.decode(chunk, { stream: true });
  }
  markdown += decoder.decode();
  return { ...skillFromMarkdown(markdown, path.at(-2) || repo, 64000), source: href };
}

export function removeSkill(store, id) {
  const next = listSkills(store).filter(skill => skill.id !== id);
  store.set('skills', next);
  return next;
}

export function skillFromMarkdown(markdown, fallback, limit = skillTextLimit) {
  const input = markdown.replace(/^\uFEFF/, '').trim();
  if (!input) throw new Error('技能文件为空。');
  if (input.length > limit) throw new Error('技能文件超过 ' + limit.toLocaleString('en-US') + ' 字符。');
  const header = input.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || '';
  function field(key) {
    return header.match(new RegExp('^' + key + ':[ \\t]*([^\\r\\n]+)', 'm'))?.[1].trim().replace(/^(['"])(.*)\1$/, '$2') || '';
  }
  const name = field('name') || input.match(/^#\s+(.+)$/m)?.[1] || fallback;
  const description = field('description');
  return { name: name.slice(0, 80), description: description.slice(0, 280), text: input, enabled: false };
}

export const defaultFigureSkillSource = 'https://github.com/Sleepy-Avacado/FigGenie-paper-diagram-skill/blob/main/skills/figgenie-paper-diagram/SKILL.md';

/** Seeds the bundled FigGenie skill once as the default, user-editable studio figure skill (MIT, see bundled LICENSE). */
export function seedDefaultFigureSkill(store, markdown) {
  if (store.setting('defaultFigureSkillSeeded')) return null;
  store.set('defaultFigureSkillSeeded', true);
  if (typeof markdown !== 'string' || !markdown.trim()) return null;
  let parsed;
  try { parsed = skillFromMarkdown(markdown, 'FigGenie · 论文插图', studioSkillTextLimit); }
  catch { return null; }
  const next = saveSkill(store, {
    name: 'FigGenie · 论文插图（默认）',
    description: '默认科研绘图技能：按顶会惯例画架构/机制/AI 示意图（SVG）。源自 FigGenie（MIT），可在图文技能中修改、停用或删除。',
    text: parsed.text,
    enabled: true,
    scope: 'studio',
    origin: 'bundled',
    source: defaultFigureSkillSource,
  });
  return next[0];
}
