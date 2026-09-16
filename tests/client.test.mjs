// 客户端 bundle 契约测试：在 Node 里按 DSH 客户端模块系统的形状加载 bundle，
// 并用一个「迷你 SlotCore」复核注册语义。
//
// 这里刻意复刻真实 SlotCore 的 kind 规则（list 必须有 id、keyed 必须有 key）：
// DSH 0.1.5 起 `settings.plugin.item` 由 list 变成按设置命名空间索引的 keyed 槽，
// 旧写法不带 key 会在注册时抛错并连带整个客户端插件加载失败，徽标一起消失。
// 该规则留在测试里，退化会立刻失败。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const MANIFEST = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

const SLOT_KINDS = {
  'conversation.input.right': 'list',
  'settings.general.item': 'list',
  // 历史插槽：现行 DSH 已是 keyed。保留声明即锁定回归。
  'settings.plugin.item': 'keyed',
}

const READY_USD = { status: 'ready', value: { currency: 'USD' }, writable: true }
const READY_CNY = { status: 'ready', value: { currency: 'CNY' }, writable: true }
const UNAVAILABLE = { status: 'unavailable', value: undefined, writable: false }

function createReact() {
  return {
    createElement(type, props) {
      return { type, props: props || {}, children: Array.prototype.slice.call(arguments, 2) }
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot()
    },
  }
}

/** 迷你 SlotRegistry：只实现 bundle 用到的 inject/register 与 kind 校验。 */
function createSlots() {
  const registrations = []
  return {
    registrations,
    inject(name, callback) {
      assert.equal(typeof name, 'string')
      callback()
    },
    register(options, component) {
      const kind = SLOT_KINDS[options.name]
      assert.ok(kind !== undefined, `注册到未声明的插槽: ${options.name}`)
      if (kind === 'list') assert.ok(options.id !== undefined, `list 槽 ${options.name} 需要 id`)
      if (kind === 'keyed') assert.ok(options.key !== undefined, `keyed 槽 ${options.name} 需要 key`)
      registrations.push({ name: options.name, options, component })
      return () => {}
    },
    faceOf(name) {
      const found = registrations.find((entry) => entry.name === name)
      assert.ok(found !== undefined, `未注册插槽 ${name}`)
      return found
    },
  }
}

function createHarness({ withSettings = true, snapshot = READY_USD } = {}) {
  const slots = createSlots()
  const dictionaries = []
  const writes = []
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set: (field, value) => {
      writes.push([field, value])
      return Promise.resolve()
    },
  }
  const ctx = {
    get(name) {
      if (name === 'slots') return slots
      if (name === 'locale') {
        return {
          register(ns, dicts) {
            dictionaries.push({ ns, dicts })
            return () => {}
          },
          bind: (ns) => (key) => `${ns}.${key}`,
        }
      }
      if (name === 'settingsScope') return withSettings ? { bind: () => scope } : undefined
      return undefined
    },
    effect(callback) {
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
  }
  return { ctx, slots, dictionaries, writes }
}

async function loadBundle() {
  const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let handoff
  const window = {
    __ModuleLoader__: {
      load(registration) {
        handoff = registration
      },
    },
  }
  const document = {
    createElement: () => ({ dataset: {}, parentNode: null, textContent: '' }),
    head: { appendChild() {} },
  }
  vm.runInNewContext(code, { window, document, console })
  return handoff
}

function createPlugin(handoff) {
  return handoff.factory((id) => {
    if (id === 'react') return createReact()
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { Tooltip: function Tooltip() {} }
    throw new Error(`客户端 bundle 依赖了非平台模块: ${id}`)
  })
}

/** 组件 props = 注入面 + 框架标准座；这里按渲染器的合成顺序拼装。 */
function composeProps(face, standard) {
  return { ...face, ...standard }
}

/** React 的 children 可变参数：单个数组实参要展平一层再断言。 */
function childrenOf(node) {
  const out = []
  for (const child of node.children) {
    if (Array.isArray(child)) out.push(...child)
    else out.push(child)
  }
  return out
}

function amountText(tree) {
  return tree.children[0].children[0].children[0]
}

test('bundle 以包名注册，且只依赖平台 seed 模块', async () => {
  const handoff = await loadBundle()
  assert.equal(handoff.id, MANIFEST.name)
  assert.equal(typeof handoff.factory, 'function')

  const plugin = createPlugin(handoff)
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(Array.from(plugin.inject), ['slots', 'locale'])
})

test('manifest 声明的客户端注入是字符串数组并覆盖所用插槽的宿主包', () => {
  const inject = MANIFEST.dsh.client.inject
  assert.ok(Array.isArray(inject) && inject.every((id) => typeof id === 'string'))
  for (const required of [
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-settings-general',
    '@deepseek-ai/dsh-client-ui-primitives',
  ]) {
    assert.ok(inject.includes(required), `manifest 缺少 ${required}`)
  }
})

