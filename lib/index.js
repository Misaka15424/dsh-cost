// dsh-cost-log —— Host 半体（纯手写 ESM，无构建步骤）
//
// 注册会话投影键 `costLog`：把 durable session log 中每一步的
// provider token usage（现行 DSH 只随 assistant/message 携带，事件注释明确
// "there is no separate usage record"；旧日志里的 assistant/chunk 仍被兼容）
// 按模型与请求发生时间折叠成人民币花费。投影是 durable 的，翻页、压缩、
// 历史补拉都不会改变总额；同一步被重复上报时按 (turn, step) 替换而非累加，
// 因此重放不会重复计费。
//
// 价格表（三段时代，按请求发生时刻取价）：
// - 2026-08-17 00:00（北京时间）之前：旧价格表，不分峰谷。
// - 2026-08-17 00:00 起：峰谷价格表，空闲价为高峰价一半。
// - 2026-09-10 04:00 UTC 起：V4.1-Flash 上线降价后的峰谷价格表。
//   高峰：北京时间周一至周五 9:00-12:00、14:00-18:00；其余（含周末）为空闲时段。
// - 输入缓存写入（cacheWriteTokens）DeepSeek 不单独报价，按缓存未命中计。
// - 未识别模型不猜测价格：对应用量计入 unpricedTokens，客户端标“≈”。
//
// 价格来源：https://api-docs.deepseek.com/zh-cn/quick_start/pricing
// 生效时刻来源：DeepSeek-V4.1-Flash 发布公告（2026-08-13 / 2026-09-10 更新日志）。
// Pro 在 2026-09-10 之后「计费方式保持不变」（定价页脚注(2)）；公告中曾提及
// 9/14 起 v4-pro 改按 Flash 计费，但被该脚注与更新日志推翻，故不实现。
//
// 旧价格表（2026-08-17 之前）：
//   deepseek-v4-flash: 命中 0.02 / 未命中 1 / 输出 2（元/百万 tokens）
//   deepseek-v4-pro:   命中 0.025 / 未命中 3 / 输出 6（元/百万 tokens）
//
// 另注册 Host 用户设置命名空间 `cost-log`（字段 `currency`）：徽标与设置行
// 共用它作为唯一真源，选择随设置文档持久（旧版存在浏览器 localStorage，
// 已迁移到 Host 设置）。设置行由客户端半体落在 settings.general.item。

import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'

const KEY = 'costLog'
const MILLION = 1_000_000
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/** 本插件拥有的 Host 用户设置命名空间（须匹配 /^[a-z][a-z0-9-]*$/）。 */
export const SETTINGS_NAMESPACE = 'cost-log'
/** 命名空间内承载计价货币的字段。 */
export const CURRENCY_FIELD = 'currency'
/** 受支持的计价货币。 */
export const CURRENCIES = ['CNY', 'USD']
/** 未显式选择时的默认货币。 */
export const DEFAULT_CURRENCY = 'CNY'

/** Host 侧持久 schema；同时是浏览器 scope 校验 wire 的依据。 */
export const CostLogSettingsSchema = z.object({
  [CURRENCY_FIELD]: z.union([...CURRENCIES]).default(DEFAULT_CURRENCY),
})

/** 峰谷价格表生效时刻：2026-08-17 00:00 北京时间 = 2026-08-16 16:00 UTC。 */
export const EFFECTIVE_AT_MS = Date.UTC(2026, 7, 16, 16, 0, 0)

/** V4.1-Flash 降价生效时刻：2026-09-10 04:00 UTC（发布公告明确给出的时刻）。 */
export const EFFECTIVE_AT_MS_2 = Date.UTC(2026, 8, 10, 4, 0, 0)

/** 2026-08-17 之前的旧价格表，不分峰谷（元/百万 tokens）。 */
const LEGACY_RATES = Object.freeze({
  flash: Object.freeze({ inputHit: 0.02, inputMiss: 1, output: 2 }),
  pro: Object.freeze({ inputHit: 0.025, inputMiss: 3, output: 6 }),
})

