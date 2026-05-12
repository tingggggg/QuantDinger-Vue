<template>
  <div
    class="chart-cell"
    :class="{ 'chart-cell--focused': focused, 'chart-cell--dark': theme === 'dark' }"
    @click="$emit('focus')"
  >
    <!-- Cell header: per-cell symbol / market / timeframe controls -->
    <div class="chart-cell__header">
      <a-select
        :value="localMarket"
        size="small"
        style="width: 100px"
        @change="onMarketChange"
      >
        <a-select-option v-for="m in markets" :key="m" :value="m">{{ m }}</a-select-option>
      </a-select>
      <a-input
        :value="localSymbol"
        size="small"
        placeholder="Symbol"
        style="width: 130px"
        @pressEnter="onSymbolEnter"
        @blur="onSymbolEnter"
      />
      <div class="chart-cell__tf-group">
        <button
          v-for="tf in timeframes"
          :key="tf"
          class="chart-cell__tf-btn"
          :class="{ active: tf === localTimeframe }"
          @click="onTimeframeChange(tf)"
        >{{ tf }}</button>
      </div>
      <div class="chart-cell__spacer"></div>
      <a-tooltip title="Remove cell">
        <button
          v-if="closable"
          class="chart-cell__close-btn"
          @click.stop="$emit('remove')"
        >
          <a-icon type="close" />
        </button>
      </a-tooltip>
    </div>

    <!-- Chart body -->
    <div class="chart-cell__body">
      <KlineChart
        :symbol="localSymbol"
        :market="localMarket"
        :timeframe="localTimeframe"
        :theme="theme"
        :active-indicators="activeIndicators"
        :realtime-enabled="false"
        @indicator-toggle="handleIndicatorToggle"
        @chart-ready="onChartReady"
      />
    </div>
  </div>
</template>

<script>
import { ref, watch, inject, onBeforeUnmount } from 'vue'
import KlineChart from '@/views/indicator-analysis/components/KlineChart.vue'

let _cellSeq = 0
const _nextCellId = () => `chartcell-${++_cellSeq}`

const MARKETS = ['USStock', 'Crypto', 'HKStock', 'CNStock', 'Forex', 'Futures', 'MOEX']
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1H', '4H', '1D', '1W']

