import { useState } from 'react';
import { Icon } from './icons.jsx';
import { GuideDemo } from './guide-demo.jsx';
import './user-guide.css';

const topics = [
  {
    id: 'start', title: '快速上手', icon: 'guide',
    steps: [
      { title: '从半句话开始研究', scene: 'journey', action: ['capture', '打开快速记录'],
        body: '随时按 Ctrl+Shift+Space 打开快速记录，或用 Ctrl+K 呼出双栏预览指令面板跳转任意想法、文献、笔记与命令。' },
      { title: '按需接入模型与引擎', scene: 'agent', action: ['agents', '前往 Agent 接入'],
        body: '记录、阅读、批注与本地数据绘图均可离线使用。需要追问、译文或查证时，在「偏好设置 → Agent 接入」测试连接并设为默认。' },
    ],
  },
  {
    id: 'capture', title: '记录与语音', icon: 'capture',
    steps: [
      { title: '随手记下想法和出处', scene: 'capture', action: ['capture', '打开快速记录'],
        body: '默认按 Ctrl+Shift+Space 唤起快速记录，不打断当前页面进度。支持一句话记录、粘贴剪贴板引文及标注论文页码。' },
      { title: '说完即保存', scene: 'voice', action: ['capture', '打开快速记录'],
        body: '点击「说完即保存」或按 Ctrl+Shift+Alt+Space 直接启动本地听写并自动归档；想先校对文字可选「听写到草稿」。' },
    ],
  },
  {
    id: 'discussion', title: '对话、节奏与笔记', icon: 'socratic',
    steps: [
      { title: '自主掌控追问节奏与可行性提醒', scene: 'discussion', action: ['new', '新建对话'],
        body: '对话内置可行性直觉核查：若想法违背常识或缺乏实现可能，Agent 会减少防御性套话并直接提醒关键硬伤；每轮支持数字键 1–5 快捷勾选，也可随时「暂停追问」或切到「仅记录」模式。' },
      { title: '记录本与专注笔记库', scene: 'notes', action: ['notes', '打开笔记库'],
        body: '对话右侧「记录本」自动归档至「笔记库」并保留来源链接；笔记库支持「专注写作」居中模式、排序切换及 4 套学术模板（文献精读 / 实验记录 / 组会提纲 / 审稿回复）。' },
    ],
  },
  {
    id: 'research', title: '查证与关联', icon: 'history',
    steps: [
      { title: 'SuperAgent 后台任务与分步查证', scene: 'research', action: ['tasks', '查看后台任务'],
        body: '在对话右侧打开「查证」发起初查，或前往「任务」队列通过 Router / Explorer / Verifier / Watchdog 四角色状态条筛选追踪文献初查、深查与跨轮整理，点击推荐问题即可启动深查。' },
      { title: '灵感库评估与关联星图', scene: 'merge', action: ['library', '打开灵感库'],
        body: '在「灵感库」按可用度、重要性和研究价值评估想法，支持画廊、清单与可按分值过滤的「关联星图」；档案页可直接回看完整讨论脉络。' },
    ],
  },
  {
    id: 'search', title: '文献检索与对比', icon: 'search',
    steps: [
      { title: '多源检索与自动查重', scene: 'search-import', action: ['papers', '打开文献库'],
        body: '在「文献 → 多源检索」聚合检索公开学术库，自动标记「已在库中」的论文，支持年份过滤与近期检索词；详情栏支持一键复制 BibTeX 与标准引文。' },
      { title: '沿引文脉络追踪', scene: 'citations', action: ['papers', '打开文献库'],
        body: '在论文详情的「引文脉络」标签页查看参考文献与被引列表，发现关键前置或后续工作时可一键收入本地馆藏。' },
      { title: '跨篇对比并存入笔记', scene: 'paper-compare', action: ['papers', '打开文献库'],
        body: '在「文献 → 跨篇对比」勾选 2–4 篇论文生成对照矩阵，支持复制 Markdown 表格或一键「存入笔记库」长期留存。' },
    ],
  },
  {
    id: 'reader', title: '文献研读与译文', icon: 'book',
    steps: [
      { title: '三栏沉浸研读与可固定侧栏', scene: 'reader-mark', action: ['papers', '打开文献库'],
        body: '顶栏集成「未读 / 在读 / 已读」状态切换、收藏星标、阅读进度条与「适宽」缩放；左侧导航支持「目录 / 标注索引 / 全文搜索」三签切换并可用图钉固定在左侧不遮挡正文，底部悬浮胶囊支持快速翻页与一键加书签（快捷键 ←/→ 翻页、Ctrl+F 搜索）。' },
      { title: '段落级双语对照与本页白话笔记', scene: 'reader-translation', action: ['papers', '打开文献库'],
        body: '顶部一键切换「原文 / 双语对照 / 译文」，译文按自然段拆分为结构化卡片（¶1、¶2…），支持单段复制或存入论文笔记、A-/A+ 调节字号与随时点击「停止」；右侧研读台支持拖拽调宽，5C 速读与「本页白话」均可一键存入整篇论文笔记。' },
    ],
  },
  {
    id: 'evidence', title: '证据核验台', icon: 'shield',
    steps: [
      { title: '划词建结论并绑定 PDF 原文', scene: 'discussion-evidence', action: ['library', '打开灵感库'],
        body: '在对话中划选任意句子即可通过浮动工具条一键「送入证据台」；为每条结论绑定多段本地 PDF 原文并标记支持/反例/待核实，支持核验覆盖率统计与导出 Markdown 证据表。' },
    ],
  },
  {
    id: 'memory', title: '研究记忆', icon: 'memory',
    steps: [
      { title: '可追溯、可撤回的长期上下文', scene: 'memory', action: ['memory', '管理研究记忆'],
        body: '在「偏好设置 → 研究记忆库」维护长期方向卡（Memory）与行为准则（Soul）；AI 推断的建议需你手动采纳，所有条目均可回溯来源对话或撤回。' },
    ],
  },
  {
    id: 'studio', title: '科研制图工作台', icon: 'layers',
    steps: [
      { title: 'SuperAgent 四角色协同与视觉闭环精修', scene: 'figure-intake', action: ['studio', '打开科研制图'],
        body: '顶部单行指令栏直接切换 5 类作品；编辑器上方内置「Router · 规划 → Researcher · 核验 → Drawer · 出图 → Vision Critic」四角色协同面板与「视觉精修」开关。接入视觉模型时会自动渲染 PNG 交由 Vision Critic 评分审稿并回传自动精修（最多 2 轮），可在「质检与依据」查看执行轨迹。' },
      { title: '数据图：交互表格、期刊预设与复制 SVG', scene: 'figure-output', action: ['studio', '打开科研制图'],
        body: '支持「表格 / CSV」双模式编辑（增删行列、一键转置）与实时预览，内置 Nature 单栏 / Science 双栏 / IEEE 黑白 / 宽幅演示预设；右侧画布支持缩放、网格/白底/深色底色切换及一键「复制 SVG」。' },
      { title: '流程图：三步页签与快捷风格', scene: 'flow-review', action: ['studio', '打开科研制图'],
        body: '流程图升级为「1. 框架与风格 | 2. 逐块素材 | 3. 整图排版」三步页签，内置顶刊白底细线、双栏紧凑、汇报高对比一键风格预设，随时可点击「停止」中止生成。' },
      { title: '概念图：一键构图模板与画布检查器', scene: 'figure-concept', action: ['studio', '打开科研制图'],
        body: '概念示意内置「方法总览 + 详图」「双路线对比」「系统数据流」起稿模板；右侧画布内置「画布预览 | 质检与依据 | 版本迭代」三栏页签，无需下拉翻找。' },
      { title: '作品插回对话与版本管理', scene: 'studio-insert', action: ['studio', '打开科研制图'],
        body: '同一项目统一管理科研图、配图与 PPTX 历史版本，修订不会覆盖旧版，确认后可一键插入新建或已有对话继续讨论。' },
    ],
  },
  {
    id: 'agent', title: 'Agent、技能与自动化', icon: 'agent',
    steps: [
      { title: '连接本机 CLI 或兼容 API', scene: 'agent', action: ['agents', '前往 Agent 接入'],
        body: '支持复用本机已登录的 Codex / Claude Code / Kimi Code，也可在兼容 API 预设中填入 Key 一键接入并测试连接。' },
      { title: 'API 预设与模型切换', scene: 'api-preset', action: ['agents', '前往 Agent 接入'],
        body: '选择服务商预设后自动填入官方地址与推荐模型，密钥由系统加密存储在本地，随时可刷新模型列表或切换默认引擎。' },
      { title: '科研技能与制图技能', scene: 'skills', action: ['skills', '打开技能管理'],
        body: '在「偏好设置 → 科研技能 / 制图技能」检索 GitHub 或导入本地 SKILL.md，审阅内容后按需启用或停用。' },
      { title: '内置绘图规范（FigGenie）', scene: 'figure-skills', action: ['studio-skills', '打开制图技能'],
        body: '默认启用期刊视觉规范，可在「制图技能」查看或调整选图、构图、字体和版面复核约束。' },
      { title: '可控的后台自动化', scene: 'automation', action: ['automation', '打开自动化规则'],
        body: '支持关闭、仅记录待批准、或按规则自动运行，所有后台任务与失败重试均在「任务」队列透明可查。' },
      { title: '托盘驻留与结果回看', scene: 'tray', action: ['tasks', '查看后台任务'],
        body: '关闭主窗口后退驻系统托盘继续执行未完成任务；普通结果留在任务队列，仅重要证据触发桌面提醒。' },
    ],
  },
];

