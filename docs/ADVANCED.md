# 高级功能交付进度

更新：2026-10-19。源码目录为 `/Users/joe/Documents/ChatGPT/qiaomu-x-helper`；旧 `qiaomu-banbot/dist/chrome` 是用户已安装扩展的固定目录，开发构建不自动覆盖它。

## 本轮范围与完成标准

1. TypeSafe 默认服务：100 项测试、浏览器设置页已验证，PR #14 已合并，v0.1.11 GitHub 包已发布；已重新提交商店，回读待审核，通过后自动发布。
2. 高级搜索：词语/账号/日期/互动/媒体条件、实时查询预览、相对日期、模板、保存/编辑/置顶/分类、JSON 导入导出；打开 X 原生搜索，不抓取私有接口。
3. KOL 值得关注评分：只分析用户当前加载的账号样本；内容、独立表达、互动质量分开；样本不足明确显示，证据与模型版本保留。主页入口、记录页与本机备注，关注/拉黑由用户在 X 完成。
4. 兴趣助手：按账号保存关注/避开主题、人工正反例，Jev 显示兴趣及值得回复估计；反馈可撤销、删除。只影响插件判断，不声称改变 X 推荐算法。
5. 待回复：用户主动加入及提及页已加载条目，本机分账号收件箱；评分、置顶、已处理、恢复、搜索与分页；不自动发送。
6. 数据复盘：保存可见观测点、浏览/互动增长、追踪统计与导出；原始预测不可改写，不伪造 24 小时结果。

最终验收：生产后台/IndexedDB/协议适配集成、网络失败/权限/跨账号/迟到响应/分页/导入边界回归，真实浏览器桌面和窄屏截图、原生 X 挂载宽度与交互、包内模块完整性；分支 PR 合并、CI、公开 Release 与商店状态分别记录。

## 调研依据

- X Search Pro：https://github.com/neonwatty/x-search-pro，MIT，提交 1e017142355e25282daa5ab16f2de35a14b2bd60。读取 lib/query-builder.js、lib/storage.js；吸收条件构建、搜索库、执行时刷新日期。独立实现，修正其多词强制短语与 until 排除当天带来的交互问题。
- Make X Great Again：https://github.com/foru17/make-x-great-again，AGPL-3.0，提交 0da0e50f4f11090727c3898d6b23860bb47964de。KOL 浮卡仍列为计划；profile metrics migration 只存年龄和关注数，没有现成值得关注算法。不复制 AGPL 代码，不以粉丝量代表内容质量。
- 搜索操作符参考：https://github.com/igorbrigadir/twitter-advanced-search；官方基础条件：https://help.x.com/en/using-x/x-advanced-search。只使用可解释的常用字段，搜索结果与操作符兼容性由 X 决定。
- TypeSafe：https://docs.typesafe.ai/introduction，按独立原子问题评估各维度，代码组合分数；只获取结构化决定，不伪造文字摘要。

## 状态

- [x] 默认服务修复及 GitHub 0.1.11
- [x] 0.1.11 商店重新提审
- [x] 搜索 / 本机数据层（生产集成已通过）
- [x] KOL / 兴趣 / 待回复 / 复盘（生产集成 + 两次真实 Jev 构造样例）
- [x] 界面与真实浏览器验收（五视图 / 390 px / 深色 / 真实 X 布局替身 / 10,000 条分页）
- [ ] 高级版本发布
