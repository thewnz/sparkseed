import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { guideExamples, guideScenes } from './guide-scenes.mjs';
import './guide-demo.css';

const { example, excerpt, idea, paper, question, claim, translationSource, translationText } = guideExamples;
const screens = {
  workspace: ['guide', 'Sparkseed'], capture: ['capture', '快速记录'], discussion: ['socratic', '对话'],
  notes: ['document', '记录本'], research: ['search', '查证'], merge: ['constellation', '整理与关联'],
  papers: ['book', '文献库'], reader: ['book', '研读台'], memory: ['memory', '研究记忆'],
  studio: ['layers', '科研制图'], agent: ['agent', '偏好设置'], skills: ['skill', '科研技能'], tasks: ['queue', '后台任务'],
  figure: ['layers', '科研制图'], api: ['agent', 'Agent 接入'], automation: ['bolt', '自动化规则'],
  figureSkills: ['skill', '制图技能'], citations: ['connection', '论文详情'], compare: ['split', '跨篇对比'],
  evidence: ['shield', '证据核验台'], translation: ['book', '研读台'], flow: ['flow', '科研制图'],
};
const studioTypes = [['chart', '数据图'], ['flow', '流程图'], ['constellation', '概念示意'], ['media', '自由配图'], ['document', '演示文稿']];
const navigation = [['socratic', '对话'], ['constellation', '灵感库'], ['book', '文献'], ['document', '笔记'],
  ['queue', '任务'], ['layers', '制图'], ['bolt', '快记'], ['preferences', '设置']];

