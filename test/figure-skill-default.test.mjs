import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { openStore } from '../desktop/store.mjs';
import { listSkills, saveSkill, seedDefaultFigureSkill, skillFromMarkdown } from '../desktop/skills.mjs';
import { studioSkillTextLimit } from '../desktop/skill-limits.mjs';

const markdown = readFileSync(new URL('../desktop/bundled-skills/figgenie-paper-diagram/SKILL.md', import.meta.url), 'utf8');

test('默认绘图技能种子：启用、studio scope、带来源署名', () => {
  const store = openStore(':memory:');
  try {
    const item = seedDefaultFigureSkill(store, markdown);
    assert.ok(item, '首次应写入默认技能');
    assert.equal(item.enabled, true);
    assert.equal(item.scope, 'studio');
    assert.match(item.source, /github\.com\/Sleepy-Avacado\/FigGenie-paper-diagram-skill/);
    assert.ok(item.text.length > 10000, '应保留原文主体');
    const skills = listSkills(store);
    assert.equal(skills.filter(s => s.scope === 'studio' && s.enabled).length, 1);
  } finally { store.close(); }
});

test('默认绘图技能只种子一次：重复调用不重复写入', () => {
  const store = openStore(':memory:');
  try {
    seedDefaultFigureSkill(store, markdown);
    const again = seedDefaultFigureSkill(store, markdown);
    assert.equal(again, null);
    assert.equal(listSkills(store).length, 1);
  } finally { store.close(); }
});

test('用户删除默认技能后不再自动恢复', () => {
  const store = openStore(':memory:');
  try {
    const item = seedDefaultFigureSkill(store, markdown);
    store.set('skills', listSkills(store).filter(s => s.id !== item.id));
    const again = seedDefaultFigureSkill(store, markdown);
    assert.equal(again, null);
    assert.equal(listSkills(store).length, 0);
  } finally { store.close(); }
});

test('studio 技能上限容纳 FigGenie 原文且启用总量受控', () => {
  const store = openStore(':memory:');
  try {
    assert.ok(markdown.length <= studioSkillTextLimit, '原文应不超过 studio 上限');
    const [saved] = saveSkill(store, { name: 'FigGenie 全文', description: '测试', text: markdown, enabled: true, scope: 'studio' });
    assert.equal(saved.text.length, markdown.trim().length);
    assert.throws(() => saveSkill(store, { name: '超限', description: '', text: 'x'.repeat(studioSkillTextLimit + 1), enabled: true, scope: 'studio' }), /长度/);
  } finally { store.close(); }
});

test('skillFromMarkdown 以 studio 上限解析 FigGenie 名称', () => {
  const parsed = skillFromMarkdown(markdown, 'fallback', studioSkillTextLimit);
  assert.equal(parsed.name, 'figgenie-paper-diagram');
  assert.equal(parsed.text.length, markdown.trim().length);
});