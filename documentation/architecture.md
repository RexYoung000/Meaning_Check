# 架构与数据边界

## 职责

保留 WXT 0.21.4、TypeScript 5.9.3、Manifest V3。内容脚本读取公开回复 / 用户选中文字并展示卡片；后台补齐上下文和调用模型；可信设置页管理连接、语言、网站及权限；工具栏弹窗显示状态和快捷开关；引导页提供安装及使用入口。没有业务服务器。

## 本地配置与迁移

ModelProfile 保存 id、名称、厂商、协议、基础地址、模型 ID 和测试状态；密钥仅放受保护的 storage.local。内容脚本只能接收不含密钥的公共设置、状态和解读结果。更改地址要求重新填写密钥，避免旧凭据被发送给新来源。关闭连接或切换模型不会自动推理。

旧 deepseekApiKey 在首次初始化迁入 DeepSeek V4.1 Flash 连接：先持久保存新结构，再移除旧项；迁移可重复运行，不覆盖已有配置。storage.local 设置 TRUSTED_CONTEXTS；页面请求按扩展 ID、来源、启用路径核验。模型测试及型号刷新仅允许可信扩展页面。

SiteConfig 保存来源 origin、路径列表与 enabled；多个路径为 OR，* 为通配。固定权限 storage、scripting、activeTab；默认 X / Reddit 和原有 DeepSeek 来源。其他站点 / API 使用可选 HTTPS 来源权限；自定义本地服务仅支持 HTTP loopback。动态注册自定义站点内容脚本，不预授予所有站点，不申请 cookies、tabs 或外部消息连接权限。

## 数据及模型接口

ContextBundle 保留 current / parent / root 引用、去重来源、缺项、警告和 thread / selection 模式；Post.origin 区分 x、reddit、web、manual。选中文字仅包含用户选区和可选手动背景，不能伪造自动父链。

统一分析入口接受 bundle、当前连接、输出语言及取消信号。官方预置除 Claude 使用原生 Messages 外，使用厂商官方 Chat Completions 兼容接口；自定义连接支持 Chat Completions、Responses、Messages。参数按协议和厂商发送，不能把 DeepSeek 专用字段发给所有服务。流式仅用于接收，校验通过后才展示结果，丢弃思考内容。

严格检查结束状态、JSON 契约、来源和原文引用；不自动重试。接口失败仅展示安全错误，不暴露响应中的凭据。帖子 URL 可用于回看，模型仅接收文本、角色和媒体限制，不接收浏览器 cookies 或个人配置。

## 生命周期

端口与心跳维持活动任务，任务结束停止；每次主动操作的端到端截止 60 秒，上下文补齐独立不超过 30 秒。等待用户补充时无活动计时。关闭、导航、目标变化、暂停站点或全局暂停均取消当前操作，最终清理插件自建临时页。

临时页以 token / 过期时间登记到 storage.session；后台重启清理归属明确的页，用户已导航的页保留。设置变更对下次模型请求生效，不重算现有结果。首次安装 / 首次升级引导使用本地版本标记，避免每次启动重复打开。

## 0.2 实现入口

shared/settings.ts 负责可信存储与迁移；shared/models.ts 为型号源，shared/i18n.ts 为界面文案源，shared/sites.ts 判定来源 / 路径及排除已知私信和编辑入口。ui/reader.ts 复用 X / Reddit 适配与卡片；selection.content.ts 按用户站点授权动态注册。后台对公开配置、可信设置命令和网页分析端口分别核验，不向网页返回密钥。

设置任务使用可信页面端口及心跳，离开页面取消连接测试 / 型号请求。网页任务维护显式取消函数，后台主动暂停不能仅断开端口；临时页清理同时检查 url 与 pendingUrl，避免加载中遗留空白页，也保留已开始用户导航的页。

UI 使用共享 page.css，每页只加载一次。根 LICENSE 为许可维护源，构建脚本生成 public/LICENSE.txt 并打入安装包；SVG 为图标形状源，PNG 通过 icons 脚本生成。接口路径、语言和型号更改先保存，下次点击分析才生效。
