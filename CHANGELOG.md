# 更新日志

本项目遵循语义化版本：功能不变、仅跟随 DeepSeek 官方价格变化或 DSH 接口变化时递增补丁号。

## 1.0.1

跟随 DSH 0.1.5 接口变更修复插件，并同步 DeepSeek 官方最新价格表。

### 修复：DSH 0.1.5 兼容性（插件此前整体失效）

- **客户端不再注册 `settings.plugin.item`。** 该插槽已由 list 槽改为按设置命名空间索引的
  **keyed** 槽，SlotCore 对缺少 `key` 的注册直接抛错
  （`keyed slot "settings.plugin.item" requires options.key`）。该异常沿 `apply` 抛出，
  导致**整个客户端插件加载失败**，连输入框旁的费用徽标一并消失。
  货币选择改落在 `settings.general.item`（设置 > 通用页），与官方主题/语言插件一致。
- **Host 投影改用现行契约** `{ key, stateSchema, init, apply, wire: { viewSchema, view }, stateVersion }`。
  旧写法把视图直挂顶层 `view`/`schema`，注册器因缺少 `wire` 把该单元当作 **host-only**，
  客户端 `useProjection('costLog')` 永远拿到 `undefined`，徽标渲染为 `null`。
- **schema 分工明确**：投影 schema 使用 `zod`（与 DSH 自带投影单元一致）；Host 设置命名空间
  `cost-log` 使用 `@deepseek-ai/schemastery`（`settings.register` 的要求）。
- **货币持久化迁移**：由浏览器 `localStorage` 改为 DSH 用户设置文档，徽标与设置行通过
  `ctx.settingsScope.bind({ namespace: 'cost-log' })` 共享同一份快照，跨浏览器一致；
  缺少 `settingsScope` 时优雅退化为只读默认货币。
- `assistant/chunk` 已不再是会话事件（用量只随 `assistant/message` 携带），该分支保留为
  **旧日志兼容**，现行路径不会命中。

### 价格表

- **新增第三段价格时代。** 价格按请求发生时刻取卡，不再一刀切换：
  - 2026-08-17 之前：旧价格表，不分峰谷；
  - 2026-08-17 ~ 2026-09-10 03:59 UTC：峰谷价格表（V4-Flash 降价前）；
  - 2026-09-10 04:00 UTC 起（现行）：V4.1-Flash 降价后的峰谷价格表。
- **Flash 降价**（官方 V4.1-Flash 发布公告，2026-09-10 04:00 UTC 生效）：
  空闲 `0.02 / 1 / 4`、高峰 `0.04 / 2 / 8`（元/百万 tokens）；
  美元空闲 `$0.003 / $0.15 / $0.6`、高峰 `$0.006 / $0.3 / $1.2`。
- **Pro 维持原价**：空闲 `0.15 / 4.5 / 13.5`、高峰 `0.30 / 9 / 27`（元/百万 tokens）。
  官方发布公告曾称 2026-09-14 起 `deepseek-v4-pro` 全部路由到 V4.1-Flash 并按 Flash 计费，
  但定价页脚注(2)与更新日志改口为「继续提供 V4 Pro，计费方式保持不变」，**该路由说法作废**，
  故不实现。
- **高峰时段加入工作日限制**：北京时间**周一至周五** `9:00-12:00`、`14:00-18:00`；
  其余时间（含周末全天）为空闲时段。
- **模型别名**：接受官方现行名 `deepseek-flash`；`deepseek-v4-flash` 与
  `deepseek-v4-flash-vision-exp` 已下线但仍被路由到 V4.1-Flash 并按 Flash 计费，一并接受。
- **`stateVersion` 2 → 3。** 价格表变化会改变同一事件的折叠结果，必须让持久化投影缓存
  （`(sessionId, key, ver, seq)`）失效并整体重折；否则旧会话会一直沿用旧价、只有新步骤用新价，
  总额自相矛盾。

### 测试

- 新增 `tests/contract.test.mjs`（10 项）：投影定义形状、状态与 wire 载荷的 JSON 往返、
  设置命名空间与 schema、`stateVersion` 递增守护。
- 重写 `tests/client.test.mjs`（9 项）：内置迷你 SlotCore 复刻 kind 规则（list 必须有 `id`、
  keyed 必须有 `key`），锁死本次的失败模式；校验货币接线与无 `settingsScope` 时的降级。
- `tests/pricing.test.mjs` 扩到 20 项：三段时代取价、降价生效点前后一秒、周末全天空闲、
  同一会话跨降价点分段计价、模型别名。

### 文档

- 两份 README 的价格表、设置入口、依赖说明与架构图同步更新。
- 新增本 CHANGELOG 与「调整价格表必须递增 `stateVersion`」的维护约定。

## 1.0.0

首个稳定版：`costLog` 会话投影（按模型与请求时刻折叠 provider token usage）+ 输入框旁费用徽标 +
CNY/USD 双币种 + 2026-08-17 起的峰谷价格表。