const guideGroups = [
  { label: '核心工作流', ids: ['start', 'capture', 'discussion'] },
  { label: '文献、证据与记忆', ids: ['search', 'reader', 'evidence', 'research', 'memory'] },
  { label: '科研制图与设置', ids: ['studio', 'agent'] },
];
const orderedTopics = guideGroups.flatMap(group => group.ids.map(id => topics.find(topic => topic.id === id)));

const researchJourney = [
  ['compose', '记录想法', '快记、语音与引文', 'capture'],
  ['socratic', '可控对话', '追问、暂停与纪要', 'discussion'],
  ['book', '研读文献', '对照阅读与 5C 速读', 'reader-translation'],
  ['shield', '核验证据', '划词绑定 PDF 原文', 'discussion-evidence'],
  ['flow', '科研制图', '三步流程图与矢量导出', 'flow-review'],
];

const shortcutsList = [
  { keys: 'Ctrl + K', desc: '打开双栏预览全局检索与命令面板（Tab 切换范围）' },
  { keys: 'Ctrl + N', desc: '新建研究对话' },
  { keys: 'Ctrl + /', desc: '展开或收起对话记录侧栏' },
  { keys: 'Ctrl + Shift + Space', desc: '全局唤起快速记录窗（保留当前页面）' },
  { keys: 'Ctrl + Enter', desc: '发送当前回复或保存记录' },
  { keys: '1 – 5', desc: '在待回答追问中快速勾选对应选项' },
];

