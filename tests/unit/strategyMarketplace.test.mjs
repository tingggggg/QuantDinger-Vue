import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('desktop marketplace exposes queryable strategy compatibility filters', () => {
  const source = read('src/views/indicator-community/index.vue')
  for (const parameter of ['market', 'market_type', 'binding_mode', 'strategy_type', 'direction_mode', 'leverage']) {
    assert.match(source, new RegExp(`${parameter}:`))
  }
  assert.doesNotMatch(source, /filters\.timeframe/)
  assert.match(source, /activeStrategyFilterChips/)
})

test('desktop marketplace derives strategy markets from system market modules', () => {
  const source = read('src/views/indicator-community/index.vue')
  assert.match(source, /loadEnabledMarketOptions/)
  assert.match(source, /strategyMarketOptions/)
  assert.doesNotMatch(source, /strategyMarkets:\s*\[/)
})

test('desktop strategy cards separate execution and confirmation cadence', () => {
  const card = read('src/views/indicator-community/components/IndicatorCard.vue')
  const detail = read('src/views/indicator-community/components/IndicatorDetail.vue')
  for (const field of ['execution_mode', 'execution_frequency', 'confirmation_frequencies']) {
    assert.match(card + detail, new RegExp(field))
  }
  assert.match(card + detail, /marketplace_contract/)
})

test('desktop strategy cards omit the overfitting risk prompt', () => {
  const card = read('src/views/indicator-community/components/IndicatorCard.vue')
  assert.doesNotMatch(card, /overfit-risk-gauge|OverfitRiskGauge/)
})

test('marketplace labels payoff ratio separately from profit factor', () => {
  const detail = read('src/views/indicator-community/components/IndicatorDetail.vue')
  const review = read('src/views/indicator-community/index.vue')

  for (const source of [detail, review]) {
    assert.match(source, /strategyCenter\.backtest\.payoffRatio/)
    assert.match(source, /profit_loss_ratio/)
    assert.match(source, /losing_trades/)
  }
  assert.doesNotMatch(detail, /formatNumber\(performance\.profit_factor/)
  assert.doesNotMatch(review, /formatReviewNumber\(reviewPerformance\.profit_factor/)
})

test('desktop marketplace adaptation requires compatibility and a fresh backtest', () => {
  const detail = read('src/views/indicator-community/components/IndicatorDetail.vue')
  const ide = read('src/views/strategy-ide/index.vue')

  assert.match(detail, /\/compatibility`/)
  assert.match(detail, /\/adapt`/)
  assert.match(detail, /compatibilityResult\.compatible/)
  assert.match(ide, /adaptedBacktestRequired/)
  assert.match(ide, /hasSuccessfulBacktest/)
  assert.match(ide, /getScriptSourcePublishReadiness/)
  assert.doesNotMatch(ide, /assetId: id/)
  assert.match(ide, /backtestBeforeDeployment/)
})

test('strategy publishing guides users to a successful backtest with localized fallback handling', () => {
  const ide = read('src/views/strategy-ide/index.vue')
  const request = read('src/utils/request.js')
  const api = read('src/api/strategy.js')
  const english = read('src/locales/lang/en-US.js')
  const reviewedLocales = read('src/locales/reviewed-ui-overrides.js')

  assert.match(ide, /publishBacktestStatus !== 'passed'/)
  assert.match(ide, /goToBacktestFromPublish/)
  assert.match(ide, /isBacktestRequiredPublishResponse/)
  assert.match(ide, /publishBacktestRequiredHint/)
  assert.match(request, /normalizePublishBacktestRequiredError/)
  assert.match(request, /details\.requires_backtest/)
  assert.match(api, /script-sources\/publish-readiness/)
  assert.match(api, /params: \{ id: sourceId \}/)
  assert.match(english, /strategyIde\.publishGoBacktest/)
  assert.match(reviewedLocales, /strategyPublishBacktestCopy/)
  assert.doesNotMatch(english, /Please run code validation before publishing\./)
})

test('strategy republishing reports a marketplace update instead of another listing', () => {
  const ide = read('src/views/strategy-ide/index.vue')
  const english = read('src/locales/lang/en-US.js')
  const reviewedLocales = read('src/locales/reviewed-ui-overrides.js')

  assert.match(ide, /publication_action/)
  assert.match(ide, /publishUpdateSuccess/)
  assert.match(english, /strategyIde\.publishUpdateSuccess/)
  assert.match(reviewedLocales, /strategyPublishUpdateSuccessCopy/)
})
