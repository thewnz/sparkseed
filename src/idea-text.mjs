export const ideaStatuses = { idle: '已保存', queued: '排队中', running: '思考中', ready: '待回答', failed: '未完成' };
export const ideaDates = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function ideaTitle(idea) {
  return idea.analysis?.title || idea.body.split('\n')[0] || idea.paper || idea.excerpt.split('\n')[0]
    || idea.discussion.find(turn => turn.artifact)?.artifact.title || '未命名想法';
}

export function ideaPreview(idea) {
  if (idea.analysis?.abstract) return idea.analysis.abstract;
  const context = idea.discussion.findLast(turn => turn.answer?.note || turn.message);
  return idea.body.split('\n').slice(1).join(' ').trim() || context?.answer?.note || context?.message
    || (idea.body ? idea.excerpt || idea.paper : '');
}

// Accurate semantic state that distinguishes unanswered questions from answered turns.
export function ideaDisplayStatus(idea) {
  if (idea.status === 'running') return { key: 'running', label: '思考中' };
  if (idea.status === 'queued') return { key: 'queued', label: '排队中' };
  if (idea.status === 'failed') return { key: 'failed', label: '未完成' };
  const last = idea.discussion?.at(-1);
  if (last?.question && !last.answer) return { key: 'waiting', label: '待回答' };
  const turns = idea.discussion?.length || 0;
  if (turns > 0) return { key: 'progressed', label: `已推进 ${turns} 轮` };
  return { key: 'idle', label: '已记录' };
}

export function formatIdeaMarkdown(idea) {
  const lines = [`# ${ideaTitle(idea)}`, ''];
  if (idea.paper || idea.page) {
    lines.push(`> 来源：${[idea.paper, idea.page && `第 ${idea.page} 页`].filter(Boolean).join(' · ')}`);
  }
  if (idea.body) lines.push('', idea.body);
  if (idea.excerpt) lines.push('', `> 原文摘录：${idea.excerpt.replace(/\r?\n/g, '\n> ')}`);
  if (idea.analysis) {
    lines.push('', '## 研究提炼');
    if (idea.analysis.abstract || idea.analysis.hypothesis) {
      lines.push(idea.analysis.abstract || idea.analysis.hypothesis);
    }
    if (idea.analysis.confirmed?.length) {
      lines.push('', '### 已确认共识', ...idea.analysis.confirmed.map(item => `- ${item}`));
    }
    if (idea.analysis.open?.length) {
      lines.push('', '### 待查证问题', ...idea.analysis.open.map(item => `- ${item}`));
    }
    if (idea.analysis.next) lines.push('', `**下一步**：${idea.analysis.next}`);
  }
  if (idea.discussion?.length) {
    lines.push('', '## 讨论脉络');
    idea.discussion.forEach((turn, idx) => {
      if ('message' in turn) {
        lines.push('', `### 补充 (${idx + 1})`, turn.message || '');
      } else {
        lines.push('', `### 追问 (${idx + 1})：${turn.question}`);
        if (turn.answer) {
          const reply = turn.answer.skipped
            ? '（已跳过）'
            : [...(turn.answer.options || []), turn.answer.note].filter(Boolean).join('；');
          lines.push(`- **回应**：${reply}`);
        } else {
          lines.push('- *（待回答）*');
        }
      }
    });
  }
  return lines.join('\n').trim();
}

export function summarizeDiscussion(discussion) {
  const answered = [];
  const notes = [];
  let skipped = 0;
  let open = '';
  const cite = paper => paper ? '引用《' + paper.title + '》第 ' + paper.page + ' 页' : '';
  for (const turn of discussion) {
    if ('message' in turn) notes.push([turn.message, cite(turn.paper)].filter(Boolean).join('\n'));
    else if (turn.answer?.skipped) skipped++;
    else if (turn.answer) {
      answered.push({ question: turn.question, selections: turn.answer.options, note: [turn.answer.note, cite(turn.answer.paper)].filter(Boolean).join('\n') });
    } else if (turn.question) open = turn.question;
  }
  return { answered, notes, skipped, open };
}

export function draftDiscussionSkill(idea) {
  const { answered, notes } = summarizeDiscussion(idea.discussion);
  const points = answered.flatMap(item => {
    const evidence = [...item.selections, item.note].filter(Boolean).join('；');
    return evidence ? ['- ' + item.question + ' ' + evidence] : [];
  });
  return {
    name: ideaTitle(idea).slice(0, 60),
    description: '从已保存的讨论提炼，可补充适用范围。',
    origin: idea.id, enabled: false,
    text: ['## 适用条件', '复用前先确认本次任务的目标、数据与限制。',
      '## 已讨论的做法', ...points, ...notes.map(note => '- ' + note),
      '## 检查项', '- 区分这次的事实与历史案例，确认步骤仍适用。'].join('\n').slice(0, 12000),
  };
}