const productFeatures = [
  { icon: 'socratic', title: '可控节奏的研究对话', target: 'new', action: '新建对话',
    body: '从半句话或论文引文出发，通过结构化追问推进思考，随时可暂停追问切入「仅记录」模式。',
    points: ['支持「暂停追问」与「自动追问 / 仅记录」自由切换，不再被连环提问打断', '支持数字键 1–5 选答、划词浮动送入证据台与一键复制 Markdown 纪要', '右侧协同集成「查证」「证据台」「记录本」，讨论与求证同屏完成'],
    proof: '输入：想法、引文或语音 · 产出：可追溯讨论纪要与归档笔记' },
  { icon: 'book', title: '多源检索、引文与研读台', target: 'papers', action: '打开文献库',
    body: '聚合公开学术源检索与本地 PDF 馆藏，在同一工作台完成查重、对照翻译、批注与跨篇对比。',
    points: ['多源检索自动识别「已在库中」，支持年份筛选与近期检索词', '详情栏一键复制 BibTeX 与标准引文；跨篇对比一键「存入笔记库」', 'PDF 研读台支持拖拽分栏、5C 速读同步笔记与批注导出 Markdown'],
    proof: '输入：关键词、DOI 或本地 PDF · 产出：题录、BibTeX、批注与对比矩阵' },
  { icon: 'shield', title: '证据核验台与灵感库', target: 'library', action: '打开灵感库',
    body: '把讨论里的每个判断锚定到 PDF 原文，并在灵感库中按三维评分筛选与星图探索。',
    points: ['划选对话句子即可送入证据台，统计支持/反例/待核实覆盖率并导出证据表', '灵感库支持画廊、清单与按分值过滤的关联星图，档案页内置讨论回看'],
    proof: '输入：待证结论与本地 PDF · 产出：可定位、可导出的证据链' },
  { icon: 'document', title: '笔记库与研究记忆', target: 'notes', action: '打开笔记库',
    body: '讨论记录本自动归档，独立手稿支持专注写作与学术模板；长期研究方向沉淀在 Memory。',
    points: ['笔记库内置「专注写作」模式、4 套结构化模板与多维度排序', '长期研究背景（Memory）与行为准则（Soul）均需人工确认，随时可撤回'],
    proof: '输入：阅读摘要与阶段结论 · 产出：结构化研究笔记与长期上下文' },
  { icon: 'layers', title: '新版科研制图工作台', target: 'studio', action: '打开科研制图',
    body: '单行指令栏直切 5 类作品，覆盖数据图、三步审核流程图、概念示意图、自由配图与 PPTX。',
    points: ['数据图支持一键「转置行列」、快捷期刊配色/幅宽与「复制 SVG 源码」', '流程图采用「框架与风格 / 逐块素材 / 整图排版」三步页签与风格预设', '右侧画布内置网格/白底/深色底板及「画布预览 / 质检与依据 / 版本迭代」检查器'],
    proof: '输入：CSV/TSV、流程描述或讨论上下文 · 产出：SVG/PDF/PNG/D2/PPTX' },
  { icon: 'agent', title: '本地优先与灵活接入', target: 'agents', action: '配置 Agent',
    body: 'SQLite 本地存储与加密密钥管理，核心记录与本地绘图可离线使用，按需接入任意主流模型。',
    points: ['支持本机 CLI 与兼容 API 预设，可独立指定对话与制图模型', '技能（SKILL.md）与后台自动化规则完全透明，随时可停止、重试或关闭'],
    proof: '输入：CLI 账号、API Key 或 SKILL.md · 产出：可控的本地研究环境' },
];

