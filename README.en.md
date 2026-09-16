# dsh-cost-log

English | [简体中文](./README.md)

A DSH plugin that shows **the current conversation's token usage and estimated cost** beside the input box. Cost is computed from DeepSeek's official rate card by a durable Host-side session projection, so paging, context compaction, and history backfill never change the accumulated value. The browser only reads and renders the projection — no external requests.

<p align="center">
  <img src="./docs/assets/cost-badge-preview.jpg" alt="dsh-cost-log cost badge beside the message composer" width="972">
</p>

## Features

- Shows the current conversation's token usage and estimated cost beside the input box, updating as usage changes.
- Cost is kept in a Host-side **DSH Session Projection** (`costLog`), so paging, compaction, and history backfill never change it.
- Prices cache hits, cache misses, cache writes, and output separately, and picks the rate card by the request instant.
- **CNY / USD** switchable; the choice is written to the DSH user-settings document, so it persists on the Host and stays consistent across browsers.
- Covers the current DeepSeek official models (below); unrecognized third-party models are never guessed and are marked with `≈`.
- No API key access, no balance lookup, no external request; no build step and no extra daemon.

## Installation

`dsh plugin` installs through pnpm, so make sure pnpm is available first (Node ships corepack — run `corepack enable` once).

```bash
dsh plugin --profile web add github:Misaka15424/dsh-cost
```

**Restart the dsh web server** afterwards for the plugin to take effect.

> ⚠️ **Installation note**
>
> The same-named `dsh-cost-log` on the npm registry is the older upstream release (currently `1.0.0`, no
> longer maintained) and does not work on DSH 0.1.5+. The bare-name form
> `dsh plugin --profile web add dsh-cost-log` installs that one — use the GitHub source above instead.

### Uninstall

```bash
dsh plugin --profile web remove dsh-cost-log
```

## Usage

1. Open any conversation — the cost badge appears on the right side of the input box.
2. Hover it for input tokens, output tokens, flash cost, and pro cost.
3. Switch currency in **DSH Settings > General > Cost currency**, choosing CNY or USD (CNY by default).

Cost currency is the only user-adjustable setting.

## Pricing and supported models

The rate card is chosen by the **request instant**. Rates below are in USD; for CNY see the [Chinese README](./README.md).

Current rates (from 2026-09-10 04:00 UTC), USD per million tokens:

| Model | Cache hit | Cache miss | Output |
| --- | --- | --- | --- |
| `deepseek-flash` | off-peak $0.003 / peak $0.006 | off-peak $0.15 / peak $0.3 | off-peak $0.6 / peak $1.2 |
| `deepseek-v4-pro` | off-peak $0.022 / peak $0.044 | off-peak $0.66 / peak $1.32 | off-peak $1.98 / peak $3.96 |

- **Peak hours** are Beijing time **Monday through Friday** `9:00-12:00` and `14:00-18:00`; every other hour (including all weekend hours) is off-peak, at half the peak rate.
- **Historical requests are priced automatically**, no configuration needed: before `2026-08-17` the legacy flat table applies (Flash `$0.0028 / $0.14 / $0.28`, Pro `$0.003625 / $0.435 / $0.87`); from `2026-08-17` through `2026-09-10 03:59 UTC` the pre-cut peak/off-peak table applies (Flash off-peak `$0.007 / $0.22 / $0.66`, peak `$0.014 / $0.44 / $1.32`; Pro unchanged from the table above).
- **Supported models**: `deepseek-flash` (current official name) and `deepseek-v4-pro`, plus `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` — retired, but DeepSeek still routes them to V4.1-Flash and bills them at Flash rates. Only DSH's built-in `deepseek-official` provider is priced.

Pricing source: [official DeepSeek USD pricing](https://api-docs.deepseek.com/quick_start/pricing), last verified 2026-09-16; the exact instant of the price cut comes from the [DeepSeek-V4.1-Flash release announcement](https://api-docs.deepseek.com/news/news260910) (2026-09-10 04:00 UTC).

### Pricing basis

| Usage | Billing |
| --- | --- |
| Input (cache miss) | `inputTokens` at the input (cache miss) rate |
| Input (cache hit) | `cacheReadTokens` at the input (cache hit) rate |
| Cache write | `cacheWriteTokens`; DeepSeek does not quote this separately, billed as cache miss |
| Output | `outputTokens` at the output rate |

> The amount is a reference estimate based on provider-reported token usage, not an official DeepSeek bill. Usage for the same `turn/step` is de-duplicated by the projection replacement rules, which covers both the legacy `assistant/chunk` usage found in older logs and the current `assistant/message` usage.

## Compatibility

| dsh-cost-log | DSH |
| --- | --- |
| 1.0.1+ | 0.1.5 or later |

Adapted and verified against the DSH 0.1.5-rc.2 slot and projection contracts. The upstream `1.0.0` release does not work on DSH 0.1.5+.

## Upstream

This project is a maintained fork of [kami-mura/dsh-cost](https://github.com/kami-mura/dsh-cost). The upstream project is currently inactive; this fork updates the plugin for newer DSH versions and maintains current DeepSeek pricing data. The original MIT license and upstream attribution are preserved.

## Development

There is no build step — `lib/` is the artifact. For local development prefer a `link:` install: edit the checkout, then just restart dsh web.

```bash
npm install
dsh plugin --profile web add link:/path/to/dsh-cost
```

Run tests:

```bash
npm install
node --test tests/*.test.mjs
```

Implementation notes:

- `lib/index.js` (Host half): registers the DSH Session Projection key `costLog`, providing `stateSchema` and `wire.viewSchema` / `wire.view` to the registry; also registers the user-settings namespace `cost-log` (field `currency`).
- `lib/client.js` (client bundle): hand-written CJS bundle (`window.__ModuleLoader__.load`) registering two slots — `conversation.input.right` (the badge) and `settings.general.item` (the currency row) — and talking to DSH through `locale` and `settingsScope`. `cordis.patch.yml` is the patch that adds it to the profile layer stack.
- Runtime capabilities required (all built into DSH): Host `sessionProjections` and optionally `settings`; browser `slots`, `locale`, `settingsScope`, and the `react` platform module. The Host half also needs `@deepseek-ai/schemastery` and `zod`, pulled in by the install.
- Maintenance rule: whenever the rate card changes you **must** bump `costLogProjection.stateVersion`; otherwise existing sessions keep serving their cached totals at the old prices and only new steps pick up the new ones (`tests/contract.test.mjs` guards this). Keep the English and Chinese READMEs in sync for user-visible changes.

## License

[MIT](LICENSE)
