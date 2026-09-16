// Host 半体契约测试：锁死两类曾因 DSH 版本更新而失配的接口——
// 1) SessionProjectionRegistry 的 ProjectionDefinition 形状
//    （旧版把视图直挂 `view`/`schema`，现行是 `stateSchema` + `wire`，
//     视图缺失会让投影被当作 host-only，客户端永远拿不到值）；
// 2) settings.register 需要的 schemastery schema 与命名空间格式。
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CURRENCIES,
  CURRENCY_FIELD,
  CostLogSettingsSchema,
  DEFAULT_CURRENCY,
  SETTINGS_NAMESPACE,
  costLogProjection,
} from '../lib/index.js'

const HOUR = 3_600_000

function event(type, seq, time, data) {
  return { type, seq, time, data }
}

function usage(inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0) {
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
}

/** 一次已计价的完整请求：request/header → step/start → assistant/message。 */
function pricedSession(at) {
  let state = costLogProjection.init()
  state = costLogProjection.apply(state, event('request/header', 0, at - 10, {
    header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } },
  }))
  state = costLogProjection.apply(state, event('step/start', 1, at, { turn: 1, step: 1 }))
  state = costLogProjection.apply(state, event('assistant/message', 2, at, {
    turn: 1,
    step: 1,
    message: { source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-v4-flash' } },
    usage: usage(1_000_000, 1_000_000),
  }))
  return state
}

test('投影定义满足现行 ProjectionDefinition 契约', () => {
  assert.equal(costLogProjection.key, 'costLog')
  assert.equal(typeof costLogProjection.init, 'function')
  assert.equal(typeof costLogProjection.apply, 'function')
  // stateSchema 验持久化状态，wire.viewSchema 验离开 Host 的载荷。
  assert.equal(typeof costLogProjection.stateSchema?.parse, 'function')
  assert.equal(typeof costLogProjection.wire?.viewSchema?.parse, 'function')
  assert.equal(typeof costLogProjection.wire?.view, 'function')
  assert.ok(
    Number.isSafeInteger(costLogProjection.stateVersion) && costLogProjection.stateVersion >= 0,
    'stateVersion 必须是非负整数',
  )
  // 价格表调整会改变同一事件的折叠结果，因此必须递增 stateVersion，让持久化
  // cache 行失效并整体重折；否则旧会话会沿用旧价、只有新步骤用新价。
  assert.ok(costLogProjection.stateVersion >= 3, '计价规则变更后 stateVersion 应已递增')
})

test('投影状态可 JSON 往返并通过 stateSchema（projection cache 前置条件）', () => {
  const state = pricedSession(Date.UTC(2026, 7, 17, 4, 0))
  const restored = costLogProjection.stateSchema.parse(JSON.parse(JSON.stringify(state)))
  assert.deepEqual(restored, state)
})

test('空状态也满足 stateSchema 与 viewSchema', () => {
  const state = costLogProjection.init()
  assert.deepEqual(costLogProjection.stateSchema.parse(state), state)
  const view = costLogProjection.wire.view(state)
  assert.deepEqual(costLogProjection.wire.viewSchema.parse(view), view)
  assert.equal(view.cost, 0)
  assert.equal(view.complete, true)
  assert.equal(view.latest, null)
})

test('视图经 JSON 往返仍通过 viewSchema（wire 载荷）', () => {
  const view = costLogProjection.wire.view(pricedSession(Date.UTC(2026, 7, 17, 4, 0)))
  const parsed = costLogProjection.wire.viewSchema.parse(JSON.parse(JSON.stringify(view)))
  assert.deepEqual(parsed, view)
})

test('已计价的视图带出模型明细与最近一次计价', () => {
  const at = Date.UTC(2026, 7, 17, 4, 0) // 北京 12:00，空闲时段
  const view = costLogProjection.wire.view(pricedSession(at))
  // flash 空闲：未命中 1.5 + 输出 4.5 = 6 元
  assert.equal(view.cost, 6)
  assert.equal(view.complete, true)
  assert.equal(view.byModel.length, 1)
  assert.equal(view.byModel[0].model, 'deepseek-v4-flash')
  assert.equal(view.byModel[0].priced, true)
  assert.equal(view.latest.model, 'deepseek-v4-flash')
  assert.equal(view.latest.rate.mode, 'offpeak')
  assert.equal(view.latest.rateUsd.mode, 'offpeak')
})

test('stateSchema 拒绝被破坏的持久化状态', () => {
  assert.throws(() => costLogProjection.stateSchema.parse(null))
  assert.throws(() => costLogProjection.stateSchema.parse({ total: null }))
  assert.throws(() => costLogProjection.stateSchema.parse({ ...costLogProjection.init(), lastKey: 7 }))
})

test('viewSchema 拒绝被破坏的载荷', () => {
  const view = costLogProjection.wire.view(costLogProjection.init())
  assert.throws(() => costLogProjection.wire.viewSchema.parse({ ...view, currency: 'USD' }))
  assert.throws(() => costLogProjection.wire.viewSchema.parse({ ...view, complete: 'yes' }))
})

test('设置命名空间符合 settings registry 的格式要求', () => {
  assert.match(SETTINGS_NAMESPACE, /^[a-z][a-z0-9-]*$/)
  assert.deepEqual(CURRENCIES, ['CNY', 'USD'])
  assert.equal(DEFAULT_CURRENCY, 'CNY')
  assert.equal(CURRENCY_FIELD, 'currency')
})

test('设置 schema 可被 describe 序列化，并应用默认值与校验', () => {
  // settings.register 的 describe 面会序列化 schema.toJSON()。
  assert.doesNotThrow(() => JSON.stringify(CostLogSettingsSchema.toJSON()))
  assert.deepEqual(CostLogSettingsSchema({}), { [CURRENCY_FIELD]: DEFAULT_CURRENCY })
  assert.deepEqual(CostLogSettingsSchema({ [CURRENCY_FIELD]: 'USD' }), { [CURRENCY_FIELD]: 'USD' })
  assert.throws(() => CostLogSettingsSchema({ [CURRENCY_FIELD]: 'EUR' }))
})

test('峰谷边界仍按 step/start 时刻计价', () => {
  const started = Date.UTC(2026, 7, 17, 1, 59) // 北京 09:59，高峰
  const completed = started + 2 * HOUR // 北京 11:59，仍高峰
  let state = costLogProjection.init()
  state = costLogProjection.apply(state, event('request/header', 0, started - 10, {
    header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } },
  }))
  state = costLogProjection.apply(state, event('step/start', 1, started, { turn: 1, step: 1 }))
  state = costLogProjection.apply(state, event('assistant/message', 2, completed, {
    turn: 1,
    step: 1,
    usage: usage(1_000_000, 0),
  }))
  // flash 高峰未命中 3 元/M
  assert.equal(costLogProjection.wire.view(state).cost, 3)
})