/** Pro 在两次调价之间未变，两个峰谷时代共用同一张卡。 */
const PRO_RATES = Object.freeze({
  offpeak: Object.freeze({ inputHit: 0.15, inputMiss: 4.5, output: 13.5 }),
  peak: Object.freeze({ inputHit: 0.3, inputMiss: 9, output: 27 }),
})

/** Flash 的 2026-08-17 ~ 2026-09-10 价卡（降价前）。 */
const INTERIM_FLASH_RATES = Object.freeze({
  offpeak: Object.freeze({ inputHit: 0.05, inputMiss: 1.5, output: 4.5 }),
  peak: Object.freeze({ inputHit: 0.1, inputMiss: 3, output: 9 }),
})

/** Flash 的 2026-09-10 起价卡（V4.1-Flash 降价后）。 */
const FLASH_RATES = Object.freeze({
  offpeak: Object.freeze({ inputHit: 0.02, inputMiss: 1, output: 4 }),
  peak: Object.freeze({ inputHit: 0.04, inputMiss: 2, output: 8 }),
})

/** 2026-08-17 ~ 2026-09-10 的峰谷价格表。 */
const INTERIM_RATES = Object.freeze({ flash: INTERIM_FLASH_RATES, pro: PRO_RATES })

/** 2026-09-10 起的峰谷价格表（当前价）。 */
const NEW_RATES = Object.freeze({ flash: FLASH_RATES, pro: PRO_RATES })

/** 2026-08-17 之前的旧价格表（美元/百万 tokens），不分峰谷。 */
const LEGACY_RATES_USD = Object.freeze({
  flash: Object.freeze({ inputHit: 0.0028, inputMiss: 0.14, output: 0.28 }),
  pro: Object.freeze({ inputHit: 0.003625, inputMiss: 0.435, output: 0.87 }),
})

/** Pro 的美元价卡，两次调价之间未变。 */
const PRO_RATES_USD = Object.freeze({
  offpeak: Object.freeze({ inputHit: 0.022, inputMiss: 0.66, output: 1.98 }),
  peak: Object.freeze({ inputHit: 0.044, inputMiss: 1.32, output: 3.96 }),
})

/** Flash 的 2026-08-17 ~ 2026-09-10 美元价卡（降价前）。 */
const INTERIM_FLASH_RATES_USD = Object.freeze({
  offpeak: Object.freeze({ inputHit: 0.007, inputMiss: 0.22, output: 0.66 }),
  peak: Object.freeze({ inputHit: 0.014, inputMiss: 0.44, output: 1.32 }),
})

/** Flash 的 2026-09-10 起美元价卡（V4.1-Flash 降价后）。 */
const FLASH_RATES_USD = Object.freeze({
  offpeak: Object.freeze({ inputHit: 0.003, inputMiss: 0.15, output: 0.6 }),
  peak: Object.freeze({ inputHit: 0.006, inputMiss: 0.3, output: 1.2 }),
})

/** 2026-08-17 ~ 2026-09-10 的美元峰谷价格表。 */
const INTERIM_RATES_USD = Object.freeze({ flash: INTERIM_FLASH_RATES_USD, pro: PRO_RATES_USD })

/** 2026-09-10 起的美元峰谷价格表（当前价）。 */
const NEW_RATES_USD = Object.freeze({ flash: FLASH_RATES_USD, pro: PRO_RATES_USD })

export const OFFICIAL_PROVIDER = 'deepseek-official'

/**
 * 官方 Flash 档的模型 id。`deepseek-flash` 是 2026-09-10 起的正式名；
 * `deepseek-v4-flash` 与 `deepseek-v4-flash-vision-exp` 已下线但仍被路由到
 * V4.1-Flash 并按 Flash 价格计费（定价页脚注(1)）。
 */
const FLASH_MODEL_IDS = Object.freeze([
  'deepseek-flash',
  'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp',
])

/** 模型 id → 价格档。只接受 DeepSeek 官方 API 的 Flash / Pro 模型 id。 */
export function familyOf(model) {
  const id = String(model ?? '').trim().toLowerCase()
  if (id === 'deepseek-v4-pro') return 'pro'
  if (FLASH_MODEL_IDS.includes(id)) return 'flash'
  return null
}

