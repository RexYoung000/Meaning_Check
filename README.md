# Meaning Check

开源的公开交流理解浏览器插件。使用自己的模型 API，点击「帮我确认意思」，先读主解读，再看语气和原文依据。MIT 许可。[English](README.en.md)。

## 当前版本

0.3.0 在回复原文下展开独立卡片，支持多条同时解读、排队、加载计时、收起与单条取消，并提供回复旁的插件设置入口。已实现图标与常驻按钮、工具栏、首次引导、中英界面、独立输出语言、九家模型厂商与自定义接口、网站 / 路径管理，以及 X / Reddit 回复和自定义网页选区入口。已有 DeepSeek 配置有迁移保护；保存与连接测试分别显示。

类型、逻辑检查、隔离浏览器中实际插件、构建和权限检查的结果见 [测试记录](documentation/tests.md)。网站和模型的自动化场景使用模拟数据。Dia 已重载并确认 0.3.0，设置入口与真实 X 的原位加载 / 缺上下文回退已核对；真实多条使用体验和厂商结果仍待验收。本轮没有真实模型调用，代理记录的真实推理为 0。

## 在 Dia 使用新版

1. 打开 Dia 的扩展管理页（地址栏输入 `chrome://extensions`），找到 Meaning Check，点击 Reload / 重新加载。确认版本 0.3.0；若此前未加载，开启开发者模式，加载本项目的 `.output/chrome-mv3`。
2. 从浏览器的扩展菜单找到 Meaning Check，支持时固定到工具栏。点击网页回复旁的「插件设置」，或工具栏图标 → 插件设置；浏览器 Details 是管理页面，其中 Extension options 也能打开真正的插件设置。首次安装 / 首次升级会打开一次使用指南，之后可从弹窗或设置再次打开。
3. 在「模型连接」新增自己的连接：厂商 → 完整模型名称 → API 密钥 → 保存。原有 DeepSeek 配置自动迁入。需要验证时点击「编辑 → 测试连接」，会进行一次可能收费的 API 调用。保存、悬停、切换型号及免费示例不进行推理。
4. 「语言」分别设置界面和解读语言。界面可随时切换 中文 / English；解读默认跟随浏览器完整语言，或选择简体中文、English、日语等 / 自填语言代码。改界面不会自动改解读语言。引用保留原文。
5. 刷新 X / Reddit 页面，点击公开回复下常驻的「帮我确认意思」。缺上下文时先选择补齐、现有内容分析或手动补充；可连续点击多条，每条在原文下方加载；最多同时处理两条，其余排队。滚动不会关闭；收起保留任务，关闭只取消这一条，暂停取消当前网站所有任务。

在「网站」可关闭、编辑、删除或新增 HTTPS 来源及路径（每行一条，* 通配，满足任意一条即可）。Reddit 默认含 www.reddit.com 和 reddit.com 两个来源项。新来源由浏览器按需授权；自定义网页先选中文字，点击入口确认可选背景，再分析，不读取整页、编辑框或私信。自定义 API 支持 HTTPS 或 localhost / 127.0.0.1 的 HTTP 地址。

图文、GIF 只覆盖文字；模型错误、无效依据或截断结果不展示为结论。没有业务服务器、分析历史、回复生成或自动发送。密钥仅保存在本浏览器扩展的可信存储，网页不能读取；更换接口地址需重新填写密钥。

## 开发与交付

Node 24、pnpm 10。`pnpm install` 安装，`pnpm dev` 开发，`pnpm build` 生成 `.output/chrome-mv3`，`pnpm zip` 生成 `.output/meaning-check-0.3.0-chrome.zip`。构建后重新加载扩展并刷新网页。图标维护源为 public/icon.svg，`pnpm icons` 生成四种 PNG；构建与打包自动复制根 LICENSE。

检查：`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:e2e`、`pnpm check:package`。首次测试运行 `pnpm exec playwright install chromium`；也可用 `MEANING_CHECK_CHROMIUM` 指定官方测试浏览器。测试只建立独立临时配置，不使用个人浏览器资料。

## 文档

- [产品规则](documentation/product.md)、[界面与交互](DESIGN.md)
- [模型、API ID 和官方来源](documentation/models.md)
- [架构、权限、密钥与迁移](documentation/architecture.md)
- [验证结果与待验收项](documentation/tests.md)
- [真实回复验收候选](documentation/evidence/live-evaluation.json)、[研究记录](documentation/research.md)

当前只保留本地源码与提交，没有远端或商店发布。最终视觉、使用体验及真实理解价值由 Rex 验收。
