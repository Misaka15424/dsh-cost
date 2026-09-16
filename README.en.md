# dsh-cost-log

English | [简体中文](./README.md)

DSH native plugin: real-time current conversation cost based on DeepSeek's official pricing, shown as a badge beside the input box (to the left of the model selector). Cost is computed by a durable Host session projection, so paging, context compaction, and history backfill never change the accumulated value. The browser only reads and renders the projection — no external requests.

<p align="center">
  <img src="./docs/assets/cost-badge-preview.jpg" alt="dsh-cost-log cost badge beside the message composer" width="972">
</p>

## Installation

`dsh plugin` installs through pnpm, so make sure pnpm is available first (Node ships corepack — run `corepack enable` once).

```bash
dsh plugin --profile web add github:Misaka15424/dsh-cost
```

**Restart the dsh web server** afterwards for the plugin to take effect.

> **Install from the GitHub source above.** The same-named `dsh-cost-log@1.0.0` on the npm registry is the upstream author's unmaintained release and fails on DSH 0.1.x (the badge never appears); installing by the bare name also overwrites the profile's source specifier.

## Usage

1. Open any conversation — the cost badge appears on the right side of the input box.
2. Hover it for input tokens, output tokens, flash cost, and pro cost.
3. To switch currency: **DSH Settings > General > Cost currency**, choose CNY / USD (CNY by default). The choice is written to the DSH user-settings document, so it persists on the Host and stays consistent across browsers.

## Updating and uninstalling

```bash
# Update: re-run the same install command, then restart dsh web
dsh plugin --profile web add github:Misaka15424/dsh-cost

# Uninstall
dsh plugin --profile web remove dsh-cost-log
```

## Features

- Badge stays beside the composer and updates as token usage changes; a pulse dot shows a running turn.
- Amounts are rounded to 2 decimals; below 0.01 shows `<0.01`; partially priced totals are marked with `≈`.
- Tooltip copy and currency names follow the DSH language (Chinese / English); styling follows the light / dark theme.
- Only DSH's built-in `deepseek-official` DeepSeek models are priced; third-party models are never guessed.
- No API key access, no balance lookup, no external request, and no database, proxy, or extra daemon.

## Rate card

The rate card is chosen by the **request instant**, with CNY and USD each taken from DeepSeek's own page.

Current rates (from 2026-09-10 04:00 UTC), CNY per million tokens:

| Model | Cache hit | Cache miss | Output |
| --- | --- | --- | --- |
| `deepseek-flash` | off-peak 0.02 / peak 0.04 | off-peak 1 / peak 2 | off-peak 4 / peak 8 |
| `deepseek-v4-pro` | off-peak 0.15 / peak 0.30 | off-peak 4.5 / peak 9 | off-peak 13.5 / peak 27 |

Current rates, USD per million tokens:

| Model | Cache hit | Cache miss | Output |
| --- | --- | --- | --- |
| `deepseek-flash` | off-peak $0.003 / peak $0.006 | off-peak $0.15 / peak $0.3 | off-peak $0.6 / peak $1.2 |
| `deepseek-v4-pro` | off-peak $0.022 / peak $0.044 | off-peak $0.66 / peak $1.32 | off-peak $1.98 / peak $3.96 |

- **Peak hours** are Beijing time **Monday through Friday** `9:00-12:00` and `14:00-18:00`; every other hour (including all weekend hours) is off-peak, at half the peak rate.
- **Historical requests are priced automatically**, no configuration needed: before `2026-08-17` the legacy flat table applies (Flash `0.02 / 1 / 2`, Pro `0.025 / 3 / 6`); from `2026-08-17` through `2026-09-10 03:59 UTC` the pre-cut peak/off-peak table applies (Flash off-peak `0.05 / 1.5 / 4.5`, peak `0.10 / 3.0 / 9.0`; Pro unchanged).
- **Priced models**: `deepseek-flash` (current official name), `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` (both retired but still routed by DeepSeek to V4.1-Flash and billed at Flash rates), and `deepseek-v4-pro`.

Pricing sources: [official DeepSeek CNY pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) / [official DeepSeek USD pricing](https://api-docs.deepseek.com/quick_start/pricing), last verified 2026-09-16; the exact instant of the price cut comes from the [DeepSeek-V4.1-Flash release announcement](https://api-docs.deepseek.com/news/news260910) (2026-09-10 04:00 UTC).

## Pricing basis

| Usage | Billing |
| --- | --- |
| Input (cache miss) | `inputTokens` at the input (cache miss) rate |
| Input (cache hit) | `cacheReadTokens` at the input (cache hit) rate |
| Cache write | `cacheWriteTokens`; DeepSeek does not quote this separately, billed as cache miss |
| Output | `outputTokens` at the output rate |

> The amount is a reference estimate based on provider-reported token usage, not an official DeepSeek bill. Usage for the same `turn/step` is de-duplicated by the projection replacement rules, which covers both the legacy `assistant/chunk` usage found in older logs and the current `assistant/message` usage.

## Requirements

DSH 0.1.5 or newer. Everything it needs is built into DSH: on the Host, `sessionProjections` and optionally `settings`; in the browser, `slots`, `locale`, `settingsScope`, the `react` platform module, and the `conversation.input.right` (`ui-conversation`) and `settings.general.item` (`ui-settings-general`) slots. The Host half additionally depends on `@deepseek-ai/schemastery` and `zod`, which the install pulls in automatically.

## Development

There is no build step — `lib/` is the artifact. For local development prefer a `link:` install: edit the checkout, then just restart dsh web, with no install or copy step:

```bash
npm install                                            # the checkout's own deps (required for link:)
dsh plugin --profile web add link:/path/to/dsh-cost
```

Run tests:

```bash
npm install
node --test tests/*.test.mjs
```

Maintenance rule: whenever the rate card changes you **must** bump `costLogProjection.stateVersion`; otherwise existing sessions keep serving their cached totals at the old prices and only new steps pick up the new ones (`tests/contract.test.mjs` guards this). Keep the English and Chinese README files in sync for user-visible changes.

Main files: `lib/index.js` (Host half: `costLog` session projection + pricing + the `cost-log` settings namespace), `lib/client.js` (client bundle: the badge and the currency row), `cordis.patch.yml` (profile layer patch), `tests/` (pricing, Host contract, client contract).

## License

[MIT](LICENSE)
