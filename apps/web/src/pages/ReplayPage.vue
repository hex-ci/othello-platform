<script setup lang="ts">
/**
 * 复盘页面（T15，F-E-09/11 + T20 AI 复盘分析）。
 * 路由 /replay/:id（对局 id 或分享令牌），加载走子历史并逐步回放。
 * 三栏：左棋盘 + 控制 / 中走子记录 / 右 AI 分析。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Share2,
  Loader2,
  Download,
  Upload,
} from '@lucide/vue'
import { useReplayStore } from '@/stores/replay-store'
import { encodeMoves, decodeMoves, NotationError } from '@othello-platform/engine'
import GameBoard from '@/components/game/GameBoard.vue'
import AnalysisPanel from '@/components/game/AnalysisPanel.vue'
import CopyFallbackDialog from '@/components/ui/CopyFallbackDialog.vue'
import { useCopy } from '@/composables/use-copy'
import { toast } from 'vue-sonner'

const route = useRoute()
const router = useRouter()
const replay = useReplayStore()
const { t } = useI18n()
const { pendingCopy, copy, clearPending } = useCopy()

const {
  game,
  blackName,
  whiteName,
  currentStep,
  totalSteps,
  board,
  blackCount,
  whiteCount,
  playing,
  speed,
  loading,
  error,
  frames,
  analysis,
  analyzing,
  analysisError,
} = storeToRefs(replay)

const COL_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

function posLabel(pos: { x: number; y: number } | null): string {
  if (!pos) return 'pass'
  return `${COL_LABELS[pos.x] ?? ''}${pos.y + 1}`
}

function formatMove(m: {
  color: string
  pos: { x: number; y: number } | null
  isPass: boolean
}): string {
  if (m.isPass)
    return `${m.color === 'BLACK' ? t('replay.blackShort') : t('replay.whiteShort')} pass`
  return `${m.color === 'BLACK' ? t('replay.blackShort') : t('replay.whiteShort')} ${posLabel(m.pos)}`
}

async function shareGame(): Promise<void> {
  if (!game.value) return
  try {
    const { createShareToken } = await import('@/api/rooms')
    const res = await createShareToken(game.value.id)
    const url = `${window.location.origin}/replay/${res.token}`
    const ok = await copy(url)
    if (ok) toast.success(t('replay.shareCopied'))
    // 失败时 useCopy 已记录 pendingCopy，弹窗引导手动复制
  } catch {
    toast.error(t('replay.shareFail'))
  }
}

/** 导出标准记谱（F-E-19）：本地编码后复制到剪贴板 */
async function exportNotation(): Promise<void> {
  if (!frames.value) return
  const moves = frames.value
    .slice(1)
    .filter((f) => f.move)
    .map((f) => ({
      color: f.move!.color as 'BLACK' | 'WHITE',
      pos: f.move!.pos,
      isPass: f.move!.isPass,
    }))
  const notation = encodeMoves(moves)
  const ok = await copy(notation)
  if (ok) toast.success(t('notation.exportCopied', { s: notation }))
  // 失败时 useCopy 已记录 pendingCopy，弹窗引导手动复制
}

/** 导入标准记谱（F-E-19）：粘贴记谱 → 解码 → 本地回放 */
const showImport = ref(false)
const importText = ref('')
const importError = ref<string | null>(null)

function openImport(): void {
  importText.value = ''
  importError.value = null
  showImport.value = true
}

function doImport(): void {
  importError.value = null
  try {
    const moves = decodeMoves(importText.value.trim())
    // 用解码出的走子序列构建本地复盘帧
    replay.loadFromMoves(moves)
    showImport.value = false
  } catch (err) {
    importError.value = err instanceof NotationError ? err.message : t('notation.invalid')
  }
}

/** AI 复盘分析由用户在 AnalysisPanel 主动点击"开始分析"触发，避免对局加载即探缓存 404 污染 console */

onMounted(async () => {
  const id = String(route.params.id)
  // gameId 格式为 g_数字；其余一律视为分享令牌（16 位 base64url，含 - 和 _）
  if (/^g_\d+$/.test(id)) {
    await replay.loadById(id)
  } else {
    await replay.loadByToken(id)
  }
})

