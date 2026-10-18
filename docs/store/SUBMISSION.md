# Chrome 应用商店提交记录

更新：2026-10-19（Asia/Shanghai）。

- 名称：乔木 X 助手 · Qiaomu X Helper
- 版本：0.2.0，已成功重新提交，后台回读「待审核 / 该草稿尚待审核」。通过审核后自动发布（提交前 checkbox 已核对为 true）；尚未上架。
- 仓库：https://github.com/joeseesun/qiaomu-x-helper
- 商店条目：`npbekbjlplpiopckedfiggpdkgaaflll`
- 发布基线：PR #15 合并提交 `8fda30a55629a08d06e876ed4e421a6eacc1bab5`。
- GitHub：[v0.2.0 Preview](https://github.com/joeseesun/qiaomu-x-helper/releases/tag/v0.2.0)。主分支 CI [39147307847](https://github.com/joeseesun/qiaomu-x-helper/actions/runs/39147307847) 通过，CI 与本机包的 20 个文件逐项相同；公开下载返回 200 且 SHA-256 一致。
- 包：`artifacts/qiaomu-x-helper-0.2.0-chrome.zip`
- SHA-256：`7a977cc638948f40fc6cc2d6766facb76898a715966d7d5d3e0cbfb3a84c7462`

提交时间：2026-10-19 01:14（Asia/Shanghai，实际回读记录）。

## 本轮审核修正

0.1.11 已成功重新送审，后收到“垃圾内容和商店中的排名 / Yellow Argon”拒绝。后台具体指出商品说明罗列多个模型平台属于“产品说明中有过多关键字”。本轮移除商品描述中的平台枚举，改用简短、直接的功能说明。实际平台支持保留在连接设置、README 与审核步骤；不申诉、不重复提交未修正的描述。

0.2.0 加入 KOL 样本评估、兴趣反馈、待回复、搜索与复盘。同步隐私说明、单一用途与本机存储披露，上传最新的五张 1280 × 800 RGB 截图。没有新增权限、遥测、后台抓取或远程代码。

## 可复用资料

- `listing-zh.txt`：当前中文商品介绍。
- `reviewer-notes.txt` / `reviewer-summary.txt`：完整测试步骤与 500 字以内摘要，无开发者凭据。
- `declarations.json`：单一用途、权限与数据类别。
- `visuals.html` / `assets/`：生产 UI 与生产内容脚本夹具，全部标明示例数据。
- `screenshot-1.png` 至 `screenshot-5.png`：1280 × 800 RGB；`promo-440x280.png`：440 × 280 RGB。

本机数据也披露：个人身份信息、身份验证信息、网络记录、用户活动与网站内容。公开安装链接在审核通过前不是已上架证据。