function ProductIntro({ onNavigate }) {
  const go = target => onNavigate?.(target);
  const [scene, setScene] = useState(researchJourney[0][3]);
  return <section className="guide-product" aria-labelledby="guide-product-title">
    <div className="guide-product-lead">
      <div className="guide-product-heading">
        <p className="guide-product-eyebrow">LOCAL-FIRST RESEARCH WORKBENCH</p>
        <h2 id="guide-product-title">Sparkseed <span>火种</span></h2>
        <p className="guide-product-intro">围绕真实研究闭环构建的本地桌面工作台：从捕捉半句话出发，在可控节奏的对话中推进思考，用 PDF 原文锚定每一条结论，最终输出可编辑的科研图稿与汇报文稿。</p>
        <div className="guide-product-hero-actions">
          {onNavigate && <><button type="button" className="primary icon-label" onClick={() => go('new')}>
            <Icon name="compose" />新建对话</button>
          <button type="button" className="quiet icon-label" onClick={() => go('papers')}>
            <Icon name="book" />打开文献库</button>
          <button type="button" className="quiet icon-label" onClick={() => go('studio')}>
            <Icon name="layers" />打开科研制图</button></>}
        </div>
        <ul className="guide-product-facts" aria-label="核心特性">
          <li>Ctrl+K 双栏全局检索</li><li>可控对话节奏与证据台</li><li>可编辑 SVG 与三步流程图</li>
        </ul>
      </div>
      <div className="guide-product-emblem" aria-hidden="true">
        <img src={import.meta.env.BASE_URL + 'brand-mark.png'} alt="" />
        <span>从问题出发<br />回到证据</span>
      </div>
    </div>

    <section className="guide-product-block" aria-labelledby="guide-shortcuts-title">
      <div className="guide-product-block-heading">
        <div><p>高效操控</p><h3 id="guide-shortcuts-title">常用快捷键速查</h3></div>
        <span>全键盘驱动，减少鼠标往返</span>
      </div>
      <div className="guide-shortcuts-grid">
        {shortcutsList.map(item => <div key={item.keys} className="guide-shortcut-item">
          <kbd>{item.keys}</kbd>
          <span>{item.desc}</span>
        </div>)}
      </div>
    </section>

    <section className="guide-product-block" aria-labelledby="guide-journey-title">
      <div className="guide-product-block-heading"><h3 id="guide-journey-title">交互式流程预览</h3>
        <span>点击任意阶段查看对应操作</span></div>
      <ol className="guide-product-journey" aria-label="研究流程">
        {researchJourney.map(([icon, title, detail, id]) => <li key={id}>
          <button type="button" className="quiet" aria-pressed={scene === id} aria-controls="guide-intro-demo" onClick={() => setScene(id)}>
            <span className="guide-journey-icon"><Icon name={icon} /></span>
            <span><strong>{title}</strong><small>{detail}</small></span>
          </button>
        </li>)}
      </ol>
      <div className="guide-stage guide-intro-stage" id="guide-intro-demo">
        <GuideDemo key={scene} id={scene} autoPlay={false} />
      </div>
    </section>

    <section className="guide-product-block" aria-labelledby="guide-features-title">
      <div className="guide-product-block-heading"><div><p>模块全景</p><h3 id="guide-features-title">六大核心能力</h3></div>
        <span>每张卡片均可一键直达对应模块</span></div>
      <div className="guide-feature-grid">
        {productFeatures.map(feature => <article className="guide-feature-card" key={feature.title}>
          <header><span><Icon name={feature.icon} /></span></header>
          <h4>{feature.title}</h4><p>{feature.body}</p>
          <ul>{feature.points.map(point => <li key={point}>{point}</li>)}</ul>
          <small className="guide-feature-proof">{feature.proof}</small>
          {onNavigate && <button type="button" className="quiet icon-label" onClick={() => go(feature.target)}>{feature.action}<Icon name="forward" /></button>}
        </article>)}
      </div>
    </section>

    <section className="guide-product-block guide-product-drawing" aria-labelledby="guide-drawing-title">
      <div className="guide-product-block-heading"><div><p>科研制图规范</p><h3 id="guide-drawing-title">先确定科学结构，再输出出版级矢量图</h3></div>
        {onNavigate && <button type="button" className="quiet icon-label" onClick={() => go('studio')}><Icon name="layers" />进入科研制图</button>}</div>
      <div className="guide-drawing-layout">
        <ol className="guide-drawing-steps">
          <li><span>1</span><div><strong>框架与风格</strong><p>输入流程描述并选用「顶刊白底细线 / 双栏紧凑 / 汇报高对比」预设，先确认阶段拓扑与连线。</p></div></li>
          <li><span>2</span><div><strong>逐块审核素材</strong><p>按块生成 Agent 矢量图或截取论文原图，通过几何与原文依据核验后再进入下一块。</p></div></li>
          <li><span>3</span><div><strong>整图排版与检查</strong><p>支持本地排版或 Agent 自动布局，在右侧画布切换底色并使用「质检与依据」逐项核对。</p></div></li>
          <li><span>4</span><div><strong>多格式导出与迭代</strong><p>支持导出 SVG / PDF / PNG / D2 / ZIP / PPTX 或一键复制 SVG 源码，迭代修改均保留历史版本。</p></div></li>
        </ol>
        <div className="guide-drawing-standard"><h4>内置顶刊视觉约束基准</h4>
          <div className="guide-benchmark-strip" aria-label="100 张开放论文方法图基准">
            <div><strong>100</strong><span>开放方法图</span></div>
            <div><strong>77</strong><span>方法/架构图</span></div>
            <div><strong>11</strong><span>学科领域</span></div>
            <div><strong>1.23</strong><span>宽高比中位</span></div>
            <div><strong>72.8%</strong><span>近白留白</span></div>
          </div>
          <ul>
            <li>白底为主，最多三种低饱和阶段色，拒绝渐变卡片与装饰虚线</li>
            <li>0.8–1.2px 细线与小箭头、0–2px 小圆角，自动检测文字截断与节点重叠</li>
            <li>小写 (a)(b)(c) 面板标记与统一阶段标题层级，保留人工复核入口</li>
          </ul>
        </div>
      </div>
    </section>
  </section>;
}

