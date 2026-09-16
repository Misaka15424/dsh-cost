# dsh-cost-log

[English](./README.en.md) | 简体中文

DSH 原生插件：按 DeepSeek 价格表实时计算**当前对话花费**，并把金额徽标放在**输入框旁边**（输入框卡片工具行右侧、模型选择器左侧）。金额由 Host 端的 durable 会话投影 `costLog` 计算，跟着会话日志走——翻页、上下文压缩、历史补拉都不会改变累计值；浏览器端只读投影并渲染，不发任何外部请求。

<p align="center">
  <img src="./docs/assets/cost-badge-preview.jpg" alt="dsh-cost-log 输入框费用徽标演示" width="972">
</p>

## 安装

```bash
dsh plugin --profile web add dsh-cost-log
```

安装后需**重启 dsh web 服务**生效。

### 更新

**从 npm / GitHub 安装**时，重新执行安装命令即可升级：

```bash
dsh plugin --profile web add dsh-cost-log
```

**本地源码开发推荐用 `link:`**（pnpm 会建一个直指仓库的软链）：装一次之后，改仓库里的代码**立即**生效于
profile，只需重启 dsh web，不再有任何安装或复制步骤。

```bash
dsh plugin --profile web add link:/path/to/dsh-cost
```

`link:` 的代价是依赖按**仓库真实路径**解析，因此仓库自身要先 `npm install`。

若用 `file:`（快照复制：pnpm 会把包拷进 `node_modules`，且副本在 lockfile 命中时是惰性的，裸
`pnpm install` 与 `pnpm install --force` 都只报 `Already up to date`），则必须**先删掉包目录再装**：

```powershell
cd $env:USERPROFILE\.dsh\profiles\web
Remove-Item node_modules\dsh-cost-log -Recurse -Force
pnpm install
```

> 本地源码安装（`link:` / `file:`）不要用**裸名**更新：`dsh plugin --profile web add dsh-cost-log`
> 会从 npm registry 解析裸名，装成 registry 上的版本并**覆盖** profile 里的 `link:`/`file:` 声明，
> 从而切断与仓库的关联。

无论哪种方式，更新后都必须**重启 dsh web 服务**：Host 半体在进程启动时加载，且本 profile 的 Host
热重载是关闭的（`@deepseek-ai/dsh-base/cordis.patch.yml` 中 `id: hmr` 为 `disabled: true`），
只有客户端 bundle 走浏览器端 HMR。

## 卸载

```bash
dsh plugin --profile web remove dsh-cost-log
```

## 为什么选择 dsh-cost-log？

**它不只是把 token 乘以一个固定单价，而是面向 DeepSeek 官方模型与 DSH 会话机制设计的成本投影。1.0.0 是稳定版，今后只维护 DeepSeek 价格变化与 DSH 兼容性。**

| 优势 | 具体表现 |
| --- | --- |
| 会话级持久累计 | 成本在 Host 的 durable session projection 中计算，不依赖浏览器标签页；翻页、上下文压缩和历史补拉都不会改变累计值。 |
| DeepSeek 专属计价 | 分开计算缓存命中、缓存未命中、缓存写入与输出，并按 Flash / Pro、请求发生时刻所属的价格时代、北京时间峰谷时段（周一至周五）与 CNY / USD 自动选价。 |
| 不重复，也不猜价 | 同一 `turn/step` 的 usage 按投影替换规则去重；遇到未知第三方模型只标记未完整计价，不套用可能错误的默认单价。 |
| 隐私优先，零额外部署 | 不读取 API Key、不查询账户余额、不发送外部请求，也不需要数据库、代理或额外常驻服务。 |
| 费用就在工作流里 | 徽标常驻输入框旁，发送前后都能看到会话总额；点击才展开明细，并自动跟随 DSH 的语言与明暗主题。 |

## 功能

