<script setup lang="ts">
/**
 * 圆形每步倒计时（F-C-04）。
 * 本地展示，服务端超时为权威；样式对齐设计稿 05-game。
 */
import { computed } from 'vue'

const {
  remaining,
  total = 30,
} = defineProps<{
  /** 当前回合剩余秒数 */
  remaining: number
  /** 每步总秒数（用于计算圆环进度） */
  total?: number
}>()

const RADIUS = 35
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const dashOffset = computed(() => {
  const ratio = Math.max(0, Math.min(1, remaining / total))
  return CIRCUMFERENCE * (1 - ratio)
})

const mmss = computed(() => {
  const s = Math.max(0, remaining)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
})

const urgent = computed(() => remaining <= 10)
</script>

<template>
  <div class="relative w-20 h-20">
    <svg class="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
      <circle cx="40" cy="40" :r="RADIUS" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="4" />
      <circle
        cx="40"
        cy="40"
        :r="RADIUS"
        fill="none"
        :stroke="urgent ? '#f87171' : '#d4a843'"
        stroke-width="4"
        stroke-linecap="round"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="dashOffset"
        class="transition-[stroke-dashoffset] duration-1000 ease-linear"
      />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <span class="text-[8px] text-text-secondary uppercase">{{ $t('moveTimer.step') }}</span>
      <span class="text-sm font-bold font-mono tabular-nums" :class="urgent ? 'text-red-400' : 'text-gold'">
        {{ mmss }}
      </span>
    </div>
  </div>
</template>