/** 只有 DSH 内置 DeepSeek 官方 provider 的正式模型才可计价。 */
export function isOfficialDeepSeekModel(provider, model) {
  return String(provider ?? '').trim().toLowerCase() === OFFICIAL_PROVIDER
    && familyOf(model) !== null
}

/**
 * 是否处于高峰时段。高峰为北京时间周一至周五 [9:00,12:00) 与 [14:00,18:00)；
 * 其余时间（含周六周日全天）为空闲时段。
 */
export function isPeakAt(ms) {
  const shifted = new Date(ms + BEIJING_OFFSET_MS)
  const weekday = shifted.getUTCDay() // 0 = 周日、6 = 周六
  if (weekday === 0 || weekday === 6) return false
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  return (minutes >= 9 * 60 && minutes < 12 * 60)
    || (minutes >= 14 * 60 && minutes < 18 * 60)
}

/**
 * 某一时刻、某一模型的计价点。按请求时刻落在哪个价格时代取价卡。
 * @returns {null | { mode: 'legacy' | 'offpeak' | 'peak', inputHit: number, inputMiss: number, output: number }}
 */
export function pricePointAt(model, time, currency = 'CNY') {
  const family = familyOf(model)
  if (family === null) return null
  const at = Number.isFinite(time) ? time : Date.now()
  const usd = currency === 'USD'
  if (at < EFFECTIVE_AT_MS) {
    const rates = usd ? LEGACY_RATES_USD[family] : LEGACY_RATES[family]
    return { mode: 'legacy', ...rates }
  }
  const peak = isPeakAt(at)
  const table = at < EFFECTIVE_AT_MS_2
    ? (usd ? INTERIM_RATES_USD : INTERIM_RATES)
    : (usd ? NEW_RATES_USD : NEW_RATES)
  const tier = peak ? table[family].peak : table[family].offpeak
  return { mode: peak ? 'peak' : 'offpeak', ...tier }
}

/** 某一时刻、某一模型的美元计价点。 */
export function usdPricePointAt(model, time) {
  return pricePointAt(model, time, 'USD')
}

/** 把浮点金额固定到 1e-10，避免二进制浮点尾巴。 */
export function roundCost(value) {
  return Math.round(value * 1e10) / 1e10
}

function finiteNonNegative(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function usageBuckets(usage) {
  return {
    inputTokens: finiteNonNegative(usage?.inputTokens),
    outputTokens: finiteNonNegative(usage?.outputTokens),
    cacheReadTokens: finiteNonNegative(usage?.cacheReadTokens),
    cacheWriteTokens: finiteNonNegative(usage?.cacheWriteTokens),
  }
}

function bucketsEqual(left, right) {
  return left.inputTokens === right.inputTokens
    && left.outputTokens === right.outputTokens
    && left.cacheReadTokens === right.cacheReadTokens
    && left.cacheWriteTokens === right.cacheWriteTokens
}

/** 缓存未命中 = 未缓存输入 + 缓存写入（DeepSeek 不单独报 write）。 */
function missTokens(buckets) {
  return buckets.inputTokens + buckets.cacheWriteTokens
}

function bucketTotal(buckets) {
  return buckets.inputTokens + buckets.outputTokens
    + buckets.cacheReadTokens + buckets.cacheWriteTokens
}

function costFor(buckets, rate) {
  return (missTokens(buckets) * rate.inputMiss
    + buckets.cacheReadTokens * rate.inputHit
    + buckets.outputTokens * rate.output) / MILLION
}

function zeroTotal() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0,
    costUsd: 0,
    unpricedTokens: 0,
  }
}

function init() {
  return {
    total: zeroTotal(),
    byModel: {},
    samples: {},
    steps: {},
    lastKey: null,
    header: null,
  }
}

