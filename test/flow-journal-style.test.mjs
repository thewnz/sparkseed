import assert from 'node:assert/strict';
import test from 'node:test';
import { flowDrawingRules } from '../desktop/flow-design.mjs';
import { flowStyleDirectives } from '../desktop/flow-style-brief.mjs';
import { assemblyInstructions, blockInstructions } from '../desktop/flow-assembly.mjs';
import { journalDensityTargets, journalFigureStyle, journalFigureRules, journalStagePalette, panelLetter } from '../desktop/flow-journal-style.mjs';

test('顶会/顶刊视觉契约进入绘图规则和风格指令', () => {
  assert.match(flowDrawingRules, /白底/);
  assert.match(flowDrawingRules, /小写 \(a\)/);
  assert.match(flowDrawingRules, /彩色圆角卡片/);
  assert.match(flowStyleDirectives({}), /低饱和阶段色/);
  assert.match(flowStyleDirectives({ palette: 3 }), /数据语义色/);
  assert.match(flowStyleDirectives({}), /蓝 #2f5f8f/);
  assert.match(flowStyleDirectives({}), /白底/);
  assert.ok(journalStagePalette.length <= journalFigureStyle.maxHues);
  assert.ok(journalFigureStyle.radius <= 2);
  assert.ok(journalDensityTargets.nearWhite[0] >= 0.6);
  assert.equal(panelLetter(0), '(a)');
  assert.equal(panelLetter(25), '(z)');
  assert.equal(panelLetter(26), '(aa)');
  assert.ok(journalFigureRules.includes('不要用圆形编号'));
});

test('逐块与整图提示不再要求磨砂卡片、粗箭头、渐变和装饰性总览', () => {
  assert.match(blockInstructions, /功能小框圆角 0–2px/);
  assert.match(blockInstructions, /主箭头 1\.1–1\.3px/);
  assert.match(blockInstructions, /按科学含义选择图元/);
  assert.match(blockInstructions, /空骨架必须补全/);
  assert.doesNotMatch(blockInstructions, /磨砂色块|rx 8|加粗 2\.5px|图元覆盖画布 ≥85%|<linearGradient>/);
  assert.match(assemblyInstructions, /小写 \(a\)\(b\)\(c\)/);
  assert.match(assemblyInstructions, /不使用顶部缩略总览条、扇形放大线或彩色虚线底板/);
});

test('密度选项遵循基准留白，不再以铺满画布为目标', () => {
  assert.match(flowStyleDirectives({ density: 0 }), /近白区域约 62%–76%/);
  assert.match(flowStyleDirectives({}), /近白区域约 65%–80%/);
  assert.match(flowStyleDirectives({ density: 2 }), /近白区域约 75%–88%/);
  assert.doesNotMatch(flowStyleDirectives({ density: 0 }), /图元覆盖画布 ≥85%/);
  assert.match(flowStyleDirectives({ density: 0 }), /空骨架/);
});