function DemoScreen({ name, state: s, action, typed }) {
  const target = label => action.target === label ? 'true' : undefined;
  const control = (label, icon, variant) => <span key={label} className="demo-control" data-target={target(label)} data-variant={variant}>
    {icon && <Icon name={icon} />}{variant !== 'icon' && label}</span>;
  const field = (label, value, placeholder) => <div className="demo-field" data-target={target(label)}>
    <small>{label}</small><p>{action.kind === 'type' && action.target === label
      ? <>{typed}<i className="demo-caret" /></>
      : value || (placeholder && <span className="demo-placeholder">{placeholder}</span>)}</p></div>;
  const status = (title, detail, icon = 'check') => <div className="demo-result"><Icon name={icon} />
    <div><strong>{title}</strong>{detail && <p>{detail}</p>}</div></div>;
  const bar = (...controls) => <div className="demo-toolbar">{controls}</div>;
  const tabs = (...controls) => <div className="demo-tabs">{controls}</div>;
  const nav = labels => <aside className="demo-nav">{labels.map(([icon, label]) => control(label, icon))}</aside>;
  const studioTabs = selected => tabs(...studioTypes.map(([icon, label]) =>
    control(label, icon, selected === label ? 'selected' : undefined)));
  const discussion = <>
    <div className="demo-row"><strong>{idea}</strong>{bar(control('研究工作', 'search'), control('记录本', 'document'))}</div>
    <div className="demo-message demo-user">{example}</div>
    {!s.sent && <div className="demo-message"><strong>你想先比较哪个环节？</strong>
      {bar(control('采样方法', s.picked ? 'check' : null, s.picked ? 'selected' : undefined),
        control('评估指标'), control('自己补充'), control('朗读问题'))}</div>}
    {s.sent && <div className="demo-message demo-user">{s.sent}</div>}
    {s.voice && status('正在听写，识别结束后发送…', '先比较分层采样和随机采样。', 'microphone')}
    {s.attachment && status('小样本研究汇报 · PPT', '讨论附件', 'document')}
    <div className="demo-compose">{s.picked && <small>已选 1 项</small>}
      {bar(control('跳过'), control('说完即发送', 'microphone'), control('发送', 'send', 'icon'))}</div>
  </>;

  switch (name) {
    case 'workspace':
      return <div className="demo-workspace">{nav(navigation)}
        <div className="demo-stack">{s.notebook ? <>
          <strong>笔记库</strong>{status('待查：样本量对区间覆盖率的影响。', idea + ' · 讨论记录本', 'document')}
        </> : <><strong>{s.saved ? '讨论记录' : '新讨论'}</strong>
          {s.saved ? status(s.saved, '刚刚 · 已保存', 'discussion') : field('第一条消息', '', '说说你的想法，半句话也可以…')}</>}
        </div></div>;
    case 'capture':
      return <>
        {field('第一条消息', s.body, '说说你的想法，半句话也可以…')}
        {s.sources && <div className="demo-split demo-source-fields">
          {field('论文名或链接', s.paper, '选填')}{field('页码', s.page, '选填')}
        </div>}
        {s.excerpt && <blockquote className="demo-quote">{s.excerpt}</blockquote>}
        {s.voice && status('正在听写，识别结束后自动保存…', '分层采样能改善小样本估计吗？', 'microphone')}
        {bar(control(s.excerpt ? '替换引文' : '粘贴引文', 'excerpt'), control(s.paper ? '编辑位置' : '论文位置', 'location'),
          control('引用论文', 'book'), control('听写到草稿', 'microphone'))}
        {s.discussion ? bar(control('发送', 'send', 'icon')) : bar(control(s.voice ? '取消语音保存' : '说完即保存', 'microphone'),
          control('保存', null, 'primary'), control('保存并讨论', 'forward'))}
      </>;
    case 'discussion':
      return discussion;
    case 'notes':
      return <div className="demo-workspace">{nav([['document', '笔记库']])}
        <div className="demo-notes" data-split={s.split}>
          <div className="demo-message"><strong>{idea}</strong><p>{example}</p></div>
          <div className="demo-panel demo-note">
            <div className="demo-row"><strong>记录本</strong>{bar(control(s.split ? '悬浮' : '并排'), control('关闭'))}</div>
            {bar(control('B'), control('I'), control('U'), control('字体'), control('字号'))}
            {field('记录本正文', s.note, '写下要跟进的问题')}
            {s.note && <small className="demo-saved"><Icon name="check" /> 已归档到笔记库</small>}
          </div>
        </div></div>;
    case 'research':
      return <>
        {tabs(control('查论文', 'search'), control('查证假设'), control('整理与关联', 'stars'))}
        {s.running && status(s.running, '', 'history')}
        {s.initial && <div className="demo-panel"><small>推荐查证问题</small>
          <div className="demo-option" data-target={target('开始深查')}><span>{question}</span><small>开始深查 →</small></div>
        </div>}
        {s.findings && <>
          {status('证据卡 · 适用条件', '各层需要有足够观测值。· 论文 A，第 3 页', 'book')}
          {bar(control(s.comparison ? '收起论文对照' : '展开论文对照'))}
          {s.comparison && <table className="demo-table"><thead><tr><th>来源</th><th>样本与方法</th></tr></thead>
            <tbody><tr><td>论文 A · 第 3 页</td><td>分层随机抽样</td></tr><tr><td>论文 B · 第 5 页</td><td>简单随机抽样</td></tr></tbody></table>}
        </>}
      </>;
    case 'merge':
      return s.saved ? status('用区间覆盖率评价小样本分层采样', '来源：小样本分层采样、用覆盖率评价区间估计', 'library') : <>
        <div className="demo-option" data-target={target('互补 · 用覆盖率评价区间估计')}>
          <span>{s.open ? '▾' : '▸'} 互补 · 用覆盖率评价区间估计</span></div>
        {s.open && <><p>当前 Idea 提供采样方法，关联 Idea 提供评估指标。</p>
          {bar(control('查看原 Idea'), control('确认关系'), control('忽略'))}
          {s.draft ? <>{field('组合草稿', s.draft)}{bar(control('保存为新 Idea', 'compose', 'primary'))}</>
            : bar(control('生成组合草稿', 'compose'))}</>}
      </>;
    case 'papers':
      return <>
        {tabs(control('我的论文', null, s.search ? undefined : 'selected'), s.search ? <strong key="search">检索</strong> : control('检索'), control('对比'))}
        {s.search ? <>
          <div className="demo-input-row">{field('检索词', s.query, '输入主题、题名或 DOI')}{control('检索', 'search', 'primary')}</div>
          {bar(control('arXiv', 'check', 'selected'), control('Crossref', 'check', 'selected'), control('OpenAlex', 'check', 'selected'))}
          {s.results && <div className="demo-row"><div><strong>{paper}</strong><p>arXiv · 开放获取 · 演示样例</p></div>
            {control('收录并阅读', 'import', 'primary')}</div>}
        </> : status('我的论文', '可以导入本地 PDF，或切换到检索。', 'book')}
      </>;
    case 'reader':
      return <>
        <div className="demo-row"><strong>{paper}</strong><small>第 {s.page || 3} 页</small></div>
        <div className="demo-reader"><aside>目录<br />研究方法<br />实验设置</aside>
          <div className="demo-sheet"><strong>研究方法</strong><p><span className="demo-paper-selection" data-selected={s.selected} data-highlighted={s.highlighted}
            data-target={target('论文选区')}>{excerpt}</span></p><p>两组方案都使用相同的评估指标。</p></div></div>
        {s.selected && <div className="demo-selection">
          {bar(control('高亮'), control('下划线'), control('批注'), control('翻译'),
            s.binding ? control('绑定证据', 'plus') : control('引用'))}</div>}
        {s.highlighted && (s.evidence ? bar(control('返回证据台', 'back')) : <small>批注 1 · 第 3 页</small>)}
      </>;
    case 'translation': {
      const view = s.view || 'original';
      const original = <div className="demo-panel demo-translation-page" key="source"><strong>原文 · 第 3 页</strong><p lang="en">{translationSource}</p></div>;
      const translated = <div className="demo-panel demo-translation-page" key="translation"><strong>本页译文 · 第 3 页</strong>
        {bar(control('翻译本页', null, 'primary'), control('翻译全文'))}
        {s.translated ? <p>{translationText}</p> : <p>当前页还没有译文。</p>}</div>;
      return <>
        <div className="demo-row"><strong>{paper}</strong><small>PDF 第 3 页</small></div>
        {tabs(control('原文', null, view === 'original' ? 'selected' : undefined),
          control('双语对照', null, view === 'parallel' ? 'selected' : undefined),
          control('译文', null, view === 'translated' ? 'selected' : undefined),
          ...(view === 'parallel' ? [control('上下排列'), control('交换顺序')] : []))}
        <div className={view === 'parallel' ? 'demo-adaptive-panes' : 'demo-stack'}>
          {view === 'original' ? original : view === 'translated' ? translated : s.swapped ? [translated, original] : [original, translated]}
        </div>
      </>;
    }
    case 'evidence':
      if (s.confirm) return <div className="demo-panel">
        <strong>绑定到「{claim}」</strong><small>{paper} · PDF 第 3 页</small>
        <blockquote className="demo-quote">{excerpt}</blockquote>
        <small>证据关系 · {s.relation || '待核实'}</small>
        {bar(...['支持', '反例', '待核实'].map(label =>
          control(label, null, label === (s.relation || '待核实') ? 'selected' : undefined)))}
        {field('备注（选填）', '', '记录适用条件')}
        {bar(control('取消'), control('保存证据', null, 'primary'))}
      </div>;
      return <>
        <div className="demo-row"><strong>{idea}</strong>{bar(control('研究工作'), control('记录本'), control('证据台', 'book'))}</div>
        <div className="demo-message demo-user"><span className="demo-paper-selection" data-selected={s.selected}
          data-target={target('讨论结论')}>{claim}</span></div>
        {(s.draft || s.saved) && <div className="demo-panel"><strong>证据台</strong>
          {s.draft ? <>{field('新建结论', claim)}{bar(control('保存结论', null, 'primary'))}</>
            : <><strong>{claim}</strong>{bar(control('添加论文证据', 'plus'))}
              {s.linked && <div className="demo-panel"><small>支持 · {paper} · PDF 第 3 页</small>
                <blockquote className="demo-quote">{excerpt}</blockquote>{bar(control('查看原文', 'forward'))}</div>}</>}
        </div>}
      </>;
    case 'flow':
      return <>
        <div className="demo-row"><strong>项目 · 小样本研究</strong><small>草稿已保存</small></div>
        {studioTabs('流程图')}
        {tabs(...['确认框架', '审核素材', '排版保存'].map((step, i) =>
          control(step, null, i === (!s.phase ? 0 : s.phase === 'review' ? 1 : 2) ? 'selected' : undefined)))}
        {s.phase === 'review' ? <>
          <div className="demo-adaptive-panes">
            <div className="demo-panel"><strong>框架参考</strong><p>收集样本 → 分层抽样 → 汇总估计</p></div>
            <div className="demo-panel"><strong>{s.candidate ? '待审核图稿' : '当前模块'}</strong><p>第 1 块 · 收集样本</p>
              {s.candidate && field('修改要求', '', '描述需要修订的部分')}</div>
          </div>
          {bar(s.candidate ? control('通过，进入下一块', 'check', 'primary') : control('生成本块', 'stars', 'primary'))}
        </> : <div className="demo-panel">
          <strong>{s.phase === 'saved' ? '整图已保存' : s.phase === 'layout' ? '整图布局' : '研究流程与框架'}</strong>
          {s.phase === 'layout' && !s.preview ? <p>3 块素材已审核</p>
            : bar(control('收集样本'), control('分层抽样', 'forward'), control('汇总估计', 'forward'))}
          {bar(!s.phase ? control('确认框架，开始逐块审核', 'check', 'primary')
            : s.phase === 'saved' ? control('作品版本 · 1', 'history')
            : s.preview ? control('验收并保存', 'check', 'primary')
            : control('生成布局预览', 'stars', 'primary'), ...(s.phase === 'layout' && !s.preview ? [control('本地排版')] : []))}
        </div>}
      </>;
    case 'memory':
      return <>
        {tabs(control('Soul'), control('Memory', null, 'selected'))}
        <div className="demo-panel"><strong>Agent 总结</strong><p>以后优先核对论文正文里的适用条件。</p>
          {s.accepted ? <>{status('已采纳到研究记忆')}{bar(control('查看来源讨论', 'discussion'))}</>
            : bar(control('采纳', 'check', 'primary'), control('忽略'), control('查看来源讨论'))}</div>
      </>;
    case 'studio':
      if (s.creating) return <div className="demo-panel"><strong>新建项目</strong>
        {field('项目名称', s.name, '例如：课题组阶段汇报')}{bar(control('取消'), control('创建项目', null, 'primary'))}</div>;
      if (s.preview) return <>
        <div className="demo-slide"><small>第 1 页 / 3</small><strong>小样本研究汇报</strong><p>研究问题 · 抽样方法 · 评估计划</p></div>
        <div className="demo-row"><small>插入位置 · {idea}</small>{bar(control('导出 PPTX'), control('插入讨论', 'discussion'))}</div>
      </>;
      if (!s.project) return <div className="demo-row"><strong>项目</strong>{control('新建项目', 'plus', 'primary')}</div>;
      return <>
        <div className="demo-row"><strong>项目 · 小样本研究汇报</strong><small>草稿已保存</small></div>
        {studioTabs(s.slides ? '演示文稿' : '数据图')}
        <div className="demo-option" data-target={target('参考讨论')}><span>参考讨论</span>
          <span>{s.linked ? idea : '仅使用生成要求'} ▾</span></div>
        {s.menu && <div className="demo-menu"><small>仅使用生成要求</small>{control(idea, 'discussion')}</div>}
        {bar(control('生成演示文稿', 'stars', 'primary'))}
      </>;
    case 'figure': {
      const briefOptions = {
        purpose: ['这张图最想让读者看懂什么？', '随时间或步骤变化的趋势', '方法或实验组之间的差异'],
        source: ['你打算用什么材料来出图？', '粘贴自己的材料', '导入本地文件'],
        audience: ['这张图准备在哪里使用？', '论文或投稿', '组会或答辩'],
      };
      if (s.phase === 'start') return <><div className="demo-row"><strong>项目 · 小样本研究</strong>
        {control('新建项目', 'plus')}</div>{studioTabs()}</>;
      if (Object.hasOwn(briefOptions, s.phase)) {
        const [question, ...options] = briefOptions[s.phase];
        return <div className="demo-panel"><strong>确认绘图需求</strong>
          {s.phase === 'audience' && <small>已完成 2 问 · 材料已跳过</small>}
          <strong>{question}</strong>{bar(...options.map((option, i) =>
            control(option, s.picked && i === 0 ? 'check' : null, s.picked && i === 0 ? 'selected' : undefined)))}
          {bar(control('自己补充'), control('跳过此问'), control('继续', 'forward', 'primary'))}
        </div>;
      }
      if (s.phase === 'editor') return <div className="demo-panel">
        {studioTabs('数据图')}{field('绘制方式', s.agent ? '用 Agent 定制' : '按表格绘图（可选模型建议）')}
        {bar(control('需求问答（选填）'))}
        {field('数据表', s.sample ? '轮次,准确率 · 1,78 · 2,85 · 3,90' : '', '粘贴 CSV / TSV')}
        {bar(control('载入示例'), control('导入文件', 'import'), s.agent ?
          control('生成图稿', 'stars', 'primary') : control('仅本地绘制', 'stars', 'primary'))}
      </div>;
      if (s.phase === 'concept') return <div className="demo-panel">
        {studioTabs('概念示意')}{field('输出方式', '可编辑 SVG')}
        {field('画面内容与关系', s.description ? '从采样、质检到汇总，按顺序排列三个步骤。' : '', '写下实体和连接方向')}
        {bar(control('发送并生成草案', 'stars', 'primary'))}
      </div>;
      if (s.phase === 'concept-preview') return <div className="demo-panel"><strong>概念示意预览</strong>
        {bar(control('采样'), control('质检', 'forward'), control('汇总', 'forward'))}</div>;
      return <><div className="demo-panel">
        <div className="demo-row"><strong>科研图预览</strong><small>历史版本 · 版本 {s.revised ? 2 : 1}</small></div>
        <b className="demo-chart-label">{s.revised ? '准确率（%）' : '准确率'}</b>
        <div className="demo-figure-chart" role="img" aria-label="三轮准确率分别为 78%、85%、90%">
          {[78, 85, 90].map((value, index) => <span key={value}><i />第 {index + 1} 轮</span>)}
        </div>{bar(control('导出', 'import'))}
      </div>
      {!s.revised && !s.local && <div className="demo-panel">{field('修改要求', s.revision, '描述需要调整的内容')}
        {bar(control('发送并修改', 'stars', 'primary'))}</div>}</>;
    }
    case 'api':
      return <div className="demo-panel"><strong>兼容 API</strong>
        {tabs(control('OpenAI'), control('DeepSeek', null, s.phase ? 'selected' : undefined), control('自定义兼容 API'))}
        {s.phase === 'form' && <>{field('API 地址', 'https://api.deepseek.com/v1')}{field('模型', '预设模型')}
          {field('API Key', s.filled ? '••••••••' : '', '按服务要求填写')}
          {bar(control('保存连接', null, 'primary'))}</>}
        {['saved', 'ready', 'default'].includes(s.phase) && <div className="demo-row">
          <div><strong>DeepSeek</strong><p>{s.phase === 'saved' ? '已配置 · 待测试' : s.phase === 'default' ? '默认 · 连接可用' : '连接可用'}</p></div>
          {bar(control('测试'), control(s.phase === 'default' ? '编辑' : '设为默认'))}
        </div>}
      </div>;
    case 'automation':
      return <><strong>运行方式</strong>
        {tabs(control('关闭'), control('只记录', null, s.ticket || s.finished ? 'selected' : undefined), control('自动执行'))}
        <div className="demo-panel"><strong>任务票据</strong>{s.ticket || s.finished ? <>
          {status('生成论文白话摘要', s.finished ? '已结束 · 结果保存在论文中' : '等待你确认', 'book')}
          {s.ticket && bar(control('批准执行', 'check', 'primary'), control('忽略'))}
        </> : <p>符合规则的论文任务会登记在这里。</p>}</div></>;
    case 'figureSkills':
      return <div className="demo-panel"><strong>{s.editing ? '编辑技能' : 'FigGenie · 论文插图（默认）'}</strong>
        {s.editing ? <>{field('SKILL.md', '根据研究目标选图，检查构图、标签和可读性。')}
          {bar(control('保存技能', null, 'primary'))}</> : bar(control('已启用', 'check', 'selected'), control('编辑'))}
      </div>;
    case 'citations':
      return <div className="demo-panel"><div className="demo-row"><strong>引文脉络</strong>{!s.loaded && control('梳理', 'connection')}</div>
        {s.loaded && <>{tabs(control('参考文献', null, s.cited ? undefined : 'selected'), control('被引文献', null, s.cited ? 'selected' : undefined))}
          <div className="demo-row"><strong>{s.cited ? '小样本下的覆盖率评估' : '分层随机抽样方法'}</strong>
            {control(s.saved ? '已收录' : '收录', s.saved ? 'check' : 'import')}</div></>}
      </div>;
    case 'compare':
      return s.result ? <table className="demo-table"><thead><tr><th>维度</th><th>分层抽样</th><th>简单抽样</th></tr></thead>
        <tbody><tr><th>方法</th><td>按层抽取</td><td>统一抽取</td></tr><tr><th>数据</th><td>分组样本</td><td>总体样本</td></tr></tbody></table>
        : <div className="demo-panel"><strong>选择对比论文</strong>
          {bar(control('分层随机抽样', s.first ? 'check' : null, s.first ? 'selected' : undefined),
            control('简单随机抽样', s.second ? 'check' : null, s.second ? 'selected' : undefined))}
          {s.second && bar(control('生成对比', 'stars', 'primary'))}
        </div>;
    case 'agent':
      return <>
        {tabs(control('Agent 接入', 'agent', s.tab ? 'selected' : undefined), control('外观'), control('通用'))}
        {s.model ? <div className="demo-panel"><strong>Codex CLI 模型</strong>
          {field('模型名或别名', '', '留空使用 CLI 默认模型')}{bar(control('取消'), control('保存模型', null, 'primary'))}</div>
          : s.tab ? <div className="demo-panel"><div className="demo-row"><strong>Codex CLI</strong>
          {s.primary && <small className="demo-saved">默认</small>}</div>
          <p>{s.testing ? '测试中…' : s.tested ? '连接可用' : '已安装 · 待测试'}</p>
          {(s.testing || s.tested) && <div className="demo-diagnostics">{['安装', '登录', '实际生成', '取消请求'].map((label, index) =>
            <span key={label}>{label}<small>{s.testing && index > 1 ? '检测中…' : '通过'}</small></span>)}</div>}
          {bar(control('模型'), control(s.testing ? '停止测试' : '测试'), ...(!s.primary ? [control('设为默认', null, 'primary')] : []))}
        </div> : field('偏好设置', '从顶部进入 Agent 接入')}
      </>;
    case 'skills':
      return <>
        {tabs(control('科研讨论', null, 'selected'), control('图文生成'))}
        {s.saved ? status('文献综述', '已启用 · 科研讨论', 'skill') : s.draft ? <div className="demo-panel">
          {field('SKILL.md', '总结研究问题、纳入条件和关键证据，并列出来源。')}
          {bar(control('保存后启用', s.enabled ? 'check' : null, s.enabled ? 'selected' : undefined), control('保存技能', null, 'primary'))}
        </div> : <>
          <div className="demo-input-row">{field('技能检索方向', s.query, '例如：文献综述或论文查证')}
            {control('AI 在 GitHub 检索技能', 'search', 'primary')}</div>
          {s.found && <div className="demo-row"><div><strong>文献综述</strong><p>GitHub · SKILL.md · 演示样例</p></div>{control('导入', 'import')}</div>}
        </>}
      </>;
    case 'tasks':
      return s.tray ? <div className="demo-menu demo-tray"><strong>Windows 系统托盘 · Sparkseed</strong>
        <small>快速记录</small><small>语音快记（说完即保存）</small>{control('打开 Sparkseed', 'forward')}<small>退出</small>
      </div> : <>
        {tabs(control('需要处理'), control('进行中', null, s.complete ? undefined : 'selected'),
          control('已完成', null, s.complete ? 'selected' : undefined))}
        <div className="demo-row"><div><strong>文献初查 · {idea}</strong><p>{s.complete ? '已完成' : '正在后台运行'}</p></div>
          {control(s.complete ? '查看结果' : '打开任务', 'forward')}</div>
      </>;
    default:
      return null;
  }
}