/** 把一步 usage 按 sign 加减进 byModel 聚合；返回新的 byModel。 */
function shiftModel(byModel, provider, model, buckets, sign, rate, rateUsd) {
  const providerName = String(provider ?? '') || 'unknown'
  const modelName = String(model ?? '') || 'unknown'
  const key = `${providerName}\u0000${modelName}`
  const old = byModel[key]
  const next = old === undefined
    ? {
      provider: providerName,
      model: modelName,
      inputTokens: buckets.inputTokens * sign,
      outputTokens: buckets.outputTokens * sign,
      cacheReadTokens: buckets.cacheReadTokens * sign,
      cacheWriteTokens: buckets.cacheWriteTokens * sign,
      cost: 0,
      costUsd: 0,
      priced: rate !== null,
    }
    : {
      provider: old.provider,
      model: old.model,
      inputTokens: old.inputTokens + buckets.inputTokens * sign,
      outputTokens: old.outputTokens + buckets.outputTokens * sign,
      cacheReadTokens: old.cacheReadTokens + buckets.cacheReadTokens * sign,
      cacheWriteTokens: old.cacheWriteTokens + buckets.cacheWriteTokens * sign,
      cost: old.cost,
      costUsd: old.costUsd,
      priced: old.priced,
    }

  if (rate === null) {
    next.priced = false
  } else {
    next.cost = roundCost((old?.cost ?? 0) + costFor(buckets, rate) * sign)
    next.costUsd = roundCost((old?.costUsd ?? 0) + costFor(buckets, rateUsd) * sign)
    next.priced = true
  }

  // 删除减到零的模型行，保持 state 与 view 干净。
  const empty = next.inputTokens === 0
    && next.outputTokens === 0
    && next.cacheReadTokens === 0
    && next.cacheWriteTokens === 0
    && next.cost === 0
    && next.costUsd === 0
  if (empty) {
    if (old === undefined) return byModel
    const copy = { ...byModel }
    delete copy[key]
    return copy
  }
  return { ...byModel, [key]: next }
}

function foldUsage(state, sample) {
  const buckets = usageBuckets(sample.usage)
  const key = `${sample.turn}:${sample.step}`
  const prev = state.samples[key] ?? null

  // usage chunk 与 assistant/message 重复报同一步且完全相同：不重复计。
  if (prev !== null
    && prev.provider === sample.provider
    && prev.model === sample.model
    && bucketsEqual(prev.buckets, buckets)) {
    return state
  }

  let total = state.total
  let byModel = state.byModel

  if (prev !== null) {
    const prevOfficial = isOfficialDeepSeekModel(prev.provider, prev.model)
    const prevRate = prevOfficial ? pricePointAt(prev.model, prev.time) : null
    const prevRateUsd = prevOfficial ? usdPricePointAt(prev.model, prev.time) : null
    const prevCost = prevRate === null ? 0 : costFor(prev.buckets, prevRate)
    const prevCostUsd = prevRateUsd === null ? 0 : costFor(prev.buckets, prevRateUsd)
    const prevUnpriced = prevRate === null ? bucketTotal(prev.buckets) : 0
    total = {
      ...total,
      inputTokens: total.inputTokens - prev.buckets.inputTokens,
      outputTokens: total.outputTokens - prev.buckets.outputTokens,
      cacheReadTokens: total.cacheReadTokens - prev.buckets.cacheReadTokens,
      cacheWriteTokens: total.cacheWriteTokens - prev.buckets.cacheWriteTokens,
      cost: roundCost(total.cost - prevCost),
      costUsd: roundCost(total.costUsd - prevCostUsd),
      unpricedTokens: total.unpricedTokens - prevUnpriced,
    }
    byModel = shiftModel(byModel, prev.provider, prev.model, prev.buckets, -1, prevRate, prevRateUsd)
  }

  const official = isOfficialDeepSeekModel(sample.provider, sample.model)
  const rate = official ? pricePointAt(sample.model, sample.time) : null
  const rateUsd = official ? usdPricePointAt(sample.model, sample.time) : null
  const sampleCost = rate === null ? 0 : costFor(buckets, rate)
  const sampleCostUsd = rateUsd === null ? 0 : costFor(buckets, rateUsd)
  const sampleUnpriced = rate === null ? bucketTotal(buckets) : 0
  total = {
    ...total,
    inputTokens: total.inputTokens + buckets.inputTokens,
    outputTokens: total.outputTokens + buckets.outputTokens,
    cacheReadTokens: total.cacheReadTokens + buckets.cacheReadTokens,
    cacheWriteTokens: total.cacheWriteTokens + buckets.cacheWriteTokens,
    cost: roundCost(total.cost + sampleCost),
    costUsd: roundCost(total.costUsd + sampleCostUsd),
    unpricedTokens: total.unpricedTokens + sampleUnpriced,
  }
  byModel = shiftModel(byModel, sample.provider, sample.model, buckets, 1, rate, rateUsd)

  return {
    ...state,
    total,
    byModel,
    samples: {
      ...state.samples,
      [key]: {
        turn: sample.turn,
        step: sample.step,
        provider: String(sample.provider ?? '') || 'unknown',
        model: String(sample.model ?? '') || 'unknown',
        time: sample.time,
        buckets,
      },
    },
    lastKey: key,
  }
}

