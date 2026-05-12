<template>
  <div class="workspace" :class="{ 'workspace--dark': theme === 'dark' }">
    <!-- Top toolbar: layout selector -->
    <div class="workspace__toolbar">
      <span class="workspace__label">Layout:</span>
      <div class="workspace__layout-group">
        <button
          v-for="opt in layoutOptions"
          :key="opt.key"
          class="workspace__layout-btn"
          :class="{ active: layout === opt.key }"
          :title="opt.title"
          @click="setLayout(opt.key)"
        >
          <span class="layout-icon" :class="'layout-icon--' + opt.key"></span>
          {{ opt.label }}
        </button>
      </div>
      <div class="workspace__toolbar-spacer"></div>
      <span class="workspace__hint">Click a chart to focus it. Realtime is off in Workspace.</span>
    </div>

    <!-- Chart grid -->
    <div class="workspace__grid" :class="'workspace__grid--' + layout">
      <ChartCell
        v-for="(cell, idx) in cells"
        :key="cell.id"
        :market="cell.market"
        :symbol="cell.symbol"
        :timeframe="cell.timeframe"
        :theme="theme"
        :focused="idx === focusedIdx"
        :closable="cells.length > 1"
        @focus="focusedIdx = idx"
        @remove="removeCell(idx)"
        @update:market="v => updateCell(idx, 'market', v)"
        @update:symbol="v => updateCell(idx, 'symbol', v)"
        @update:timeframe="v => updateCell(idx, 'timeframe', v)"
      />
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed } from 'vue'
import ChartCell from './components/ChartCell.vue'

// 1='1' single, 2v='1+1 vertical' (default), 2h='1+1 horizontal', 4='2x2'
const LAYOUT_TO_CELL_COUNT = {
  '1': 1,
  '2v': 2,
  '2h': 2,
  '4': 4
}

const DEFAULT_CELLS = [
  { market: 'USStock', symbol: 'AAPL', timeframe: '4H' },
  { market: 'USStock', symbol: 'AAPL', timeframe: '15m' },
  { market: 'USStock', symbol: 'AAPL', timeframe: '1H' },
  { market: 'USStock', symbol: 'AAPL', timeframe: '5m' }
]

let _cellId = 0
const nextCellId = () => `cell-${++_cellId}`

export default {
  name: 'Workspace',
  components: { ChartCell },
  setup () {
    const layout = ref('2v') // default per user spec: 1+1 vertical
    const cells = reactive([])
    const focusedIdx = ref(0)

    // Persisted across layout changes; we just trim/extend the visible list.
    const _ensureCells = (n) => {
      while (cells.length < n) {
        const tpl = DEFAULT_CELLS[cells.length] || DEFAULT_CELLS[0]
        cells.push({ id: nextCellId(), ...tpl })
      }
      // Don't actually destroy data on shrink — keep memory for re-expansion.
      // The grid CSS only renders the first `n` cells via v-for limit below.
    }

    const visibleCells = computed(() => {
      const n = LAYOUT_TO_CELL_COUNT[layout.value] || 1
      _ensureCells(n)
      return cells.slice(0, n)
    })

    const setLayout = (key) => {
      if (!LAYOUT_TO_CELL_COUNT[key]) return
      layout.value = key
      const n = LAYOUT_TO_CELL_COUNT[key]
      if (focusedIdx.value >= n) focusedIdx.value = 0
    }

    const updateCell = (idx, field, value) => {
      if (!cells[idx]) return
      cells[idx] = { ...cells[idx], [field]: value }
    }

    const removeCell = (idx) => {
      if (cells.length <= 1) return
      cells.splice(idx, 1)
      // After removal, the layout's expected count may be larger than remaining
      // cells — _ensureCells will refill defaults on next visibleCells read.
      if (focusedIdx.value >= cells.length) focusedIdx.value = Math.max(0, cells.length - 1)
    }

    // Theme: read from localStorage / default light. Workspace is read-only
    // re-uses the same key the rest of the app stores theme under.
    const theme = ref('light')
    try {
      const stored = window.localStorage.getItem('app-theme')
      if (stored === 'dark' || stored === 'light') theme.value = stored
    } catch (e) { /* ignore */ }

    // Seed with default count
    _ensureCells(LAYOUT_TO_CELL_COUNT[layout.value])

    const layoutOptions = [
      { key: '1', label: '1', title: 'Single chart' },
      { key: '2v', label: '1+1 ↕', title: 'Two charts, stacked vertically' },
      { key: '2h', label: '1+1 ↔', title: 'Two charts, side by side' },
      { key: '4', label: '2×2', title: 'Four charts, grid' }
    ]

    return {
      layout,
      layoutOptions,
      cells: visibleCells,
      focusedIdx,
      theme,
      setLayout,
      updateCell,
      removeCell
    }
  }
}
</script>

<style lang="less" scoped>
.workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #f0f2f5;
  padding: 8px;
  gap: 8px;

  &--dark { background: #0e0e0e; }
}

.workspace__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 10px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 4px;

  .workspace--dark & {
    background: #1f1f1f;
    border-color: #2a2a2a;
    color: #d1d4dc;
  }
}

.workspace__label {
  font-size: 12px;
  font-weight: 600;
  color: #666;

  .workspace--dark & { color: #aaa; }
}

.workspace__layout-group {
  display: inline-flex;
  gap: 4px;
}

.workspace__layout-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: #666;
  background: #fafafa;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;

  &:hover { color: #1890ff; border-color: #1890ff; }
  &.active {
    color: #fff;
    background: #1890ff;
    border-color: #1890ff;
  }

  .workspace--dark & {
    color: #d1d4dc;
    background: #252525;
    border-color: #2a2a2a;
  }
}

.workspace__toolbar-spacer { flex: 1; }

.workspace__hint {
  font-size: 11px;
  color: #999;

  .workspace--dark & { color: #777; }
}

.workspace__grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 8px;

  &--1  { grid-template-columns: 1fr;       grid-template-rows: 1fr; }
  &--2v { grid-template-columns: 1fr;       grid-template-rows: 1fr 1fr; }
  &--2h { grid-template-columns: 1fr 1fr;   grid-template-rows: 1fr; }
  &--4  { grid-template-columns: 1fr 1fr;   grid-template-rows: 1fr 1fr; }
}
</style>
