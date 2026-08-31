import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { resolveDecisionLabelKey } from '../../src/utils/fastAnalysisPresentation.js'

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('fast analysis displays final R/R warning and regime outcome monitoring', () => {
  const report = read('src/views/ai-analysis/components/FastAnalysisReport.vue')

  assert.match(report, /tp\.risk_reward_ratio \?\? tp\.riskRewardRatio/)
  assert.match(report, /tp\.rr_warning \?\? tp\.rrWarning/)
  assert.match(report, /hasLowRiskReward/)
  assert.match(report, /regime_performance/)
})

test('fast analysis keeps warning and crypto factor content readable in dark mode', () => {
  const report = read('src/views/ai-analysis/components/FastAnalysisReport.vue')
  const darkTheme = report.slice(report.indexOf('.fast-analysis-report.theme-dark'))

  assert.match(darkTheme, /\.rr-warning-alert[\s\S]*?\.ant-alert-description \{ color: #c7c7ce; \}/)
  assert.match(darkTheme, /\.crypto-factor-summary[\s\S]*?&__text \{ color: @dk-text2; \}/)
  assert.match(darkTheme, /\.crypto-factor-item[\s\S]*?background: @dk-surface2;/)
  assert.match(darkTheme, /&__label, &__hint \{ color: @dk-text2; \}/)
})

test('fast analysis crypto cards use locale keys instead of Chinese-or-English branches', () => {
  const report = read('src/views/ai-analysis/components/FastAnalysisReport.vue')

  assert.doesNotMatch(report, /const localZh/)
  assert.match(report, /fastAnalysis\.cryptoVolume24h/)
  assert.match(report, /fastAnalysis\.cryptoFundingRate/)
  assert.match(report, /cryptoSignalValueLabel/)
})

test('insufficient credits opens billing while other failures keep retry', () => {
  const report = read('src/views/ai-analysis/components/FastAnalysisReport.vue')

  assert.match(report, /insufficientCreditsError \? \$t\('fastAnalysis\.rechargeNow'\) : \$t\('fastAnalysis\.retry'\)/)
  assert.match(report, /this\.\$router\.push\(\{ name: 'Billing' \}\)/)
  assert.match(report, /this\.\$emit\('retry'\)/)
})

test('strategy logs render typed market-data failures with actionable reasons', () => {
  const logs = read('src/views/strategy-center/components/StrategyLogs.vue')

  assert.match(logs, /event_type === 'market_data_unavailable'/)
  assert.match(logs, /market_data_error/)
  assert.match(logs, /marketDataReasonLabel/)
  assert.match(logs, /marketDataAction/)
  assert.match(logs, /technical_detail/)
})

test('hold reports preserve mild directional bias instead of flattening to neutral', () => {
  assert.equal(resolveDecisionLabelKey({ decision: 'HOLD', score: 17.6 }), 'fastAnalysis.outlookMildBull')
  assert.equal(resolveDecisionLabelKey({ decision: 'HOLD', bias: 'MILD_BEARISH' }), 'fastAnalysis.outlookMildBear')
  assert.equal(resolveDecisionLabelKey({ decision: 'HOLD', score: 3 }), 'fastAnalysis.outlookNeutral')
  assert.equal(resolveDecisionLabelKey({ decision: 'BUY', score: -30 }), 'fastAnalysis.outlookBull')
})
