<script setup lang="ts">
/**
 * 棋谱列表（T08）：展示走子历史（含 pass）。
 */
import type { Color, Pos } from '@othello-platform/engine'

defineProps<{
  moves: { seq: number, color: Color, pos: Pos | null, isPass: boolean }[]
}>()

const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function posLabel(pos: Pos | null, isPass: boolean): string {
  if (isPass || !pos) return 'PASS'
  const col = COL_LABELS[pos.x] ?? ''
  return `${col}${pos.y + 1}`
}
</script>

<template>
  <div class="h-48 overflow-y-auto rounded-lg bg-surface/60 border border-glass-border p-2">
    <div v-if="moves.length === 0" class="text-text-secondary text-sm text-center py-4">{{ $t('local.noMoves') }}</div>
    <ol v-else class="space-y-1 text-sm font-mono">
      <li v-for="m in moves" :key="m.seq" class="flex items-center gap-2">
        <span class="text-text-secondary w-6 text-right">{{ m.seq }}.</span>
        <span
          class="inline-block w-3 h-3 rounded-full border"
          :class="m.color === 'BLACK' ? 'bg-black border-white/30' : 'bg-white border-black/30'"
        ></span>
        <span :class="m.isPass ? 'text-text-secondary italic' : 'text-text-primary'">
          {{ posLabel(m.pos, m.isPass) }}
        </span>
      </li>
    </ol>
  </div>
</template>
