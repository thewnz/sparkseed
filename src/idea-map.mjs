const common = new Set([
  'the', 'and', 'for', 'with', 'using', 'this', 'that', 'from', 'into', 'idea',
  '想法', '这个', '一个', '我们', '讨论', '可以', '可能', '需要', '论文', '研究', '一种',
]);

export const mapSize = { width: 960, height: 560 };

function terms(idea) {
  const discussion = idea.discussion.flatMap(turn => [turn.message, turn.answer?.note, turn.paper?.title, turn.answer?.paper?.title,
    ...(turn.answer?.options || [])]);
  const text = [idea.body, idea.body, idea.paper, idea.excerpt.slice(0, 4500), ...discussion].filter(Boolean).join(' ').slice(0, 18000).toLowerCase();
  const counts = new Map();
  function add(token) {
    if (!common.has(token)) counts.set(token, (counts.get(token) || 0) + 1);
  }
  for (const token of text.match(/[a-z][a-z0-9-]{2,}|\p{Script=Han}+/gu) || []) {
    if (/^[a-z]/.test(token)) add(token);
    else {
      const letters = [...token];
      for (let index = 1; index < letters.length; index++) add(letters[index - 1] + letters[index]);
    }
  }
  return counts;
}

export function ideaRating(idea) {
  const values = [idea.importance, idea.research_value].filter(value => Number.isInteger(value) && value >= 1 && value <= 5);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function ideaUsability(idea) {
  return Number.isInteger(idea.usability) && idea.usability >= 1 && idea.usability <= 5 ? idea.usability : null;
}

export function sortIdeasByUsability(ideas) {
  return [...ideas].sort((first, second) => Number(Boolean(second.pinned_at)) - Number(Boolean(first.pinned_at)) ||
    (ideaUsability(second) ?? 0) - (ideaUsability(first) ?? 0) ||
    second.created.localeCompare(first.created));
}

export function researchCandidates(idea, ideas) {
  const origin = terms(idea);
  const ranked = ideas.filter(row => row.id !== idea.id).map(row => {
    const candidate = terms(row);
    let shared = 0;
    for (const [word, count] of origin) shared += Math.min(count, candidate.get(word) || 0);
    return { row, shared: shared / Math.sqrt(Math.max(1, candidate.size)) };
  }).sort((a, b) => b.shared - a.shared);
  const candidates = ranked.filter(item => item.shared).slice(0, 18).map(item => item.row);
  return [...new Set([...candidates, ...ranked.slice(0, 6).map(item => item.row),
    ...ideas.filter(row => row.id !== idea.id).slice(0, 6)])];
}

export function buildIdeaMap(ideas) {
  const ordered = [...ideas].sort((first, second) => first.id.localeCompare(second.id));
  const size = ordered.length;
  const counts = ordered.map(terms);
  const frequencies = new Map();
  for (const document of counts) {
    for (const word of document.keys()) frequencies.set(word, (frequencies.get(word) || 0) + 1);
  }
  const vectors = counts.map(document => {
    let magnitude = 0;
    for (const [word, count] of document) {
      const weight = Math.sqrt(count) * (1 + Math.log((size + 1) / (frequencies.get(word) + 1)));
      document.set(word, weight);
      magnitude += weight * weight;
    }
    const length = Math.sqrt(magnitude);
    if (length) for (const [word, weight] of document) document.set(word, weight / length);
    return document;
  });
  const pairs = [];
  const neighbors = new Map(ordered.map(idea => [idea.id, []]));
  for (let first = 0; first < size; first++) {
    for (let second = first + 1; second < size; second++) {
      const a = vectors[first], b = vectors[second];
      const [small, large] = a.size < b.size ? [a, b] : [b, a];
      let similarity = 0;
      for (const [word, weight] of small) similarity += weight * (large.get(word) || 0);
      similarity = Math.min(1, similarity);
      pairs.push({ first, second, similarity, distance: 80 + (1 - Math.pow(similarity, .4)) * 245 });
      if (similarity > .075) {
        neighbors.get(ordered[first].id).push({ id: ordered[second].id, similarity });
        neighbors.get(ordered[second].id).push({ id: ordered[first].id, similarity });
      }
    }
  }
  for (const [id, entries] of neighbors) neighbors.set(id, entries.sort((a, b) => b.similarity - a.similarity).slice(0, 4));

  const centerX = mapSize.width / 2, centerY = mapSize.height / 2;
  const positions = ordered.map((idea, index) => {
    const angle = index * 2.399963;
    const radius = size > 1 ? Math.sqrt((index + .65) / size) : 0;
    return { idea, x: centerX + Math.cos(angle) * radius * 315, y: centerY + Math.sin(angle) * radius * 205 };
  });
  const steps = size < 90 ? 70 : size < 270 ? 30 : 14;
  const scale = 1 / Math.sqrt(Math.max(size, 1));
  for (let step = 0; step < steps; step++) {
    const dx = new Float64Array(size), dy = new Float64Array(size);
    for (const pair of pairs) {
      const a = positions[pair.first], b = positions[pair.second];
      const x = b.x - a.x, y = b.y - a.y;
      const distance = Math.hypot(x, y) || 1;
      const target = Math.max(46, pair.distance);
      const change = (distance - target) / distance * (.016 + pair.similarity * .075) * scale;
      dx[pair.first] += x * change; dy[pair.first] += y * change;
      dx[pair.second] -= x * change; dy[pair.second] -= y * change;
    }
    positions.forEach((point, index) => {
      point.x = Math.min(mapSize.width - 40, Math.max(40, point.x + dx[index] + (centerX - point.x) * .003));
      point.y = Math.min(mapSize.height - 35, Math.max(35, point.y + dy[index] + (centerY - point.y) * .003));
    });
  }
  return { positions, neighbors };
}