- 输入框旁常驻金额徽标，token 用量变化时自动更新；货币可在 DSH 设置 > 通用 > **费用货币** 中选择（CNY / USD，默认 CNY），选择写入 DSH 用户设置文档，随 Host 持久并跨浏览器一致。
- 悬浮提示语言跟随 DSH 系统语言（中文 / English）。
- 悬停费用图标后只显示：输入 tokens、输出 tokens、flash 花费、pro 花费。
- 所有展示费用四舍五入保留两位小数；不足 0.01 时显示为 `<0.01`。
- 价格表按请求发生时刻分三段（人民币与美元各自独立取值）：
  - **2026-08-17 之前**：旧价格表，不分峰谷。
  - **2026-08-17 ~ 2026-09-10 03:59 UTC**：峰谷价格表（V4-Flash 降价前）。
    - `deepseek-v4-flash`：空闲 0.05 / 1.5 / 4.5，高峰 0.10 / 3.0 / 9.0（元/百万 tokens）
    - `deepseek-v4-pro`：空闲 0.15 / 4.5 / 13.5，高峰 0.30 / 9.0 / 27.0（元/百万 tokens）
  - **2026-09-10 04:00 UTC 起（现行）**：V4.1-Flash 降价后的峰谷价格表。
    - `deepseek-flash`：空闲 0.02 / 1 / 4，高峰 0.04 / 2 / 8（元/百万 tokens）
    - `deepseek-v4-pro`：空闲 0.15 / 4.5 / 13.5，高峰 0.30 / 9.0 / 27.0（元/百万 tokens）
- DeepSeek 官方美元价格表（现行档）：
  - `deepseek-flash`：空闲 $0.003 / $0.15 / $0.6，高峰 $0.006 / $0.3 / $1.2（美元/百万 tokens）
  - `deepseek-v4-pro`：空闲 $0.022 / $0.66 / $1.98，高峰 $0.044 / $1.32 / $3.96（美元/百万 tokens）
- 三段顺序为「缓存命中 / 缓存未命中 / 输出」；空闲价为高峰价一半。
- 高峰时段：北京时间**周一至周五** `9:00-12:00`、`14:00-18:00`；其余时间（含周末全天）为空闲时段。
- 只给 DSH 内置 `deepseek-official` provider 计价：`deepseek-flash`（现行官方名）以及仍被路由到 V4.1-Flash 并按 Flash 计费的 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp`，加上 `deepseek-v4-pro`。
- 未识别的第三方模型不猜价：徽标显示 `≈`/`¥0+` 或 `≈`/`$0+`。
- 样式使用 DSH WebUI 设计令牌（`--dsw-alias-*`），明暗主题自动跟随。

价格来源：[DeepSeek 官方中文价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)与[官方英文价格页](https://api-docs.deepseek.com/quick_start/pricing)，最后核验于 2026-09-16。降价的精确生效时刻取自 [DeepSeek-V4.1-Flash 发布公告](https://api-docs.deepseek.com/news/news260910)（2026-09-10 04:00 UTC）。

## 计价口径

| 用量 | 计费方式 |
| --- | --- |
| 缓存未命中输入 | `inputTokens`，按“百万 tokens 输入（缓存未命中）” |
| 缓存命中输入 | `cacheReadTokens`，按“百万 tokens 输入（缓存命中）” |
| 缓存写入 | `cacheWriteTokens`，DeepSeek 不单独报价，按缓存未命中计 |
| 输出 | `outputTokens`，按“百万 tokens 输出” |

> 金额是依据 provider 上报 token usage 的**参考估算**，不是 DeepSeek 官方账单。同一 `turn/step` 的用量会按 projection 替换规则去重（旧日志里的 `assistant/chunk` usage 与现行的 `assistant/message` usage 都适用），不会重复计费。

### 生效前价格表

新价格生效前使用官网当前价格：

```js
// lib/index.js
const LEGACY_RATES = {
  flash: { inputHit: 0.02, inputMiss: 1, output: 2 },
  pro:   { inputHit: 0.025, inputMiss: 3, output: 6 },
}

