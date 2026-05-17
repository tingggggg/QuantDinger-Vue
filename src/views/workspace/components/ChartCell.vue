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

    // ===== Workspace sync wiring (crosshair + visible range) =====
    // Workspace provides a shared bus via provide('workspaceSync'). On local
    // crosshair / scroll / zoom we broadcast; on foreign events from cells
    // with the same market+symbol we replay onto our own axes. Source-tagging
    // prevents echo, and separate suppress flags isolate the two streams.
    const sync = inject('workspaceSync', null)
    const chartInstance = ref(null)
    let unsubscribeCrosshair = null
    let unsubscribeRange = null
    const crosshairGuard = { suppress: false }
    const rangeGuard = { suppress: false }
    // Dedup: skip broadcasting identical range tuples back-to-back, because
    // klinecharts re-fires onVisibleRangeChange on every redraw/resize.
    let lastSentRange = null
    // Index nearest to a timestamp via binary search on the dataList.
    const nearestIndex = (dataList, ts) => {
      if (!dataList.length) return -1
      let lo = 0; let hi = dataList.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (dataList[mid].timestamp < ts) lo = mid + 1
        else hi = mid
      }
      // Pick the closer of lo / lo-1.
      if (lo > 0 && Math.abs(dataList[lo - 1].timestamp - ts) < Math.abs(dataList[lo].timestamp - ts)) {
        return lo - 1
      }
      return lo
    }

    const onChartReady = (instance) => {
      chartInstance.value = instance
      if (!sync || !instance || typeof instance.subscribeAction !== 'function') return

      // --- Crosshair: broadcast (timestamp, price) on hover ---
      const crosshairCb = (data) => {
        if (crosshairGuard.suppress) return
        // klinecharts onCrosshairChange payload:
        //   { x, y, paneId, realX, kLineData, realDataIndex, dataIndex, indicatorData }
        // The bar's timestamp lives at data.kLineData.timestamp.
        const ts = data && data.kLineData && data.kLineData.timestamp
        if (ts == null) return
        // Convert cursor pixel-y -> price so peers can place the horizontal
        // line at the same PRICE on their own y-axis (which may differ
        // between timeframes).
        let value = null
        try {
          const paneId = (data && data.paneId) || 'candle_pane'
          const pt = instance.convertFromPixel({ y: data.y }, { paneId })
          value = pt && pt.value
        } catch (_) {}
        sync.broadcastCrosshair({
          sourceId: cellId,
          timestamp: ts,
          value: value,
          market: localMarket.value,
          symbol: localSymbol.value
        })
      }
      instance.subscribeAction('onCrosshairChange', crosshairCb)
      unsubscribeCrosshair = () => {
        try { instance.unsubscribeAction && instance.unsubscribeAction('onCrosshairChange', crosshairCb) } catch (_) {}
      }

      // --- Visible range: broadcast (fromTime, toTime) on scroll/zoom ---
      const rangeCb = (data) => {
        if (rangeGuard.suppress) return
        if (!data) return
        // klinecharts payload: { from, to, realFrom, realTo } (bar indices).
        // realFrom/realTo are clamped to dataList bounds.
        const dataList = instance.getDataList()
        if (!dataList.length) return
        const a = Math.max(0, Math.min(data.realFrom | 0, dataList.length - 1))
        const b = Math.max(0, Math.min(data.realTo | 0, dataList.length - 1))
        const fromTime = dataList[a] && dataList[a].timestamp
        const toTime = dataList[b] && dataList[b].timestamp
        if (fromTime == null || toTime == null) return
        // Dedup: klinecharts re-fires onVisibleRangeChange on every redraw.
        if (lastSentRange && lastSentRange.fromTime === fromTime && lastSentRange.toTime === toTime) return
        lastSentRange = { fromTime, toTime }
        sync.broadcastRange({
          sourceId: cellId,
          fromTime: fromTime,
          toTime: toTime,
          market: localMarket.value,
          symbol: localSymbol.value
        })
      }
      instance.subscribeAction('onVisibleRangeChange', rangeCb)
      unsubscribeRange = () => {
        try { instance.unsubscribeAction && instance.unsubscribeAction('onVisibleRangeChange', rangeCb) } catch (_) {}
      }
    }

    if (sync) {
      // Apply foreign crosshair events.
      watch(() => sync.crosshairEvent.value, (evt) => {
        if (!evt || evt.sourceId === cellId) return
        if (evt.market !== localMarket.value || evt.symbol !== localSymbol.value) return
        const inst = chartInstance.value
        if (!inst || typeof inst.executeAction !== 'function') return
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
        if (y == null || !isFinite(y)) y = 0
        crosshairGuard.suppress = true
        try { inst.executeAction('onCrosshairChange', { x: x, y: y, paneId: 'candle_pane' }) } catch (_) {}
        setTimeout(() => { crosshairGuard.suppress = false }, 0)
      })

      // Apply foreign visible-range events: match the same time window on
      // our own axis by adjusting barSpace + scrolling to the right edge.
      watch(() => sync.rangeEvent.value, (evt) => {
        if (!evt || evt.sourceId === cellId) return
        if (evt.market !== localMarket.value || evt.symbol !== localSymbol.value) return
        const inst = chartInstance.value
        if (!inst || typeof inst.setBarSpace !== 'function' ||
            typeof inst.scrollToTimestamp !== 'function') return
        const dataList = inst.getDataList && inst.getDataList()
        if (!dataList || !dataList.length) return
        const fromIdx = nearestIndex(dataList, evt.fromTime)
        const toIdx = nearestIndex(dataList, evt.toTime)
        const barCount = Math.max(2, toIdx - fromIdx + 1)
        // Pane width = candle pane DOM width. getDom signature varies; try
        // a couple of shapes before giving up.
        let paneWidth = 0
        try {
          const dom = inst.getDom && (inst.getDom('candle_pane', 'main') || inst.getDom('candle_pane'))
          paneWidth = (dom && dom.clientWidth) || 0
        } catch (_) {}
        if (!paneWidth) paneWidth = 800 // sane fallback
        const newBarSpace = Math.max(1, Math.min(50, paneWidth / barCount))
        rangeGuard.suppress = true
        try {
          inst.setBarSpace(newBarSpace)
          inst.scrollToTimestamp(evt.toTime)
        } catch (_) {}
        // setBarSpace + scrollToTimestamp each re-fire onVisibleRangeChange.
        // Keep the guard up long enough for both to settle.
        setTimeout(() => { rangeGuard.suppress = false }, 80)
      })
    }

    onBeforeUnmount(() => {
      if (unsubscribeCrosshair) unsubscribeCrosshair()
      if (unsubscribeRange) unsubscribeRange()
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
