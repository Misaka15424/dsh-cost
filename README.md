# dsh-cost-log

[English](./README.en.md) | 简体中文

DSH 原生插件：按 DeepSeek 官方价格表实时计算**当前对话花费**，金额徽标常驻输入框旁（模型选择器左侧）。花费由 Host 侧的 durable 会话投影计算，翻页、上下文压缩、历史补拉都不会改变累计值；浏览器只读投影并渲染，不发起任何外部请求。

<p align="center">
  <img src="./docs/assets/cost-badge-preview.jpg" alt="dsh-cost-log 输入框费用徽标演示" width="972">
</p>

## 安装

`dsh plugin` 通过 pnpm 安装依赖，请先确保 pnpm 可用（Node 自带 corepack，执行一次 `corepack enable` 即可）。

```bash
dsh plugin --profile web add github:Misaka15424/dsh-cost
```

安装后**重启 dsh web 服务**生效。

> **请用上面的 GitHub 源安装。** npm registry 上同名的 `dsh-cost-log@1.0.0` 是上游作者已停更的版本，在 DSH 0.1.x 下会失败（表现为徽标完全不出现）；用裸名 `dsh plugin --profile web add dsh-cost-log` 安装还会覆盖 profile 里的来源声明。

## 使用

1. 打开任意会话，输入框右侧（模型选择器左边）出现费用徽标。
2. 悬停可查看输入 tokens、输出 tokens、flash 花费、pro 花费。
3. 切换货币：**DSH 设置 > 通用 > 费用货币**，选择 CNY / USD（默认 CNY）。选择写入 DSH 用户设置文档，随 Host 持久、跨浏览器一致。

- 徽标随 token 用量自动更新，运行中带脉冲点。
- 金额四舍五入保留两位小数，不足 0.01 显示为 `<0.01`；含未计价模型时以 `≈` 标记。
- 提示文案与货币名跟随 DSH 语言（中文 / English），样式跟随明暗主题。
- 只对 DSH 内置 `deepseek-official` provider 的 DeepSeek 模型计价，不为第三方模型猜价。
- 不读 API Key、不查账户余额、不发起外部请求，也不需要数据库、代理或额外常驻服务。

## 卸载

```bash
dsh plugin --profile web remove dsh-cost-log
```

## 价格表

按**请求发生时刻**选择价格时代。下表为人民币报价，美元报价见 [English README](./README.en.md)。

现行价格（2026-09-10 04:00 UTC 起），人民币 / 百万 tokens：

| 模型 | 缓存命中 | 缓存未命中 | 输出 |
| --- | --- | --- | --- |
| `deepseek-flash` | 空闲 0.02 / 高峰 0.04 | 空闲 1 / 高峰 2 | 空闲 4 / 高峰 8 |
| `deepseek-v4-pro` | 空闲 0.15 / 高峰 0.30 | 空闲 4.5 / 高峰 9 | 空闲 13.5 / 高峰 27 |

- **高峰时段**：北京时间**周一至周五** `9:00-12:00`、`14:00-18:00`；其余时间（含周末全天）为空闲，空闲价为高峰价一半。
- **历史请求自动回溯**，无需设置：`2026-08-17` 之前用旧价格表（Flash `0.02 / 1 / 2`、Pro `0.025 / 3 / 6`，不分峰谷）；`2026-08-17` ~ `2026-09-10 03:59 UTC` 用 Flash 降价前的峰谷表（Flash 空闲 `0.05 / 1.5 / 4.5`、高峰 `0.10 / 3.0 / 9.0`，Pro 与现行相同）。
- **计价模型**：`deepseek-flash`（现行官方名）、`deepseek-v4-flash`、`deepseek-v4-flash-vision-exp`（后两者已下线，但官方仍将其路由到 V4.1-Flash 并按 Flash 价格计费）与 `deepseek-v4-pro`。

价格来源：[官方中文价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)，最后核验 2026-09-16；降价生效时刻取自 [DeepSeek-V4.1-Flash 发布公告](https://api-docs.deepseek.com/news/news260910)（2026-09-10 04:00 UTC）。

## 计价口径

| 用量 | 计费 |
| --- | --- |
| 缓存未命中输入 | `inputTokens`，按「输入（缓存未命中）」单价 |
| 缓存命中输入 | `cacheReadTokens`，按「输入（缓存命中）」单价 |
| 缓存写入 | `cacheWriteTokens`，DeepSeek 不单独报价，按缓存未命中计 |
| 输出 | `outputTokens`，按「输出」单价 |

> 金额是依据 provider 上报 token usage 的**参考估算**，不是 DeepSeek 官方账单。同一 `turn/step` 的用量会按投影替换规则去重，旧日志里的 `assistant/chunk` 与现行的 `assistant/message` 都适用，不会重复计费。

## 运行要求

DSH 0.1.5 及以上。所需能力均为 DSH 内置：Host 侧 `sessionProjections` 与 `settings`（可选）；Client 侧 `slots`、`locale`、`settingsScope`、`react` 平台模块，以及 `conversation.input.right`（`ui-conversation`）与 `settings.general.item`（`ui-settings-general`）两个插槽。Host 半体依赖 `@deepseek-ai/schemastery` 与 `zod`，安装时自动带出。

## 开发

本仓库无构建步骤，`lib/` 即产物。本地开发推荐用 `link:` 安装，改完代码只需重启 dsh web，无需任何安装或复制步骤：

```bash
npm install                                            # 仓库自身依赖（link: 安装必需）
dsh plugin --profile web add link:/path/to/dsh-cost
```

运行测试：

```bash
npm install
node --test tests/*.test.mjs
```

维护约定：调整价格表时**必须同时递增** `costLogProjection.stateVersion`，否则已有会话会沿用投影缓存里的旧价、只有新步骤用新价（`tests/contract.test.mjs` 有守护断言）。修改用户可见内容时，请同步更新中英文 README。

主要文件：`lib/index.js`（Host 半体：`costLog` 会话投影 + 计价 + `cost-log` 设置命名空间）、`lib/client.js`（Client bundle：徽标 + 货币设置行）、`cordis.patch.yml`（profile 层栈 patch）、`tests/`（价格、Host 契约、Client 契约）。

## License

[MIT](LICENSE)
