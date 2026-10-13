# 架构

## 组成

WXT 0.21.4、TypeScript 5.9.3、Manifest V3，srcDir 为 src。内容脚本识别 X 帖子并在 Shadow Root 中展示 UI；后台管理上下文与模型任务；options 页管理本地密钥。没有业务服务器、账号系统、定时任务、历史库、遥测或邮件。

## 数据流与接口

点击 → 建立任务连接 → 检查配置 → 获取当前 / 父帖 / 原帖 → 必要时后台临时 X 页补齐 → 缺失时等待用户选择 → 模型 → 校验 → 展示。

ContextBundle 包含 current / parent / root 角色、按 ID 去重的帖子（文本、URL、媒体及完整性提示）、缺失角色、明确标为用户补充的材料。只送这三种角色，不送遍历中间帖、个人资料、编辑框或统计。

InterpretationResult 包含 summary、tone、function、1–2 条 evidence（sourceId、短 quote、解释）、可选 uncertainty 和 ready / needs_context。运行时验证来源与引用，无效或截断输出为失败；显示采用 textContent，不执行模型 HTML。帖子是数据，不可改变系统指令，模型无工具权限。

## X 上下文

读取正文时排除本插件节点和已识别的沉浸式翻译译文节点，保留英文原文作为引用依据；不修改第三方插件状态。Chrome 消息采用兼容的回调响应，取消信号在任务结束后解绑。

等待详情页的帖子加载标识消失，再使用明确父链接或已加载祖先链；初始只有焦点帖的页面不能提前判为原帖。不将首页的相邻帖子、引用帖或回复列表当作父链。无法可靠定位时为缺失。按需开 active:false 临时标签页，复用当前登录但不读取 cookie；最多 10 层 / 30 秒，成功、取消、失败、后台重启均清理。仅 session 存任务 ID、临时页 ID 与期限，不持久化帖子或结果。

## Provider 与配置

POST https://api.deepseek.com/chat/completions，model deepseek-flash；thinking enabled、reasoning_effort low、stream true、response_format json_object、max_tokens 4096。提示词明确 JSON 契约。响应头 25 秒 / 全程 60 秒；活动任务连接每 15 秒心跳防止后台空闲，停止任务立即停止心跳。后台重启不重放付费请求。

密钥只在 storage.local，启动即 setAccessLevel TRUSTED_CONTEXTS，限制成功前不得读写密钥。options 不显示保存值；内容脚本只能询问配置状态。没有 storage.sync。仅 storage 权限和 https://x.com/*、https://api.deepseek.com/* 主机范围；工具栏 action 打开 options。不添加 all_urls、cookies 或通用 tabs 权限。

## 故障

缺密钥引导设置；缺上下文等待用户选择；超限要求缩减；无效 JSON、证据不匹配、HTTP 错误、超时不展示结论。只提供用户主动重试。关闭 / 导航 / 切换对象断开连接并取消请求，不回放旧结果。结果与待补充内容仅保留在当前页面内存；后台空闲断开不清除卡片，用户下一次主动操作时重连并重新校验当前材料，不自动重发。临时页先登记，再导航到 X。

## 依据与相关文档

- [WXT 结构](https://wxt.dev/guide/essentials/project-structure)、[隔离 UI](https://wxt.dev/guide/essentials/content-scripts.html)
- [Chrome 存储](https://developer.chrome.com/docs/extensions/reference/api/storage)、[后台生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [DeepSeek 接口](https://api-docs.deepseek.com/api/create-chat-completion/)
- [产品规则](product.md)、[设计](../DESIGN.md)、[测试](tests.md)、[研究](research.md)、[入口](../README.md)、[协作规则](../AGENTS.md)

以上能力已有实现，自动化证据见 tests.md。X 祖先关联依赖两套 DOM 适配：现代 data-timeline-entry 与经典 primaryColumn / tweet。无法确认的关联不猜测；实际 Dia / X 适配仍待完成运行验证。
