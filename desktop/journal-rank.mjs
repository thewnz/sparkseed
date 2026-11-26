const normalize = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

export function rankEntries(value, prefix = '', depth = 0) {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number') {
    const text = normalize(String(value));
    if (!text) return [];
    const key = prefix.split('.').filter(Boolean).pop() || '评级';
    return [{ key: key.slice(0, 40), value: text.slice(0, 80) }];
  }
  if (Array.isArray(value)) return value.flatMap(item => rankEntries(item, prefix, depth + 1));
  if (typeof value !== 'object') return [];
  const label = value.name || value.label || value.key || value.title;
  const grade = value.value || value.rank || value.grade;
  if (label && grade !== undefined && typeof grade !== 'object') {
    return [{ key: normalize(String(label)).slice(0, 40), value: normalize(String(grade)).slice(0, 80) }];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    rankEntries(child, prefix ? prefix + '.' + key : key, depth + 1));
}

export function rankLabel(entries) {
  return (entries || []).slice(0, 4).map(item => item.key + ' ' + item.value).join(' · ');
}

export async function fetchJournalRank(venue, secret, { request = fetch, signal } = {}) {
  const name = normalize(venue).slice(0, 200);
  if (!name) throw new Error('这篇论文没有期刊或会议名称。');
  if (!secret) throw new Error('请先填写 easyScholar 密钥。');
  const url = new URL('https://easyscholar.cc/open/getPublicationRank');
  url.search = new URLSearchParams({ secretKey: secret, publicationName: name });
  const response = await request(url, {
    signal, redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'Sparkseed/0.1' },
  });
  if (!response.ok) throw new Error('easyScholar 返回 HTTP ' + response.status);
  const data = await response.json();
  if (data?.code && Number(data.code) !== 200) throw new Error(normalize(data.msg) || '期刊评级查询失败。');
  const seen = new Set();
  const entries = rankEntries(data?.data ?? data).filter(item => {
    const key = item.key + '\0' + item.value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
  return { venue: name, entries, label: rankLabel(entries), fetchedAt: new Date().toISOString() };
}
