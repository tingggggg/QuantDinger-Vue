import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { tabKey } from '../../src/components/MultiTab/tabIdentity.mjs'

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('route view keeps cache storage mounted across cached and non-cached pages', () => {
  const routeView = read('src/layouts/RouteView.vue')
  const layout = read('src/layouts/BasicLayout.vue')

  assert.match(layout, /<route-view[^>]+:keep-alive="multiTab"/)
  assert.match(routeView, /<keep-alive :max="maxCachedPages">/)
  assert.match(routeView, /v-if="shouldKeepAlive"/)
  assert.match(routeView, /v-if="!shouldKeepAlive"/)
  assert.match(routeView, /routeMeta\.keepAlive/)
  assert.match(routeView, /this\.\$route\.name \|\| this\.\$route\.path/)
  assert.match(routeView, /this\.\$route\.fullPath \|\| this\.\$route\.path/)
  assert.doesNotMatch(routeView, /return <router-view key=\{routeKey\}/)
})

test('multi-tab workspaces are enabled for users without a saved preference', () => {
  const defaults = read('src/config/defaultSettings.js')
  const bootstrap = read('src/core/bootstrap.js')

  assert.match(defaults, /multiTab:\s*true/)
  assert.match(bootstrap, /storage\.get\(TOGGLE_MULTI_TAB, defaultSettings\.multiTab\)/)
})

test('cached IDE pages release global save shortcuts while hidden', () => {
  const strategyIde = read('src/views/strategy-ide/index.vue')
  const indicatorIde = read('src/views/indicator-ide/index.vue')

  assert.match(strategyIde, /deactivated \(\)[\s\S]*removeEventListener\('keydown', this\._saveShortcut, true\)/)
  assert.match(strategyIde, /activated \(\)[\s\S]*addEventListener\('keydown', this\._saveShortcut, true\)/)
  assert.match(indicatorIde, /deactivated \(\)[\s\S]*removeEventListener\('keydown', this\._saveShortcutListener\)/)
  assert.match(indicatorIde, /activated \(\)[\s\S]*addEventListener\('keydown', this\._saveShortcutListener\)/)
})

test('workspace tabs are identified by route path instead of transient query state', () => {
  assert.equal(tabKey('/strategy-ide'), '/strategy-ide')
  assert.equal(tabKey('/strategy-ide?tab=script&sourceId=26'), '/strategy-ide')
  assert.equal(tabKey({
    path: '/strategy-ide',
    fullPath: '/strategy-ide?tab=script&draft=1',
    meta: {}
  }), '/strategy-ide')
})

test('routes can explicitly opt into separate query-specific tabs', () => {
  assert.equal(tabKey({
    path: '/research',
    fullPath: '/research?run=two',
    meta: { multiTabByFullPath: true }
  }), '/research?run=two')
})
