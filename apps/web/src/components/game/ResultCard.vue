<script setup lang="ts">
/**
 * 对局结算卡片（C 档，对齐设计稿 06-game-over）。
 * 胜利横幅 + 双方比分卡（WIN 徽章 + 比例条）+ 操作插槽。
 * ELO/积分/分享/复盘等未实现，忽略。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Crown, Medal, Handshake } from '@lucide/vue'

const props = defineProps<{
  result: 'BLACK' | 'WHITE' | 'DRAW'
  blackCount: number
  whiteCount: number
  blackName: string
  whiteName: string
  /** 黑方是否为「你」 */
  blackIsYou: boolean
  endReason?: string
  moveCount?: number
}>()

const { t } = useI18n()

const isDraw = computed(() => props.result === 'DRAW')
const iWon = computed(() => !isDraw.value && (props.result === 'BLACK') === props.blackIsYou)

const banner = computed(() => {
  if (isDraw.value) return { text: t('result.draw'), tone: 'draw' as const }
  return iWon.value ? { text: t('result.win'), tone: 'win' as const } : { text: t('result.lose'), tone: 'lose' as const }
})

const total = computed(() => props.blackCount + props.whiteCount)
const blackPct = computed(() => (total.value === 0 ? 50 : Math.round((props.blackCount / total.value) * 100)))
const whitePct = computed(() => 100 - blackPct.value)

const subtitle = computed(() => {
  let base: string
  if (isDraw.value) {
    base = t('result.drawSubtitle', { b: props.blackCount, w: props.whiteCount })
  }
  else {
    const winner = props.result === 'BLACK' ? props.blackName : props.whiteName
    const wc = props.result === 'BLACK' ? props.blackCount : props.whiteCount
    const lc = props.result === 'BLACK' ? props.whiteCount : props.blackCount
    base = t('result.winSubtitle', { winner, wc, lc })
  }
  return props.endReason ? `${base} · ${props.endReason}` : base
})

function nameTag(name: string, isYou: boolean): string {
  return isYou ? `${name}${t('common.youSuffix')}` : name
}
</script>

<template>
  <div>
    <!-- 胜利横幅 -->
    <div class="text-center mb-6 animate-[pop-in_0.6s_ease-out]">
      <div
        class="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 animate-[float_4s_ease-in-out_infinite]"
        :class="{
          'bg-gradient-to-br from-gold to-gold-light shadow-[0_8px_40px_rgba(212,168,67,0.5)]': banner.tone === 'win',
          'bg-gradient-to-br from-gray-500 to-gray-700 shadow-[0_8px_40px_rgba(0,0,0,0.4)]': banner.tone === 'lose',
          'bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-[0_8px_40px_rgba(16,185,129,0.4)]': banner.tone === 'draw',
        }"
      >
        <Crown v-if="banner.tone === 'win'" class="w-10 h-10 text-[#0f1117]" />
        <Medal v-else-if="banner.tone === 'lose'" class="w-10 h-10 text-gray-200" />
        <Handshake v-else class="w-10 h-10 text-white" />
      </div>
      <h1
        class="text-4xl font-black mb-2"
        :class="banner.tone === 'win' ? 'gold-shine' : banner.tone === 'lose' ? 'text-text-secondary' : 'text-emerald-400'"
      >
        {{ banner.text }}
      </h1>
      <p class="text-text-secondary text-sm">{{ subtitle }}</p>
    </div>

    <!-- 比分卡 -->
    <div class="backdrop-blur-xl bg-glass border rounded-2xl p-6" :class="iWon ? 'border-gold/30' : 'border-glass-border'">
      <div class="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
        <!-- 黑方 -->
        <div class="flex flex-col items-center text-center">
          <div class="relative mb-3">
            <div
              class="w-16 h-16 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border-4 flex items-center justify-center"
              :class="result === 'BLACK' && !isDraw ? 'border-gold shadow-[0_4px_20px_rgba(212,168,67,0.4)]' : 'border-glass-border shadow-[0_4px_20px_rgba(0,0,0,0.3)]'"
            >
              <span class="text-xl font-bold text-white">{{ $t('result.blackPiece') }}</span>
            </div>
            <div v-if="result === 'BLACK' && !isDraw" class="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-gold text-[9px] font-bold text-[#0f1117]">
              WIN
            </div>
          </div>
          <p class="text-sm font-bold" :class="blackIsYou ? '' : 'text-text-secondary'">{{ nameTag(blackName, blackIsYou) }}</p>
          <p class="text-[10px] text-text-secondary mt-0.5">{{ $t('result.playBlackFirst') }}</p>
          <p class="text-3xl font-black font-mono tabular-nums mt-2" :class="result === 'BLACK' && !isDraw ? 'text-gold' : 'text-text-secondary'">
            {{ blackCount }}
          </p>
        </div>

        <!-- 中央比例条 -->
        <div class="flex flex-col items-center px-4">
          <span class="text-[10px] text-text-secondary uppercase tracking-widest mb-1">{{ $t('result.score') }}</span>
          <div class="h-2 w-32 rounded-full overflow-hidden flex bg-[rgba(255,255,255,0.08)]">
            <div class="bg-gradient-to-r from-gray-700 to-gray-500 transition-all duration-500" :style="{ width: `${blackPct}%` }"></div>
            <div class="bg-gradient-to-r from-gray-200 to-white transition-all duration-500" :style="{ width: `${whitePct}%` }"></div>
          </div>
          <span v-if="moveCount !== undefined" class="text-[10px] text-text-secondary mt-2">{{ $t('result.endAtMove', { n: moveCount }) }}</span>
        </div>

        <!-- 白方 -->
        <div class="flex flex-col items-center text-center">
          <div class="relative mb-3">
            <div
              class="w-16 h-16 rounded-full bg-gradient-to-br from-white to-gray-200 border-4 flex items-center justify-center"
              :class="result === 'WHITE' && !isDraw ? 'border-gold shadow-[0_4px_20px_rgba(212,168,67,0.4)]' : 'border-glass-border shadow-[0_4px_20px_rgba(0,0,0,0.3)]'"
            >
              <span class="text-xl font-bold text-gray-700">{{ $t('result.whitePiece') }}</span>
            </div>
            <div v-if="result === 'WHITE' && !isDraw" class="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-gold text-[9px] font-bold text-[#0f1117]">
              WIN
            </div>
          </div>
          <p class="text-sm font-bold" :class="!blackIsYou ? '' : 'text-text-secondary'">{{ nameTag(whiteName, !blackIsYou) }}</p>
          <p class="text-[10px] text-text-secondary mt-0.5">{{ $t('result.playWhiteSecond') }}</p>
          <p class="text-3xl font-black font-mono tabular-nums mt-2" :class="result === 'WHITE' && !isDraw ? 'text-gold' : 'text-text-secondary'">
            {{ whiteCount }}
          </p>
        </div>
      </div>
    </div>

    <!-- 操作插槽 -->
    <div class="mt-5">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
@keyframes pop-in {
  0% { transform: scale(0.8); opacity: 0; }
  60% { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes shine {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
.gold-shine {
  background: linear-gradient(90deg, #d4a843, #e8c96a, #d4a843);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  background-size: 200% auto;
  animation: shine 3s linear infinite;
}
</style>
