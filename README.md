# dsh-cost-log

[English](./README.en.md) | 简体中文

DSH 插件：在输入框旁显示**当前对话的 Token 消耗与估算费用**。费用按 DeepSeek 官方价格表计算，由 Host 侧的 durable 会话投影保存——翻页、上下文压缩、历史补拉都不会改变累计值；浏览器只读投影并渲染，不发起任何外部请求。

<p align="center">
  <img src="./docs/assets/cost-badge-preview.jpg" alt="dsh-cost-log 输入框费用徽标演示" width="972">
</p>

## 功能

- 在输入框旁显示当前对话的 Token 消耗与估算费用，用量变化时自动更新。
- 费用由 Host 侧的 **DSH Session Projection**（`costLog`）保存，不随翻页、压缩或历史补拉变化。
- 分开计价缓存命中 / 缓存未命中 / 缓存写入 / 输出，并按请求发生时刻选择价格时代。
- 支持 **CNY / USD** 切换，选择写入 DSH 用户设置文档，随 Host 持久、跨浏览器一致。
- 支持当前 DeepSeek 官方模型（见下）；未识别的第三方模型不猜价，以 `≈` 标记。
- 不读 API Key、不查账户余额、不发起外部请求；无构建步骤、无额外常驻服务。

## 安装

`dsh plugin` 通过 pnpm 安装依赖，请先确保 pnpm 可用（Node 自带 corepack，执行一次 `corepack enable` 即可）。

```bash
dsh plugin --profile web add github:Misaka15424/dsh-cost
```

安装后**重启 dsh web 服务**生效。

> ⚠️ **安装提示**
>
> npm registry 上同名的 `dsh-cost-log` 是上游的旧版本（已停更，当前为 `1.0.0`），在 DSH 0.1.5+ 下不可用；
> 用裸名 `dsh plugin --profile web add dsh-cost-log` 会装到它。请使用上面的 GitHub 源。

### 卸载

```bash
dsh plugin --profile web remove dsh-cost-log
```

## 使用

1. 打开任意会话，输入框右侧（模型选择器左边）出现费用徽标。
2. 悬停徽标可查看输入 tokens、输出 tokens、flash 花费、pro 花费。
3. 切换货币：**DSH 设置 > 通用 > 费用货币**，选择 CNY / USD（默认 CNY）。

可调整的设置只有「费用货币」一项。

## 价格与支持模型

按**请求发生时刻**选择价格时代。下表为人民币报价，美元报价见 [English README](./README.en.md)。

现行价格（2026-09-10 04:00 UTC 起），人民币 / 百万 tokens：

| 模型 | 缓存命中 | 缓存未命中 | 输出 |
| --- | --- | --- | --- |
| `deepseek-flash` | 空闲 0.02 / 高峰 0.04 | 空闲 1 / 高峰 2 | 空闲 4 / 高峰 8 |
| `deepseek-v4-pro` | 空闲 0.15 / 高峰 0.30 | 空闲 4.5 / 高峰 9 | 空闲 13.5 / 高峰 27 |

- **高峰时段**：北京时间**周一至周五** `9:00-12:00`、`14:00-18:00`；其余时间（含周末全天）为空闲，空闲价为高峰价一半。
- **历史请求自动回溯**，无需设置：`2026-08-17` 之前用旧价格表（Flash `0.02 / 1 / 2`、Pro `0.025 / 3 / 6`，不分峰谷）；`2026-08-17` ~ `2026-09-10 03:59 UTC` 用 Flash 降价前的峰谷表（Flash 空闲 `0.05 / 1.5 / 4.5`、高峰 `0.10 / 3.0 / 9.0`，Pro 与现行相同）。
- **支持模型**：`deepseek-flash`（现行官方名）与 `deepseek-v4-pro`，以及已下线但仍被官方路由到 V4.1-Flash 并按 Flash 价格计费的 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp`。只对 DSH 内置 `deepseek-official` provider 计价。

价格来源：[官方中文价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)，最后核验 2026-09-16；降价生效时刻取自 [DeepSeek-V4.1-Flash 发布公告](https://api-docs.deepseek.com/news/news260910)（2026-09-10 04:00 UTC）。

### 计价口径

| 用量 | 计费 |
| --- | --- |
| 缓存未命中输入 | `inputTokens`，按「输入（缓存未命中）」单价 |
| 缓存命中输入 | `cacheReadTokens`，按「输入（缓存命中）」单价 |
| 缓存写入 | `cacheWriteTokens`，DeepSeek 不单独报价，按缓存未命中计 |
| 输出 | `outputTokens`，按「输出」单价 |

> 金额是依据 provider 上报 token usage 的**参考估算**，不是 DeepSeek 官方账单。同一 `turn/step` 的用量会按投影替换规则去重，旧日志里的 `assistant/chunk` 与现行的 `assistant/message` 都适用。

## 兼容性

| dsh-cost-log | DSH |
| --- | --- |
| 1.0.1+ | 0.1.5 及以上 |

针对 DSH 0.1.5-rc.2 的插槽与投影契约适配并验证。上游 `1.0.0` 不适用于 DSH 0.1.5+。

## 上游

本项目是 [kami-mura/dsh-cost](https://github.com/kami-mura/dsh-cost) 的维护分支。上游目前已停止维护；本分支负责适配新版 DSH，并持续跟进 DeepSeek 官方价格。原始 MIT 许可证与上游署名均予保留。

## 开发

本仓库无构建步骤，`lib/` 即产物。本地开发推荐 `link:` 安装，改完代码只需重启 dsh web：

```bash
npm install
dsh plugin --profile web add link:/path/to/dsh-cost
```

测试：

```bash
npm install
node --test tests/*.test.mjs
```

实现要点：

- `lib/index.js`（Host 半体）：注册 DSH Session Projection 键 `costLog`，向 registry 提供 `stateSchema` 与 `wire.viewSchema` / `wire.view`；同时注册用户设置命名空间 `cost-log`（`currency` 字段）。
- `lib/client.js`（Client bundle）：手写 CJS bundle（`window.__ModuleLoader__.load`），注册 `conversation.input.right`（徽标）与 `settings.general.item`（货币行）两个插槽，经 `locale` 与 `settingsScope` 与 DSH 交互。`cordis.patch.yml` 是把它加入 profile 层栈的 patch。
- 运行所需能力（均为 DSH 内置）：Host `sessionProjections`、`settings`（可选）；Client `slots`、`locale`、`settingsScope`、`react` 平台模块。Host 侧另需 `@deepseek-ai/schemastery` 与 `zod`，安装时自动带出。
- 维护约定：调整价格表时**必须同时递增** `costLogProjection.stateVersion`，否则已有会话会沿用缓存里的旧价、只有新步骤用新价（`tests/contract.test.mjs` 有守护断言）。修改用户可见内容时请同步更新中英文 README。

## License

[MIT](LICENSE)
