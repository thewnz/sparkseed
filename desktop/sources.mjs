import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { normalizeQuery, normalizeText, searchAll, searchWeb } from './paper-search.mjs';

export const researchSources = {
  github: { label: 'GitHub', endpoint: 'https://api.githubcopilot.com/mcp/x/repos/readonly', tool: 'search_repositories' },
  scholar: { label: '学术搜索', endpoint: '', tool: '' },
  web: { label: '网页搜索', endpoint: '', tool: '' },
};

export function mcpEndpoint(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('请填写完整的 MCP 地址。'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.hash || url.search) {
    throw new Error('请填写 HTTPS 地址。本机服务可使用 HTTP。');
  }
  return url;
}

export function validateSearchTool(name) {
  if (typeof name !== 'string' || !/^[a-z\d_.-]{1,100}$/i.test(name) || !/(search|query)/i.test(name)) {
    throw new Error('请填写搜索工具名，例如 search_repositories。');
  }
  return name;
}

export function scholarUrl(query) {
  const url = new URL('https://scholar.google.com/scholar');
  url.searchParams.set('q', query);
  return url.href;
}

export function sourceBrowserUrl(id, query) {
  const text = normalizeQuery(query);
  if (id === 'scholar') return scholarUrl(text);
  if (id !== 'github' && id !== 'web') throw new Error('未知研究工具。');
  const url = new URL(id === 'github' ? 'https://github.com/search' : 'https://www.bing.com/search');
  url.searchParams.set('q', text);
  if (id === 'github') url.searchParams.set('type', 'repositories');
  return url.href;
}

async function searchGitHub(query, request, signal) {
  const url = new URL('https://api.github.com/search/repositories');
  url.search = new URLSearchParams({ q: query, per_page: '15' });
  const response = await request(url, {
    signal, redirect: 'error',
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Sparkseed research workspace' },
  });
  if (response.status === 403 || response.status === 429) {
    throw new Error('GitHub 暂时限制了匿名检索。请稍后重试，或在浏览器打开。');
  }
  if (response.status === 422) throw new Error('GitHub 无法处理这条检索。请缩短关键词或检查检索条件。');
  if (!response.ok) throw new Error('GitHub 检索暂时不可用，可在浏览器打开。');
  const data = await response.json();
  if (!Array.isArray(data.items)) throw new Error('GitHub 返回了无法读取的结果，可在浏览器打开。');
  return {
    entries: data.items.slice(0, 15).flatMap(repo => {
      const title = normalizeText(repo?.full_name).slice(0, 300);
      if (!/^[\w.-]+\/[\w.-]+$/.test(title) || repo.private) return [];
      const stars = Number.isSafeInteger(repo.stargazers_count) ? '★ ' + repo.stargazers_count.toLocaleString('zh-CN') : '';
      const description = [stars, normalizeText(repo.language), normalizeText(repo.description)].filter(Boolean).join(' · ');
      return [{ title, url: 'https://github.com/' + title, description: description.slice(0, 900) }];
    }),
    notice: data.incomplete_results ? 'GitHub 只返回了部分结果，可缩小查询范围后重试。' : '',
    source: 'GitHub',
    text: '',
  };
}

export async function searchPublicSource(id, query, request = fetch) {
  const text = normalizeQuery(query);
  const signal = AbortSignal.timeout(17000);
  if (id === 'github') {
    try { return await searchGitHub(text, request, signal); }
    catch (error) {
      if (signal.aborted || error instanceof TypeError) throw new Error('未能连接 GitHub，可稍后重试或在浏览器打开。');
      throw error;
    }
  }
  if (id !== 'scholar' && id !== 'web') throw new Error('未知研究工具。');
  let rows;
  let notice = '';
  if (id === 'scholar') {
    const value = await searchAll(text, { sources: ['crossref', 'arxiv', 'europepmc'], request, signal });
    const failed = value.sources.filter(item => item.status === 'error').map(item => item.label);
    if (failed.length === value.sources.length) throw new Error('公开学术来源暂时无法访问。请稍后重试，或用 Google Scholar 搜索。');
    if (failed.length) notice = failed.join('、') + ' 暂时未返回结果。';
    rows = value.results;
  } else {
    rows = await searchWeb(text, { request, signal });
  }
  return { entries: rows.slice(0, 15).map(item => ({
    title: item.title.slice(0, 300),
    url: item.url,
    description: [
      (item.sources || [item.source]).join(' / '),
      item.authors.slice(0, 3).join(', '),
      item.year,
      item.venue,
      item.abstract,
    ].filter(Boolean).join(' · ').slice(0, 900),
  })), notice, source: researchSources[id].label, text: '' };
}

