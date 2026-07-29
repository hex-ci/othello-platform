<script setup lang="ts">
/**
 * 在线对局页（T08/T09/T10）：三栏布局（玩家信息/棋盘/聊天操作），对齐设计稿 05-game。
 * 棋盘真相以服务端广播为准（§6.2）。ELO/观战/悔棋/提示/音乐等未实现，忽略。
 */
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft,
  Flag,
  Handshake,
  Check,
  X,
  User,
  Undo2,
  Lightbulb,
  RotateCcw,
  Film,
  RefreshCw,
  ShieldCheck,
  Ghost,
} from '@lucide/vue'
import { useOnlineGameStore } from '@/stores/online-game-store'
import { useChatStore } from '@/stores/chat-store'
import { useAuthStore } from '@/stores/auth-store'
import { getWsClient } from '@/api/ws-client'
import GameBoard from '@/components/game/GameBoard.vue'
import MoveTimer from '@/components/game/MoveTimer.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import ResultCard from '@/components/game/ResultCard.vue'

const route = useRoute()
const router = useRouter()
const game = useOnlineGameStore()
const chat = useChatStore()
const auth = useAuthStore()
const { t } = useI18n()

const {
  gameId,
  board,
  turn,
  myColor,
  blackName,
  whiteName,
  blackCount,
  whiteCount,
  status,
  errorState,
  result,
  endReason,
  lastMovePos,
  moveLog,
  legalMovesList,
  isMyTurn,
  isAiGame,
  hintPos,
  drawRequestedBy,
  remainingSeconds,
  totalSeconds,
  reconnecting,
  rematchRequestedBy,
  rematchWaiting,
} = storeToRefs(game)

const roomId = computed(() => Number(route.params.id))
const readonly = computed(() => !isMyTurn.value || status.value !== 'playing')
/** 加载态：未收到 game_start 也无 error，避免空棋盘闪现后切错误态 */
const loading = computed(() => status.value === 'idle' && !errorState.value)

/** 每步剩余秒数格式化为 mm:ss（人机 120s / 人人 30s） */
const timerMmss = computed(() => {
  const s = Math.max(0, remainingSeconds.value)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
})