onUnmounted(() => {
  replay.reset()
})
</script>

<template>
  <div class="min-h-screen bg-primary text-text-primary">
    <!-- 顶栏（对照设计稿 11-replay：徽章 + 对局信息 + 操作） -->
    <nav
      class="fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-xl bg-[rgba(15,17,23,0.85)] border-b border-glass-border"
    >
      <div class="max-w-[1440px] mx-auto h-full px-4 sm:px-8 flex items-center justify-between">
        <!-- 左：Logo + 复盘模式徽章 -->
        <div class="flex items-center gap-3">
          <div
            class="w-8 h-8 rounded-lg bg-gradient-to-br from-board-green to-[#0d4a28] flex items-center justify-center"
          >
            <div class="grid grid-cols-2 gap-0.5">
              <div class="w-2 h-2 rounded-full bg-black"></div>
              <div class="w-2 h-2 rounded-full bg-white"></div>
              <div class="w-2 h-2 rounded-full bg-white"></div>
              <div class="w-2 h-2 rounded-full bg-black"></div>
            </div>
          </div>
          <span
            class="px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-purple-500/15 text-purple-400 border border-purple-500/25"
          >{{ $t('replay.modeBadge') }}</span
          >
        </div>

        <!-- 中：对局信息 -->
        <div v-if="game" class="hidden md:block text-center">
          <p class="text-sm text-text-primary">
            <span class="font-semibold">{{ blackName ?? $t('common.blackSide') }}</span>
            <span class="text-text-secondary">（{{ $t('common.black') }}）</span>
            <span class="text-text-secondary mx-2">vs</span>
            <span class="font-semibold">{{ whiteName ?? $t('common.whiteSide') }}</span>
            <span class="text-text-secondary">（{{ $t('common.white') }}）</span>
            <span class="text-text-secondary mx-2">·</span>
            <span class="text-text-secondary">{{
              game.mode === 'human_vs_ai' ? $t('replay.aiMode') : $t('replay.humanMode')
            }}</span>
            <span class="text-text-secondary mx-2">·</span>
            <span class="text-text-secondary">{{ $t('result.endAtMove', { n: totalSteps }) }}</span>
          </p>
        </div>

        <!-- 右：分享 / 导出 / 导入 / 返回 -->
        <div class="flex items-center gap-1.5 sm:gap-3">
          <button
            v-if="game"
            class="p-2 sm:px-3 sm:py-1.5 rounded-lg text-[11px] font-medium text-text-secondary border border-glass-border hover:border-gold/30 hover:text-gold transition-colors flex items-center gap-1.5"
            :title="$t('replay.share')"
            @click="shareGame"
          >
            <Share2 class="w-3.5 h-3.5" /><span class="hidden sm:inline">{{
              $t('replay.share')
            }}</span>
          </button>
          <button
            v-if="game"
            class="p-2 sm:px-3 sm:py-1.5 rounded-lg text-[11px] font-medium text-text-secondary border border-glass-border hover:border-gold/30 hover:text-gold transition-colors flex items-center gap-1.5"
            :title="$t('notation.export')"
            @click="exportNotation"
          >
            <Download class="w-3.5 h-3.5" /><span class="hidden sm:inline">{{
              $t('notation.export')
            }}</span>
          </button>
          <button
            class="p-2 sm:px-3 sm:py-1.5 rounded-lg text-[11px] font-medium text-text-secondary border border-glass-border hover:border-gold/30 hover:text-gold transition-colors flex items-center gap-1.5"
            :title="$t('notation.import')"
            @click="openImport"
          >
            <Upload class="w-3.5 h-3.5" /><span class="hidden sm:inline">{{
              $t('notation.import')
            }}</span>
          </button>
          <button
            class="p-2 sm:px-3 sm:py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
            :title="$t('common.backToLobby')"
            @click="router.push('/lobby')"
          >
            <ArrowLeft class="w-3 h-3" /><span class="hidden sm:inline">{{
              $t('common.backToLobby')
            }}</span>
          </button>
        </div>
      </div>
    </nav>

    <!-- 导入记谱弹窗 -->
    <div
      v-if="showImport"
      class="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="showImport = false"
    >
      <div class="bg-surface border border-glass-border rounded-2xl p-6 w-full max-w-md">
        <h3 class="text-sm font-bold mb-3">{{ $t('notation.importTitle') }}</h3>
        <textarea
          v-model="importText"
          class="w-full h-24 bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-lg p-3 text-sm font-mono focus:outline-none focus:border-gold/30"
          :placeholder="$t('notation.importPlaceholder')"
        ></textarea>
        <div v-if="importError" class="text-red-400 text-xs mt-2">{{ importError }}</div>
        <div class="flex gap-3 mt-4">
          <button
            class="flex-1 py-2.5 rounded-lg font-semibold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light text-sm"
            @click="doImport"
          >
            {{ $t('notation.importBtn') }}
          </button>
          <button
            class="px-4 py-2.5 rounded-lg text-sm text-text-secondary border border-glass-border hover:text-text-primary"
            @click="showImport = false"
          >
            {{ $t('common.cancel') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 主体：三栏（左棋盘+控制 / 中走子记录 / 右 AI 分析） -->
    <main class="pt-16 max-w-[1440px] mx-auto min-h-[calc(100vh-4rem)] flex flex-col lg:flex-row">
      <!-- 左：棋盘 + 控制 -->
      <div
        class="w-full lg:w-[540px] flex-shrink-0 flex flex-col items-center justify-center p-4 lg:p-6"
      >
        <!-- 加载/错误状态 -->
        <div v-if="loading" class="flex flex-col items-center gap-3 text-text-secondary">
          <Loader2 class="w-8 h-8 animate-spin" />
          <span class="text-sm">{{ $t('replay.loading') }}</span>
        </div>
        <div v-else-if="error" class="text-center">
          <p class="text-rose-400 mb-4">{{ error }}</p>
          <button
            class="px-4 py-2 rounded-lg bg-glass border border-glass-border hover:border-gold/30 transition-colors text-sm"
            @click="router.push('/lobby')"
          >
            {{ $t('common.backToLobby') }}
          </button>
        </div>

        <!-- 复盘内容 -->
        <template v-else-if="game">
          <!-- 对局信息（桌面端已在顶栏展示，仅移动端显示） -->
          <div class="mb-4 text-center md:hidden">
            <p class="text-sm font-semibold mb-1">
              {{ blackName ?? $t('common.blackSide') }} vs {{ whiteName ?? $t('common.whiteSide') }}
            </p>
            <p class="text-xs text-text-secondary">
              {{ game.mode === 'human_vs_ai' ? $t('replay.aiMode') : $t('replay.humanMode') }} ·
              {{ $t('replay.moveNumber', { n: totalSteps }) }}
            </p>
          </div>

          <!-- 棋盘（只读） -->
          <GameBoard :board="board" :legal-moves="[]" :last-move-pos="null" :readonly="true" />

          <!-- 比分 -->
          <div class="mt-4 flex items-center gap-6 text-sm">
            <div class="flex items-center gap-2">
              <div class="w-4 h-4 rounded-full bg-gray-800 border border-gray-600"></div>
              <span class="font-mono tabular-nums">{{ blackCount }}</span>
            </div>
            <span class="text-text-secondary">:</span>
            <div class="flex items-center gap-2">
              <span class="font-mono tabular-nums">{{ whiteCount }}</span>
              <div class="w-4 h-4 rounded-full bg-white border border-gray-300"></div>
            </div>
          </div>

          <!-- 播放控制 -->
          <div class="mt-6 flex flex-col items-center gap-4 w-full max-w-md">
            <!-- 进度条 -->
            <div class="w-full">
              <input
                type="range"
                :min="0"
                :max="totalSteps"
                :value="currentStep"
                class="w-full h-2 rounded-full appearance-none cursor-pointer bg-glass accent-gold"
                @input="replay.goTo(Number(($event.target as HTMLInputElement).value))"
              >
              <div class="flex justify-between text-xs text-text-secondary mt-1">
                <span>{{ $t('replay.start') }}</span>
                <span>{{ $t('replay.progress', { cur: currentStep, total: totalSteps }) }}</span>
                <span>{{ $t('replay.end') }}</span>
              </div>
            </div>

            <!-- 控制按钮 -->
            <div class="flex items-center gap-3">
              <button
                class="w-10 h-10 rounded-lg bg-glass border border-glass-border hover:border-gold/30 transition-colors flex items-center justify-center"
                :disabled="currentStep === 0"
                @click="replay.goToStart()"
              >
                <SkipBack class="w-4 h-4" />
              </button>
              <button
                class="w-10 h-10 rounded-lg bg-glass border border-glass-border hover:border-gold/30 transition-colors flex items-center justify-center"
                :disabled="currentStep === 0"
                @click="replay.stepBack()"
              >
                <StepBack class="w-4 h-4" />
              </button>
              <button
                class="w-12 h-12 rounded-lg bg-gold/10 border border-gold/30 hover:bg-gold/20 transition-colors flex items-center justify-center text-gold"
                @click="replay.togglePlay()"
              >
                <Pause v-if="playing" class="w-5 h-5" />
                <Play v-else class="w-5 h-5" />
              </button>
              <button
                class="w-10 h-10 rounded-lg bg-glass border border-glass-border hover:border-gold/30 transition-colors flex items-center justify-center"
                :disabled="currentStep === totalSteps"
                @click="replay.stepForward()"
              >
                <StepForward class="w-4 h-4" />
              </button>
              <button
                class="w-10 h-10 rounded-lg bg-glass border border-glass-border hover:border-gold/30 transition-colors flex items-center justify-center"
                :disabled="currentStep === totalSteps"
                @click="replay.goToEnd()"
              >
                <SkipForward class="w-4 h-4" />
              </button>
            </div>

            <!-- 速度控制 -->
            <button
              class="px-3 py-1.5 rounded-lg text-xs bg-glass border border-glass-border hover:border-gold/30 transition-colors"
              @click="replay.cycleSpeed()"
            >
              {{ $t('replay.speed', { n: speed }) }}
            </button>
          </div>
        </template>
      </div>

      <!-- 中：走子记录 -->
      <aside
        class="w-full lg:w-[240px] flex-shrink-0 lg:border-l lg:border-r border-glass-border flex flex-col max-h-[40vh] lg:max-h-[calc(100vh-4rem)] overflow-hidden"
      >
        <div class="px-4 py-3 border-b border-glass-border">
          <h3 class="text-[10px] uppercase tracking-wider text-text-secondary">
            {{ $t('replay.moveLog') }}
          </h3>
        </div>
        <div class="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          <div
            v-for="(frame, idx) in frames"
            :key="idx"
            class="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors cursor-pointer"
            :class="
              idx === currentStep
                ? 'bg-gold/10 border border-gold/20 text-gold'
                : 'hover:bg-[rgba(255,255,255,0.03)]'
            "
            @click="replay.goTo(idx)"
          >
            <span class="w-10 text-text-secondary font-mono">{{
              idx === 0 ? $t('replay.start') : idx
            }}</span>
            <template v-if="frame.move">
              <div
                class="w-3 h-3 rounded-full border flex-shrink-0"
                :class="
                  frame.move.color === 'BLACK'
                    ? 'bg-gray-800 border-gray-600'
                    : 'bg-white border-gray-300'
                "
              ></div>
              <span class="font-mono">{{ formatMove(frame.move) }}</span>
              <span v-if="frame.move.isPass" class="text-text-secondary text-[10px]">{{
                $t('replay.noLegal')
              }}</span>
            </template>
            <span v-else class="text-text-secondary">{{ $t('replay.initialPosition') }}</span>
          </div>
        </div>
      </aside>

      <!-- 右：AI 复盘分析 -->
      <aside
        class="w-full lg:flex-1 min-w-0 lg:min-w-[320px] overflow-y-auto max-h-[40vh] lg:max-h-[calc(100vh-4rem)]"
      >
        <AnalysisPanel
          :analysis="analysis"
          :analyzing="analyzing"
          :analysis-error="analysisError"
          :current-step="currentStep"
          @analyze="replay.loadAnalysis()"
        />
      </aside>
    </main>
    <CopyFallbackDialog :text="pendingCopy" @close="clearPending" />
  </div>
</template>