test('注册两个 list 槽（徽标 + 通用设置行），不再触碰 keyed 的 settings.plugin.item', async () => {
  const { ctx, slots, dictionaries } = createHarness()
  createPlugin(await loadBundle()).apply(ctx)

  const names = slots.registrations.map((entry) => entry.name)
  assert.deepEqual(names, ['conversation.input.right', 'settings.general.item'])
  assert.ok(!names.includes('settings.plugin.item'))

  const badge = slots.faceOf('conversation.input.right')
  assert.equal(badge.options.id, 'cost-log')
  assert.equal(badge.options.order, 40)
  assert.equal(badge.options.locale, 'costLog')
  assert.equal(typeof badge.options.label, 'function')

  const row = slots.faceOf('settings.general.item')
  assert.equal(row.options.id, 'cost-log-currency')
  assert.equal(row.options.order, 30)
  assert.equal(row.options.locale, 'costLog')

  // 两行文案共用 costLog 命名空间，中英字典键必须一一对应。
  assert.equal(dictionaries.length, 1)
  assert.equal(dictionaries[0].ns, 'costLog')
  assert.deepEqual(
    Object.keys(dictionaries[0].dicts.zh).sort(),
    Object.keys(dictionaries[0].dicts.en).sort(),
  )
})

test('缺少 settingsScope 时只注册徽标，且货币回落默认值', async () => {
  const { ctx, slots } = createHarness({ withSettings: false })
  createPlugin(await loadBundle()).apply(ctx)

  assert.deepEqual(slots.registrations.map((entry) => entry.name), ['conversation.input.right'])

  const badge = slots.faceOf('conversation.input.right')
  const view = { complete: true, cost: 6, costUsd: 0.84, tokens: {}, byModel: [], latest: null }
  const tree = badge.component(composeProps(badge.options.inject(), {
    useProjection: () => view,
    useSession: (select) => select({ running: false }),
    t: (key) => key,
  }))
  assert.equal(amountText(tree), '¥6.00')
})

test('徽标按 Host 设置里的货币渲染金额', async () => {
  const { ctx, slots } = createHarness({ snapshot: READY_USD })
  createPlugin(await loadBundle()).apply(ctx)

  const badge = slots.faceOf('conversation.input.right')
  const view = { complete: true, cost: 6, costUsd: 0.84, tokens: {}, byModel: [], latest: null }
  const tree = badge.component(composeProps(badge.options.inject('session-1'), {
    useProjection: () => view,
    useSession: (select) => select({ running: true }),
    t: (key) => key,
  }))

  assert.equal(amountText(tree), '$0.84')
  assert.equal(tree.children[0].props['data-complete'], 'true')
  // running=true 时应带脉冲点。
  assert.equal(tree.children[0].children[1].props.className, 'dcl-dot')
})

test('投影尚无值时不渲染徽标', async () => {
  const { ctx, slots } = createHarness()
  createPlugin(await loadBundle()).apply(ctx)

  const badge = slots.faceOf('conversation.input.right')
  const tree = badge.component(composeProps(badge.options.inject(), {
    useProjection: () => undefined,
    useSession: (select) => select({ running: false }),
    t: (key) => key,
  }))
  assert.equal(tree, null)
})

test('不可计价部分用 ≈ 前缀提示', async () => {
  const { ctx, slots } = createHarness({ snapshot: READY_CNY })
  createPlugin(await loadBundle()).apply(ctx)

  const badge = slots.faceOf('conversation.input.right')
  const view = { complete: false, cost: 1.5, costUsd: 0.2, tokens: {}, byModel: [], latest: null }
  const tree = badge.component(composeProps(badge.options.inject(), {
    useProjection: () => view,
    useSession: (select) => select({ running: false }),
    t: (key) => key,
  }))
  assert.equal(amountText(tree), '≈¥1.50')
})

test('设置行跟随 Host 快照，并把选择写回设置命名空间', async () => {
  const { ctx, slots, writes } = createHarness({ snapshot: READY_USD })
  createPlugin(await loadBundle()).apply(ctx)

  const row = slots.faceOf('settings.general.item')
  const tree = row.component(composeProps(row.options.inject(), { t: (key) => key }))

  assert.equal(tree.props.className, 'dcl-settings-row')
  assert.equal(tree.children[1].props.value, 'USD')
  assert.equal(tree.children[1].props.disabled, false)
  assert.deepEqual(
    childrenOf(tree.children[1]).map((option) => option.props.value),
    ['CNY', 'USD'],
  )

  tree.children[1].props.onChange({ target: { value: 'CNY' } })
  assert.deepEqual(writes, [['currency', 'CNY']])
})

test('命名空间不可用时设置行不占用设置页，且下拉禁用', async () => {
  const unavailable = createHarness({ snapshot: UNAVAILABLE })
  createPlugin(await loadBundle()).apply(unavailable.ctx)
  const row = unavailable.slots.faceOf('settings.general.item')
  assert.equal(row.component(composeProps(row.options.inject(), { t: (key) => key })), null)

  // 已有 provider 但尚未就绪：保留行，禁用下拉。
  const loading = createHarness({ snapshot: { status: 'loading', value: undefined, writable: false } })
  createPlugin(await loadBundle()).apply(loading.ctx)
  const pendingRow = loading.slots.faceOf('settings.general.item')
  const tree = pendingRow.component(composeProps(pendingRow.options.inject(), { t: (key) => key }))
  assert.equal(tree.children[1].props.disabled, true)
  assert.equal(tree.children[1].props.value, 'CNY')
})
