// dsh-cost-log —— Client bundle（手写，无构建步骤）
// 格式与 tsdown clientBundle 产物一致：CJS 闭包注册到 window.__ModuleLoader__，
// 工厂通过注入的 require 从 loader 模块表解析外部依赖（react 与
// @deepseek-ai/dsh-client-ui-primitives 都是 web 平台 seed 模块）。
//
// UI：
// 1) ui-conversation 的 `conversation.input.right`（list / session）——
//    输入框卡片工具行右端、模型选择器左边，始终贴着输入区。金额读取 Host
//    注册的 durable 会话投影 `costLog`，不访问外部站点。
// 2) ui-settings-general 的 `settings.general.item`（list / root）——
//    「设置 > 通用」里的货币选择行。
//
// 货币是唯一的跨端状态，走 Host 用户设置命名空间 `cost-log`（Host 半体注册
// schema），客户端经 ctx.settingsScope.bind({ namespace }) 读写：徽标与设置行
// 订阅同一份快照，因此永远一致，并随用户设置文档持久。
// 悬浮提示文案通过 locale 服务与系统语言保持一致。

window.__ModuleLoader__.load({ id: 'dsh-cost-log', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var React = require('react');
var Tooltip = require('@deepseek-ai/dsh-client-ui-primitives').Tooltip;

var NS = 'costLog';
// 必须与 Host 半体的 SETTINGS_NAMESPACE / CURRENCY_FIELD / CURRENCIES 保持一致。
var SETTINGS_NAMESPACE = 'cost-log';
var CURRENCY_FIELD = 'currency';
var EFFECTIVE_AT_MS = Date.UTC(2026, 7, 16, 16, 0, 0); // 北京 2026-08-17 00:00
var BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
var DEFAULT_CURRENCY = 'CNY';
var CURRENCIES = ['CNY', 'USD'];

var DICT_ZH = {
  'costBadge': '对话花费',
  'input': '输入',
  'output': '输出',
  'miss': '未命中',
  'hit': '命中',
  'write': '写入',
  'noTokens': '当前对话还没有 token 用量',
  'model': '模型',
  'latestRate': '最近一次计价',
  'legacy': '旧价格表',
  'peak': '高峰时段',
  'offpeak': '空闲时段',
  'currentLegacy': '当前：旧价格表（新表 2026-08-17 00:00 北京时间生效）',
  'currentNew': '当前：新价格表',
  'incomplete': '注意：包含未按本价格表计价的模型调用，金额仅为可计价部分',
  'rateHit': '命中',
  'rateMiss': '未命中',
  'rateOutput': '输出',
  'inputTokens': '输入 tokens',
  'outputTokens': '输出 tokens',
  'flashCost': 'flash 花费',
  'proCost': 'pro 花费',
  'settings.title': '费用货币',
  'settings.description': '选择费用徽标与明细中使用的货币',
  'settings.unavailable': '当前部署不提供该设置，暂时无法修改',
  'currency.CNY': '人民币 (CNY)',
  'currency.USD': '美元 (USD)',
};

var DICT_EN = {
  'costBadge': 'Conversation cost',
  'input': 'Input',
  'output': 'Output',
  'miss': 'miss',
  'hit': 'hit',
  'write': 'write',
  'noTokens': 'No token usage in this conversation yet',
  'model': 'Model',
  'latestRate': 'Latest pricing',
  'legacy': 'Legacy pricing',
  'peak': 'Peak hours',
  'offpeak': 'Off-peak hours',
  'currentLegacy': 'Current: legacy pricing (new pricing effective 2026-08-17 00:00 Beijing time)',
  'currentNew': 'Current: new pricing',
  'incomplete': 'Note: includes model calls not priced by this table; amount only covers priced portion',
  'rateHit': 'hit',
  'rateMiss': 'miss',
  'rateOutput': 'output',
  'inputTokens': 'Input tokens',
  'outputTokens': 'Output tokens',
  'flashCost': 'flash cost',
  'proCost': 'pro cost',
  'settings.title': 'Cost currency',
  'settings.description': 'Choose the currency used in the cost badge and details',
  'settings.unavailable': 'This deployment does not expose this setting; it cannot be changed here',
  'currency.CNY': 'CNY',
  'currency.USD': 'USD',
};

var CSS =
  '.dcl-root{display:inline-flex;align-items:center;justify-content:center;height:24px;padding:0 8px;border:1px solid var(--dsw-static-deepseek-500,#4D6BFE);border-radius:12px;background:var(--dsw-static-deepseek-500,#4D6BFE);color:#fff;font-family:var(--dsw-font-family);font-size:12px;line-height:18px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;box-sizing:border-box;cursor:default;gap:5px}' +
  '.dcl-root .dcl-amount{color:#fff}' +
  '.dcl-root[data-complete="false"] .dcl-amount{color:rgba(255,255,255,.9)}' +
  '.dcl-root .dcl-dot{width:5px;height:5px;border-radius:50%;background:#fff;animation:dcl-pulse 1.2s ease-in-out infinite}' +
  '@keyframes dcl-pulse{0%,100%{opacity:.3}50%{opacity:1}}' +
  '@media (prefers-reduced-motion:reduce){.dcl-root .dcl-dot{animation:none}}' +
  '.dcl-settings-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid var(--dsw-alias-border-l2,#eee)}' +
  '.dcl-settings-text{display:flex;flex-direction:column;gap:4px;min-width:0}' +
  '.dcl-settings-title{color:var(--dsw-alias-label-primary,#1f2329);font-size:14px;line-height:22px}' +
  '.dcl-settings-desc{color:var(--dsw-alias-label-tertiary,#6b7280);font-size:12px;line-height:18px}' +
  '.dcl-settings-select{background:var(--dsw-alias-bg-module-platform,#fff);height:36px;font:inherit;color:var(--dsw-alias-label-primary,#1f2329);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:18px;padding:0 14px;font-size:14px;line-height:22px;cursor:pointer}' +
  '.dcl-settings-select:disabled{color:var(--dsw-alias-label-tertiary,#6b7280);cursor:not-allowed}';

function fallbackTranslate(key) {
  return DICT_ZH[key] || key;
}

function formatTokens(n) {
  var value = Number(n) || 0;
  var scaled = function (v) {
    return v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
  };
  if (value < 1000) return String(Math.round(value));
  if (value < 1000000) return scaled(value / 1000) + 'K';
  return scaled(value / 1000000) + 'M';
}

function currencySymbol(currency) {
  return currency === 'USD' ? '$' : '¥';
}

function formatCost(n, currency) {
  var value = Number(n);
  var symbol = currencySymbol(currency);
  if (!Number.isFinite(value) || value < 0) return symbol + '—';
  if (value === 0) return symbol + '0.00';
  if (value < 0.01) return '<' + symbol + '0.01';
  return symbol + (Math.round(value * 100) / 100).toFixed(2);
}

function beijingClock(ms) {
  var shifted = new Date(ms + BEIJING_OFFSET_MS);
  return {
    weekday: shifted.getUTCDay(), // 0 = 周日、6 = 周六
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** 高峰为北京时间周一至周五 9:00-12:00、14:00-18:00；其余（含周末）空闲。 */
function isPeakAt(ms) {
  var clock = beijingClock(ms);
  if (clock.weekday === 0 || clock.weekday === 6) return false;
  return (clock.minutes >= 9 * 60 && clock.minutes < 12 * 60)
    || (clock.minutes >= 14 * 60 && clock.minutes < 18 * 60);
}

function currentTierLabel(now, t) {
  if (now < EFFECTIVE_AT_MS) return t('currentLegacy');
  return t('currentNew') + ' · ' + (isPeakAt(now) ? t('peak') : t('offpeak'));
}

function rateName(rate, t) {
  if (rate.mode === 'legacy') return t('legacy');
  if (rate.mode === 'peak') return t('peak');
  return t('offpeak');
}

function rateDetail(rate, currency, t) {
  var symbol = currencySymbol(currency);
  return t('rateHit') + ' ' + symbol + rate.inputHit + '/M · ' +
    t('rateMiss') + ' ' + symbol + rate.inputMiss + '/M · ' +
    t('rateOutput') + ' ' + symbol + rate.output + '/M';
}

function buildTooltip(value, t, currency) {
  var tokens = value.tokens || {};
  var byModel = value.byModel || [];
  var flashCost = 0;
  var proCost = 0;
  for (var i = 0; i < byModel.length; i++) {
    if (byModel[i].priced !== true) continue;
    var model = String(byModel[i].model || '').toLowerCase();
    var cost = currency === 'USD' ? (Number(byModel[i].costUsd) || 0) : (Number(byModel[i].cost) || 0);
    if (model === 'deepseek-v4-flash') flashCost += cost;
    else if (model === 'deepseek-v4-pro') proCost += cost;
  }
  var lines = [
    t('inputTokens') + ' ' + formatTokens(tokens.inputTokens),
    t('outputTokens') + ' ' + formatTokens(tokens.outputTokens),
    t('flashCost') + ' ' + formatCost(flashCost, currency),
    t('proCost') + ' ' + formatCost(proCost, currency),
  ];
  var latest = value.latest;
  if (latest !== null && latest !== undefined && latest.model) {
    var rate = currency === 'USD' ? latest.rateUsd : latest.rate;
    lines.push('');
    lines.push(t('latestRate') + ' · ' + t('model') + ' ' + latest.model);
    lines.push(rate === null || rate === undefined
      ? currentTierLabel(Date.now(), t)
      : rateName(rate, t) + ' · ' + rateDetail(rate, currency, t));
  }
  if (value.complete === false) lines.push('', t('incomplete'));
  return lines.join('\n');
}

/** 从 scope 快照取出合法货币；快照缺失或值不合法时回落到默认货币。 */
function currencyOf(snapshot) {
  var section = snapshot === null || snapshot === undefined ? undefined : snapshot.value;
  var currency = section === null || section === undefined ? undefined : section[CURRENCY_FIELD];
  return CURRENCIES.indexOf(currency) === -1 ? DEFAULT_CURRENCY : currency;
}

/**
 * 货币读取面：把 Host 设置 scope 收敛成组件可直接消费的注入面。
 * 缺少 settingsScope 服务时退化为只读默认值——徽标照常显示，只是无法改货币。
 */
function createCurrencyFace(scope) {
  if (scope === undefined) {
    var absent = { status: 'unavailable', value: undefined, writable: false };
    return {
      settingsAvailable: false,
      getCurrencySnapshot: function () { return absent; },
      subscribeCurrency: function () { return function () {}; },
      setCurrency: function () {},
    };
  }
  return {
    settingsAvailable: true,
    getCurrencySnapshot: function () { return scope.getSnapshot(); },
    subscribeCurrency: function (listener) { return scope.subscribe(listener); },
    setCurrency: function (currency) {
      if (CURRENCIES.indexOf(currency) === -1) return;
      // 写入失败由 scope 自己回读 Host 状态，这里无需额外处理。
      void scope.set(CURRENCY_FIELD, currency);
    },
  };
}

/** 订阅货币快照（uSES：getSnapshot 在变更前保持同一引用）。 */
function useCurrency(props) {
  var snapshot = React.useSyncExternalStore(
    props.subscribeCurrency,
    props.getCurrencySnapshot,
    props.getCurrencySnapshot,
  );
  return { snapshot: snapshot, currency: currencyOf(snapshot) };
}

function CostBadge(props) {
  var value = props.useProjection('costLog');
  var running = props.useSession(function (snapshot) { return snapshot.running; });
  var t = props.t || fallbackTranslate;
  var currency = useCurrency(props).currency;
  if (value === undefined) return null;

  var complete = value.complete !== false;
  var amount = currency === 'USD' ? (Number(value.costUsd) || 0) : (Number(value.cost) || 0);
  var amountText = formatCost(amount, currency);
  if (!complete && amount > 0) amountText = '≈' + amountText;
  else if (!complete) amountText = (currency === 'USD' ? '$0.00+' : '¥0.00+');
  var summary = buildTooltip(value, t, currency);

  return React.createElement(
    Tooltip,
    {
      label: function () { return buildTooltip(value, t, currency); },
      side: 'top',
      delayMs: 450,
      maxWidth: 360,
    },
    React.createElement(
      'div',
      {
        className: 'dcl-root',
        'data-complete': complete ? 'true' : 'false',
        'aria-label': summary,
      },
      React.createElement('span', { className: 'dcl-amount' }, amountText),
      running ? React.createElement('span', { className: 'dcl-dot', 'aria-hidden': true }) : null,
    ),
  );
}

function CurrencyRow(props) {
  var t = props.t || fallbackTranslate;
  var state = useCurrency(props);
  var snapshot = state.snapshot;
  // 命名空间未暴露给本客户端（或连接处于 memory 模式）时不占用设置页。
  if (snapshot !== undefined && snapshot !== null && snapshot.status === 'unavailable') return null;
  var writable = snapshot !== undefined && snapshot !== null && snapshot.writable === true;

  return React.createElement(
    'div',
    { className: 'dcl-settings-row' },
    React.createElement(
      'div',
      { className: 'dcl-settings-text' },
      React.createElement('div', { className: 'dcl-settings-title' }, t('settings.title')),
      React.createElement(
        'div',
        { className: 'dcl-settings-desc' },
        writable ? t('settings.description') : t('settings.unavailable'),
      ),
    ),
    React.createElement(
      'select',
      {
        className: 'dcl-settings-select',
        value: state.currency,
        disabled: !writable,
        'aria-label': t('settings.title'),
        onChange: function (event) { props.setCurrency(event.target.value); },
      },
      CURRENCIES.map(function (id) {
        return React.createElement('option', { key: id, value: id }, t('currency.' + id));
      }),
    ),
  );
}

function apply(ctx) {
  var slots = ctx.get('slots');
  if (slots === undefined) return;
  var style = document.createElement('style');
  style.dataset.plugin = 'dsh-cost-log';
  style.textContent = CSS;
  document.head.appendChild(style);
  ctx.effect(function () {
    return function () {
      if (style.parentNode) style.parentNode.removeChild(style);
    };
  });

  var locale = ctx.get('locale');
  if (locale !== undefined) {
    ctx.effect(function () {
      return locale.register(NS, { zh: DICT_ZH, en: DICT_EN });
    }, 'cost-log: dictionaries');
  }

  var scope = ctx.get('settingsScope');
  var currencyFace = createCurrencyFace(
    scope === undefined ? undefined : scope.bind({ namespace: SETTINGS_NAMESPACE }),
  );

  // 输入框卡片内、工具行右侧：位于模型选择器左侧，紧贴发送区。
  slots.inject('conversation.input.right', function () {
    var options = {
      name: 'conversation.input.right',
      id: 'cost-log',
      order: 40,
      label: locale !== undefined ? function () { return locale.bind(NS)('costBadge'); } : '对话花费',
      inject: function () { return currencyFace; },
    };
    if (locale !== undefined) options.locale = NS;
    return slots.register(options, CostBadge);
  });

  // 设置 > 通用：货币选择行（list 槽，按 id/order 落位）。
  if (currencyFace.settingsAvailable) {
    slots.inject('settings.general.item', function () {
      var options = {
        name: 'settings.general.item',
        id: 'cost-log-currency',
        order: 30,
        inject: function () { return currencyFace; },
      };
      if (locale !== undefined) options.locale = NS;
      return slots.register(options, CurrencyRow);
    });
  }
}

module.exports = { name: 'cost-log', inject: ['slots', 'locale'], apply: apply };
return module.exports; } });
