import { createHash } from 'node:crypto';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const compact = value => String(value ?? '').trim();
const escapeMarkdown = value => compact(value).replace(/([\\`*_{}\[\]<>#+!|])/g, '\\$1');
const citeId = paper => paper.arxiv ? 'arxiv:' + paper.arxiv.toLowerCase() : paper.pmcid || paper.doi?.toLowerCase() || paper.id;
const bibText = value => compact(value).replace(/\s+/g, ' ').replace(/[\\{}%&$#_^~]/g, character => ({
  '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
}[character] || '\\' + character));

function location(card) {
  if (card.section) return card.section;
  return card.page == null ? '摘要' : '第 ' + card.page + ' 页';
}

export function makeMemo(idea, jobs) {
  const title = idea.analysis?.title || compact(idea.body).split(/\r?\n/)[0].slice(0, 90) || idea.paper || '研究备忘录';
  const lines = ['# ' + escapeMarkdown(title), '', '## 原始 Idea', '', escapeMarkdown(idea.body) || '仅记录了论文线索。'];
  if (idea.paper) lines.push('', '来源论文：' + escapeMarkdown(idea.paper) + (idea.page ? '，第 ' + escapeMarkdown(idea.page) + ' 页' : ''));
  if (idea.excerpt) lines.push('', ...escapeMarkdown(idea.excerpt).split(/\r?\n/).map(line => '> ' + line));

  const results = jobs.filter(job => job.progress.result && ['ready', 'waiting'].includes(job.status));
  const summary = results.find(job => job.kind === 'synthesis')?.progress.result.summary;
  lines.push('', '## 讨论摘要', '');
  if (summary) {
    if (idea.analysis?.abstract) lines.push(escapeMarkdown(idea.analysis.abstract), '');
    for (const [label, items] of [['假设', [summary.hypothesis]], ['已确认', summary.confirmed], ['待解决', summary.open], ['下一步', [summary.next]]]) {
      for (const item of items.filter(Boolean)) lines.push('- ' + label + '：' + escapeMarkdown(item));
    }
  } else {
    lines.push('尚未生成 AI 讨论摘要。');
  }

  const reports = new Map();
  for (const job of results.filter(job => job.kind !== 'synthesis')) {
    const report = job.progress.result;
    const hypothesis = report.hypothesis || job.input?.question || (job.kind === 'deep' ? '文献深查' : '文献初查');
    if (!reports.has(hypothesis)) reports.set(hypothesis, report);
  }
  const refs = new Map();
  function reference(paper) {
    const id = citeId(paper);
    if (!refs.has(id)) refs.set(id, { paper, key: 'sparkseed' + createHash('sha256').update(id).digest('hex').slice(0, 12) });
    return refs.get(id).key;
  }
  lines.push('', '## 假设与关键证据');
  if (!reports.size) lines.push('', '尚无已完成的文献查证。');
  for (const [hypothesis, report] of reports) {
    lines.push('', '### ' + escapeMarkdown(hypothesis), '', escapeMarkdown(report.assessment));
    const papers = new Map(report.papers.map(paper => [paper.id, paper]));
    for (const card of report.cards) {
      const paper = papers.get(card.id);
      if (!paper) continue;
      lines.push('', '- **' + escapeMarkdown(card.kind) + '** · ' + escapeMarkdown(paper.title) + ' · ' + escapeMarkdown(location(card)) + ' [@' + reference(paper) + ']');
      if (card.finding) lines.push('  - 能说明：' + escapeMarkdown(card.finding));
      if (card.cannot) lines.push('  - 不能说明：' + escapeMarkdown(card.cannot));
      if (card.condition) lines.push('  - 适用条件：' + escapeMarkdown(card.condition));
      lines.push('  > ' + escapeMarkdown(card.quote));
    }
    for (const unknown of report.unknowns || []) lines.push('- 证据不足：' + escapeMarkdown(unknown));
    if (report.revision) lines.push('', '#### 修改建议', '', escapeMarkdown(report.revision));
  }

  lines.push('', '## 参考文献', '');
  for (const { paper, key } of refs.values()) {
    const url = /^(https?):\/\/[^\s<>]+$/i.test(paper.url || '') ? ' · <' + paper.url + '>' : '';
    lines.push('- ' + key + ' · ' + escapeMarkdown([paper.title, paper.year, paper.version].filter(Boolean).join(' · ')) + url);
  }
  if (!refs.size) lines.push('尚无参考文献。');
  const bibtex = [...refs.values()].map(({ paper, key }) => {
    const type = paper.type === 'journal-article' ? 'article' : paper.type === 'proceedings-article' ? 'inproceedings' : 'misc';
    const doi = paper.doi || (/^10\.\d{4,9}\/\S+$/.test(paper.id) ? paper.id : '');
    const fields = { title: paper.title, author: paper.authors?.map(bibText).join(' and '), year: paper.year,
      ...(type === 'article' ? { journal: paper.venue } : type === 'inproceedings' ? { booktitle: paper.venue } : { howpublished: paper.venue }),
      doi, url: paper.url, eprint: paper.arxiv || paper.pmcid, archivePrefix: paper.arxiv ? 'arXiv' : paper.pmcid && 'PMC', note: paper.version };
    const body = Object.entries(fields).filter(([, value]) => value).map(([name, value]) =>
      '  ' + name + ' = {' + (name === 'author' ? value : bibText(value)) + '}').join(',\n');
    return '@' + type + '{' + key + ',\n' + body + '\n}';
  }).join('\n\n');
  return { markdown: lines.join('\n') + '\n', bibtex: bibtex ? bibtex + '\n' : '% 暂无参考文献\n' };
}

export async function exportMemo(parent, idea, jobs) {
  const { markdown, bibtex } = makeMemo(idea, jobs);
  const directory = await mkdtemp(join(parent, 'Sparkseed-'));
  const files = { markdown: join(directory, '研究备忘录.md'), bibtex: join(directory, '参考文献.bib') };
  const written = await Promise.allSettled([writeFile(files.markdown, markdown, { flag: 'wx' }),
    writeFile(files.bibtex, bibtex, { flag: 'wx' })]);
  const failure = written.find(result => result.status === 'rejected');
  if (failure) {
    await Promise.allSettled(Object.values(files).map(file => unlink(file)));
    await rmdir(directory).catch(() => {});
    throw failure.reason;
  }
  return files;
}
