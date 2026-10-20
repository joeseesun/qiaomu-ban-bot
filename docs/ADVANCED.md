# 0.4.0 当前交付范围（2026-10-20）

当前已迁入 Clipper 文字/图片模型管理、长文编辑器与 X 草稿引擎；已移除主页评估和备注及后台接口，搜索改成结构化条件，小火面板简化并统一关注者字号。当前验收以 [QA](QA.md#040-preview-模型管理与长文) 为准。下面保留旧版本工作记录，不代表当前功能状态或安装路径。

---

# 高级功能交付进度

## 2026-10-20 阅读与社区标注升级（实现完成，安装验收待解锁）

用户已授权开发及自行配置需要的子域名。实现分支 `codex/reading-community`，设计锚点 `DESIGN.md`。
复用现有待回复和标注数据库，升级静默阅读界面、独立收藏入口、作者证据、词汇规则、标注导出及可选社区服务。
部署前已检查 Hostinger：Node 22 / Python 3.12 可用，Nginx 采用非系统默认目录；不会改动既有站点或占用已有端口。
完成标准：持久化与迁移、身份去重及撤回、权限与离线失败、生产界面和模型载荷、HTTPS 服务回读、发布包与远端提交分别验证。

### 当前验收进度（2026-10-20）

- 已实现：轻量回复条、关注数/关系/作者资料、一键待回复与分栏工作台/备注/排序、词汇过滤、证据输入、标注 Markdown/JSON 导出、可选社区客户端与服务端。
- `npm run package`：122 项扩展测试通过，服务端 5 项测试通过。新增账号身份补齐、旧库同帖去重与提示规则不覆盖模型过滤的回归。
- 真实 Jev 1.13.0 返回两条合成丰富证据样例：AI 0.43 / 0.77，输入 1325 / 1334 tokens。只证明协议和模型链路，不是准确率基准。过程文件 `artifacts/live-reading-smoke.json`。
- 已部署 `https://x-community.qiaomu.ai` → Hostinger，systemd 用户 `qiaomu-x-community`、回环端口 3258、SQLite WAL、Nginx HTTPS，证书到期 2027-01-18，沿用现有证书自动续期及 Nginx reload hook。
- 外网 HTTPS 已实际验收：新邀请码兑换、两身份同帖分歧、重复提交去重、单条/全部撤回、旧修订不复活。临时测试身份与记录已清理。
- 日备份 timer 已启用，备份 `PRAGMA integrity_check` 为 `ok`，线上 Python 与仓库 SHA-256 一致；数据库 `/var/lib/qiaomu-x-community/community.sqlite`，代码 `/opt/qiaomu-apps/x-community`。用户专属的一次性邀请保存在本机 `~/.config/qiaomu-x-helper/community-owner-invite.txt`（0600，未写入仓库/聊天；尚未兑换）。
- 浏览器：Ego QA 空间 37；p1 设置预览，p2 真实 X 只读，p3 合成阅读夹具。已确认真实 X 页面公开用户 ID/关注数/关注关系字段存在。桌面、390 px 阅读夹具、资料卡及一键待回复已检查。Mac 随后锁定，用户解锁请求已发出；最终深色与已安装扩展运行验证待继续。
- 已从 Chrome 原生扩展管理页确认安装 ID `cngkpaljmngkmbkaloepadeogcbconne`，固定目录 `../qiaomu-banbot/dist/chrome`。原 0.2.0 已备份，0.3.0 的 21 个文件均已复制并逐项核对摘要；尚未重载，未改动浏览器存储。
- 实现 [PR #17](https://github.com/joeseesun/qiaomu-x-helper/pull/17)，GitHub 分发入口 [v0.3.0 Preview](https://github.com/joeseesun/qiaomu-x-helper/releases/tag/v0.3.0)。0.3.0 未提交商店，上一次商店 0.2.0 状态不可据此更新。
- 续做：用户手动解锁 Mac 后重载原固定安装实例、刷新 X，核实版本 / 原有数据 / 新作者行及待回复；补查最终深色与窄屏工作台，再结束 QA 空间。不要自动开启社区或回传历史标签。

更新：2026-10-19。源码目录为 `/Users/joe/Documents/ChatGPT/qiaomu-x-helper`；旧 `qiaomu-banbot/dist/chrome` 是用户已安装扩展的固定目录，开发构建不自动覆盖它。

## 本轮范围与完成标准

1. TypeSafe 默认服务：100 项测试、浏览器设置页已验证，PR #14 已合并，v0.1.11 GitHub 包已发布；已重新提交商店，后收到商品说明关键字过多的拒绝；0.2.0 修正描述，状态见提交记录。
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
- [x] 高级版本 GitHub 发布（PR #15、main CI、公开下载哈希均已核对）
- [x] 0.2.0 商店重新送审（拒绝原句已修正，五张新截图、隐私与审核步骤已回读，当前待审核）
