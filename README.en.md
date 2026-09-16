# dsh-cost-log

English | [简体中文](./README.md)

DSH native plugin: real-time current conversation cost based on DeepSeek pricing, displayed as a badge beside the input box (right side of the composer tool row, to the left of the model selector). Cost is computed by a durable Host session projection `costLog`, so paging, compaction, or history backfill never change the accumulated value. The browser only reads and renders the projection — no external requests.

<p align="center">
  <img src="./docs/assets/cost-badge-preview.jpg" alt="dsh-cost-log cost badge beside the message composer" width="972">
</p>

## Why dsh-cost-log?

**It is more than tokens multiplied by one static rate: it is a cost projection designed around official DeepSeek models and DSH session semantics. Version 1.0.0 is the stable release; future maintenance is limited to DeepSeek pricing changes and DSH compatibility.**

| Advantage | What it means |
| --- | --- |
| Durable conversation totals | Cost is computed in a Host-side durable session projection, not in the browser tab. Paging, context compaction, and history backfill do not change the accumulated value. |
| DeepSeek-specific pricing | Cache hits, cache misses, cache writes, and output are priced separately, with automatic selection by Flash / Pro, the pricing era the request instant falls in, Beijing peak hours (Monday to Friday), and CNY / USD. |
| No double counting or guessed rates | Usage for the same `turn/step` is de-duplicated by projection replacement rules. Unknown third-party models are marked as partially priced instead of receiving a potentially wrong fallback rate. |
| Privacy-first, zero extra deployment | No API key access, account-balance lookup, external request, database, proxy, or additional daemon is required. |
| Cost stays in the workflow | The badge remains beside the composer so the conversation total is visible before and after sending. Details open on demand and follow the DSH locale and light / dark theme. |

## Features

