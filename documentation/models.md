# 模型与接口清单

核对日期：2026-10-14。型号为官方当前目录的工程预置，不保证每个账号均开通。主界面使用全名，括号为 API ID；账号刷新与手填 ID 保留。此文件是预置和来源的维护依据。新增适配尚待本轮实现；真实厂商调用未完成验证。

| 厂商 | 默认及其他预置型号 | 官方来源 / 接口 |
|---|---|---|
| xAI | 默认 Grok 4.7 (grok-4.7)；Grok 4.6 (grok-4.6) | [模型](https://docs.x.ai/developers/models)；https://api.x.ai/v1 |
| OpenAI | 默认 GPT 6.1 Sol (gpt-6.1-sol)；GPT 6 Luna (gpt-6-luna)、GPT 6 Astra (gpt-6-astra) | [模型](https://developers.openai.com/api/docs/models/all)；https://api.openai.com/v1 |
| Anthropic | 默认 Claude Sonnet 5.5 (claude-sonnet-5-5)；Haiku 5.5、Opus 5.5、Fable 5.1 | [模型](https://platform.claude.com/docs/en/models/overview)；https://api.anthropic.com/v1/messages |
| Google | 默认 Gemini 3.8 Flash (gemini-3.8-flash)；Gemini 4 Argon、3.5 Flash Lite、3.1 Pro Preview | [模型](https://ai.google.dev/gemini-api/docs/models)、[兼容接口](https://ai.google.dev/gemini-api/docs/openai)；https://generativelanguage.googleapis.com/v1beta/openai |
| GLM | 默认 GLM 5.3 Flash (glm-5.3-flash)；GLM 5.3、5.3 FlashX | [模型](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash)；https://open.bigmodel.cn/api/paas/v4 |
| DeepSeek | 默认 DeepSeek V4.1 Flash (deepseek-flash)；DeepSeek V4 Pro (deepseek-v4-pro) | [价格 / 型号](https://api-docs.deepseek.com/quick_start/pricing/)、[更新](https://api-docs.deepseek.com/updates/)；https://api.deepseek.com |
| 千问 | 默认 Qwen 3.8 Flash (qwen3.8-flash)；Qwen 3.7 Plus、Qwen 3.8 Max | [模型](https://help.aliyun.com/zh/model-studio/models)、[兼容接口](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope) |
| Kimi | 默认 Kimi K3 (kimi-k3)；Kimi K2.6、K2.7 Code、K2.7 Code Highspeed | [模型](https://platform.kimi.com/docs/models)；https://api.moonshot.cn/v1 |
| MiniMax | 默认 MiniMax M3 (MiniMax-M3)；M2.7、M2.7 Highspeed、M3.1 Flash Preview | [中国](https://platform.minimax.cn/docs/guides/text-generation)、[海外](https://platform.minimax.io/docs/guides/text-generation)；https://api.minimax.cn/v1 或 https://api.minimax.io/v1 |

Claude 使用原生 Messages；其他预置使用官方 Chat Completions 兼容接口。自定义接口可选 Chat Completions、Responses、Messages。Claude Code 的 CLI / 登录 token 不作为 API 连接。

千问基础地址与地区 / 工作空间绑定；新地址为 https://{WorkspaceId}.{Region}.maas.aliyuncs.com/compatible-mode/v1，地区含 cn-beijing、us-east-1、ap-southeast-1、ap-northeast-1。旧版地区地址仍由官方支持，默认北京 https://dashscope.aliyuncs.com/compatible-mode/v1，海外可修改官方对应地址；不得用不同地区密钥混接。

GLM 普通平台 API 与仅限 Coding 的套餐可能不同。MiniMax M3.1 Flash Preview 需要 M Plan；预览型号明确标注、不设为默认。厂商型号目录刷新只列可返回的 API ID，不证明推理权限；不支持目录接口的连接继续使用预置及手填。

每个连接保留用户型号，不自动升级或切换。连接测试调用固定短解读示例且可能产生费用；真实验证最多 20 次推理（包含测试与重试）。本轮完成后在 tests.md 分别记录协议模拟覆盖和真实服务覆盖。
