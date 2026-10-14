# Meaning Check

开源的公开交流理解浏览器插件，工程名 Meaning_Check。用户自带模型 API，点击「帮我确认意思」，先读主解读，再看语气和原文依据。MIT 许可。[English](README.en.md)。

## 当前阶段

2026-10-14 升级规则已对齐并先建档：九家厂商、双语、输出本地化、Reddit / 网站管理、图标和引导，进入实施。新增能力尚未完成验证。型号与来源见 [模型清单](documentation/models.md)。

首版业务功能已实现，自动化与隔离浏览器自测通过，已加载到 Dia。真实 Dia / X 页面操作及 DeepSeek 解读质量仍待完成验证。此为浏览器插件，没有独立网站或业务服务器。

## 开发与加载

Node 24、pnpm 10。`pnpm install` 安装依赖，`pnpm dev` 开发，`pnpm build` 生成 `.output/chrome-mv3`。在 Dia 的扩展管理页开启开发者模式，选择「加载已解压的扩展程序」，载入该目录。

扩展工具栏按钮打开本地设置页，也可在扩展管理中选择 Meaning Check → Details → Extension options。已加载后修改代码，需要先构建、在扩展管理中重新加载，再刷新 X 页面。

填写自己的 DeepSeek 密钥并保存；密钥只保存在当前浏览器的插件存储中。打开英文 X 回复页面，悬停或用键盘聚焦回复，点击「帮我确认意思」。

首次运行浏览器测试先执行 `pnpm exec playwright install chromium`。也可通过 `MEANING_CHECK_CHROMIUM` 指定已有的官方 Chromium / Chrome for Testing，始终使用临时独立配置，不能指向个人浏览器资料目录。

`pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`pnpm check:package` 为交付检查。检查结果以 [测试记录](documentation/tests.md) 为准。

## 文档入口

- [产品规则](documentation/product.md)
- [设计与交互](DESIGN.md)
- [架构、权限与配置](documentation/architecture.md)
- [测试与验收](documentation/tests.md)
- [10 条真实回复的验收记录](documentation/evidence/live-evaluation.json)
- [研究依据](documentation/research.md)

最终体验由 Rex 在 Dia 中验收；工程自测与真实模型质量分别记录。发布及商店上架由 Rex 决定。
