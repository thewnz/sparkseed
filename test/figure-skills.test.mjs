import assert from 'node:assert/strict';
import { test } from 'node:test';
import { figureSkillPacks, figureSkillsFor, figureSkillTexts } from '../desktop/figure-skills.mjs';

test('技能包按图片类型注入', () => {
  assert.deepEqual(figureSkillsFor('flow').map(pack => pack.id), ['figgenie', 'framework']);
  assert.deepEqual(figureSkillsFor('concept').map(pack => pack.id), ['schematic', 'figgenie']);
  assert.deepEqual(figureSkillsFor('illustration').map(pack => pack.id), ['k-dense-schematics', 'schematic']);
  assert.deepEqual(figureSkillsFor('data'), []);
  assert.deepEqual(figureSkillsFor('unknown'), []);
});

test('技能包携带来源与许可证，且长度受控', () => {
  for (const pack of figureSkillPacks) {
    assert.ok(pack.source.startsWith('https://') || pack.source.startsWith('desktop/'));
    assert.ok(pack.license);
    assert.ok(pack.text.length > 80 && pack.text.length <= 1200, pack.id + ' 长度 ' + pack.text.length);
  }
  const total = figureSkillTexts('concept').reduce((sum, item) => sum + item.text.length, 0);
  assert.ok(total <= 3000);
});
