# 0.5.0 宣传物料来源

- `screenshot-1.png` 至 `screenshot-5.png`：1280 × 800，五张。实际生产界面，所有文章、账号、模型与对话内容为隔离演示数据。按写作、图库、阅读过滤、书签、模型配置排列。
- `promo-440x280.png`：商店小型宣传图。
- `marquee-1400x560.png`：商店横幅。
- `../images/hero-050.png`：README 概念主视觉，1400 × 700。
- `social-1280x640.png`：GitHub Social preview 候选图。文件生成不等于已在仓库 Settings 上传。
- `visuals.html`：可复现的原生 HTML/CSS 排版，不改造截图里的功能、按钮或数据状态。功能截图来自 `../images/*-050.png`。
- `../images/launch-art-050.png`：通过内置 `image_gen` 生成的概念插画，用散纸逐渐整理为笔记本表达“从阅读到写作”。不是软件界面，也不是插件云端生成成功的证据。

## 生图提示词

工具：内置 `image_gen`，非 CLI。实际采用的英文提示词：

> Use case: ads-marketing. Create one polished editorial campaign illustration for Qiaomu X Helper, a Chrome extension that helps people turn noisy social reading into their own clear writing. Wide landscape 2:1 composition, high resolution. No text, no letters, no logos, no UI screenshot. On a very pale warm-white background: a restrained sculptural still life of unmarked, beautifully crafted off-white paper slips scattered at the far left, gradually becoming three orderly pages and a clean open notebook on the right, with a single graphite pencil resting beside it. Visual metaphor of collecting, filtering and writing. Paper edges, subtle tactile texture, soft side lighting and precise shadows, premium magazine photography mixed with elegant paper sculpture. Palette strictly charcoal ink, warm paper white, very subtle pale grey; a single tiny muted cobalt blue bookmark as accent. Keep the upper half mostly empty for later typography, main objects in lower right half. Calm, intelligent, useful, contemporary, not cute. No robot, no sparkle icons, no gradient blobs, no neon, no black-yellow palette, no tilted fake software screens. This is explicitly conceptual campaign artwork, not a representation of actual software UI.

图片生成后复制到仓库，宣传标题由 HTML 排版，避免生成文字错误。图库截图里的同一插画通过真实上传入口添加、重命名、预览和插入文章，刷新后仍可读到原图。

规格依据：[Chrome 官方图片要求](https://developer.chrome.com/docs/webstore/images)。商品文案依据：[Listing Requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)。核对日期：2026-10-21。上架状态见 [SUBMISSION.md](SUBMISSION.md)。
