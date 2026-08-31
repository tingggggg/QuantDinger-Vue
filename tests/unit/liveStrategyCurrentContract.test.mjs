import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const editorPath = fileURLToPath(
  new URL('../../src/views/strategy-center/components/LiveStrategyEditor.vue', import.meta.url)
)
const source = fs.readFileSync(editorPath, 'utf8')

test('live strategy creation validates with the current compiler', () => {
  assert.match(source, /compileScriptSource/)
  assert.match(source, /compiledManifest/)
  assert.match(source, /hasCurrentContract/)
  assert.doesNotMatch(source, /strategyManifest\.apiVersion/)
  assert.doesNotMatch(source, /Number\(config\.api_version/)
})

test('live strategy direction is contract-driven with a legacy fallback', () => {
  assert.match(source, /manifestDirectionMode/)
  assert.match(source, /directionModeDetectedHint/)
  assert.match(source, /requiresDirectionFallback/)
  assert.match(source, /directionMode: this\.requiresDirectionMode \? this\.effectiveDirectionMode/)
  assert.doesNotMatch(source, /v-model="model\.positionSide"/)
})

test('live eligibility follows the manifest market instead of the strategy shape', () => {
  assert.match(source, /supportsLiveExecutionMode\(this\.strategyManifest\)/)
  assert.match(source, /credentialMatchesLiveStrategy\(this\.strategyManifest, credential\.exchange_id\)/)
  assert.doesNotMatch(source, /if \(this\.isPortfolioStrategy\) return exchange === 'alpaca'/)
})

test('source changes clear an incompatible saved credential before submission', () => {
  assert.match(source, /this\.compatibleCredentials\.some\(item => String\(item\.id\) === String\(this\.model\.credentialId\)\)/)
  assert.match(source, /this\.model\.credentialId = undefined/)
})
