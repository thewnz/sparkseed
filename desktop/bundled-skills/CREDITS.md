# 内置科研绘图技能来源

| 技能 | 来源 | 许可证 | 使用方式 |
| --- | --- | --- | --- |
| FigGenie · 顶会论文图 | `desktop/bundled-skills/figgenie-paper-diagram/SKILL.md`（上游 FigGenie-Skill，作者 Sleepy Avacado） | MIT | 摘取版式、留白、线宽、字号与反模式规则 |
| schematic-figure · 机制示意 | https://github.com/lgwrightlab/schematic-figure | MIT（字体为 GUST Font License，随原仓库附带） | 摘取机制优先、视图选择、线宽统一与最终尺寸复核 |
| framework-figure-studio-pro · 框架图契约 | https://github.com/c-narcissus/paper-framework-figure-studio-pro | MIT-0 | 摘取语义图、渲染规则、可见文字白名单与负约束 |
| K-Dense · 科研示意插画 | https://github.com/K-Dense-AI/scientific-agent-skills | MIT | 摘取位图插画提示词与检查清单，不调用其外部服务 |

以上规则以中文精简后写入 `desktop/figure-skills.mjs`，按图片类型注入提示词；未复制原仓库代码或素材。
