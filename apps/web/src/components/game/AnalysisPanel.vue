<script setup lang="ts">
/**
 * AI 复盘分析面板（T20，F-E-09）。
 * 评估曲线 + 当前手评分 + 建议落点 + 关键节点 + 对局总结。
 * 对照设计稿 docs/pages/11-replay.html 右栏。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Brain, Loader2, Lightbulb, Sparkles, AlertTriangle, Check } from '@lucide/vue'
import type { GameAnalysisDTO, MoveAnalysisDTO, MoveClassification } from '@othello-platform/shared'
import EvalChart from './EvalChart.vue'

const props = defineProps<{
  analysis: GameAnalysisDTO | null
  analyzing: boolean
  analysisError: string | null
  currentStep: number
}>()

const emit = defineEmits<{ analyze: [] }>()

const { t } = useI18n()

const COL_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
function posLabel(pos: { x: number; y: number } | null): string {
  if (!pos) return t('analyze.pass')
  return `${COL_LABELS[pos.x] ?? ''}${pos.y + 1}`
}

const currentMove = computed<MoveAnalysisDTO | null>(() => {
  if (!props.analysis) return null
  const idx = Math.min(Math.max(0, props.currentStep - 1), props.analysis.moves.length - 1)
  return props.analysis.moves[idx] ?? null
})

const keyMoments = computed<MoveAnalysisDTO[]>(() => {
  if (!props.analysis) return []
  return props.analysis.moves.filter((m) => m.classification === 'brilliant' || m.classification === 'blunder')
})

const CLASS_COLOR: Record<MoveClassification, string> = {
  brilliant: 'text-gold bg-gold/5 border-gold/15',
  good: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/15',
  inaccuracy: 'text-amber-400 bg-amber-500/5 border-amber-500/15',
  blunder: 'text-red-400 bg-red-500/5 border-red-500/15',
  normal: 'text-text-secondary bg-glass border-glass-border',
}

const CLASS_BADGE: Record<MoveClassification, string> = {
  brilliant: 'bg-gold/15 text-gold border-gold/25',
  good: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  inaccuracy: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  blunder: 'bg-red-500/15 text-red-400 border-red-500/25',
  normal: 'bg-glass text-text-secondary border-glass-border',
}

function clsLabel(c: MoveClassification): string {
  return t(`analyze.${c}`)
}

function formatEval(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(2)
}

function endReasonText(result: string | null): string {
  if (!result) return '-'
  // 复用 endReason.normal（正常结束）；result 已在 winner 展示
  return t('endReason.normal')
}

const winnerText = computed(() => {
  if (!props.analysis) return ''
  const r = props.analysis.summary.result
  if (r === 'DRAW') return t('analyze.draw')
  if (r === 'BLACK') return t('analyze.blackSide')
  return t('analyze.whiteSide')
})
</script>

<template>
  <div class="px-5 py-4 space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-xs uppercase tracking-wider text-text-secondary flex items-center gap-2">
        <Brain class="w-3.5 h-3.5 text-purple-400" />{{ t('analyze.title') }}
      </h3>
      <button
        v-if="!analysis && !analyzing"
        type="button"
        class="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
        @click="emit('analyze')"
      >
        {{ t('analyze.analyzeBtn') }}
      </button>
    </div>

    <!-- 分析中 -->
    <div v-if="analyzing" class="flex items-center gap-2 text-text-secondary text-sm">
      <Loader2 class="w-4 h-4 animate-spin" />
      <span>{{ t('analyze.analyzing') }}</span>
    </div>

    <!-- 失败 -->
    <div v-else-if="analysisError" class="text-red-400 text-xs">{{ analysisError }}</div>

    <!-- 分析结果 -->
    <template v-else-if="analysis">
      <!-- 评估曲线 -->
      <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-4">
        <EvalChart :moves="analysis.moves" :current-step="currentStep" />
      </div>

      <!-- 当前手评分 -->
      <div v-if="currentMove && !currentMove.isPass" class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-[10px] uppercase tracking-wider text-text-secondary">{{ t('analyze.currentScore') }}</span>
          <span
            class="px-2 py-0.5 rounded-md text-[10px] font-semibold border"
            :class="CLASS_BADGE[currentMove.classification]"
          >
            {{ clsLabel(currentMove.classification) }}
          </span>
        </div>
        <div class="flex items-center gap-3 mb-3">
          <span class="text-sm text-text-primary font-medium">
            {{ t('analyze.moveN', { n: currentMove.seq }) }} · {{ posLabel(currentMove.pos) }}
          </span>
          <span
            class="text-xl font-bold font-mono tabular-nums"
            :class="currentMove.eval >= 0 ? 'text-emerald-400' : 'text-red-400'"
          >
            {{ formatEval(currentMove.eval) }}
          </span>
        </div>
        <div v-if="currentMove.bestPos" class="bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-lg p-3">
          <div class="flex items-center gap-2 mb-1">
            <Lightbulb class="w-3.5 h-3.5 text-gold" />
            <span class="text-[11px] text-text-secondary">{{ t('analyze.bestMove') }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold text-text-primary font-mono">{{ posLabel(currentMove.bestPos) }}</span>
            <span class="text-[10px] text-text-secondary">·</span>
            <span class="text-sm text-gold font-mono">{{ formatEval(currentMove.bestEval) }}</span>
            <span class="text-[10px] text-text-secondary ml-1">{{ t('analyze.bestMoveHint') }}</span>
          </div>
        </div>
      </div>

      <!-- 关键节点 -->
      <div v-if="keyMoments.length > 0" class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-4">
        <span class="text-[10px] uppercase tracking-wider text-text-secondary mb-3 block">{{ t('analyze.keyMoments') }}</span>
        <div class="space-y-2.5">
          <div
            v-for="m in keyMoments"
            :key="m.seq"
            class="flex items-center gap-3 px-3 py-2 rounded-lg border"
            :class="CLASS_COLOR[m.classification]"
          >
            <Sparkles v-if="m.classification === 'brilliant'" class="w-4 h-4 text-gold flex-shrink-0" />
            <AlertTriangle v-else class="w-4 h-4 text-red-400 flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <span class="text-xs text-text-primary font-medium">
                {{ t('analyze.moveN', { n: m.seq }) }} · {{ posLabel(m.pos) }}
              </span>
              <span class="text-[10px] ml-2" :class="m.classification === 'brilliant' ? 'text-gold' : 'text-red-400'">
                {{ clsLabel(m.classification) }}
              </span>
            </div>
            <span
              class="text-xs font-mono"
              :class="m.eval >= 0 ? 'text-emerald-400' : 'text-red-400'"
            >
              {{ formatEval(m.eval) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 对局总结 -->
      <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-4">
        <span class="text-[10px] uppercase tracking-wider text-text-secondary mb-3 block">{{ t('analyze.matchSummary') }}</span>
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="text-xs text-text-secondary">{{ t('analyze.winner') }}</span>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full bg-gradient-to-br from-gray-900 to-black"></div>
              <span class="text-xs text-text-primary font-medium">{{ winnerText }}</span>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-text-secondary">{{ t('analyze.blackAvg') }} / {{ t('analyze.whiteAvg') }}</span>
            <div class="flex items-center gap-3">
              <span class="text-xs text-emerald-400 font-mono">{{ formatEval(analysis.summary.blackAvg) }}</span>
              <span class="text-xs text-red-400 font-mono">{{ formatEval(analysis.summary.whiteAvg) }}</span>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-text-secondary">{{ t('analyze.brilliantCount') }}</span>
            <div class="flex items-center gap-2 text-xs font-mono">
              <span class="text-gold flex items-center gap-1"><Sparkles class="w-3 h-3" />{{ analysis.summary.brilliantCount }}</span>
              <span class="text-text-secondary">/</span>
              <span class="text-red-400 flex items-center gap-1"><AlertTriangle class="w-3 h-3" />{{ analysis.summary.blunderCount }}</span>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-text-secondary">{{ t('analyze.inaccuracyCount') }}</span>
            <span class="text-xs text-text-primary font-mono">{{ analysis.summary.inaccuracyCount }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-text-secondary">{{ t('analyze.endReason') }}</span>
            <span class="text-xs text-text-primary">{{ endReasonText(analysis.summary.result) }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 空态 -->
    <div v-else class="flex items-center justify-center py-8 text-text-secondary text-xs">
      <Check class="w-3.5 h-3.5 mr-1.5" />
      <span>{{ t('analyze.analyzeBtn') }}</span>
    </div>
  </div>
</template>