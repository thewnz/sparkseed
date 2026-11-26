import { createHash } from 'node:crypto';
import { researchLimits } from './research-limits.mjs';
export { researchLimits } from './research-limits.mjs';

// Only direct user commands qualify. Quoted text and inferred preferences do not.
export function rememberExplicitRequest(store, ideaId, message) {
  const match = typeof message === 'string' && message.trim().match(/^(?:请(?:长期)?记住|请记入研究记忆|请加入长期记忆)[：:]\s*([\s\S]+)$/u);
  const text = match && match[1].trim();
  if (!text || text.length > 1000) return false;
  const id = 'explicit-' + createHash('sha256').update(ideaId + '\n' + text).digest('hex').slice(0, 40);
  const withdrawn = store.work.memories().find(entry => entry.text === text && entry.status === 'withdrawn');
  if (withdrawn) {
    store.work.setMemoryStatus(withdrawn.id, 'active');
    store.work.reinforceMemory(withdrawn.id, 0.2);
    return true;
  }
  store.work.addMemory({ id, idea_id: ideaId }, { text, reason: '用户在讨论中明确要求记住' });
  return true;
}

const initial = {
  soul: '用中文与我讨论研究想法。每轮聚焦一个问题，提供贴合语境的选项，允许我补充或跳过。区分事实、推断和待查证的假设。工作限于文献检索、阅读和分析。',
  memory: '',
};

export function readResearchProfile(store) {
  const saved = store.setting('researchProfile');
  return Object.fromEntries(Object.entries(initial).map(([section, text]) => [section,
    saved?.[section] || { text, revision: 0, savedAt: null, history: [] },
  ]));
}

export function learnedResearch(store) {
  const seen = new Set();
  const approved = new Set((store.work?.memories() || []).filter(row => row.status === 'active').map(row => row.text));
  return (store.work?.learned() || []).flatMap(row => row.observations.map(item => ({
    ...item, ideaId: row.idea_id, updated: row.updated, approved: approved.has(item.text),
  }))).filter(item => {
    const key = item.kind + ':' + item.text;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 16);
}

export function relevantMemory(store, idea, question = '') {
  const profile = readResearchProfile(store);
  function terms(value) {
    const content = String(value ?? '').toLowerCase();
    const words = content.match(/[a-z0-9-]{3,}/g) || [];
    for (const phrase of content.match(/[\p{Script=Han}]+/gu) || []) {
      const characters = [...phrase];
      for (let index = 1; index < characters.length; index++) words.push(characters[index - 1] + characters[index]);
    }
    return [...new Set(words)];
  }
  const recent = (idea.discussion || []).slice(-4).flatMap(turn =>
    [turn.message, turn.question, turn.answer?.note, ...(turn.answer?.options || [])]);
  const context = new Set(terms([question, idea.body, idea.paper, ...recent].filter(Boolean).join(' ')));
  const entries = store.work?.memories() || [];
  const structured = new Set(entries.map(entry => entry.text));
  const notes = [...entries.filter(entry => entry.status === 'active').map(entry => entry.text),
    ...profile.memory.text.split(/\n\s*\n/).map(note => note.trim()).filter(note => note && !structured.has(note))];
  const memory = [...new Set(notes)].map(note => ({ note, score: terms(note).filter(term => context.has(term)).length }))
    .filter(row => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 5)
    .map(row => row.note.slice(0, 900)).join('\n\n');
  const learned = learnedResearch(store).filter(item => item.approved);
  const adaptive = [...learned.filter(item => item.kind === 'style').slice(0, 4),
    ...learned.filter(item => item.kind !== 'style' && terms(item.text).some(term => context.has(term))).slice(0, 4)]
    .map(({ kind, text }) => ({ kind, text }));
  return { soul: profile.soul.text, memory, adaptive, memoryRevision: profile.memory.revision, soulRevision: profile.soul.revision };
}

export function saveResearchSection(store, { section, text, revision } = {}, origin) {  if (!Object.hasOwn(researchLimits, section) || typeof text !== 'string' || text.length > researchLimits[section]) {
    throw new Error('研究记忆内容超出允许范围。');
  }
  const profile = readResearchProfile(store);
  const current = profile[section];
  if (revision !== current.revision) throw new Error('此内容已更新，请重新打开后再编辑。');
  if (text === current.text) return profile;
  const { history, ...previous } = current;
  profile[section] = {
    text, revision: revision + 1, savedAt: new Date().toISOString(), ...(origin ? { origin } : {}),
    history: [previous, ...history].slice(0, 12),
  };
  store.set('researchProfile', profile);
  return profile;
}

export function appendMemoryProfile(store, texts, origin) {
  const profile = readResearchProfile(store);
  const current = profile.memory;
  const parts = current.text.split(/\n\s*\n/).map(value => String(value).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const fresh = [...new Set((Array.isArray(texts) ? texts : []).map(value => String(value).replace(/\s+/g, ' ').trim()).filter(Boolean))]
    .filter(text => !parts.some(part => part.includes(text) || (text.includes(part) && part.length >= 8)));
  if (!fresh.length) return profile;
  let text = parts.join('\n\n');
  for (const item of fresh) {
    const next = text ? text + '\n\n' + item : item;
    if (next.length > researchLimits.memory) break;
    text = next;
  }
  if (!text || text === current.text) return profile;
  return saveResearchSection(store, { section: 'memory', text, revision: current.revision }, origin);
}
