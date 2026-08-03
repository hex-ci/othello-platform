<script setup lang="ts">
/**
 * 评估曲线 SVG（T20，F-E-09）。
 * 黑方视角 [-1,+1]：曲线在中线之上 = 黑优，之下 = 白优。
 * 当前手用金色竖线 + 圆点高亮。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MoveAnalysisDTO } from '@othello-platform/shared'

const props = defineProps<{
  moves: MoveAnalysisDTO[]
  currentStep: number
}>()

const { t } = useI18n()

const W = 280
const H = 120
const PAD = 4

const points = computed(() => {
  const ms = props.moves
  if (ms.length === 0) return ''
  const n = ms.length
  const stepX = n > 1 ? (W - PAD * 2) / (n - 1) : 0
  return ms
    .map((m, i) => {
      const x = PAD + (n > 1 ? stepX * i : (W - PAD * 2) / 2)
      // eval 黑方视角 [-1,1] → y (1=顶/H=0, -1=底/H=H)
      const y = H / 2 - (m.eval * (H / 2 - PAD))
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

const areaPath = computed(() => {
  const ms = props.moves
  if (ms.length === 0) return ''
  const n = ms.length
  const stepX = n > 1 ? (W - PAD * 2) / (n - 1) : 0
  const linePts: string[] = []
  ms.forEach((m, i) => {
    const x = PAD + (n > 1 ? stepX * i : (W - PAD * 2) / 2)
    const y = H / 2 - (m.eval * (H / 2 - PAD))
    linePts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  })
  const firstX = PAD
  const lastX = n > 1 ? W - PAD : (W - PAD * 2) / 2 + PAD
  return `M ${linePts.join(' L ')} L ${lastX.toFixed(1)},${(H / 2).toFixed(1)} L ${firstX.toFixed(1)},${(H / 2).toFixed(1)} Z`
})

const currentMarker = computed(() => {
  const ms = props.moves
  if (ms.length === 0) return null
  // currentStep 含义：第 currentStep 帧（0=初始盘）。对应分析手 seq=currentStep（含 pass）
  const idx = Math.min(Math.max(0, props.currentStep - 1), ms.length - 1)
  const m = ms[idx]
  if (!m) return null
  const n = ms.length
  const stepX = n > 1 ? (W - PAD * 2) / (n - 1) : 0
  const x = PAD + (n > 1 ? stepX * idx : (W - PAD * 2) / 2)
  const y = H / 2 - (m.eval * (H / 2 - PAD))
  return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) }
})

const fromTo = computed(() => ({ from: 1, to: props.moves.length }))
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <span class="text-[10px] uppercase tracking-wider text-text-secondary">{{ t('analyze.evalCurve') }}</span>
      <span class="text-[10px] text-text-secondary">{{ t('analyze.moveRange', fromTo) }}</span>
    </div>
    <div class="relative h-[120px] w-full">
      <svg :viewBox="`0 0 ${W} ${H}`" class="w-full h-full" preserveAspectRatio="none">
        <!-- 中线 -->
        <line :x1="0" :y1="H / 2" :x2="W" :y2="H / 2" stroke="rgba(255,255,255,0.1)" stroke-width="0.5" stroke-dasharray="4,4" />
        <line :x1="0" :y1="H / 4" :x2="W" :y2="H / 4" stroke="rgba(255,255,255,0.05)" stroke-width="0.5" />
        <line :x1="0" :y1="3 * H / 4" :x2="W" :y2="3 * H / 4" stroke="rgba(255,255,255,0.05)" stroke-width="0.5" />
        <!-- 黑优填充 -->
        <path v-if="areaPath" :d="areaPath" fill="rgba(26,107,60,0.15)" />
        <!-- 折线 -->
        <polyline v-if="points" :points="points" fill="none" stroke="rgba(212,168,67,0.8)" stroke-width="1.5" />
        <!-- 当前手标记 -->
        <template v-if="currentMarker">
          <line
            :x1="currentMarker.x" :y1="0"
            :x2="currentMarker.x" :y2="H"
            stroke="rgba(212,168,67,0.5)" stroke-width="1" stroke-dasharray="3,3"
          />
          <circle :cx="currentMarker.x" :cy="currentMarker.y" r="3" fill="#d4a843" />
        </template>
      </svg>
      <div class="absolute top-0 left-0 text-[8px] text-text-secondary">{{ t('analyze.blackAdv') }}</div>
      <div class="absolute bottom-0 left-0 text-[8px] text-text-secondary">{{ t('analyze.whiteAdv') }}</div>
      <div class="absolute top-[47%] right-0 text-[8px] text-text-secondary/50">{{ t('analyze.even') }}</div>
    </div>
  </div>
</template>