function compactResult(result) {
  const text = result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') || '';
  let data = result.structuredContent;
  if (!data && text) {
    try { data = JSON.parse(text); } catch { /* A plain-text result is also valid. */ }
  }
  const list = Array.isArray(data) ? data : data?.items || data?.results || data?.repositories || data?.organic_results;
  const entries = Array.isArray(list) ? list.slice(0, 15).flatMap(item => {
    const title = item?.title || item?.full_name || item?.name;
    if (typeof title !== 'string') return [];
    const raw = item.html_url || item.url || item.link;
    const url = typeof raw === 'string' && /^https?:\/\//i.test(raw) ? raw.slice(0, 1500) : '';
    const description = item.description || item.snippet || item.abstract;
    return [{ title: title.slice(0, 300), url, description: typeof description === 'string' ? description.slice(0, 900) : '' }];
  }) : [];
  return { entries, text: entries.length ? '' : (text || (data ? JSON.stringify(data, null, 2) : '')).slice(0, 12000) };
}

export async function useResearchSource(config, query, cancellation) {
  const url = mcpEndpoint(config.endpoint);
  const name = validateSearchTool(config.tool);
  const headers = {};
  if (config.token) headers.Authorization = 'Bearer ' + config.token;
  if (url.hostname === 'api.githubcopilot.com') {
    headers['X-MCP-Readonly'] = 'true';
    headers['X-MCP-Tools'] = name;
  }
  const timeout = AbortSignal.timeout(20000);
  const deadline = cancellation ? AbortSignal.any([timeout, cancellation]) : timeout;
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers },
    fetch(input, options) {
      const signal = options?.signal ? AbortSignal.any([deadline, options.signal]) : deadline;
      return fetch(input, { ...options, signal, redirect: 'error' });
    },
  });
  const client = new Client({ name: 'research-workspace', version: '0.1.0' }, { capabilities: {} });
  try {
    await client.connect(transport, { timeout: 20000 });
    let cursor;
    let tool;
    for (let page = 0; page < 3 && !tool; page++) {
      const result = await client.listTools(cursor ? { cursor } : {});
      tool = result.tools.find(item => item.name === name);
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    if (!tool || tool.annotations?.destructiveHint === true) throw new Error('服务没有提供所选的只读搜索工具。');
    const schema = tool.inputSchema;
    const argument = config.queryField || ['query', 'q', 'keyword', 'search_query'].find(key => schema.properties?.[key]);
    if (!argument || !schema.properties?.[argument] || (schema.required || []).some(key => key !== argument)) {
      throw new Error('搜索工具需要额外参数，或查询字段不匹配。请检查工具名与字段。');
    }
    if (!query) return { tool: name, queryField: argument };
    const result = await client.callTool({ name, arguments: { [argument]: query } }, undefined, { timeout: 20000 });
    if (result.isError) throw new Error('搜索工具返回失败。请检查查询和服务权限。');
    return compactResult(result);
  } catch (error) {
    cancellation?.throwIfAborted();
    if (timeout.aborted || /timed out/i.test(error.message)) throw new Error('连接超时。请检查 MCP 地址和网络。');
    if (error instanceof UnauthorizedError ||
        error instanceof StreamableHTTPError && [401, 403].includes(error.code) ||
        /\b(?:401|403)\b|unauthorized/i.test(error.message)) {
      throw new Error(config.token ? '连接未获授权。请检查访问令牌和搜索权限。' :
        '此 MCP 服务需要授权。请在连接设置中填写访问令牌。');
    }
    if (/^(服务没有|搜索工具)/.test(error.message)) throw error;
    throw new Error('MCP 连接失败。请检查地址、权限和服务协议。');
  } finally {
    await client.close().catch(() => {});
  }
}