- Always-visible cost badge next to the input box; updates as token usage changes. Currency is configurable in DSH Settings > General > **Cost currency** (CNY / USD, default CNY); the choice is written to the DSH user-settings document, so it persists on the Host and stays consistent across browsers.
- Tooltip language follows the DSH system language (Chinese / English).
- Hovering over the cost icon shows only: input tokens, output tokens, flash cost, pro cost.
- All displayed costs are rounded to 2 decimal places; amounts below 0.01 are shown as `<0.01`.
- The rate card is selected by the request instant in three eras (CNY and USD are each taken from DeepSeek's own page):
  - **Before 2026-08-17**: legacy pricing, no peak/off-peak split.
  - **2026-08-17 through 2026-09-10 03:59 UTC**: peak/off-peak pricing (before the V4-Flash price cut).
    - `deepseek-v4-flash`: off-peak 0.05 / 1.5 / 4.5, peak 0.10 / 3.0 / 9.0 (CNY per million tokens)
    - `deepseek-v4-pro`: off-peak 0.15 / 4.5 / 13.5, peak 0.30 / 9.0 / 27.0 (CNY per million tokens)
  - **From 2026-09-10 04:00 UTC (current)**: peak/off-peak pricing after the V4.1-Flash price cut.
    - `deepseek-flash`: off-peak 0.02 / 1 / 4, peak 0.04 / 2 / 8 (CNY per million tokens)
    - `deepseek-v4-pro`: off-peak 0.15 / 4.5 / 13.5, peak 0.30 / 9.0 / 27.0 (CNY per million tokens)
- Official DeepSeek USD pricing (current era):
  - `deepseek-flash`: off-peak $0.003 / $0.15 / $0.6, peak $0.006 / $0.3 / $1.2 (USD per million tokens)
  - `deepseek-v4-pro`: off-peak $0.022 / $0.66 / $1.98, peak $0.044 / $1.32 / $3.96 (USD per million tokens)
- Each triple reads cache hit / cache miss / output; off-peak is half the peak rate.
- Peak hours are Beijing time **Monday through Friday** `9:00-12:00` and `14:00-18:00`; every other hour (including all weekend hours) is off-peak.
- Pricing is limited to DSH's built-in `deepseek-official` provider: `deepseek-flash` (the current official name) plus `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp`, which still route to V4.1-Flash and bill at Flash rates, and `deepseek-v4-pro`.
- Unrecognized third-party models are never guessed: the badge shows `≈` / `¥0+` (or `≈` / `$0+`).
- Styles use DSH WebUI design tokens (`--dsw-alias-*`) and follow light / dark themes.

Pricing sources: [official DeepSeek CNY pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) and [official DeepSeek USD pricing](https://api-docs.deepseek.com/quick_start/pricing), last verified 2026-09-16. The exact instant of the price cut comes from the [DeepSeek-V4.1-Flash release announcement](https://api-docs.deepseek.com/news/news260910) (2026-09-10 04:00 UTC).

## Pricing basis

| Usage | Billing |
| --- | --- |
| Input (cache miss) | `inputTokens`, billed as 1M input tokens (cache miss) |
| Input (cache hit) | `cacheReadTokens`, billed as 1M input tokens (cache hit) |
| Cache write | `cacheWriteTokens`; DeepSeek does not quote this separately, billed as cache miss |
| Output | `outputTokens`, billed as 1M output tokens |

> The amount is a reference estimate based on provider-reported token usage, not an official DeepSeek bill. Usage for the same `turn/step` is de-duplicated by the projection replacement rules (this covers both the legacy `assistant/chunk` usage found in older logs and the current `assistant/message` usage).

### Pre-effective pricing

Before the new pricing takes effect, the current official rates are used:

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

## Architecture

```
Browser (Client)                               DSH Host
┌──────────────────────────────┐  session    ┌──────────────────────────────┐
│ conversation.input.right      │  projection │ sessionProjections registry  │
│ cost badge beside input       │ ◄────────── │ costLog projection            │
│ useProjection('costLog')      │  durable    │  ├ request/header model       │
│ settings.general.item         │             │  └ assistant/message usage    │
│ currency row in General       │             │     (legacy assistant/chunk   │
│ React + hand-written bundle   │             │      usage still accepted)    │
│ locale + settingsScope        │  settings   │ cost by time x model x tier   │
└──────────────────────────────┘ ◄────────── │ outputs both CNY / USD        │
                                              │ settings namespace `cost-log` │
                                              └──────────────────────────────┘
```

- **Host** ([`lib/index.js`](lib/index.js)): registers the `sessionProjections` key `costLog` (`stateSchema` + `wire.viewSchema/view`) and outputs both CNY and USD cost; also registers the user-settings namespace `cost-log` (field `currency`).
- **Client** ([`lib/client.js`](lib/client.js)): hand-written CJS bundle (`window.__ModuleLoader__.load`) registering two list slots — the cost badge in `conversation.input.right` (reads `useProjection('costLog')`) and the currency row in `settings.general.item`; tooltips localize via the `locale` service, and both entries share one snapshot through `ctx.settingsScope.bind({ namespace: 'cost-log' })`.
- No external HTTP calls, no cookies, no database, no local server, no build step.

## Installation

From npm:

```bash
dsh plugin --profile web add dsh-cost-log
```

From GitHub:

```bash
dsh plugin --profile web add github:kami-mura/dsh-cost
```

Return to the terminal running DSH, press `Ctrl+C` to stop the old process, then start it again:

```bash
dsh web
```

### Updating

When installed from **npm or GitHub**, re-running the install command upgrades the plugin:

```bash
dsh plugin --profile web add dsh-cost-log
```

For **local source development, prefer `link:`** (pnpm creates a symlink that points straight at the
checkout): install once, then edits in the checkout are visible to the profile **immediately** — only a
dsh web restart is needed, with no install or copy step at all.

```bash
dsh plugin --profile web add link:/path/to/dsh-cost
```

The cost of `link:` is that dependencies resolve through the **checkout's real path**, so the checkout
itself needs `npm install` first.

With `file:` (a snapshot copy: pnpm copies the package into `node_modules`, and that copy is lazy while
the lockfile entry matches — a plain `pnpm install` or `pnpm install --force` only reports
`Already up to date`) you must delete the package directory first:

```powershell
cd $env:USERPROFILE\.dsh\profiles\web
Remove-Item node_modules\dsh-cost-log -Recurse -Force
pnpm install
```

> For a local-source install (`link:` / `file:`), do **not** update with the bare name:
> `dsh plugin --profile web add dsh-cost-log` resolves the bare name from the npm registry, installs
> that registry version, and **overwrites** the profile's `link:`/`file:` spec — cutting the profile off
> from your checkout.

Either way you must then **restart the dsh web server**: the Host half loads at process start and Host
hot reload is disabled in this profile (`id: hmr` is `disabled: true` in
`@deepseek-ai/dsh-base/cordis.patch.yml`); only client bundles use browser-side HMR.

Uninstall:

```bash
dsh plugin --profile web remove dsh-cost-log
```

> Requires DSH runtime capabilities: Host `sessionProjections` and `settings` (optional); Client `slots`, `locale`, `settingsScope`, the `react` platform module, and the `conversation.input.right` (`ui-conversation`) plus `settings.general.item` (`ui-settings-general`) slots. The Host half additionally needs `@deepseek-ai/schemastery` (settings schema) and `zod` (projection schemas).

## Quick start

1. Install the plugin and restart DSH Web.
2. Open any conversation.
3. The cost badge appears on the right side of the input box; hover to see token usage, click to view the flash / pro cost breakdown.

To switch currency, open DSH Settings > General and use the **Cost currency** row to choose CNY or USD (the badge and breakdown follow immediately).

## Files

| File | Description |
| --- | --- |
| `lib/index.js` | Host half (`costLog` session projection + peak/off-peak pricing + `cost-log` settings namespace) |
| `lib/client.js` | Client bundle (cost badge beside the input + currency row in General settings) |
| `cordis.patch.yml` | Bundle patch (mounts the Host half in the profile layer stack) |
| `package.json` | Package manifest (`dsh.bundle.patch` + `dsh.client.platform: "web"`) |
| `CHANGELOG.md` | Release history (DSH 0.1.5 compatibility notes and price eras) |
| `tests/pricing.test.mjs` | Pricing, model validation, boundary, and projection folding tests |
| `tests/contract.test.mjs` | Host contract tests (projection definition shape, schema round-trip, settings namespace) |
| `tests/client.test.mjs` | Client contract tests (slot kind rules, currency wiring, degradation) |

Run tests (install dependencies first — the Host half uses `@deepseek-ai/schemastery` and `zod`):

```bash
npm install
node --test tests/*.test.mjs
```

## Contributing

Version 1.0.0 is in stable maintenance. New features are out of scope; updates are limited to official DeepSeek pricing changes and DSH compatibility. Keep the English and Chinese README files in sync for user-visible changes.

Whenever the rate card changes you MUST bump `costLogProjection.stateVersion`; otherwise existing sessions keep serving their cached totals at the old prices and only new steps pick up the new ones. `tests/contract.test.mjs` guards this invariant.

## License

[MIT](LICENSE)
