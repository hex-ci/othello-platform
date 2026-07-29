<script setup lang="ts">
/**
 * 观战页（T14，F-E-05/10）：只读订阅进行中对局，对照设计稿 08-spectate。
 * 实时接收走子，不可落子、不影响对局；棋盘真相以服务端广播为准（§6.2）。
 */
import { onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Eye, User, LogOut, Ghost } from '@lucide/vue'
import { useSpectateStore } from '@/stores/spectate-store'
import { useChatStore } from '@/stores/chat-store'
import { getWsClient } from '@/api/ws-client'
import GameBoard from '@/components/game/GameBoard.vue'
import MoveTimer from '@/components/game/MoveTimer.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'

const route = useRoute()
const router = useRouter()
const game = useSpectateStore()
const chat = useChatStore()
const { t } = useI18n()

const {
  board,
  turn,
  blackName,
  whiteName,
  blackCount,
  whiteCount,
  status,
  errorState,
  result,
  lastMovePos,
  moveLog,
  remainingSeconds,
  totalSeconds,
  spectatorCount,
} = storeToRefs(game)

/** 加载态：未收到 spectate_start 也无 error 时显示加载占位，避免空棋盘闪现后切错误态 */
const loading = computed(() => status.value === 'idle' && !errorState.value)

const gameId = computed(() => String(route.params.id))

/** 每步剩余秒数格式化为 mm:ss（人机 120s / 人人 30s） */
const timerMmss = computed(() => {
  const s = Math.max(0, remainingSeconds.value)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
})

// ─── 局势分析派生值 ───
const totalPieces = computed(() => blackCount.value + whiteCount.value)
const blackPct = computed(() =>
  totalPieces.value === 0 ? 50 : Math.round((blackCount.value / totalPieces.value) * 100),
)
const whitePct = computed(() => 100 - blackPct.value)
const leadText = computed(() => {
  const diff = blackCount.value - whiteCount.value
  if (diff === 0) return t('game.balanced')
  return diff > 0 ? t('game.blackLead', { n: diff }) : t('game.whiteLead', { n: -diff })
})
const emptyCells = computed(() => 64 - totalPieces.value)
const moveNumber = computed(() => moveLog.value.length)

// 最近 5 步
const COL_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const recentMoves = computed(() => moveLog.value.slice(-5))
function posLabel(m: { pos: { x: number; y: number } | null; isPass: boolean }): string {
  if (m.isPass || !m.pos) return 'pass'
  return `${COL_LABELS[m.pos.x] ?? ''}${m.pos.y + 1}`
}

const RESULT_TEXT = computed(() => {
  if (result.value === 'DRAW') return t('spectate.drawResult')
  return result.value === 'BLACK' ? t('spectate.blackWin') : t('spectate.whiteWin')
})

let tickTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  getWsClient().connect()
  chat.connect()
  game.connect()
  game.spectateJoin(gameId.value)
  tickTimer = setInterval(() => {
    // 仅对局进行中才倒数，避免空观战/未开局时空跑倒计时
    if (status.value === 'playing') game.tickRemaining()
  }, 1_000)
})

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  game.disconnect()
})

function leaveSpectate() {
  void router.push('/lobby')
}

function displayName(name: string | null, fallback: string): string {
  return name ?? fallback
}

const blackFallback = computed(() => t('common.blackSide'))
const whiteFallback = computed(() => t('common.whiteSide'))
</script>