export default {
  name: 'ChartCell',
  components: { KlineChart },
  props: {
    market: { type: String, default: 'USStock' },
    symbol: { type: String, default: 'AAPL' },
    timeframe: { type: String, default: '4H' },
    theme: { type: String, default: 'light' },
    focused: { type: Boolean, default: false },
    closable: { type: Boolean, default: true }
  },
  emits: ['update:market', 'update:symbol', 'update:timeframe', 'focus', 'remove'],
  setup (props, { emit }) {
    const cellId = _nextCellId()
    const localMarket = ref(props.market)
    const localSymbol = ref(props.symbol)
    const localTimeframe = ref(props.timeframe)
    // Per-cell indicator state. KlineChart is a view-only component for
    // preset indicators - it emits `indicator-toggle` and expects the
    // parent to round-trip the array back via `activeIndicators` prop.
    // See indicator-ide/index.vue:2195-2232 for the canonical handler.
    const activeIndicators = ref([])

    const handleIndicatorToggle = ({ action, indicator }) => {
      if (!indicator || (!indicator.id && !indicator.instanceId)) return
      const targetInstanceId = indicator.instanceId || indicator.id

      if (action === 'add') {
        activeIndicators.value = [
          ...activeIndicators.value,
          { ...indicator, instanceId: targetInstanceId, calculate: null }
        ]
      } else if (action === 'update') {
        activeIndicators.value = activeIndicators.value.map(item => {
          if ((item.instanceId || item.id) !== targetInstanceId) return item
          return {
            ...item,
            ...indicator,
            instanceId: targetInstanceId,
            params: indicator.params && typeof indicator.params === 'object'
              ? { ...indicator.params }
              : (item.params || {}),
            style: indicator.style && typeof indicator.style === 'object'
              ? { color: indicator.style.color || '', lineWidth: Number(indicator.style.lineWidth || 2) }
              : (item.style || { color: '', lineWidth: 2 }),
            calculate: null
          }
        })
      } else if (action === 'remove') {
        activeIndicators.value = activeIndicators.value.filter(
          item => (item.instanceId || item.id) !== targetInstanceId
        )
      }
    }

    // Keep local state in sync with props (parent may update them).
    watch(() => props.market, v => { localMarket.value = v })
    watch(() => props.symbol, v => { localSymbol.value = v })
    watch(() => props.timeframe, v => { localTimeframe.value = v })

    // ===== Crosshair-time sync wiring =====
    // Workspace provides a shared bus via provide('workspaceSync'). When the
    // user moves the crosshair on this cell, we broadcast (timestamp, cellId).
    // When a foreign event arrives we apply the timestamp to our chart and
    // suppress the echo (the programmatic crosshairChange will re-fire our
    // own onCrosshairChange subscriber).
    const sync = inject('workspaceSync', null)
    const chartInstance = ref(null)
    let unsubscribe = null
    const echoGuard = { suppress: false }

    const onChartReady = (instance) => {
      chartInstance.value = instance
      if (!sync || !instance || typeof instance.subscribeAction !== 'function') return
      const cb = (data) => {
        if (echoGuard.suppress) return
        // klinecharts onCrosshairChange payload is
        //   { x, y, paneId, realX, kLineData, realDataIndex, dataIndex, indicatorData }
        // The bar's timestamp lives at data.kLineData.timestamp, not data.timestamp.
        const ts = data && data.kLineData && data.kLineData.timestamp
        if (ts == null) return
        // Convert cursor pixel-y -> price so peers can place the horizontal
        // crosshair line at the same PRICE on their own y-axis (which may
        // differ between timeframes). Sharing pixel y directly would put the
        // line at wrong price levels.
        let value = null
        try {
          const paneId = (data && data.paneId) || 'candle_pane'
          const pt = instance.convertFromPixel({ y: data.y }, { paneId })
          value = pt && pt.value
        } catch (_) {}
        // Tag broadcast with this cell's current market+symbol so peers can
        // decide whether the timestamp is relevant to them. Different
        // symbols (e.g. AAPL vs TSLA) won't sync; same symbol at different
        // timeframes will.
        sync.broadcast({
          sourceId: cellId,
          timestamp: ts,
          value: value,
          market: localMarket.value,
          symbol: localSymbol.value
        })
      }
      instance.subscribeAction('onCrosshairChange', cb)
      // klinecharts unsubscribeAction wants the same callback ref.
      unsubscribe = () => {
        try { instance.unsubscribeAction && instance.unsubscribeAction('onCrosshairChange', cb) } catch (_) {}
      }
    }

    if (sync) {
      watch(() => sync.event.value, (evt) => {
        if (!evt) return
        if (evt.sourceId === cellId) return
        // Only sync if this cell tracks the same instrument as the sender.
        // Different symbols (AAPL vs TSLA) or markets won't sync; same
        // symbol at different timeframes will.
        if (evt.market !== localMarket.value || evt.symbol !== localSymbol.value) return
        const inst = chartInstance.value
        if (!inst || typeof inst.executeAction !== 'function') return
        // setCrosshair internally takes pixel x (cr.x), NOT timestamp.
        // Project foreign (timestamp, value) -> local (x, y) on the candle
        // pane's own time/price axes. Same symbol at different timeframes
        // share a price scale, so value lines up nicely.
        let x, y
        try {
          const pt = inst.convertToPixel(
            { timestamp: evt.timestamp, value: evt.value },
            { paneId: 'candle_pane' }
          )
          x = pt && pt.x
          y = pt && pt.y
        } catch (_) {}
        if (x == null || !isFinite(x)) return
        if (y == null || !isFinite(y)) y = 0 // fall back: horizontal hidden at top
        // executeAction('onCrosshairChange', {x, y, paneId}) moves the
        // crosshair visually. setCrosshair is called with notExecuteAction:true
        // so subscribers are NOT re-fired (no echo).
        echoGuard.suppress = true
        try { inst.executeAction('onCrosshairChange', { x: x, y: y, paneId: 'candle_pane' }) } catch (_) {}
        setTimeout(() => { echoGuard.suppress = false }, 0)
      })
    }

    onBeforeUnmount(() => {
      if (unsubscribe) unsubscribe()
    })

    const onMarketChange = (v) => {
      localMarket.value = v
      emit('update:market', v)
    }
    const onSymbolEnter = (e) => {
      const v = (e && e.target && typeof e.target.value === 'string')
        ? e.target.value.trim()
        : String(localSymbol.value || '').trim()
      localSymbol.value = v
      emit('update:symbol', v)
    }
    const onTimeframeChange = (tf) => {
      localTimeframe.value = tf
      emit('update:timeframe', tf)
    }

    return {
      localMarket,
      localSymbol,
      localTimeframe,
      activeIndicators,
      markets: MARKETS,
      timeframes: TIMEFRAMES,
      onMarketChange,
      onSymbolEnter,
      onTimeframeChange,
      handleIndicatorToggle,
      onChartReady
    }
  }
}
</script>

<style lang="less" scoped>
.chart-cell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;

  &--focused {
    border-color: #1890ff;
    box-shadow: 0 0 0 1px rgba(24, 144, 255, 0.25);
  }

  &--dark {
    background: #141414;
    border-color: #2a2a2a;

    &.chart-cell--focused {
      border-color: #1890ff;
    }
  }
}

.chart-cell__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid #e8e8e8;
  background: #fafafa;

  .chart-cell--dark & {
    background: #1f1f1f;
    border-bottom-color: #2a2a2a;
  }
}

.chart-cell__tf-group {
  display: inline-flex;
  gap: 2px;
}

.chart-cell__tf-btn {
  padding: 2px 8px;
  font-size: 11px;
  color: #666;
  background: transparent;
  border: 1px solid #d9d9d9;
  border-radius: 3px;
  cursor: pointer;
  user-select: none;

  &:hover { color: #1890ff; border-color: #1890ff; }
  &.active {
    color: #fff;
    background: #1890ff;
    border-color: #1890ff;
  }

  .chart-cell--dark & {
    color: #d1d4dc;
    border-color: #2a2a2a;
  }
}

.chart-cell__spacer { flex: 1; }

.chart-cell__close-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  border-radius: 3px;

  &:hover { color: #ff4d4f; background: rgba(255, 77, 79, 0.08); }
}

.chart-cell__body {
  flex: 1;
  min-height: 0;
  position: relative;

  // KlineChart 內部用百分比寬高，需要明確高度
  /deep/ .chart-left {
    width: 100% !important;
    flex: 1 1 100% !important;
    height: 100% !important;
    border-right: none !important;
  }
  /deep/ .chart-wrapper { height: 100% !important; }
}
</style>
