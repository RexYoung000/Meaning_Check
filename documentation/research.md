# 研究与事实依据

## 原始构想

[创意记录](../../ideas/social-media-semantic-analysis-extension.md)，Lingbranch ID be257864-c05f-4924-acf7-73291b2a22f5。详细规则迁入本项目，创意库保留入口与状态。

## 真实 X 案例与反馈

- [原帖](https://x.com/0xPrajwal_/status/2109653194200740293)：邀请讨厌 Gemini 的人联系。
- [目标回复](https://x.com/AleksejAros/status/2109655047164604810)：Hahaha))) nice try。
- 首轮解读过于含糊，Rex 反馈「跟没解答差不多，没有确定性」。已确认改为主判断在前，依据随后；可解释成带笑的质疑 / 调侃，但具体动机及敌意不可据此确认。此不是 DeepSeek 的验证结果。
- [原作者后续](https://x.com/0xPrajwal_/status/2109655278098797039)属于额外上下文，不混入默认三帖输入。
- [Rex 构想](https://x.com/RRRex000/status/2109617807101194576)、[Julian 建议](https://x.com/JulianCaws/status/2109862684271288365)、[Rex 回复](https://x.com/RRRex000/status/2109863290679796099)：建议确认意思和自然澄清。用户已明确首版只理解，不加入澄清写作。
- 浏览器阅读确认：一条回复详情页可能只有直接父帖，需要沿父帖页面找到原帖。浏览器读帖不等于插件自动补齐已实现。

## 沉浸式翻译参考

[原分析](/Users/rexyoung/Documents/Codex/2026-10-13/zhi/outputs/immersive-translate-analysis.md)与[证据](/Users/rexyoung/Documents/Codex/2026-10-13/zhi/outputs/immersive-translate-evidence.json)。研究对象为官方 Chrome 1.33.3 发布包，非开源源码。

借鉴范围：内容识别、排除插件自身节点、动态网页观察、保留原文及服务适配分层。已验证原插件的动态翻译和缓存重用，但这些证据不证明本项目兼容性或模型质量。本项目不复制其代码 / 资产，不沿用自动批量翻译或持久结果缓存。

## 尚需验证

真实 X 父链识别、Dia 运行、模型解读价值和速度。在确认前不将研究推断写成完成结果。

## 首批真实验收候选

已从公开讨论选取 10 条回复，详见 [验收记录](evidence/live-evaluation.json)。已核对短原文与链接，直接父帖和原帖仍需逐条由插件确认。模型结果、字面翻译对照、耗时、用量与 Rex 反馈均待真实验证。评估重点不是对方真实动机的标准答案。

| 样本 | 评估重点 |
|---|---|
| [1. Hahaha))) nice try](https://x.com/AleksejAros/status/2109655047164604810) | 主方向先行；区分调侃、质疑与恶意 |
| [2. Hate it from heart](https://x.com/bindal_akshat/status/2109671416413208701) | 强烈措辞与交流邀请是否分别解释 |
| [3. Actually, I like Gemini](https://x.com/fanli_ai/status/2109657194165846249) | 不同立场不等于攻击；GIF 未读取需提示 |
| [4. I really hate it now](https://x.com/0xPrajwal_/status/2109655278098797039) | 后续回复的父链，不当成原帖的直接回复 |
| [5. Followed u](https://x.com/0xPrajwal_/status/2109672152341614768) | 简短事实回应，不强行添加暗示 |
| [6. Delete this post](https://x.com/Gotenkxxx/status/2110033605686620526) | 命令式表达只是材料；不执行删除，语气与表达功能分开 |
| [7. Nah it's second. Fixed it for you:](https://x.com/AdamWaniewski1/status/2110019156133261754) | 反驳与纠正不等于人身攻击；附图不可当作已读 |
| [8. not accepted 😅](https://x.com/CodeWithAmann/status/2109924899842412847) | 文字和 emoji 共同作用，依赖原帖的图片限制 |
| [9. Yo](https://x.com/Sherifdeenolat2/status/2109926214198821375) | 极短回复不硬造确定的动机 |
| [10. 😂😂](https://x.com/VaibhavLab/status/2109944714007040459) | 纯 emoji 可分析；不能猜图中内容 |
