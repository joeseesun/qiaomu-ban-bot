# Chrome 应用商店提交记录

## 0.5.0 已提交审核（2026-10-21）

- 提交时间：**2026-10-21 09:29（Asia/Shanghai）**。Ego Lite 提交后回读「状态：待审核 / 该草稿尚待审核」，并核对了「审核通过后自动发布」为选中状态。
- 版本：**0.5.0 待审核，尚未核实审核通过或公开发布。** 同日公开商店页面与后台「已发布」版本均为 **0.2.0**，不能把旧版公开可见当作新版已上架。
- [Chrome 商店页面](https://chromewebstore.google.com/detail/npbekbjlplpiopckedfiggpdkgaaflll) · [GitHub v0.5.0 Preview](https://github.com/joeseesun/qiaomu-x-helper/releases/tag/v0.5.0)。商店条目：`npbekbjlplpiopckedfiggpdkgaaflll`。
- 上传包：`qiaomu-x-helper-0.5.0-chrome.zip`，238 个文件；SHA-256 `57e10fad27764c0aa35b6ba34f6d65cf0523fef8aa0f8e90a8604411977a0134`。代码基线为 PR #23 合并提交 `4a3115013876b76a79ad55a5328b89bd0c6363fd`；本轮仅更新商店资料和记录，没有替换既有 Release 安装包。
- 已上传并保存：五张 1280×800 RGB 功能截图、440×280 宣传图、1400×560 横幅、中文商品说明、权限理由、数据类别与审核测试说明。刷新后回读文案、测试说明、权限理由和数据类别一致，截图与宣传图已目视检查。
- 数据披露：个人身份信息、身份验证信息、个人通讯、网络记录、用户活动、网站内容。「个人通讯」对应用户主动发起的 AI 写作对话，不读取 X 私信、邮箱或短信。`offscreen`、可选 `nativeMessaging` 与主机权限用途已分别填写；确认不使用远程代码。
- 分发：免费、公开，所有可选地区均选中；第三方模型 / 搜索 / 图片服务的费用另计。基础写作无需密钥或本地助手，本机 Codex 配图才需要兼容助手。
- 截图为生产 UI 配合标注的演示数据，视觉来源见 [MEDIA.md](MEDIA.md)。GitHub Release 商店物料 ZIP 保留为制作时的快照；最新声明和提交状态以仓库文件为准。
- 现场证据：本机 `artifacts/store-050/` 保存提交后状态截图、文本回读、隐私选项与公开页面记录，未将账号界面截图提交到公开仓库。

本轮先前因浏览器权限系统返回 `Not allowed` 未能上传。用户解除限制后，通过 Ego Lite 正常访问、上传并送审；该阻碍已解除。已安装扩展及外部服务的验证边界仍见 [QA](../QA.md)，商店送审不替代运行验证。

GitHub Social preview 候选图 `social-1280x640.png` 已制作，尚未在仓库 Settings → General → Social preview 上传；About、Topics 与私密漏洞反馈已配置。

## 0.3.0 的分发边界（2026-10-20）

0.3.0 为 GitHub Preview，尚未上传或提交 Chrome 商店。新增社区功能及公开作者字段已更新根目录隐私说明；商店资料与审核需要独立更新。以下 0.2.0 状态保留为 2026-10-19 的历史记录；2026-10-21 已核实其公开发布，见本页顶部。

## 0.2.0 已提交记录

更新：2026-10-19（Asia/Shanghai）。

- 名称：乔木 X 助手 · Qiaomu X Helper
- 版本：0.2.0，已成功重新提交，后台回读「待审核 / 该草稿尚待审核」。通过审核后自动发布（提交前 checkbox 已核对为 true）；尚未上架。
- 仓库：https://github.com/joeseesun/qiaomu-x-helper
- 商店条目：`npbekbjlplpiopckedfiggpdkgaaflll`
- 发布基线：PR #15 合并提交 `8fda30a55629a08d06e876ed4e421a6eacc1bab5`。
- GitHub：[v0.2.0 Preview](https://github.com/joeseesun/qiaomu-x-helper/releases/tag/v0.2.0)。主分支 CI [39147307847](https://github.com/joeseesun/qiaomu-x-helper/actions/runs/39147307847) 通过，CI 与本机包的 20 个文件逐项相同；公开下载返回 200 且 SHA-256 一致。
- 包：`artifacts/qiaomu-x-helper-0.2.0-chrome.zip`
- SHA-256：`7a977cc638948f40fc6cc2d6766facb76898a715966d7d5d3e0cbfb3a84c7462`

提交时间：2026-10-19 01:07（Asia/Shanghai，提交后截图时间 01:07:27）。

## 本轮审核修正

0.1.11 已成功重新送审，后收到“垃圾内容和商店中的排名 / Yellow Argon”拒绝。后台具体指出商品说明罗列多个模型平台属于“产品说明中有过多关键字”。本轮移除商品描述中的平台枚举，改用简短、直接的功能说明。实际平台支持保留在连接设置、README 与审核步骤；不申诉、不重复提交未修正的描述。

0.2.0 加入 KOL 样本评估、兴趣反馈、待回复、搜索与复盘。同步隐私说明、单一用途与本机存储披露，上传最新的五张 1280 × 800 RGB 截图。没有新增权限、遥测、后台抓取或远程代码。

## 可复用资料

- `listing-zh.txt`：当前中文商品介绍。
- `reviewer-notes.txt` / `reviewer-summary.txt`：完整测试步骤与 500 字以内摘要，无开发者凭据。
- `declarations.json`：单一用途、权限与数据类别。
- `visuals.html` / `assets/`：生产 UI 与生产内容脚本夹具，全部标明示例数据。
- `screenshot-1.png` 至 `screenshot-5.png`：1280 × 800 RGB；`promo-440x280.png`：440 × 280 RGB。

本机数据也纳入披露；当前类别及其具体范围见 `declarations.json` 与根目录 `PRIVACY.md`。公开商店页面需核对实际版本，不能据旧版页面认定新版已上架。