// ─── 顶部状态徽章：随对局阶段切换（对齐设计稿 04 等待态 / 05 进行态）───
const headerTitle = computed(() => {
  if (status.value === 'playing') return t('game.headerPlaying')
  if (status.value === 'finished') return t('game.headerFinished')
  return t('game.headerWaiting')
})
const headerBadge = computed(() => {
  if (status.value === 'playing') {
    return {
      text: t('game.badgeLive'),
      cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    }
  }
  if (status.value === 'finished') {
    return {
      text: t('game.badgeFinished'),
      cls: 'bg-white/5 text-text-secondary border-glass-border',
    }
  }
  return { text: t('game.badgeWaiting'), cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' }
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

// 最近 5 步（棋谱条）
const COL_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const recentMoves = computed(() => moveLog.value.slice(-5))
function posLabel(m: { pos: { x: number; y: number } | null; isPass: boolean }): string {
  if (m.isPass || !m.pos) return 'pass'
  return `${COL_LABELS[m.pos.x] ?? ''}${m.pos.y + 1}`
}

/** 返回大厅：人机对局进行中则先认输结束对局（避免房间残留可观战列表）；已结束或人人对局直接跳转 */
function backToLobby() {
  if (isAiGame.value && status.value === 'playing' && gameId.value) {
    game.resign()
  }
  void router.push('/lobby')
}

// ─── 终局文案 ───
const END_REASON_TEXT = computed(() => {
  const iWon = result.value === myColor.value
  const map: Record<string, string> = {
    normal: t('endReason.normal'),
    resign: iWon ? t('endReason.resignWin') : t('endReason.resignLose'),
    draw_agree: t('endReason.drawAgree'),
    timeout: iWon ? t('endReason.timeoutWin') : t('endReason.timeoutLose'),
    disconnect: t('endReason.disconnect'),
  }
  return map[endReason.value ?? 'normal'] ?? endReason.value ?? t('endReason.normal')
})

// ─── 本地倒计时（仅展示） ───
let tickTimer: ReturnType<typeof setInterval> | null = null
let errorUnsub: (() => void) | null = null

onMounted(() => {
  const ws = getWsClient()
  ws.connect()
  chat.connect()
  chat.setActiveRoom(roomId.value)
  // 已结束房间/不存在：设 errorState，页面渲染错误卡片（不跳转）
  const unsubError = ws.on('error', (p) => {
    const payload = p as { code: string; msg?: string }
    if (payload.code === 'ROOM_FINISHED') {
      game.errorState = { kind: 'finished', msg: payload.msg ?? '该房间对局已结束' }
    } else if (payload.code === 'ROOM_NOT_FOUND' || payload.code === 'GAME_NOT_FOUND') {
      game.errorState = { kind: 'not_found', msg: payload.msg ?? '房间或对局不存在' }
    }
  })
  errorUnsub = unsubError
  if (auth.userId !== null) {
    game.connect(auth.userId)
    // 主动加入房间，触发服务端补发 game_start（修复错过首帧广播）
    game.joinRoom(roomId.value)
  }
  tickTimer = setInterval(() => {
    // 仅对局进行中才倒数，避免空房间/未开局时空跑倒计时
    if (status.value === 'playing') game.tickRemaining()
  }, 1_000)
})

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  errorUnsub?.()
  // 终局后离开对局页：通知服务端自己已不可被再战，对方发起时快速失败（F-E-16）
  game.leaveRematch()
  game.disconnect()
  chat.setActiveRoom(null)
})

function onMove(pos: { x: number; y: number }) {
  game.sendMove(pos)
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
          <span class="text-sm font-bold">{{ headerTitle }}</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full border" :class="headerBadge.cls">{{
            headerBadge.text
          }}</span>
        </div>
        <button
          class="text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
          @click="backToLobby"
        >
          <ArrowLeft class="w-3 h-3" /> {{ $t('common.backToLobby') }}
        </button>
      </div>
    </nav>

    <!-- 加载态：未收到 game_start 也无 error，避免空棋盘闪现后切错误态 -->
    <div v-if="loading" class="pt-16 min-h-[calc(100vh-4rem)] flex items-center justify-center">
      <div class="flex flex-col items-center gap-4">
        <div
          class="w-12 h-12 rounded-full border-4 border-glass border-t-gold animate-spin [animation-duration:1.2s]"
        />
        <p class="text-sm text-text-secondary">{{ $t('game.headerWaiting') }}</p>
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
        <h2 class="text-xl font-bold mb-2">
          {{
            errorState.kind === 'not_found' ? $t('game.notFoundTitle') : $t('game.finishedTitle')
          }}
        </h2>
        <p class="text-sm text-text-secondary mb-6">
          {{ errorState.kind === 'not_found' ? $t('game.notFoundDesc') : $t('game.finishedDesc') }}
        </p>
        <button
          class="px-6 py-2.5 rounded-xl text-sm font-bold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all hover:-translate-y-0.5 inline-flex items-center gap-2"
          @click="router.push('/lobby')"
        >
          <ArrowLeft class="w-4 h-4" />{{ $t('game.backLobby') }}
        </button>
      </div>
    </div>

    <!-- 三栏主体 -->
    <main
      v-else
      class="pt-16 max-w-[1440px] mx-auto min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] flex flex-col lg:flex-row"
    >
      <!-- 左栏：玩家信息 + 局势分析 + 计时 -->
      <aside
        class="w-full lg:w-72 p-5 flex flex-col gap-4 lg:border-r border-glass-border overflow-y-auto order-2 lg:order-1"
      >
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
                {{ displayName(blackName, blackFallback)
                }}<span v-if="myColor === 'BLACK'" class="text-gold">{{
                  $t('common.youSuffix')
                }}</span>
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
                {{ displayName(whiteName, whiteFallback)
                }}<span v-if="myColor === 'WHITE'" class="text-gold">{{
                  $t('common.youSuffix')
                }}</span>
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
            {{ $t('game.analysis') }}
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

      <!-- 中栏：棋盘 + 棋谱 -->
      <section
        class="w-full lg:flex-1 flex flex-col items-center justify-center p-4 lg:p-8 overflow-x-auto order-1 lg:order-2"
      >
        <GameBoard
          :board="board"
          :legal-moves="legalMovesList"
          :last-move-pos="lastMovePos"
          :hint-pos="hintPos"
          :readonly="readonly"
          @move="onMove"
        />

        <!-- 走棋记录（最近 5 步） -->
        <div
          class="mt-4 backdrop-blur-xl bg-glass border border-glass-border rounded-xl px-4 py-3 w-full max-w-[448px]"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] uppercase tracking-wider text-text-secondary">{{
              $t('game.moveLog')
            }}</span>
            <span class="text-[10px] text-text-secondary">{{
              $t('game.recentN', { n: recentMoves.length })
            }}</span>
          </div>
          <div v-if="recentMoves.length === 0" class="text-xs text-text-secondary text-center py-1">
            {{ isMyTurn ? $t('game.yourTurn') : $t('game.waitingMove') }}
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

      <!-- 右栏：聊天 + 操作 -->
      <aside
        class="w-full lg:w-72 p-5 flex flex-col gap-4 lg:border-l border-glass-border overflow-y-auto order-3"
      >
        <!-- 对局聊天 -->
        <ChatPanel :room-id="roomId" class="flex-1 min-h-[200px]" />

        <!-- 操作 -->
        <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-4">
          <h3 class="text-[10px] uppercase tracking-wider text-text-secondary mb-3">
            {{ $t('game.actions') }}
          </h3>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-if="status === 'playing'"
              class="py-2 px-3 rounded-lg text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all flex items-center justify-center gap-1"
              @click="game.resign()"
            >
              <Flag class="w-3 h-3" />{{ $t('game.resign') }}
            </button>
            <template v-if="status === 'playing'">
              <button
                v-if="drawRequestedBy !== null"
                class="py-2 px-3 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-1"
                @click="game.respondDraw(true)"
              >
                <Check class="w-3 h-3" />{{ $t('game.acceptDraw') }}
              </button>
              <button
                v-if="drawRequestedBy !== null"
                class="py-2 px-3 rounded-lg text-[11px] font-medium bg-glass text-text-secondary border border-glass-border hover:bg-[rgba(255,255,255,0.08)] transition-all flex items-center justify-center gap-1"
                @click="game.respondDraw(false)"
              >
                <X class="w-3 h-3" />{{ $t('common.reject') }}
              </button>
              <!-- 求和：仅人人对局（AI 无接受/拒绝求和逻辑，人机局该按钮为死按钮，故隐藏） -->
              <button
                v-if="drawRequestedBy === null && !isAiGame"
                class="py-2 px-3 rounded-lg text-[11px] font-medium bg-glass text-text-secondary border border-glass-border hover:bg-[rgba(255,255,255,0.08)] transition-all flex items-center justify-center gap-1"
                @click="game.requestDraw()"
              >
                <Handshake class="w-3 h-3" />{{ $t('game.requestDraw') }}
              </button>
              <!-- 悔棋/提示：仅人机对局可用（T12，F-E-02/03） -->
              <button
                :disabled="!isAiGame || !isMyTurn"
                :title="isAiGame ? $t('game.undoTitle') : $t('game.undoDisabledTitle')"
                class="py-2 px-3 rounded-lg text-[11px] font-medium bg-glass border border-glass-border transition-all flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                :class="
                  isAiGame && isMyTurn
                    ? 'text-text-secondary hover:bg-[rgba(255,255,255,0.08)]'
                    : 'text-text-secondary'
                "
                @click="game.requestUndo()"
              >
                <Undo2 class="w-3 h-3" />{{ $t('game.undo') }}
              </button>
              <button
                :disabled="!isAiGame || !isMyTurn"
                :title="isAiGame ? $t('game.hintTitle') : $t('game.hintDisabledTitle')"
                class="py-2 px-3 rounded-lg text-[11px] font-medium border transition-all flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                :class="
                  isAiGame && isMyTurn
                    ? 'bg-board-green/10 text-emerald-400 border-board-green/30 hover:bg-board-green/20'
                    : 'bg-board-green/10 text-emerald-400 border-board-green/30'
                "
                @click="game.requestHint()"
              >
                <Lightbulb class="w-3 h-3" />{{ $t('game.hint') }}
              </button>
            </template>
          </div>
        </div>
      </aside>
    </main>

    <!-- 终局结算（C 档庆祝布局） -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="status === 'finished' && result !== null"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div
            class="w-full max-w-md rounded-2xl bg-surface border border-glass-border p-6 shadow-2xl"
          >
            <ResultCard
              :result="result"
              :black-count="blackCount"
              :white-count="whiteCount"
              :black-name="displayName(blackName, blackFallback)"
              :white-name="displayName(whiteName, whiteFallback)"
              :black-is-you="myColor === 'BLACK'"
              :end-reason="END_REASON_TEXT"
              :move-count="moveLog.length"
            >
              <div class="space-y-2">
                <!-- 对方发起再战请求（T17） -->
                <div
                  v-if="rematchRequestedBy"
                  class="w-full p-3 rounded-xl bg-gold/10 border border-gold/30 flex items-center gap-2"
                >
                  <span class="flex-1 text-xs text-gold">{{
                    $t('game.rematchRequest', { name: rematchRequestedBy.username })
                  }}</span>
                  <button
                    class="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                    @click="game.respondRematch(true)"
                  >
                    {{ $t('common.accept') }}
                  </button>
                  <button
                    class="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-glass text-text-secondary border border-glass-border hover:bg-[rgba(255,255,255,0.08)] transition-all"
                    @click="game.respondRematch(false)"
                  >
                    {{ $t('common.reject') }}
                  </button>
                </div>
                <button
                  class="w-full py-3.5 rounded-xl font-bold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 text-sm"
                  @click="router.push('/lobby')"
                >
                  <RotateCcw class="w-4 h-4" />{{ $t('common.backToLobby') }}
                </button>
                <!-- 再战（T17，F-E-16）：仅人人对局 -->
                <button
                  v-if="!isAiGame"
                  :disabled="rematchWaiting"
                  class="w-full py-3 rounded-xl font-medium text-text-primary border border-glass-border hover:border-gold/30 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  @click="game.requestRematch()"
                >
                  <RotateCcw class="w-4 h-4" />{{
                    rematchWaiting ? $t('game.rematchWaiting') : $t('game.rematch')
                  }}
                </button>
                <!-- 复盘（T15，F-E-09）：跳转复盘查看器 -->
                <button
                  class="w-full py-3 rounded-xl font-medium text-text-primary border border-glass-border hover:border-gold/30 transition-all flex items-center justify-center gap-2 text-sm"
                  @click="router.push(`/replay/${gameId}`)"
                >
                  <Film class="w-4 h-4" />{{ $t('game.replayAnalysis') }}
                </button>
              </div>
            </ResultCard>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 断线重连遮罩（T13，对照设计稿 07-reconnect） -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="reconnecting"
          class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div
            class="w-full max-w-sm rounded-2xl bg-surface border border-glass-border p-8 shadow-2xl text-center"
          >
            <!-- 旋转加载 -->
            <div class="flex items-center justify-center mb-6">
              <div class="relative w-20 h-20">
                <div
                  class="absolute inset-0 rounded-full border-2 border-board-green/40 animate-[reconnect-ring_2s_ease-out_infinite]"
                />
                <div
                  class="absolute inset-0 rounded-full border-2 border-board-green/40 animate-[reconnect-ring_2s_ease-out_infinite_1s]"
                />
                <div
                  class="absolute inset-2 rounded-full border-4 border-glass border-t-gold animate-spin [animation-duration:1.2s]"
                />
                <div class="absolute inset-0 flex items-center justify-center">
                  <RefreshCw
                    class="w-6 h-6 text-gold animate-spin [animation-duration:2s] [animation-direction:reverse]"
                  />
                </div>
              </div>
            </div>

            <h2 class="text-lg font-bold mb-1">{{ $t('game.reconnecting') }}</h2>
            <p class="text-text-secondary text-xs mb-5">{{ $t('game.reconnectHint') }}</p>

            <!-- 恢复进度 -->
            <div class="mb-5">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] uppercase tracking-wider text-text-secondary">{{
                  $t('game.replayProgress')
                }}</span>
                <span class="text-xs font-bold text-gold font-mono">{{
                  $t('game.movesUnit', { n: moveLog.length })
                }}</span>
              </div>
              <div class="relative h-2 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
                <div
                  class="absolute inset-0 bg-gradient-to-r from-board-green to-emerald-400 animate-pulse"
                />
              </div>
            </div>

            <!-- 不扣分提示 -->
            <div
              class="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 text-left"
            >
              <div
                class="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0"
              >
                <ShieldCheck class="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p class="text-xs font-medium text-emerald-400">{{ $t('game.noPenalty') }}</p>
                <p class="text-[10px] text-text-secondary leading-relaxed mt-0.5">
                  {{ $t('game.noPenaltyDetail') }}
                </p>
              </div>
            </div>
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
@keyframes reconnect-ring {
  0% {
    transform: scale(0.8);
    opacity: 0.6;
  }
  100% {
    transform: scale(2);
    opacity: 0;
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
