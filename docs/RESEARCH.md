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

研究代码仅用于阅读；本仓库没有复制这些第三方项目的源码、图标或字体。运行包不加载远程代码。

## 0.1.1 对照复查

本轮直接重读 [x-focus/article-state.ts](https://github.com/fxzer/x-focus/blob/main/content-scripts/spam/article-state.ts) 的占位与恢复、[scanner.ts](https://github.com/fxzer/x-focus/blob/main/content-scripts/spam/scanner.ts) 的详情范围，以及 [hide-the-annoying/content.js](https://github.com/turkerdev/hide-the-annoying/blob/main/extension/content.js) 与 [content.css](https://github.com/turkerdev/hide-the-annoying/blob/main/extension/content.css) 的折叠恢复设计。新版选择在原生内层纵向容器挂正常工具条，折叠时独立占位，不再把正常工具条插进 X article 的横向行。没有复制这些项目代码。

人工标记采用有上限的 few-shot 样本，按文字相关性和正负标签平衡选取；不以作者或短文本长度直接推广结论，不把用户标签当作真实训练标签。
