// 四个科研绘图技能的精简规则，按图片类型注入提示词。完整原文与许可见 bundled-skills/CREDITS.md。

export const figureSkillPacks = [
  {
    id: 'figgenie',
    name: 'FigGenie · 顶会论文图',
    source: 'desktop/bundled-skills/figgenie-paper-diagram/SKILL.md',
    license: 'MIT (Sleepy Avacado)',
    text: '顶会论文图的硬规则：一张图只讲一个结论；单一阅读方向（上→下或左→右）；阶段等宽对齐，同类节点统一尺寸；' +
      '线宽 1–1.5px（按最终尺寸），箭头统一终点；正文字号不小于画布宽度的 1/80；标签放在负空间，禁止压线；' +
      '颜色只表达语义，语义色不超过 6 种并配合文字或形状区分；白底，留白不少于 30%；禁止渐变、阴影、3D、圆角卡片堆叠和装饰性图标；' +
      '先定语义结构（阶段、节点、关系）再上视觉；导出前按最终宽度核对字号、线宽与标签可读性。',
  },
  {
    id: 'schematic',
    name: 'schematic-figure · 机制示意',
    source: 'https://github.com/lgwrightlab/schematic-figure',
    license: 'MIT',
    text: '先讲清机制：列出实体、状态、转变、输入输出与作用关系，再选视图（剖面、流程、对比或状态机）；' +
      '同类元素复用同一形状、线宽和填充规则；分组用浅底或留白，不用粗边框；文字放在图形外的负空间；' +
      '默认平面 2D，只有需要空间关系时才用等距 3D；按目标宽度（单栏 89mm、双栏 183mm）反推最小字号与线宽；' +
      '交付前检查裁切、遮挡和缩略图可读性。',
  },
  {
    id: 'framework',
    name: 'framework-figure-studio-pro · 框架图契约',
    source: 'https://github.com/c-narcissus/paper-framework-figure-studio-pro',
    license: 'MIT-0',
    text: '把图当契约来写：① 语义图：节点、边、端口、方向、分组逐项列出；② 渲染规则：布局分栏、对齐方式、视觉层级；' +
      '③ 可见文字白名单：只允许清单内的标签出现在图内；④ 变量承载：哪些放线上、图例或 caption；' +
      '⑤ 负约束：不得增删事实、不得臆造数值、不得出现未列出的模块。先生成并自审语义图，再渲染；' +
      '渲染后逐项核对白名单与连线方向。',
  },
  {
    id: 'k-dense-schematics',
    name: 'K-Dense · 科研示意插画',
    source: 'https://github.com/K-Dense-AI/scientific-agent-skills',
    license: 'MIT',
    text: '位图插画提示词按六段组织：主体与动作、构图与视角、风格与材质、光线、配色、负面约束。' +
      '图内不要承载关键文字；同一项目保持色板与风格一致。生成后检查主体完整性、边缘裁切、文字乱码与空白比例；' +
      '不达标时只调整提示词，不改科学事实。',
  },
];

const byType = {
  flow: ['figgenie', 'framework'],
  concept: ['schematic', 'figgenie'],
  illustration: ['k-dense-schematics', 'schematic'],
  data: [],
};

export function figureSkillsFor(pictureType) {
  return (byType[pictureType] || []).map(id => figureSkillPacks.find(pack => pack.id === id)).filter(Boolean);
}

export function figureSkillTexts(pictureType) {
  return figureSkillsFor(pictureType).map(pack => ({ name: pack.name, text: pack.text }));
}