function apply(state, event) {
  if (event.type === 'request/header') {
    const config = event.data?.header?.config
    const provider = config?.provider
    const model = config?.model
    if (typeof provider === 'string' && typeof model === 'string') {
      return { ...state, header: { provider, model } }
    }
    return state
  }

  if (event.type === 'step/start') {
    const turn = event.data?.turn
    const step = event.data?.step
    if (turn === undefined || step === undefined || state.header === null) return state
    const key = `${turn}:${step}`
    return {
      ...state,
      steps: {
        ...state.steps,
        [key]: { ...state.header, time: event.time },
      },
    }
  }

  // 遗留分支：现行 DSH 不再产生 assistant/chunk（用量只随 assistant/message
  // 携带），但本插件更新前落盘、或尚未迁移的旧会话日志里仍有该事件。
  // 保留它只为让这些日志继续按原来的价格计费，现行路径不会命中。
  if (event.type === 'assistant/chunk') {
    const chunk = event.data?.chunk
    if (chunk?.type !== 'usage') return state
    const key = `${event.data.turn}:${event.data.step}`
    const request = state.steps[key] ?? state.header
    return foldUsage(state, {
      turn: event.data.turn,
      step: event.data.step,
      provider: request?.provider,
      model: request?.model,
      time: state.steps[key]?.time ?? event.time,
      usage: chunk.usage,
    })
  }

  if (event.type === 'assistant/message') {
    const usage = event.data?.usage
    if (usage === undefined) return state
    const key = `${event.data.turn}:${event.data.step}`
    const request = state.steps[key] ?? state.header
    const source = event.data?.message?.source
    return foldUsage(state, {
      turn: event.data.turn,
      step: event.data.step,
      provider: source?.provider ?? request?.provider,
      model: source?.model ?? request?.model,
      time: state.steps[key]?.time ?? event.time,
      usage,
    })
  }

  return state
}

function view(state) {
  const total = state.total
  const billedInput = total.inputTokens + total.cacheReadTokens + total.cacheWriteTokens
  const byModel = Object.keys(state.byModel).map((model) => {
    const entry = state.byModel[model]
    return {
      provider: entry.provider,
      model: entry.model,
      cost: entry.cost,
      costUsd: entry.costUsd,
      priced: entry.priced === true,
      tokens: {
        inputTokens: entry.inputTokens + entry.cacheReadTokens + entry.cacheWriteTokens,
        uncachedInputTokens: entry.inputTokens,
        cacheReadTokens: entry.cacheReadTokens,
        cacheWriteTokens: entry.cacheWriteTokens,
        outputTokens: entry.outputTokens,
      },
    }
  }).sort((a, b) => b.cost - a.cost || b.tokens.inputTokens - a.tokens.inputTokens)

  const last = state.lastKey === null ? null : state.samples[state.lastKey]
  return {
    currency: 'CNY',
    /** 可计价部分的人民币总额（元）。 */
    cost: roundCost(total.cost),
    /** 可计价部分的美元总额。 */
    costUsd: roundCost(total.costUsd),
    /** false 表示对话里存在无法按本价格表计价的模型调用。 */
    complete: total.unpricedTokens === 0,
    tokens: {
      /** 计费输入 tokens = 未命中 + 命中 + 写入。 */
      inputTokens: billedInput,
      uncachedInputTokens: total.inputTokens,
      cacheReadTokens: total.cacheReadTokens,
      cacheWriteTokens: total.cacheWriteTokens,
      outputTokens: total.outputTokens,
    },
    byModel,
    latest: last === null ? null : {
      provider: last.provider,
      model: last.model,
      time: last.time,
      rate: isOfficialDeepSeekModel(last.provider, last.model)
        ? pricePointAt(last.model, last.time) : null,
      rateUsd: isOfficialDeepSeekModel(last.provider, last.model)
        ? usdPricePointAt(last.model, last.time) : null,
    },
  }
}