<template>
  <div class="min-h-screen bg-primary text-text-primary">
    <!-- 固定顶栏 -->
    <nav
      class="fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-xl bg-[rgba(15,17,23,0.85)] border-b border-glass-border"
    >
      <div class="max-w-[1440px] mx-auto h-full px-4 sm:px-8 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="w-8 h-8 rounded-lg bg-gradient-to-br from-board-green to-[#0d4a28] flex items-center justify-center"
          >
            <div class="grid grid-cols-2 gap-0.5">
              <div class="w-2 h-2 rounded-full bg-black" />
              <div class="w-2 h-2 rounded-full bg-white" />
              <div class="w-2 h-2 rounded-full bg-white" />
              <div class="w-2 h-2 rounded-full bg-black" />
            </div>
          </div>
          <span class="text-sm font-bold">{{ $t('spectate.spectating') }}</span>
          <span
            v-if="status === 'playing'"
            class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/25 text-[10px] font-medium"
          >
            <span
              class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-[live-blink_1.5s_ease-in-out_infinite]"
            />{{ $t('spectate.live') }}
          </span>
          <span
            v-else
            class="px-2 py-0.5 rounded-full bg-white/5 text-text-secondary border border-glass-border text-[10px] font-medium"
          >
            {{ $t('game.badgeFinished') }}
          </span>
          <span class="text-[10px] text-text-secondary">{{ $t('spectate.readonlyHint') }}</span>
        </div>
        <button
          class="text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
          @click="leaveSpectate"
        >
          <ArrowLeft class="w-3 h-3" /> {{ $t('common.backToLobby') }}
        </button>
      </div>
    </nav>

    <!-- 加载态：未收到 spectate_start 也无 error，避免空棋盘闪现 -->
    <div v-if="loading" class="pt-16 min-h-[calc(100vh-4rem)] flex items-center justify-center">
      <div class="flex flex-col items-center gap-4">
        <div
          class="w-12 h-12 rounded-full border-4 border-glass border-t-gold animate-spin [animation-duration:1.2s]"
        />
        <p class="text-sm text-text-secondary">{{ $t('spectate.loading') }}</p>
      </div>
    </div>

    <!-- 错误态：对局不存在/已结束 -->
    <div
      v-else-if="errorState"
      class="pt-16 min-h-[calc(100vh-4rem)] flex items-center justify-center"
    >
      <div
        class="max-w-md w-full text-center backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-10"
      >
        <div
          class="w-16 h-16 mx-auto mb-5 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center"
        >
          <Ghost class="w-8 h-8 text-rose-400" />
        </div>
        <h2 class="text-xl font-bold mb-2">{{ $t('spectate.notFoundTitle') }}</h2>
        <p class="text-sm text-text-secondary mb-6">{{ $t('spectate.notFoundDesc') }}</p>
        <button
          class="px-6 py-2.5 rounded-xl text-sm font-bold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all hover:-translate-y-0.5 inline-flex items-center gap-2"
          @click="leaveSpectate"
        >
          <ArrowLeft class="w-4 h-4" />{{ $t('spectate.backLobby') }}
        </button>
      </div>
    </div>

    <!-- 三栏主体 -->
    <main
      v-else
      class="pt-16 max-w-[1440px] mx-auto min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] flex flex-col lg:flex-row"
    >
      <!-- 左栏：观战席 + 玩家信息 + 局势 -->
      <aside
        class="w-full lg:w-72 p-5 flex flex-col gap-4 lg:border-r border-glass-border overflow-y-auto order-2 lg:order-1"
      >
        <!-- 观战席横幅 -->
        <div
          class="flex items-center gap-2 bg-purple-500/5 border border-purple-500/20 rounded-xl px-3 py-2.5"
        >
          <Eye class="w-4 h-4 text-purple-400" />
          <div>
            <p class="text-[11px] font-medium text-purple-400">{{ $t('spectate.seat') }}</p>
            <p class="text-[9px] text-text-secondary">{{ $t('spectate.seatHint') }}</p>
          </div>
        </div>

        <!-- 黑方玩家卡片 -->
        <div
          class="backdrop-blur-xl bg-glass border rounded-xl p-4 transition-colors"
          :class="
            turn === 'BLACK' && status === 'playing'
              ? 'border-gold/30 animate-[turn-pulse_2s_ease-in-out_infinite]'
              : 'border-glass-border'
          "
        >
          <div class="flex items-center gap-3 mb-3">
            <div class="relative">
              <div
                class="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border-2 flex items-center justify-center"
                :class="
                  turn === 'BLACK' && status === 'playing'
                    ? 'border-gold/50'
                    : 'border-glass-border'
                "
              >
                <User class="w-5 h-5 text-gray-300" />
              </div>
              <div
                class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-black border-2 border-[#0f1117] shadow-[inset_0_2px_4px_rgba(255,255,255,0.1)]"
              />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold truncate">
                {{ displayName(blackName, blackFallback) }}
              </p>
              <p
                class="text-[10px]"
                :class="
                  turn === 'BLACK' && status === 'playing' ? 'text-gold' : 'text-text-secondary'
                "
              >
                {{ $t('game.playBlack') }} ·
                {{
                  turn === 'BLACK' && status === 'playing'
                    ? $t('game.currentTurn')
                    : $t('game.waitingTurn')
                }}
              </p>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-3xl font-bold font-mono tabular-nums">{{ blackCount }}</span>
            <div class="text-right">
              <p class="text-[10px] text-text-secondary">{{ $t('game.stepRemaining') }}</p>
              <p
                class="text-lg font-bold font-mono tabular-nums"
                :class="
                  turn === 'BLACK' && status === 'playing' ? 'text-gold' : 'text-text-secondary'
                "
              >
                {{ turn === 'BLACK' && status === 'playing' ? timerMmss : '—' }}
              </p>
            </div>
          </div>
        </div>

        <!-- VS -->
        <div class="flex items-center justify-center">
          <span class="text-xs text-text-secondary font-bold tracking-widest">VS</span>
        </div>

        <!-- 白方玩家卡片 -->
        <div
          class="backdrop-blur-xl bg-glass border rounded-xl p-4 transition-colors"
          :class="
            turn === 'WHITE' && status === 'playing'
              ? 'border-gold/30 animate-[turn-pulse_2s_ease-in-out_infinite]'
              : 'border-glass-border'
          "
        >
          <div class="flex items-center gap-3 mb-3">
            <div class="relative">
              <div
                class="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-white border-2 flex items-center justify-center"
                :class="
                  turn === 'WHITE' && status === 'playing'
                    ? 'border-gold/50'
                    : 'border-glass-border'
                "
              >
                <User class="w-5 h-5 text-gray-600" />
              </div>
              <div
                class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border-2 border-[#0f1117] shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
              />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold truncate">
                {{ displayName(whiteName, whiteFallback) }}
              </p>
              <p
                class="text-[10px]"
                :class="
                  turn === 'WHITE' && status === 'playing' ? 'text-gold' : 'text-text-secondary'
                "
              >
                {{ $t('game.playWhite') }} ·
                {{
                  turn === 'WHITE' && status === 'playing'
                    ? $t('game.currentTurn')
                    : $t('game.waitingTurn')
                }}
              </p>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-3xl font-bold font-mono tabular-nums">{{ whiteCount }}</span>
            <div class="text-right">
              <p class="text-[10px] text-text-secondary">{{ $t('game.stepRemaining') }}</p>
              <p
                class="text-lg font-bold font-mono tabular-nums"
                :class="
                  turn === 'WHITE' && status === 'playing' ? 'text-gold' : 'text-text-secondary'
                "
              >
                {{ turn === 'WHITE' && status === 'playing' ? timerMmss : '—' }}
              </p>
            </div>
          </div>
        </div>

        <!-- 局势分析 -->
        <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-4">
          <p class="text-[10px] uppercase tracking-wider text-text-secondary mb-3">
            {{ $t('spectate.situation') }}
          </p>
          <div class="h-3 rounded-full overflow-hidden flex mb-2">
            <div
              class="bg-gray-800 h-full transition-all duration-500"
              :style="{ width: `${blackPct}%` }"
            />
            <div
              class="bg-gray-200 h-full transition-all duration-500"
              :style="{ width: `${whitePct}%` }"
            />
          </div>
          <div class="flex justify-between text-[10px] text-text-secondary">
            <span>{{ $t('game.blackShort') }} {{ blackCount }} ({{ blackPct }}%)</span>
            <span>{{ $t('game.whiteShort') }} {{ whiteCount }} ({{ whitePct }}%)</span>
          </div>
          <p class="text-[10px] text-gold mt-1.5">{{ leadText }}</p>
          <div class="mt-3 pt-3 border-t border-glass-border">
            <div class="flex justify-between text-[10px] text-text-secondary">
              <span>{{ $t('game.moveNumber', { n: moveNumber }) }}</span>
              <span>{{ $t('game.emptyCells', { n: emptyCells }) }}</span>
            </div>
          </div>
        </div>

        <!-- 圆形计时 -->
        <div class="flex items-center justify-center">
          <MoveTimer :remaining="remainingSeconds" :total="totalSeconds" />
        </div>
      </aside>

      <!-- 中栏：只读棋盘 + 走棋记录 -->
      <section
        class="w-full lg:flex-1 flex flex-col items-center justify-center p-4 lg:p-8 overflow-x-auto order-1 lg:order-2"
      >
        <GameBoard :board="board" :legal-moves="[]" :last-move-pos="lastMovePos" :readonly="true" />

        <!-- 走棋记录（最近 5 步） -->
        <div
          class="mt-4 backdrop-blur-xl bg-glass border border-glass-border rounded-xl px-4 py-3 w-full max-w-[448px]"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] uppercase tracking-wider text-text-secondary">{{
              $t('spectate.recentMovesLive')
            }}</span>
            <span class="text-[10px] text-purple-400">{{
              $t('game.moveNumber', { n: moveNumber })
            }}</span>
          </div>
          <div v-if="recentMoves.length === 0" class="text-xs text-text-secondary text-center py-1">
            {{ $t('spectate.waitingMove') }}
          </div>
          <div v-else class="flex items-center gap-3 text-xs font-mono flex-wrap">
            <span
              v-for="m in recentMoves"
              :key="m.seq"
              class="flex items-center gap-1"
              :class="
                m.seq === moveLog[moveLog.length - 1]?.seq ? 'text-gold' : 'text-text-primary'
              "
            >
              <span
                class="w-2.5 h-2.5 rounded-full inline-block border"
                :class="
                  m.color === 'BLACK' ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'
                "
              />
              {{ posLabel(m) }}
            </span>
          </div>
        </div>
      </section>

      <!-- 右栏：观战席 + 聊天 + 操作 -->
      <aside
        class="w-full lg:w-72 p-5 flex flex-col gap-4 lg:border-l border-glass-border overflow-y-auto order-3"
      >
        <!-- 观战席人数 -->
        <div class="backdrop-blur-xl bg-glass border border-purple-500/25 rounded-xl p-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Eye class="w-4 h-4 text-purple-400" />
              <span class="text-[11px] font-medium text-purple-400">{{ $t('spectate.seat') }}</span>
            </div>
            <span class="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">{{
              $t('spectate.seatCount', { n: spectatorCount })
            }}</span>
          </div>
        </div>

        <!-- 观战聊天（公共频道） -->
        <ChatPanel :room-id="null" class="flex-1 min-h-[200px]" />

        <!-- 操作（只读） -->
        <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-4">
          <h3 class="text-[10px] uppercase tracking-wider text-text-secondary mb-3">
            {{ $t('spectate.actions') }}
          </h3>
          <div class="space-y-2">
            <button
              class="w-full py-2.5 rounded-lg text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all flex items-center justify-center gap-2"
              @click="leaveSpectate"
            >
              <LogOut class="w-3 h-3" />{{ $t('spectate.leave') }}
            </button>
          </div>
          <p class="text-[9px] text-text-secondary/60 text-center mt-3">
            {{ $t('spectate.readonlyNote') }}
          </p>
        </div>
      </aside>
    </main>

    <!-- 终局提示 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="status === 'finished' && result !== null"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div
            class="w-full max-w-sm rounded-2xl bg-surface border border-glass-border p-6 shadow-2xl text-center"
          >
            <p class="text-[10px] uppercase tracking-wider text-text-secondary mb-2">
              {{ $t('spectate.gameOver') }}
            </p>
            <p class="text-2xl font-bold mb-1">{{ RESULT_TEXT }}</p>
            <p class="text-sm text-text-secondary mb-5">
              {{ $t('spectate.scoreLine', { b: blackCount, w: whiteCount }) }}
            </p>
            <button
              class="w-full py-3 rounded-xl font-bold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all hover:-translate-y-0.5 text-sm"
              @click="leaveSpectate"
            >
              {{ $t('common.backToLobby') }}
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
@keyframes turn-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(212, 168, 67, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(212, 168, 67, 0);
  }
}
@keyframes live-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
