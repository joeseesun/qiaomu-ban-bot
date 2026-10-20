# 本地助手是可选项

**安装 X Helper 就能写作、管理书签和模型。** 文字模型、联网搜索、Unsplash 和云端生图按需连接各自服务，不依赖 macOS PKG。

只有选择「模型设置 → 配图 → 本机 Codex」时，才需要本机 Codex 登录与乔木本地助手。它复用 Clipper 的 Native Messaging 宿主 `ai.qiaomu.clipper`，无需再运行一套常驻 HTTP 服务。

## 兼容要求

- 助手必须实际包含 `codex_images.py` 和 `codexImageStatus / Start / Poll / Read / Cancel` 协议；迁移源码基线中的助手版本为 1.16.8。
- 安装程序必须为 **X Helper 的实际扩展 ID** 注册来源许可。Clipper 能连接，不代表 X Helper 已获许可。商店 ID 为 `npbekbjlplpiopckedfiggpdkgaaflll`；从源码加载时 ID 可能不同。
- 本机 Codex 需要登录，且账号能够使用图片生成工具。列出模型或显示已连接不能证明该账号能生成图片。
- 在配图设置保存本机 Codex 服务时，Chrome 会请求可选的 `nativeMessaging` 权限。拒绝后仍可使用云端配图。

## 先核对安装包，再安装

请查看 [Clipper 的助手发布资产](https://github.com/joeseesun/qiaomu-clipper/releases)及其说明。**不要用扩展版本推断 PKG 版本。** 本次核对时，Clipper 1.18.9 Release 附带的助手为 1.16.6，不能作为已支持此功能的安装包推荐；X Helper 本次不附带一个未经验证的新 PKG。

如果维护者已提供包含上述协议的新版助手，但提示“尚未允许 X 助手连接”，需重新注册当前扩展 ID。使用该新版助手源码中的正式安装器，保留已有配置并附上本扩展 ID：

```bash
python3 native/install.py --extension-id <在扩展管理页看到的32位ID>
```

这是高级安装路径，不要直接修改或覆盖正在使用的 Native Messaging manifest。注册后重新打开配图设置，生成一张小图，确认真实图片返回、能在图库打开并插入文章。

## 本次验证范围

X Helper 已实现本机 Codex 消息桥接、请求来源校验、任务恢复与分块读取，并有协议测试。本次没有完成已安装扩展 → 本机助手 → Codex 的真实生图验收。云端配图使用独立路径，不受此兼容要求影响。