/**
 * 投影 schema 用 zod：SessionProjectionRegistry 按 `ZodType` 调用 parse()
 * （stateSchema 验持久化状态，wire.viewSchema 验离开 Host 的载荷），DSH 自带的
 * 投影单元一律如此。设置命名空间则用 schemastery（settings.register 要它的
 * schema，describe 会序列化 schema.toJSON()）。
 */
const count = zod.number()

const bucketsSchema = zod.object({
  inputTokens: count,
  outputTokens: count,
  cacheReadTokens: count,
  cacheWriteTokens: count,
})

const stateSchema = zod.object({
  total: zod.object({
    inputTokens: count,
    outputTokens: count,
    cacheReadTokens: count,
    cacheWriteTokens: count,
    cost: zod.number(),
    costUsd: zod.number(),
    unpricedTokens: count,
  }),
  byModel: zod.record(zod.string(), zod.object({
    provider: zod.string(),
    model: zod.string(),
    inputTokens: count,
    outputTokens: count,
    cacheReadTokens: count,
    cacheWriteTokens: count,
    cost: zod.number(),
    costUsd: zod.number(),
    priced: zod.boolean(),
  })),
  samples: zod.record(zod.string(), zod.object({
    turn: zod.number(),
    step: zod.number(),
    provider: zod.string(),
    model: zod.string(),
    time: zod.number(),
    buckets: bucketsSchema,
  })),
  steps: zod.record(zod.string(), zod.object({
    provider: zod.string(),
    model: zod.string(),
    time: zod.number(),
  })),
  lastKey: zod.string().nullable(),
  header: zod.object({ provider: zod.string(), model: zod.string() }).nullable(),
})

const rateSchema = zod.object({
  mode: zod.enum(['legacy', 'peak', 'offpeak']),
  inputHit: zod.number(),
  inputMiss: zod.number(),
  output: zod.number(),
})

/** 客户端可见载荷的校验器（wire.viewSchema）。 */
const viewSchema = zod.object({
  currency: zod.literal('CNY'),
  cost: zod.number(),
  costUsd: zod.number(),
  complete: zod.boolean(),
  tokens: zod.object({
    inputTokens: count,
    uncachedInputTokens: count,
    cacheReadTokens: count,
    cacheWriteTokens: count,
    outputTokens: count,
  }),
  byModel: zod.array(zod.object({
    provider: zod.string(),
    model: zod.string(),
    cost: zod.number(),
    costUsd: zod.number(),
    priced: zod.boolean(),
    tokens: zod.object({
      inputTokens: count,
      uncachedInputTokens: count,
      cacheReadTokens: count,
      cacheWriteTokens: count,
      outputTokens: count,
    }),
  })),
  latest: zod.object({
    provider: zod.string(),
    model: zod.string(),
    time: zod.number(),
    rate: rateSchema.nullable(),
    rateUsd: rateSchema.nullable(),
  }).nullable(),
})

export const costLogProjection = Object.freeze({
  key: KEY,
  stateSchema,
  init,
  apply,
  wire: { viewSchema, view },
  // 价格表调整会改变同一事件的折叠结果，因此必须递增：persisted cache 行在
  // ver 不匹配时被丢弃并整体重折，否则旧会话会一直沿用旧价、只有新步骤用新价。
  // v2 → v3：2026-09-10 Flash 降价 + 高峰时段加入工作日限制。
  stateVersion: 3,
})

export default {
  name: 'cost-log',
  inject: ['sessionProjections'],
  apply(ctx) {
    const registry = ctx.get('sessionProjections')
    if (registry === undefined) {
      ctx.logger?.warn?.('[cost-log] host bailed: sessionProjections service unavailable')
    } else {
      ctx.effect(() => registry.register(costLogProjection), 'cost-log: session projection')
    }

    // 可选依赖：Host 设置服务缺席时只失去货币选择，投影与徽标照常工作。
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.register(SETTINGS_NAMESPACE, CostLogSettingsSchema)
    })
  },
}