const LEGACY_RATES_USD = {
  flash: { inputHit: 0.0028, inputMiss: 0.14, output: 0.28 },
  pro:   { inputHit: 0.003625, inputMiss: 0.435, output: 0.87 },
}
```

## 架构

```
浏览器 (Client)                               DSH Host
┌──────────────────────────────┐  session    ┌──────────────────────────────┐
│ conversation.input.right      │  projection │ sessionProjections 注册表    │
│ 输入框工具行右侧费用徽标      │ ◄────────── │ costLog 投影                 │
│ useProjection('costLog')      │  durable    │  ├ request/header 记当前模型  │
│ settings.general.item         │             │  └ assistant/message usage   │
│ 通用设置里的费用货币行        │             │     (旧日志的 assistant/chunk │
│ React + 手写 bundle           │             │      usage 仍兼容)           │
│ locale + settingsScope        │  settings   │ 按时间 × 模型 × 峰谷计价      │
└──────────────────────────────┘ ◄────────── │ 同时输出 CNY / USD            │
                                              │ 设置命名空间 cost-log         │
                                              └──────────────────────────────┘
```

- **Host**（[`lib/index.js`](lib/index.js)）：注册 `sessionProjections` 投影键 `costLog`（`stateSchema` + `wire.viewSchema/view`），同时输出人民币与美元成本；并注册用户设置命名空间 `cost-log`（`currency` 字段）。
- **Client**（[`lib/client.js`](lib/client.js)）：手写 CJS bundle（`window.__ModuleLoader__.load`），注册两个 list 插槽——`conversation.input.right` 的费用徽标（由 `ui-conversation` 提供，就在输入框卡片内，读取 `useProjection('costLog')`）与 `settings.general.item` 的货币选择行（由 `ui-settings-general` 提供）；通过 `locale` 服务显示系统语言，货币经 `ctx.settingsScope.bind({ namespace: 'cost-log' })` 与设置行共享同一份快照。
- 无外部 HTTP 调用、无 Cookie、无数据库、无本地服务、无构建步骤。

## 安装说明

该包是标准的 dsh bundle（`dsh.bundle.patch`），`dsh plugin add` 会自动把它加入 profile 的层栈（`dsh.profile.bundles`），无需手改任何配置文件。

从 GitHub 安装：

```bash
dsh plugin --profile web add github:kami-mura/dsh-cost
```

> 依赖 DSH 运行时能力：Host `sessionProjections` 与 `settings`（可选）；Client `slots`、`locale`、`settingsScope`、`react` 平台模块，以及 `ui-conversation` 的 `conversation.input.right`、`ui-settings-general` 的 `settings.general.item` 插槽（DSH 内置）。Host 侧另需 `@deepseek-ai/schemastery`（设置 schema）与 `zod`（投影 schema）。

## 快速开始

1. 安装插件并重启 DSH Web。
2. 打开任意会话。
3. 输入框右侧会出现费用徽标；悬停可查看 token 用量，点击可查看 flash / pro 花费明细。

切换货币：打开 DSH 设置 > 通用，在 **费用货币** 一行选择 CNY 或 USD（徽标与明细立即跟随）。

## 文件

| 文件 | 说明 |
| --- | --- |
| `lib/index.js` | Host 半体（`costLog` 会话投影 + 峰谷计价 + `cost-log` 设置命名空间） |
| `lib/client.js` | Client bundle（输入框旁花费徽标 + 通用设置里的费用货币行） |
| `cordis.patch.yml` | 组合包 patch（安装后加入 profile 层栈） |
| `package.json` | 包声明（`dsh.bundle.patch` + `dsh.client.platform: "web"`） |
| `CHANGELOG.md` | 版本变更记录（含 DSH 0.1.5 兼容性说明与价格时代划分） |
| `tests/pricing.test.mjs` | 价格、模型核验、峰谷边界与投影折叠测试 |
| `tests/contract.test.mjs` | Host 契约测试（投影定义形状、schema 往返、设置命名空间） |
| `tests/client.test.mjs` | Client 契约测试（插槽 kind 规则、货币接线与降级） |

运行测试（先装依赖：Host 半体用到 `@deepseek-ai/schemastery` 与 `zod`）：

```bash
npm install
node --test tests/*.test.mjs
```

## 贡献

1.0.0 起进入稳定维护：不再增加功能，只在 DeepSeek 官方价格变化或 DSH 接口变化时更新。修改用户可见内容时，请同步更新英文与中文 README。

调整价格表时必须同时递增 `costLogProjection.stateVersion`，否则已有会话的投影缓存不会被丢弃，旧金额会一直沿用旧价、只有新步骤用新价。`tests/contract.test.mjs` 对此有守护断言。

## License

[MIT](LICENSE)
