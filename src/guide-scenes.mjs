const example = '这篇论文里的分层采样能用在小样本上吗？';
const excerpt = '在各层内分别随机抽样，再合并各层估计结果。';
const paper = '分层抽样与区间估计';
const keyword = '小样本 分层抽样';
const idea = '小样本分层采样';
const note = '待查：样本量对区间覆盖率的影响。';
const question = '小样本下，分层抽样会改变区间覆盖率吗？';
const claim = '分层抽样可能降低估计方差。';
const translationSource = 'Samples were drawn independently within each stratum.';
const translationText = '在每一层内独立抽取样本。';

const click = (target, caption) => ({ target, caption, kind: 'click' });
const type = (target, text, caption) => ({ target, text, caption, kind: 'type' });
const drag = (target, caption) => ({ target, caption, kind: 'drag' });
const wait = caption => ({ caption, kind: 'wait' });

export const guideScenes = {
  journey: [
    ['workspace', {}, click('快记', '点击左侧「快记」，或按默认快捷键 Ctrl + Shift + Space 随时记录。')],
    ['capture', {}, type('第一条消息', example, '直接在输入框记下眼前的研究问题。')],
    ['capture', { body: example }, click('保存并讨论', '保存这条记录，同时进入对话继续推进。')],
    ['discussion', {}, wait('已接入 Agent 时，它会提出聚焦问题；你可随时点击「暂停追问」或切到「仅记录」。')],
    ['discussion', {}, click('采样方法', '点选或按数字键 1–5 选择「采样方法」，把这轮对话聚焦到方法。')],
    ['discussion', { picked: true }, click('发送', '确认选项后点击发送。')],
    ['discussion', { sent: '采样方法' }, wait('回复保存在当前对话，随时可一键「复制纪要」或从左侧继续。')],
  ],
  capture: [
    ['workspace', {}, click('快记', '打开「快速记录」。这个例子假设你已复制论文中的一句原文。')],
    ['capture', {}, type('第一条消息', example, '先记一句自己的想法。')],
    ['capture', { body: example }, click('粘贴引文', '从剪贴板带入已复制的原文。')],
    ['capture', { body: example, excerpt }, click('论文位置', '展开论文名和页码。')],
    ['capture', { body: example, excerpt, sources: true }, type('论文名或链接', paper, '填写论文名，也可以填论文链接。')],
    ['capture', { body: example, excerpt, sources: true, paper }, type('页码', '3', '填入页码，方便回到原文。')],
    ['capture', { body: example, excerpt, sources: true, paper, page: '3' }, click('保存', '把想法、引文和出处一起保存。')],
    ['workspace', { saved: idea }, wait('保存后，这条想法可以从讨论记录或 Idea 库找回。')],
  ],
  voice: [
    ['capture', {}, click('说完即保存', '点麦克风按钮，启动 Windows 本地听写。')],
    ['capture', { voice: true }, wait('说出「分层采样能改善小样本估计吗？」。系统识别结束后自动保存。')],
    ['workspace', { saved: '分层采样能改善小样本估计吗？' }, wait('在左侧讨论记录中可以找到刚才说的话。')],
  ],
  discussion: [
    ['discussion', {}, click('采样方法', '点击一个选项。也可以多选，或展开「自己补充」。')],
    ['discussion', { picked: true }, click('朗读问题', '听当前问题和选项，适合暂时不想看屏幕时使用。')],
    ['discussion', { picked: true }, click('说完即发送', '点「说完即发送」，把口述内容和已选项一起发出。')],
    ['discussion', { picked: true, voice: true }, wait('正在听写，例如「先比较分层采样和随机采样」。')],
    ['discussion', { sent: 'A · 采样方法｜先比较分层采样和随机采样。' }, wait('回复已进入讨论，Agent 会在同一个上下文中继续追问。')],
  ],
  notes: [
    ['discussion', {}, click('记录本', '从讨论右上角打开记录本。')],
    ['notes', {}, click('并排', '将浮窗切成并排布局，边看讨论边记。')],
    ['notes', { split: true }, type('记录本正文', note, '在记录本正文输入要跟进的问题。')],
    ['notes', { split: true, note }, click('笔记库', '看到「已归档到笔记库」后即可在左侧打开笔记库。')],
    ['workspace', { notebook: true }, wait('从笔记库打开条目，还可以跳回来源讨论。')],
  ],
  research: [
    ['discussion', {}, click('研究工作', '在这条想法的讨论中打开「研究工作」。')],
    ['research', {}, click('查论文', '手动开始初查。开启自动初查时也可以直接查看已有结果。')],
    ['research', { running: '正在初查相似论文…' }, wait('初查根据当前想法检索相似工作。')],
    ['research', { initial: true }, click('开始深查', '先读完整的推荐问题，再点击这条问题启动深查。')],
    ['research', { running: '深查进行中 · 正在找支持证据和反例…' }, wait('深查完成后，证据卡会列出发现和来源。')],
    ['research', { findings: true }, click('展开论文对照', '点开对照表，横向核查不同论文的样本和方法。')],
    ['research', { findings: true, comparison: true }, wait('选中来源可回到论文核对，结果也会保留在研究任务里。')],
  ],
  merge: [
    ['research', {}, click('整理与关联', '从研究工作发起整理，寻找互补的已有想法。')],
    ['merge', {}, click('互补 · 用覆盖率评价区间估计', '展开关联条目读理由，必要时点「查看原 Idea」。')],
    ['merge', { open: true }, click('生成组合草稿', '确认两条想法可以接起来后，生成草稿。')],
    ['merge', { open: true, draft: '用区间覆盖率评价小样本分层采样。' }, click('保存为新 Idea', '检查或修改草稿，再保存成一条新 Idea。')],
    ['merge', { saved: true }, wait('新 Idea 保留了两条来源，可以回看各自的原记录。')],
  ],
  'search-import': [
    ['papers', {}, click('检索', '从论文库的「我的论文」切换到「检索」。')],
    ['papers', { search: true }, type('检索词', keyword, '输入论文主题，也可以输入题名或 DOI。')],
    ['papers', { search: true, query: keyword }, click('检索', '点击查询按钮，从选中的来源查找论文。')],
    ['papers', { search: true, query: keyword, results: true }, click('收录并阅读', '从结果中选一条带开放 PDF 的论文。')],
    ['reader', { page: 1 }, wait('收录成功后打开研读台，可以从目录或页码开始阅读。')],
  ],
  'reader-mark': [
    ['reader', {}, drag('论文选区', '按住鼠标从句首拖到句尾，再松开。')],
    ['reader', { selected: true }, click('高亮', '选区工具栏出现后点「高亮」，将这句话标记为一条批注。')],
    ['reader', { highlighted: true }, drag('论文选区', '高亮保存在当前页。再次划选需要引用的原文。')],
    ['reader', { highlighted: true, selected: true }, click('引用', '点选区工具栏的「引用」，把原文和页码带到讨论。')],
    ['capture', { excerpt, sources: true, paper, page: '3', discussion: true }, wait('在讨论输入区检查引用内容和出处，再补充自己的问题。')],
  ],
  'reader-translation': [
    ['translation', {}, click('双语对照', '在研读台上方选择「双语对照」。两侧随 PDF 页码切换，译文按自然段精排展示。')],
    ['translation', { view: 'parallel' }, click('翻译本页', '接入默认 Agent 后可翻译本页或全文。已有译文可直接查看。')],
    ['translation', { view: 'parallel', translated: true }, click('交换顺序', '按阅读习惯交换原文和译文的位置。')],
    ['translation', { view: 'parallel', translated: true, swapped: true }, click('译文', '选择「译文」可以专注阅读当前页译文。')],
    ['translation', { view: 'translated', translated: true }, wait('随时可以切回原文。原文中的批注和高亮会保留。')],
  ],
  'discussion-evidence': [
    ['evidence', {}, drag('讨论结论', '在已有讨论里划选要核对的句子。')],
    ['evidence', { selected: true }, click('证据台', '打开讨论工具栏里的「证据台」，将选中文字带入新建结论。')],
    ['evidence', { draft: true }, click('保存结论', '编辑文字后保存，也可直接手填一条结论。')],
    ['evidence', { saved: true }, click('添加论文证据', '从这条结论进入论文库，打开本地 PDF。')],
    ['reader', { binding: true }, drag('论文选区', '划选要关联的原文。')],
    ['reader', { binding: true, selected: true }, click('绑定证据', '在划选工具栏点「绑定证据」。')],
    ['evidence', { confirm: true }, click('支持', '核对论文、页码和引文，再选择支持、反例或待核实。')],
    ['evidence', { confirm: true, relation: '支持' }, click('保存证据', '保存后回到原讨论，还可以继续添加其他证据。')],
    ['evidence', { saved: true, linked: true }, click('查看原文', '从证据卡跳回 PDF 的对应页。')],
    ['reader', { highlighted: true, evidence: true }, wait('可定位时高亮原句。返回证据台可继续编辑关系或备注。')],
  ],
  'flow-review': [
    ['flow', {}, click('确认框架，开始逐块审核', '在项目栏下选择「流程图」，核对生成的阶段、分支和反馈，再确认框架。')],
    ['flow', { phase: 'review' }, click('生成本块', '从框架参考旁边开始绘制当前模块。')],
    ['flow', { phase: 'review', candidate: true }, click('通过，进入下一块', '对照框架核对待审核稿，必要时填写修改要求并重新生成。')],
    ['flow', { phase: 'layout' }, click('生成布局预览', '全部模块通过后，可用 Agent 生成布局预览，也可选择本地排版。')],
    ['flow', { phase: 'layout', preview: true }, click('验收并保存', '检查整图的文字、连线和布局，验收后创建作品版本。')],
    ['flow', { phase: 'saved' }, wait('打开「作品版本」预览或导出已保存的整图。')],
  ],
  memory: [
    ['memory', {}, click('采纳', '在「Agent 总结」检查建议，确认长期有效后再采纳。')],
    ['memory', { accepted: true }, click('查看来源讨论', '从已采纳条目跳回产生这条记忆的讨论。')],
    ['discussion', { sent: '以后优先核对论文正文里的适用条件。' }, wait('来源讨论仍保留原话，也可回 Memory 编辑或撤回保存的条目。')],
  ],
  'studio-insert': [
    ['studio', {}, click('新建项目', '在图文工作台建立一个项目。')],
    ['studio', { creating: true }, type('项目名称', '小样本研究汇报', '输入便于日后查找的项目名称。')],
    ['studio', { creating: true, name: '小样本研究汇报' }, click('创建项目', '进入新项目后选择作品类型。')],
    ['studio', { project: true }, click('演示文稿', '在项目栏下方的作品类型栏选择「演示文稿」。')],
    ['studio', { project: true, slides: true }, click('参考讨论', '展开来源下拉框，选择已有讨论作为材料。')],
    ['studio', { project: true, slides: true, menu: true }, click(idea, '选择「小样本分层采样」这条讨论。')],
    ['studio', { project: true, slides: true, linked: true }, click('生成演示文稿', '使用图文工作台配置的 Agent 或 API 生成演示文稿。')],
    ['studio', { preview: true }, click('插入讨论', '预览作品、确认插入位置，再点「插入讨论」。')],
    ['discussion', { attachment: true }, wait('作品已带入该讨论的输入区，可以和新的问题一起发送。')],
  ],
  agent: [
    ['workspace', {}, click('设置', '从左侧底部打开「偏好设置」。')],
    ['agent', {}, click('Agent 接入', '进入「Agent 接入」，找到已安装并登录的 Codex CLI。')],
    ['agent', { tab: true }, click('测试', '点「测试」，依次检查安装、登录和实际生成。')],
    ['agent', { tab: true, testing: true }, wait('诊断过程中可以看到检查状态。这里演示测试通过的情况。')],
    ['agent', { tab: true, tested: true }, click('设为默认', '连接通过后，可把 Codex CLI 设为新讨论的默认 Agent。')],
    ['agent', { tab: true, tested: true, primary: true }, click('模型', '卡片出现「默认」标记后，可以从同一卡片打开模型设置。')],
    ['agent', { model: true }, click('保存模型', '选择可用模型，或留空沿用 CLI 默认模型，然后点「保存模型」。')],
    ['agent', { tab: true, primary: true }, wait('回到 Agent 接入。新讨论会使用已设为默认的 Agent。')],
  ],
  skills: [
    ['skills', {}, type('技能检索方向', '文献综述', '在技能管理输入你想找的科研场景。')],
    ['skills', { query: '文献综述' }, click('AI 在 GitHub 检索技能', '使用已接入的 Agent 检索适合的 GitHub 技能。')],
    ['skills', { found: true }, click('导入', '核对仓库和 SKILL.md 路径后导入草稿。')],
    ['skills', { draft: true }, click('保存后启用', '检查 SKILL.md 内容，再勾选「保存后启用」。')],
    ['skills', { draft: true, enabled: true }, click('保存技能', '保存后，启用的技能可用于对应的科研请求。')],
    ['skills', { saved: true }, wait('已启用的技能会列在技能管理中，可随时调整。')],
  ],
  tray: [
    ['tasks', { tray: true }, click('打开 Sparkseed', '关窗后任务继续运行。从系统托盘重新打开 Sparkseed。')],
    ['workspace', {}, click('任务', '在左侧打开「任务」队列。')],
    ['tasks', {}, click('已完成', '切到「已完成」，查看后台跑完的任务。')],
    ['tasks', { complete: true }, click('查看结果', '从任务卡片回到原讨论中的查证结果。')],
    ['research', { findings: true }, wait('需要改变判断的重要证据会通知，其余结果可在这里回看。')],
  ],
  'figure-intake': [
    ['figure', { phase: 'start' }, click('数据图', '打开图文项目，在项目栏下方选择「数据图」。')],
    ['figure', { phase: 'editor' }, click('需求问答（选填）', '按需展开问答，材料已经明确时可直接出图。')],
    ['figure', { phase: 'purpose' }, click('随时间或步骤变化的趋势', '先选择想让读者看懂什么。')],
    ['figure', { phase: 'purpose', picked: true }, click('继续', '确认选择，进入下一问。')],
    ['figure', { phase: 'source' }, click('跳过此问', '暂时没有材料也可以跳过。后续问题同样可以跳过。')],
    ['figure', { phase: 'audience' }, wait('进入下一问，已跳过的问题保存在进度里。')],
  ],
  'figure-output': [
    ['figure', { phase: 'editor' }, click('载入示例', '也可以粘贴自己的表格或导入文件。')],
    ['figure', { phase: 'editor', sample: true }, click('仅本地绘制', '直接按原表出图，无需接入模型。')],
    ['figure', { phase: 'preview', local: true }, wait('查看原表与版面检查，或返回材料修改后重新绘制。')],
    ['figure', { phase: 'editor', sample: true }, click('绘制方式', '展开绘制选项，按需调整绘制方式。')],
    ['figure', { phase: 'editor', sample: true, agent: true }, click('生成图稿', '所选 Agent 会使用绘图需求与已启用的技能。')],
    ['figure', { phase: 'preview' }, type('修改要求', '补全纵轴的单位', '对照原表检查图例、数值和坐标。')],
    ['figure', { phase: 'preview', revision: '补全纵轴的单位' }, click('发送并修改', '修改结果另存为新版本。')],
    ['figure', { phase: 'preview', revised: true }, click('导出', '选择最新版本并导出 SVG、PDF、PNG 或项目 JSON。')],
    ['figure', { phase: 'preview', revised: true }, wait('历史版本仍可切回查看。')],
  ],
  'figure-concept': [
    ['figure', { phase: 'editor' }, click('概念示意', '用概念示意表现流程、结构或机制。')],
    ['figure', { phase: 'concept' }, type('画面内容与关系', '从采样、质检到汇总，按顺序排列三个步骤。', '明确实体、关系和必须保留的标签。')],
    ['figure', { phase: 'concept', description: true }, click('输出方式', '按需要选择可编辑 SVG 或图片服务。位图生成需要可用的图像连接。')],
    ['figure', { phase: 'concept', description: true }, click('发送并生成草案', '用已配置的绘图模型生成。')],
    ['figure', { phase: 'concept-preview' }, wait('核对流程和标签后，可导出或继续修改。')],
  ],
  'api-preset': [
    ['api', {}, click('DeepSeek', '在「Agent 接入 → 兼容 API」选择预设。')],
    ['api', { phase: 'form' }, type('API Key', '••••••••', '接口和模型已预填。输入自己的 Key，这里仅演示遮罩。')],
    ['api', { phase: 'form', filled: true }, click('保存连接', '将连接配置保存到本机。')],
    ['api', { phase: 'saved' }, click('测试', '检查请求能否正常生成并取消。')],
    ['api', { phase: 'ready' }, click('设为默认', '确认可用后，可设为新讨论的默认 Agent。')],
    ['api', { phase: 'default' }, wait('已配置的连接可以随时编辑或切换模型。')],
  ],
  automation: [
    ['automation', {}, click('只记录', '先登记待处理的任务。')],
    ['automation', { ticket: true }, click('批准执行', '核对论文和任务后，再批准这次执行。')],
    ['automation', { finished: true }, wait('结果可回到对应论文查看，任务票据保留执行状态。')],
  ],
  'figure-skills': [
    ['figureSkills', {}, click('编辑', '在「偏好设置 → 图文技能」打开默认启用的 FigGenie。')],
    ['figureSkills', { editing: true }, wait('检查选图、构图、标签和回读规则。可调整内容或停用技能。')],
  ],
  citations: [
    ['citations', {}, click('梳理', '在论文详情打开「引文脉络」。')],
    ['citations', { loaded: true }, click('被引文献', '切换到引用了当前论文的工作。')],
    ['citations', { loaded: true, cited: true }, click('收录', '把相关论文留在自己的论文库。')],
    ['citations', { loaded: true, cited: true, saved: true }, wait('条目已收录，可以继续阅读或横向对比。')],
  ],
  'paper-compare': [
    ['compare', {}, click('分层随机抽样', '在论文库「对比」页勾选同主题论文。')],
    ['compare', { first: true }, click('简单随机抽样', '再选一篇，共可对比 2–4 篇。')],
    ['compare', { first: true, second: true }, click('生成对比', '用 Agent 提取研究问题、方法、结论等维度。')],
    ['compare', { result: true }, wait('对比会保存到本机，可以回到各论文核对。')],
  ],
};

export const guideExamples = { example, excerpt, idea, paper, question, claim, translationSource, translationText };

