<script setup lang="ts">
/**
 * 比分卡（离线人机侧栏用，对照设计稿 16-local）：黑（你）vs 白（AI），
 * 当前回合方的棋子带金色脉冲环。竖版布局，供 LocalGamePage 右侧栏使用。
 */
import { useGameStore } from '@/stores/game-store'

const store = useGameStore()
</script>

<template>
  <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4">
      <span class="text-[10px] uppercase tracking-wider text-text-secondary">{{
        $t('local.score')
      }}</span>
      <span class="text-[10px] text-text-secondary font-mono">{{
        $t('local.moveNumber', { n: store.moveHistory.length })
      }}</span>
    </div>
    <div class="flex items-center justify-between">
      <!-- 黑（你）—— 当前回合金色脉冲环 -->
      <div class="flex items-center gap-3">
        <div
          class="w-11 h-11 rounded-full stone-b"
          :class="
            store.turn === 'BLACK' && store.gameStatus === 'playing'
              ? 'animate-[turnPulse_1.8s_ease-in-out_infinite]'
              : ''
          "
        />
        <div>
          <p class="text-[11px] text-text-secondary">{{ $t('local.youBlack') }}</p>
          <p class="text-2xl font-black font-mono leading-none mt-1">{{ store.counts.black }}</p>
        </div>
      </div>
      <span class="text-text-secondary text-xs font-mono">vs</span>
      <!-- 白（AI） -->
      <div class="flex items-center gap-3">
        <div>
          <p class="text-[11px] text-text-secondary text-right">{{ $t('local.aiWhite') }}</p>
          <p class="text-2xl font-black font-mono leading-none mt-1 text-right">
            {{ store.counts.white }}
          </p>
        </div>
        <div
          class="w-11 h-11 rounded-full stone-w"
          :class="
            store.turn === 'WHITE' && store.gameStatus === 'playing'
              ? 'animate-[turnPulse_1.8s_ease-in-out_infinite]'
              : ''
          "
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.stone-b {
  background: radial-gradient(circle at 35% 30%, #4a4a4a, #0a0a0a 62%);
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.55),
    inset 0 1px 2px rgba(255, 255, 255, 0.14);
}
.stone-w {
  background: radial-gradient(circle at 35% 30%, #ffffff, #c9ced6 68%);
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.45),
    inset 0 -1px 2px rgba(0, 0, 0, 0.12);
}
@keyframes turnPulse {
  0%,
  100% {
    box-shadow:
      0 0 0 2px rgba(212, 168, 67, 0.55),
      0 0 14px rgba(212, 168, 67, 0.35);
  }
  50% {
    box-shadow:
      0 0 0 3px rgba(212, 168, 67, 0.9),
      0 0 26px rgba(212, 168, 67, 0.6);
  }
}
</style>