const actionLabels = { click: '点击', drag: '拖选', type: '输入', wait: '查看结果' };
const duration = { click: 2550, drag: 3050, type: 3200, wait: 2500 };
const typingStart = 950;
const typingDuration = 1500;

export function GuideDemo({ id, autoPlay = true }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => autoPlay && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [started, setStarted] = useState(playing);
  const [typed, setTyped] = useState('');
  const screen = useRef(null);
  const pointer = useRef(null);
  const steps = guideScenes[id];
  const [name, state, action] = steps[index];
  const [icon, page] = screens[name];
  const last = index === steps.length - 1;
  const actionAt = useRef(0);

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => { if (motion.matches) setPlaying(false); };
    motion.addEventListener('change', stop);
    return () => motion.removeEventListener('change', stop);
  }, []);

  useEffect(() => {
    if (!playing || last) return;
    let frame;
    let previous;
    const tick = now => {
      if (previous !== undefined) actionAt.current += now - previous;
      previous = now;
      if (actionAt.current >= duration[action.kind]) {
        actionAt.current = 0;
        setTyped('');
        setIndex(index + 1);
        if (index + 1 === steps.length - 1) setPlaying(false);
        return;
      }
      if (action.kind === 'type') {
        const progress = Math.max(0, Math.min(1, (actionAt.current - typingStart) / typingDuration));
        setTyped(action.text.slice(0, Math.ceil(action.text.length * progress)));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [action, index, last, playing, steps.length]);

  useLayoutEffect(() => {
    const area = screen.current;
    const target = area.querySelector('[data-target="true"]');
    const cursor = pointer.current;
    if (!target || !cursor) return;
    const locate = () => {
      const bounds = area.getBoundingClientRect();
      const first = target.getClientRects()[0];
      const parts = target.getClientRects();
      const final = parts[parts.length - 1];
      if (!first || !final) return;
      const drag = action.kind === 'drag';
      cursor.style.left = (drag ? first.left - bounds.left : final.left - bounds.left + final.width * .55) + 'px';
      cursor.style.top = (first.top - bounds.top + first.height * .65) + 'px';
      cursor.style.setProperty('--demo-drag-x', final.right - first.left + 'px');
      cursor.style.setProperty('--demo-drag-y', final.top - first.top + 'px');
    };
    locate();
    const resize = new ResizeObserver(locate);
    resize.observe(area);
    resize.observe(target);
    document.fonts?.ready.then(() => { if (cursor.isConnected) locate(); });
    return () => resize.disconnect();
  }, [action]);

  function choose(next) {
    setPlaying(false);
    setStarted(false);
    setIndex(next);
    actionAt.current = 0;
    setTyped('');
  }
  function toggle() {
    if (last) choose(0);
    setStarted(true);
    setPlaying(last || !playing);
  }

  return <div className="guide-demo" data-playing={playing}>
    <div className="guide-demo-window">
      <header><Icon name={icon} /><strong>{page}</strong><span>示例演示</span></header>
      <div className="guide-demo-screen" ref={screen} data-action={action.kind} data-started={started}>
        <DemoScreen key={'screen-' + index} name={name} state={state} action={action} typed={started ? typed : action.text} />
        {action.target && <div className="guide-demo-pointer-target" data-action={action.kind} ref={pointer} key={'pointer-' + index} aria-hidden="true">
          <span className="guide-demo-pointer" /><i className="guide-demo-click" />
        </div>}
      </div>
    </div>
    <p className="guide-demo-caption">
      <strong>{actionLabels[action.kind]}{action.target ? ' · ' + action.target : ''}</strong>
      <span>{action.caption}</span>
    </p>
    <div className="guide-demo-player" role="group" aria-label="控制操作演示">
      <button type="button" className="quiet icon-label" onClick={toggle}>
        <Icon name={last ? 'refresh' : playing ? 'pause' : 'play'} />{last ? '重播' : playing ? '暂停' : '播放'}
      </button>
      <span className="guide-demo-counter" aria-label={`第 ${index + 1} 步，共 ${steps.length} 步`}>{index + 1} / {steps.length}</span>
      <div className="guide-demo-steps" role="group" aria-label="逐步查看演示">
        {steps.map(([, , step], position) => <button key={position} type="button" className="quiet"
          aria-pressed={index === position} aria-label={`第 ${position + 1} 步 · ${step.target || step.caption}`}
          title={step.caption} onClick={() => choose(position)}>{position + 1}</button>)}
      </div>
    </div>
  </div>;
}
