# Meaning Check 协作规则

- 本项目是 WXT + TypeScript 的 Manifest V3 浏览器插件。优先 Dia / X / Reddit，用户新增网页采用选中文字，范围见 documentation/product.md，不扩展成网站、回复机器人或通用翻译器。
- UI 工作先读 DESIGN.md；产品规则变更先同步 product.md，架构变更先同步 architecture.md，再实现。
- README 记录实际阶段；documentation/tests.md 区分已有测试、实际运行证据、待验证项。不能把模拟接口结果当成真实解读质量。
- 密钥仅通过本地 options 页输入并保存到受保护 storage.local，禁止源码、文档、环境示例、日志和测试真实凭据。内容脚本只能读取无密钥的公共配置，不能读密钥。
- 网页仅采集当前回复、直接父帖和原帖的公开文本或用户主动选区；临时页可用于定位祖先，额外文本不送模型。不能读取编辑框、私信、账号 cookies、个人简介或互动统计。
- 悬停不请求；付费请求不自动重试；不保存分析历史；不复制第三方插件发布包源码或资产。
- 验证命令：pnpm typecheck、pnpm test、pnpm build、pnpm test:e2e、pnpm check:package。有界面变化必须在加载真实插件的浏览器中验证，不用独立网页演示替代。
- 普通提交用具体中文描述，验证后同步到用户已授权的公开 GitHub 仓库。2026-10-14 Rex 明确授权公开开源同步和个人主页重点展示；若没有对应仓库，可为本项目建立公开远端。中文 README.md 与英文 README.en.md 同步维护。商店发布、合并 PR 和生产部署仍需单独授权。
- 界面文案在 shared/i18n.ts 维护，模型目录在 shared/models.ts 维护并同步 documentation/models.md；原创图标 SVG 为唯一形状来源。
