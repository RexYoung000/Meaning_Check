# Meaning Check

为 Rex 理解公开英文 X 回复的浏览器插件 POC，工程名 Meaning_Check。点击「帮我确认意思」，先读一句中文主解读，再看语气和原文依据。

## 当前阶段

已建档，尚未实现业务功能。产品边界已确认；真实 Dia / X 兼容性与 DeepSeek 解读质量待验证。此为浏览器插件，没有独立网站或业务服务器。

## 开发与加载

Node 24、pnpm 10。`pnpm install` 安装依赖，`pnpm dev` 开发，`pnpm build` 生成 `.output/chrome-mv3`。在 Dia 的扩展管理页开启开发者模式，选择「加载已解压的扩展程序」，载入该目录。

扩展工具栏按钮打开本地设置页。填写自己的 DeepSeek 密钥并保存；密钥只保存在当前浏览器的插件存储中。打开英文 X 回复页面，悬停或用键盘聚焦回复，点击「帮我确认意思」。

`pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`pnpm check:package` 为交付检查。检查结果以 [测试记录](documentation/tests.md) 为准。

## 文档入口

- [产品规则](documentation/product.md)
- [设计与交互](DESIGN.md)
- [架构、权限与配置](documentation/architecture.md)
- [测试与验收](documentation/tests.md)
- [研究依据](documentation/research.md)

最终体验由 Rex 在 Dia 中验收；工程自测与真实模型质量分别记录。发布及商店上架由 Rex 决定。
