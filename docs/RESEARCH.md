# Jev 生态研究与产品取舍

研究日期：2026-10-18。以下链接均为项目作者或官方材料。开源项目证明的是接入方法和可复用设计，不证明 AI 检测准确率或热帖预测质量。

| 来源 | 吸收的设计 | 本项目取舍 |
| --- | --- | --- |
| [fxzer/x-focus](https://github.com/fxzer/x-focus) | X 回复过滤、名单、基于时间和浏览量的热度观察 | 独立实现 DOM 提取；增加 Jev 判断，区分观测速度与预测概率 |
| [turkerdev/hide-the-annoying](https://github.com/turkerdev/hide-the-annoying) | Jev 过滤、软折叠、语义规则、缓存和测试入口 | 保留可撤销操作；严格验证 noul 字段，错误时不折叠 |
| [mattn/go-jev](https://github.com/mattn/go-jev) | 清晰的原生类型、超时和限流处理 | 使用轻量 JS 适配器，限制并发和日额度；限流后冷却，无无限重试 |
| [sebastianbugal/jev](https://github.com/sebastianbugal/jev) | 把问题拆成独立决策、约束状态大小 | AI 来源、正向阅读提示、推广分别提问；已移除信息量评分 |
| [huzeyfe07/jev-route](https://github.com/huzeyfe07/jev-route) | 先决策、再按阈值触发允许的操作 | 只自动折叠；账号拉黑由用户确认。该项目接口示例不作为本项目协议依据 |
| [awesome-typesafe-jev](https://github.com/AbdelStark/awesome-typesafe-jev) | 接入项目索引 | 只用于发现，再回到原始仓库核对 |

[官方 noul 文档](https://docs.typesafe.ai/primitives/noul) 将 noul 定义为 0–1 的“是”概率。[官方介绍](https://docs.typesafe.ai/introduction) 展示原生决策用法。实际请求采用 `/v1/systemone`、`state`、`questions`；没有将 Jev 冒充通用聊天或摘要模型。

当前一次回复请求询问 AI 来源可能性、有内容的回复、引流推广，按需附加用户自定义规则。0.1.5 已移除低信息量问题、标签和折叠模式，简短表达不作为质量负面依据。正文属于不可信证据，不允许它覆盖判断指令。仅靠 prompt 无法证明完全抵抗注入，测试中包含一条构造注入样例，但不宣称完成安全评测。

热帖必须先定义事件：默认“发帖后 24 小时累计达到 10,000 浏览”。缺少发布时间、浏览量或足够观测时间就不显示概率。没有历史训练集和留出集校准，当前分数必须明确标为模型估计。相比新增自动回复，后续优先做回测与误判样本。

权限和后台跨域请求依据 [Chrome 存储文档](https://developer.chrome.com/docs/extensions/reference/api/storage) 与 [扩展网络请求文档](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) 设计：模型凭据留在受信任后台，服务访问按需授权，内容脚本不直接请求模型。

研究代码仅用于阅读；本仓库没有复制上述过滤扩展项目的源码、图标或字体。运行包不加载远程代码。

## 0.1.1 对照复查

本轮直接重读 [x-focus/article-state.ts](https://github.com/fxzer/x-focus/blob/main/content-scripts/spam/article-state.ts) 的占位与恢复、[scanner.ts](https://github.com/fxzer/x-focus/blob/main/content-scripts/spam/scanner.ts) 的详情范围，以及 [hide-the-annoying/content.js](https://github.com/turkerdev/hide-the-annoying/blob/main/extension/content.js) 与 [content.css](https://github.com/turkerdev/hide-the-annoying/blob/main/extension/content.css) 的折叠恢复设计。新版选择在原生内层纵向容器挂正常工具条，折叠时独立占位，不再把正常工具条插进 X article 的横向行。没有复制这些项目代码。

人工标记采用有上限的 few-shot 样本，按文字相关性和正负标签平衡选取；不以作者或短文本长度直接推广结论，不把用户标签当作真实训练标签。

## 0.1.2 折叠与操作面板回归

- [hide-the-annoying 的悬停/React class 覆盖处理](https://github.com/turkerdev/hide-the-annoying/blob/main/extension/content.js)：参考其对原生 className 重写的防护思路。本项目用独立 data 属性驱动折叠，不复制其恢复 class 的实现，也不与 X 争抢原生样式类。
- [Lucide 官方 Vanilla 接入](https://lucide.dev/guide/lucide/getting-started)：按需导入本地图标，用 SVG 创建 API 渲染在 Shadow DOM；不用 CDN 或整包图标注册表。完整许可附在安装包的 LICENSE.lucide。
- 工具条只保留概率、值得一读图标、人工 AI 图标和下拉入口。展开内容在帖子内部排版，分数和按钮分组；避免浮层遮住 X 原生操作。图标保留 title/aria-label，下拉按钮维护 aria-expanded，支持 Escape。

## 0.1.3：标注与质量验证

采用三态互斥按钮组（未标注 / AI / 真人），而不是强迫二选一的布尔 switch；`aria-pressed` 表达用户标签，分数仍来自模型。标注前已有分数随样本保留，没有分数不制造概率。

类型安全不等于作者识别准确。[TypeSafe 官方说明](https://typesafe.ai/blog/introducing-system-one-models-and-jev)介绍了 state + typed questions 和结构化概率；[官网评估说明](https://typesafe.ai/)也明确 workflow 结果不代表每个任务的准确率。当前代码只利用用户样本做请求上下文，没有训练模型权重。

本次改进是可测试的样本选择：重叠中文双字片段、英文词、主帖上下文相关性；相同文本去重、相互冲突标签排除、待判断文本和 ID 排除；每类最多 3 条。相关性分数是本地检索启发式，不能当作提升准确率的证据。

后续验证应使用未参与上下文的独立标注，按模板/重复文本分组，分别报告真人误折叠率、AI 漏检率、类别样本数；固定阈值与模型版本，比较无示例与有示例。只有真人样本时只能评估误伤，不能声称 AI 检出率。人工标签本身也应复核。


## 多平台配置与设置文案 · 2026-10-18

官方接入核对：[TypeSafe Quick Start](https://docs.typesafe.ai/introduction/quickstart) 给出 `/v1/systemone` 与 console.typesafe.ai 密钥入口；[OpenRouter Jev](https://openrouter.ai/blog/insights/what-is-jev/) 给出 `/api/alpha/decisions`、`typesafe/jev-1.14` 和 TypeSafe SDK 兼容路径；[Vercel TypeSafe API](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) 明确 `/typesafe/v1/systemone`、`typesafe-ai/jev` 和 Gateway Key。三者都可保留 state/questions/noul 结构，因此不引入普通聊天 API 解析，也不在调用失败后偷偷换平台或模型。

[更多 Jev 集成](https://vercel.com/i/jev-integrations) 还列出 Cloudflare、TanStack、LangChain 等。SDK/框架不等于服务商；Cloudflare 原生 HTTP 还需 account ID 和特定包装，本版未提供其直接预设。自定义项只承诺上述两类兼容决策接口，不能声称任意 OpenAI 聊天 Base URL 都能调用 Jev。

设置采用平台预设 + 可编辑模型名，Base URL 收在高级设置，按实际目标域名单独请求权限。新目标不能使用旧已保存密钥，失败保留连接；原始模型分数与用户标签区分。已有标签历史从热路径移到 IndexedDB，页面用索引游标读 20 条，模型仅用最近 40 条作为候选、最多 6 条参考。

文案参考 [Apple Writing](https://developer.apple.com/design/human-interface-guidelines/writing)：短、直接、说明当前状态与下一步。公众号/打赏资源复用作者自己的 Qiaomu Clipper 关于页资产；未复制其程序实现。图标为本项目原创几何对话气泡与过滤线，SVG 与确定性 PNG 生成器均在仓库。

## 乔木 X 助手：互动与复盘 · 2026-10-18

| 参考项目与核对材料 | 值得吸收 | 适用位置与交付边界 |
| --- | --- | --- |
| [Xhancer](https://github.com/Ceelog/Xhancer-Extension) | 中文拼音 @、账号备注、多账号隔离 | 本版常用 @。核对仓库目录只有 README，未发现许可证，不能当作可复用源码；仅参考产品方向 |
| [Xplore](https://github.com/devploit/Xplore)、[排序实现](https://github.com/devploit/Xplore/blob/main/src/analytics/ranking.ts) | 帖子快照、值得处理的提及、区分曝光不足与表现差 | 本版实现“看好追踪”；互动列表和更完整曲线为后续。MIT；最近推送 2026-09-21。不能把缺数据当零，也不能把涨粉相关性当因果 |
| [Bookmark X](https://github.com/LucasDitchun/export-bookmarks-x-twitter)、[导出仓库实现](https://github.com/LucasDitchun/export-bookmarks-x-twitter/blob/main/src/storage/export-repository.ts) | 本地书签、标签 / 文件夹 / 备注、Markdown 导出、备份 | 0.1.7 已提供书签页、标签 / 备注和 Markdown 导出；文件夹整理与备份导入仍未实现。MIT；调研时最近推送 2026-10-13。导出应取一致数据快照，显示实际已采集数量，不能声称拿齐全部历史 |
| [x-user-note](https://github.com/klntsky/x-user-note)、[页面备注实现](https://github.com/klntsky/x-user-note/blob/master/src/content.ts) | 给联系人写私有备注、记下屏蔽原因 | 本版联系人备注；屏蔽原因后续。仓库未检出许可证，不复制实现；其 Chrome Sync 路径不适用于本项目默认本机保存 |
| [Control Panel for Twitter](https://github.com/insin/control-panel-for-twitter) | 可逐项关闭的界面增强、成熟的 X 页面兼容实践 | 保留克制的就近入口，不叠加整套页面美化。MIT，作为兼容设计参考 |

以上是功能 / 实现结构对照，不是对这些扩展安装安全性或效果的背书。本版不复制这些扩展源码。拼音采用 [pinyin-pro](https://github.com/zh-lx/pinyin-pro) 3.29.5（MIT），离线生成搜索字段，许可随包附带；不会每次搜索调用模型。

### 当前交付

常用 @ 放在编辑器工具栏，以小弹层搜索、键盘选择、光标插入；集中管理放在账号页，与标注统计并列。成功回执必须同时有明确对象和草稿清空，不能把点发送或关闭弹窗当作成功。仅从启用后记录，不扫描历史。联系人与 AI 样本使用独立数据库。

0.1.6 起通过 X 的纯文本粘贴处理保留编辑器状态和撤销链；先等待聚焦与受控选区提交。原生 execCommand 仅作为普通 contenteditable 的回退，不能用于 Draft 中带装饰的 @ 跨节点补全；不通过写 innerHTML 改造 React 草稿。弹层采用 [Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using)，键盘交互参考 [WAI combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)。不自动发送，不替代 X 原生发布按钮。

主帖头部只增加“火焰 + 概率”；正文下方的回复标注与正文列对齐。看好追踪保存原始概率 / 模型 / 目标、当时数据和最近观测，复盘默认 3 天后。三天后的数值不能反推发帖 24 小时的数值；没有期限内采样证据时不计算“准确率”，不自动校准模型。

### 后续互动与完整复盘

1. **值得回复的提及列表**：增加独立互动页，按未处理 / 已回复 / 稍后 / 忽略筛选。每项显示原文、作者、时间、与哪个主帖相关、模型推荐理由；只打开 X 原生回复框，不代发。被动读取已加载的提及，明确覆盖范围；已回复状态必须沿用成功回执，不能仅凭点击记录。
2. **书签增强**：0.1.7 已提供本机书签、标签、搜索、备注和 Markdown 导出（见下文）。后续若增加备份导入，需验证往返一致；当前不提供备份导入，不开启后台无限抓取。
3. **更完整的帖子复盘**：在样本和时间点足够后展示初始、24 小时与 72 小时快照。分开呈现你的看好与模型判断；缺测不补零，尚无留出集前不声称概率已经校准。

### 本机兴趣反馈（设计，未实现）

Hot 右侧可放小号罗盘入口。三态为未标记、感兴趣、不感兴趣；弹层提供可选原因：喜欢话题、有新信息、内容太浅、重复看过。区分话题偏好与作者偏好，并支持撤销。先积累人工样本，再让 Jev 输出兴趣匹配度；默认只提示，是否按兴趣折叠必须由用户明确开启。独立兴趣页可查看 / 删除偏好和证据。

本机反馈只个性化“乔木 X 助手”。它不会修改或训练 X 的推荐算法。若需要 X 的“不感兴趣”等原生操作，应清楚展示为另一个用户主动操作，不能把插件的兴趣点击偷偷映射成点赞、关注或平台负反馈。

## 0.1.7 书签导出落地

借鉴 [Bookmark X 的 ExportRepository](https://github.com/LucasDitchun/export-bookmarks-x-twitter/blob/main/src/storage/export-repository.ts) 在同一只读事务取一致导出数据的方式。本项目独立实现按账号索引分页、游标生成 Markdown 块；导出直接在受信任的扩展页面访问同源数据库，避免将整库串行化通过后台消息返回。事务边界参照 [IndexedDB 文档](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology)。未复制来源项目代码或引入其依赖。

实际 X 页面于 2026-10-18 将 /i/bookmarks 跳到 /i/history，书签与喜欢位于不同路径。当前支持 /i/history、/i/bookmarks 及 /i/bookmarks/<数字文件夹 ID>，只提取帖子自身的 removeBookmark 状态，排除引用与未收藏推荐。点击开始后按已加载 DOM 采集，不使用私有 API、后台爬取或自动滚动；正文存在“显示更多”时明确为片段。X 收藏时间未暴露，首次收集时间独立记录。


## 0.1.8 书签保存交互

按用户反馈改为进入书签页默认保存，暂停按账号记忆；原先每次主动开始的设计已撤销。进度条采用原生 CSS sticky，在实际 X 标题 / 标签导航下方定位，使用实色背景，不改帖子容器。参考 [MDN position](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position) 对滚动祖先和包含块的说明，实测挂载父级与 107 px 原生顶栏边界；没有套用固定 top 常量。

## 0.2.0 工作台落地 · 2026-10-19

[neonwatty/x-search-pro](https://github.com/neonwatty/x-search-pro)（MIT，1e017142355e25282daa5ab16f2de35a14b2bd60）提供条件构建、搜索库与模板的参考。阅读其 query-builder/storage 后独立实现：多词保留为独立条件，直到日期包含所选当天，相对日期在执行时更新，避免保存语句过期。仅打开 X 原生搜索，遵循 [X 高级搜索说明](https://help.x.com/en/using-x/x-advanced-search)，操作符支持由 X 决定。

[foru17/make-x-great-again](https://github.com/foru17/make-x-great-again)（AGPL-3.0，0da0e50f4f11090727c3898d6b23860bb47964de）的 KOL 浮卡仍列为计划，没有可直接复用的值得关注算法。本项目未复制其代码。按用户选择，使用内容 / 独立表达 / 互动三个 Jev 原子问题；有限样本显示覆盖范围，不以粉丝数作为质量依据。

兴趣与待回复、复盘现已实现，取代上文旧版设计状态。记录采用本机 IndexedDB 游标分页，按账号隔离；人工兴趣正反例最多 6 条参与后续请求，删除即失效。收藏、提及与搜索没有后台抓取；人工“已处理”不等于已发出回复。模型 JSON 不会提供它没有生成的解释摘要；界面提供实际样本与维度定义，概率未校准。
