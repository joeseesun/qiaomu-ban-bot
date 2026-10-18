# Jev 生态研究与产品取舍

研究日期：2026-10-18。以下链接均为项目作者或官方材料。开源项目证明的是接入方法和可复用设计，不证明 AI 检测准确率或热帖预测质量。

| 来源 | 吸收的设计 | 本项目取舍 |
| --- | --- | --- |
| [fxzer/x-focus](https://github.com/fxzer/x-focus) | X 回复过滤、名单、基于时间和浏览量的热度观察 | 独立实现 DOM 提取；增加 Jev 判断，区分观测速度与预测概率 |
| [turkerdev/hide-the-annoying](https://github.com/turkerdev/hide-the-annoying) | Jev 过滤、软折叠、语义规则、缓存和测试入口 | 保留可撤销操作；严格验证 noul 字段，错误时不折叠 |
| [mattn/go-jev](https://github.com/mattn/go-jev) | 清晰的原生类型、超时和限流处理 | 使用轻量 JS 适配器，限制并发和日额度；限流后冷却，无无限重试 |
| [sebastianbugal/jev](https://github.com/sebastianbugal/jev) | 把问题拆成独立决策、约束状态大小 | AI、信息量、价值、推广分别提问，避免一个总分混淆不同判断 |
| [huzeyfe07/jev-route](https://github.com/huzeyfe07/jev-route) | 先决策、再按阈值触发允许的操作 | 只自动折叠；账号拉黑由用户确认。该项目接口示例不作为本项目协议依据 |
| [awesome-typesafe-jev](https://github.com/AbdelStark/awesome-typesafe-jev) | 接入项目索引 | 只用于发现，再回到原始仓库核对 |

[官方 noul 文档](https://docs.typesafe.ai/primitives/noul) 将 noul 定义为 0–1 的“是”概率。[官方介绍](https://docs.typesafe.ai/introduction) 展示原生决策用法。实际请求采用 `/v1/systemone`、`state`、`questions`；没有将 Jev 冒充通用聊天或摘要模型。

当前一次回复请求询问 AI 来源可能性、低信息量、有内容的回复、引流推广，按需附加用户自定义规则。正文属于不可信证据，不允许它覆盖判断指令。仅靠 prompt 无法证明完全抵抗注入，测试中包含一条构造注入样例，但不宣称完成安全评测。

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