export function UserGuide({ onNavigate }) {
  const [view, setView] = useState('guide');
  const [topicId, setTopicId] = useState(orderedTopics[0].id);
  const [index, setIndex] = useState(0);
  const [replay, setReplay] = useState(0);
  const topic = orderedTopics.find(item => item.id === topicId) || orderedTopics[0];
  const step = topic.steps[Math.min(index, topic.steps.length - 1)];
  const position = orderedTopics.indexOf(topic);
  const pages = orderedTopics.reduce((total, item) => total + item.steps.length, 0);
  const page = orderedTopics.slice(0, position).reduce((total, item) => total + item.steps.length, 0) + index + 1;

  function choose(id) { setTopicId(id); setIndex(0); }
  function back() {
    if (index > 0) { setIndex(index - 1); return; }
    if (position > 0) { setTopicId(orderedTopics[position - 1].id); setIndex(orderedTopics[position - 1].steps.length - 1); }
  }
  function next() {
    if (index < topic.steps.length - 1) { setIndex(index + 1); return; }
    if (position < orderedTopics.length - 1) { setTopicId(orderedTopics[position + 1].id); setIndex(0); }
  }

  return <section className="user-guide guide-page" aria-label="使用指南" onKeyDown={event => {
    if (view !== 'guide' || event.defaultPrevented || event.target.closest('.guide-sections') ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); back(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
  }}>
    <header className="guide-page-head academic-command-bar">
      <div className="page-heading">
        <div>
          <h1>使用指南</h1>
          <p>新版工作台操作演示、快捷键速查与科研制图规范</p>
        </div>
      </div>
      <nav className="guide-sections library-views segmented-pills" aria-label="指南视图">
        <button type="button" className="quiet" aria-pressed={view === 'guide'} onClick={() => setView('guide')}>分步演示</button>
        <button type="button" className="quiet" aria-pressed={view === 'product'} onClick={() => setView('product')}>功能与快捷键</button>
      </nav>
    </header>
    {view === 'product' ? <ProductIntro onNavigate={onNavigate} /> : <div className="guide-layout">
      <nav className="guide-topics" aria-label="指南目录">
        {guideGroups.map(group => <div className="guide-topic-group" key={group.label} role="group" aria-label={group.label}>
          <span>{group.label}</span>
          {orderedTopics.filter(item => group.ids.includes(item.id)).map(item => <button key={item.id} type="button" className="quiet icon-label"
            aria-current={item.id === topic.id ? 'page' : undefined} onClick={() => choose(item.id)}>
            <Icon name={item.icon} />{item.title}</button>)}
        </div>)}
      </nav>
      <div className="guide-view">
        {topic.steps.length > 1 && <nav className="guide-lessons" aria-label={topic.title + '的演示'}>
          {topic.steps.map((lesson, lessonIndex) => <button key={lesson.scene} type="button" className="quiet"
            aria-current={index === lessonIndex ? 'step' : undefined} onClick={() => setIndex(lessonIndex)}>{lesson.title}</button>)}
        </nav>}
        <div className="guide-copy" key={page} aria-live="polite">
          <p className="muted">{topic.title}{topic.steps.length > 1 && ' · ' + (index + 1) + '/' + topic.steps.length}</p>
          <h2>{step.title}</h2>
          <p>{step.body}</p>
        </div>
        <div className="guide-stage">
          <GuideDemo key={page + ':' + replay} id={step.scene} />
        </div>
        <div className="guide-actions-row">
          <button type="button" className="quiet icon-label" onClick={() => setReplay(value => value + 1)}>
            <Icon name="refresh" />重播演示
          </button>
          {onNavigate && <button type="button" className="primary icon-label" onClick={() => onNavigate(step.action[0])}>
            {step.action[1]}<Icon name="forward" />
          </button>}
        </div>
        <div className="guide-footer">
          <button type="button" className="quiet" onClick={back} disabled={page <= 1}>上一步</button>
          <span className="guide-progress" aria-label={`第 ${page} 步，共 ${pages} 步`}>{page} / {pages}</span>
          {page < pages ? <button type="button" className="quiet" onClick={next}>下一步</button>
            : <button type="button" className="quiet" onClick={() => choose(orderedTopics[0].id)}>回到快速上手</button>}
        </div>
      </div>
    </div>}
  </section>;
}
