<script setup lang="ts">
/**
 * 房间准备页（附录C ready 子阶段，对照 docs/pages/04-room.html）。
 * 人人房双方就位后进入 ready 子阶段：双方点准备 + 房主点开局 → 跳 /game/:id。
 * 人机房不经此页（LobbyPage 直接跳 /game/:id）。
 */
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import {
  Share2,
  LogOut,
  DoorOpen,
  Lock,
  Clock,
  Eye,
  Crown,
  Check,
  CheckCircle2,
  SlidersHorizontal,
  Info,
  Play,
  Copy,
  Ghost,
  ArrowLeft,
} from '@lucide/vue'
import { useRoomStore } from '@/stores/room-store'
import { useChatStore } from '@/stores/chat-store'
import { getWsClient } from '@/api/ws-client'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import CopyFallbackDialog from '@/components/ui/CopyFallbackDialog.vue'
import { useCopy } from '@/composables/use-copy'
import { toast } from 'vue-sonner'

const route = useRoute()
const router = useRouter()
const room = useRoomStore()
const chat = useChatStore()
const { t } = useI18n()
const { pendingCopy, copy, clearPending } = useCopy()

const {
  roomId,
  whiteId,
  blackName,
  whiteName,
  blackReady,
  whiteReady,
  roomName,
  spectatable,
  spectators,
  errorState,
  status,
  isHost,
  myReady,
  bothReady,
  bothSeated,
} = storeToRefs(room)

const roomIdParam = computed(() => Number(route.params.id))
/** 已等待时长（秒，本地累计） */
const elapsedSec = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  getWsClient().connect()
  chat.connect()
  chat.setActiveRoom(roomIdParam.value)
  room.connect()
  room.joinRoom(roomIdParam.value)
  elapsedTimer = setInterval(() => {
    elapsedSec.value += 1
  }, 1_000)
})

onUnmounted(() => {
  if (elapsedTimer) clearInterval(elapsedTimer)
  chat.setActiveRoom(null)
  chat.disconnect()
  room.disconnect()
})

const elapsedMmss = computed(() => {
  const s = elapsedSec.value
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
})

function toggleReady() {
  room.setReady(!myReady.value)
}

function startGame() {
  room.startGame()
}

async function leaveRoom() {
  await room.leaveRoom()
  void router.push('/lobby')
}

async function shareInvite() {
  const url = `${window.location.origin}/room/${roomId.value ?? roomIdParam.value}`
  const ok = await copy(url)
  if (ok) toast.success(t('copy.copied'))
  // 失败时 useCopy 已记录 pendingCopy，弹窗引导手动复制
}

const blackFallback = computed(() => t('common.blackSide'))
const whiteFallback = computed(() => t('common.whiteSide'))
const readyCount = computed(() => (blackReady.value ? 1 : 0) + (whiteReady.value ? 1 : 0))
const spectatorCount = computed(() => spectators.value.length)
/** 加载态：未收到 room_state 也无 error，避免空房间闪现后切错误态 */
const loading = computed(() => status.value === 'idle' && !errorState.value)

// ─── 房主设置（仅房主可改，未开局且双方未准备时生效）───
const settingsLocked = computed(() => blackReady.value || whiteReady.value)
function swapColors() {
  if (settingsLocked.value || !bothSeated.value) return
  room.updateSettings({ colorAssign: 'swap' })
}
function toggleSpectatable() {
  if (settingsLocked.value) return
  room.updateSettings({ spectatable: !spectatable.value })
}
const passwordInput = ref('')
const showPasswordInput = ref(false)
function applyPassword() {
  const pwd = passwordInput.value.trim()
  if (!pwd) return
  room.updateSettings({ password: pwd })
  passwordInput.value = ''
  showPasswordInput.value = false
}
function clearPassword() {
  room.updateSettings({ password: null })
  showPasswordInput.value = false
}
</script>

<template>
  <div class="min-h-screen bg-primary text-text-primary">
    <!-- 顶栏 -->
    <nav
      class="fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-xl bg-[rgba(15,17,23,0.85)] border-b border-glass-border"
    >
      <div class="max-w-[1440px] mx-auto h-full px-4 sm:px-8 flex items-center justify-between">
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-board-green to-[#0d4a28] shrink-0"
          >
            <div class="grid grid-cols-2 gap-0.5">
              <div class="w-2 h-2 rounded-full bg-black"></div>
              <div class="w-2 h-2 rounded-full bg-white"></div>
              <div class="w-2 h-2 rounded-full bg-white"></div>
              <div class="w-2 h-2 rounded-full bg-black"></div>
            </div>
          </div>
          <span class="text-sm font-semibold hidden sm:inline">{{ $t('room.roomLobby') }}</span>
          <span
            class="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25"
          >
            {{ $t('room.waiting') }}
          </span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-[11px] font-medium text-text-secondary border border-glass-border hover:border-gold/30 hover:text-gold transition-colors flex items-center gap-1.5"
            @click="shareInvite"
          >
            <Share2 class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">
              {{ $t('room.invite') }}
            </span>
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-[11px] font-medium text-rose-400 border border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/15 transition-colors flex items-center gap-1.5"
            @click="leaveRoom"
          >
            <LogOut class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">
              {{ $t('room.leave') }}
            </span>
          </button>
        </div>
      </div>
    </nav>

    <main class="pt-20 max-w-[1440px] mx-auto px-4 sm:px-8 pb-12">
      <!-- 加载态：未收到 room_state 也无 error，避免空房间闪现 -->
      <div v-if="loading" class="min-h-[60vh] flex items-center justify-center">
        <div class="flex flex-col items-center gap-4">
          <div
            class="w-12 h-12 rounded-full border-4 border-glass border-t-gold animate-spin [animation-duration:1.2s]"
          ></div>
          <p class="text-sm text-text-secondary">{{ $t('room.roomLobby') }}</p>
        </div>
      </div>

      <!-- 错误态：房间不存在/已结束/已满 -->
      <div
        v-else-if="errorState"
        class="max-w-md mx-auto mt-20 text-center backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-10"
      >
        <div
          class="w-16 h-16 mx-auto mb-5 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center"
        >
          <Ghost class="w-8 h-8 text-rose-400" />
        </div>
        <h2 class="text-xl font-bold mb-2">
          {{
            errorState.kind === 'not_found'
              ? $t('room.notFoundTitle')
              : errorState.kind === 'finished'
                ? $t('room.finishedTitle')
                : $t('room.fullTitle')
          }}
        </h2>
        <p class="text-sm text-text-secondary mb-6">
          {{
            errorState.kind === 'not_found'
              ? $t('room.notFoundDesc')
              : errorState.kind === 'finished'
                ? $t('room.finishedDesc')
                : $t('room.fullDesc')
          }}
        </p>
        <button
          type="button"
          class="px-6 py-2.5 rounded-xl text-sm font-bold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all hover:-translate-y-0.5 inline-flex items-center gap-2"
          @click="router.push('/lobby')"
        >
          <ArrowLeft class="w-4 h-4" />{{ $t('room.backLobby') }}
        </button>
      </div>

      <template v-else>
        <!-- 房间头 -->
        <div
          class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div
            class="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-center sm:text-left"
          >
            <div
              class="w-12 h-12 rounded-xl bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/30 flex items-center justify-center shrink-0"
            >
              <DoorOpen class="w-6 h-6 text-gold" />
            </div>
            <div class="min-w-0">
              <div class="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                <h1 class="text-lg font-bold">{{ roomName || $t('room.title') }}</h1>
                <Lock class="w-3.5 h-3.5 text-amber-400/70" :title="$t('room.private')" />
                <span class="text-[10px] text-text-secondary">
                  {{ $t('room.number', { id: roomId ?? roomIdParam }) }}
                </span>
              </div>
              <p class="text-xs text-text-secondary mt-0.5">
                {{
                  $t('room.hostLine', {
                    host: blackName ?? blackFallback,
                    mode: $t('room.pvp'),
                    timer: $t('room.threeMin'),
                  })
                }}
              </p>
            </div>
          </div>
          <div class="flex items-center justify-center sm:justify-start gap-4 text-xs sm:shrink-0">
            <span class="flex items-center gap-1.5 text-text-secondary">
              <Clock class="w-3.5 h-3.5" />{{ $t('room.waited', { time: elapsedMmss }) }}
            </span>
            <span class="flex items-center gap-1.5 text-text-secondary">
              <Eye class="w-3.5 h-3.5" />{{ $t('room.spectators', { n: spectatorCount }) }}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <!-- 左：VS Arena + 房间设置 -->
          <section class="lg:col-span-8 space-y-6">
            <!-- VS Arena -->
            <div
              class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5 sm:p-8 relative overflow-hidden"
            >
              <div
                class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[120px] font-black text-white/[0.02] select-none"
              >
                VS
              </div>

              <div class="relative grid grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 items-start">
                <!-- 黑座（房主） -->
                <div class="flex flex-col items-center text-center">
                  <div
                    class="relative mb-4"
                    :class="blackReady ? 'animate-[ready-pulse_2s_ease-in-out_infinite]' : ''"
                  >
                    <div
                      class="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border-4 flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
                      :class="blackReady ? 'border-emerald-400/60' : 'border-glass-border'"
                    >
                      <span class="text-2xl sm:text-3xl font-bold text-white">
                        {{ $t('room.blackMark') }}
                      </span>
                    </div>
                    <div
                      v-if="blackReady"
                      class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-400 border-4 border-[#0f1117] flex items-center justify-center"
                    >
                      <Check class="w-3.5 h-3.5 text-[#0f1117]" />
                    </div>
                    <div
                      class="absolute -top-2 -left-2 w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-black border-2 border-gold/40 flex items-center justify-center"
                    >
                      <Crown class="w-4 h-4 text-gold" :title="$t('room.host')" />
                    </div>
                  </div>
                  <p class="text-base font-bold">{{ blackName ?? blackFallback }}</p>
                  <p class="text-[10px] text-text-secondary mt-2">{{ $t('room.blackFirst') }}</p>
                  <span
                    class="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border"
                    :class="
                      blackReady
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    "
                  >
                    <CheckCircle2 v-if="blackReady" class="w-3 h-3" />
                    <span v-else class="flex gap-0.5">
                      <span
                        class="w-1 h-1 rounded-full bg-amber-400 animate-[waiting-dots_1.4s_infinite]"
                      ></span>
                      <span
                        class="w-1 h-1 rounded-full bg-amber-400 animate-[waiting-dots_1.4s_infinite_0.2s]"
                      ></span>
                      <span
                        class="w-1 h-1 rounded-full bg-amber-400 animate-[waiting-dots_1.4s_infinite_0.4s]"
                      ></span>
                    </span>
                    {{ blackReady ? $t('room.ready') : $t('room.waitingReady') }}
                  </span>
                </div>

                <!-- 中央 VS -->
                <div class="flex flex-col items-center px-2 sm:px-4 pt-6 sm:pt-7">
                  <div
                    class="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-board-green to-[#0d4a28] flex items-center justify-center shadow-[0_4px_20px_rgba(26,107,60,0.4)] animate-[float_4s_ease-in-out_infinite]"
                  >
                    <span class="text-base sm:text-lg font-black text-white">VS</span>
                  </div>
                  <p class="text-[10px] text-text-secondary mt-3 uppercase tracking-widest">8×8</p>
                </div>

                <!-- 白座 -->
                <div class="flex flex-col items-center text-center">
                  <div
                    class="relative mb-4"
                    :class="whiteReady ? 'animate-[ready-pulse_2s_ease-in-out_infinite]' : ''"
                  >
                    <div
                      class="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-white to-gray-200 border-4 flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
                      :class="whiteReady ? 'border-emerald-400/60' : 'border-glass-border'"
                    >
                      <span class="text-2xl sm:text-3xl font-bold text-gray-700">
                        {{ $t('room.whiteMark') }}
                      </span>
                    </div>
                    <div
                      v-if="whiteReady"
                      class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-400 border-4 border-[#0f1117] flex items-center justify-center"
                    >
                      <Check class="w-3.5 h-3.5 text-[#0f1117]" />
                    </div>
                    <div
                      v-if="!whiteReady"
                      class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-400 border-4 border-[#0f1117] flex items-center justify-center"
                    >
                      <Clock class="w-3.5 h-3.5 text-[#0f1117]" />
                    </div>
                  </div>
                  <p class="text-base font-bold">
                    {{
                      whiteId !== null ? (whiteName ?? whiteFallback) : $t('room.waitingOpponent')
                    }}
                  </p>
                  <p class="text-[10px] text-text-secondary mt-2">{{ $t('room.whiteSecond') }}</p>
                  <span
                    v-if="whiteId !== null"
                    class="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border"
                    :class="
                      whiteReady
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    "
                  >
                    <CheckCircle2 v-if="whiteReady" class="w-3 h-3" />
                    <span v-else class="flex gap-0.5">
                      <span
                        class="w-1 h-1 rounded-full bg-amber-400 animate-[waiting-dots_1.4s_infinite]"
                      ></span>
                      <span
                        class="w-1 h-1 rounded-full bg-amber-400 animate-[waiting-dots_1.4s_infinite_0.2s]"
                      ></span>
                      <span
                        class="w-1 h-1 rounded-full bg-amber-400 animate-[waiting-dots_1.4s_infinite_0.4s]"
                      ></span>
                    </span>
                    {{ whiteReady ? $t('room.ready') : $t('room.waitingReady') }}
                  </span>
                </div>
              </div>

              <!-- 准备/开局栏 -->
              <div
                class="relative mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-glass-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div
                  class="flex items-center justify-center sm:justify-start gap-2 text-xs text-text-secondary text-center sm:text-left"
                >
                  <Info class="w-3.5 h-3.5 text-gold shrink-0" />
                  <span>
                    {{ $t('room.readyHint', { ready: readyCount, total: 2 }) }}
                  </span>
                </div>
                <div
                  class="grid sm:flex sm:items-center gap-3 w-full sm:w-auto"
                  :class="isHost ? 'grid-cols-2' : 'grid-cols-1'"
                >
                  <button
                    type="button"
                    class="px-5 py-2.5 rounded-xl text-sm font-medium text-text-secondary border border-glass-border hover:border-text-secondary/40 hover:text-text-primary transition-all"
                    @click="toggleReady"
                  >
                    {{ myReady ? $t('room.cancelReady') : $t('room.readyBtn') }}
                  </button>
                  <button
                    v-if="isHost"
                    type="button"
                    :disabled="!bothSeated || !bothReady"
                    class="px-5 sm:px-7 py-2.5 rounded-xl text-sm font-bold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    @click="startGame"
                  >
                    <Play class="w-4 h-4" />{{ $t('room.startGame') }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 房间设置（房主可改） -->
            <div
              class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5 sm:p-6"
            >
              <div class="flex items-center gap-2 mb-5">
                <SlidersHorizontal class="w-4 h-4 text-gold" />
                <h2 class="text-sm font-semibold uppercase tracking-wider">
                  {{ $t('room.settings') }}
                </h2>
                <span class="text-[10px] text-text-secondary ml-auto">
                  {{ $t('room.hostOnly') }}
                </span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 sm:gap-y-5">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium">{{ $t('room.modeLabel') }}</p>
                    <p class="text-[11px] text-text-secondary mt-0.5">{{ $t('room.pvp') }}</p>
                  </div>
                  <div
                    class="flex items-center gap-1 bg-[rgba(255,255,255,0.03)] border border-glass-border rounded-full p-1 shrink-0"
                  >
                    <span
                      class="px-3 py-1 rounded-full text-[11px] font-medium bg-gold text-primary"
                    >{{ $t('room.pvp') }}</span>
                  </div>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium">{{ $t('room.timerLabel') }}</p>
                    <p class="text-[11px] text-text-secondary mt-0.5">
                      {{ $t('room.timeoutLose') }}
                    </p>
                  </div>
                  <span
                    class="text-xs text-gold font-medium px-2.5 py-1 bg-gold/10 rounded-full shrink-0"
                  >{{ $t('room.threeMin') }}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium">{{ $t('room.assignLabel') }}</p>
                    <p class="text-[11px] text-text-secondary mt-0.5">
                      {{ $t('room.blackFirstWhiteSecond') }}
                    </p>
                  </div>
                  <button
                    v-if="isHost"
                    type="button"
                    :disabled="settingsLocked || !bothSeated"
                    class="px-3 py-1 rounded-full text-[11px] font-medium bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    @click="swapColors"
                  >
                    {{ $t('room.swapColors') }}
                  </button>
                  <span
                    v-else
                    class="text-xs text-gold font-medium px-2.5 py-1 bg-gold/10 rounded-full shrink-0"
                  >{{ $t('room.fixed') }}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium">{{ $t('room.spectateLabel') }}</p>
                    <p class="text-[11px] text-text-secondary mt-0.5">
                      {{ $t('room.spectateHint') }}
                    </p>
                  </div>
                  <button
                    v-if="isHost"
                    type="button"
                    :disabled="settingsLocked"
                    class="w-11 h-6 rounded-full p-0.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    :class="spectatable ? 'bg-board-green' : 'bg-glass-border'"
                    @click="toggleSpectatable"
                  >
                    <div
                      class="w-5 h-5 rounded-full bg-white shadow-md transition-transform"
                      :class="spectatable ? 'translate-x-5' : 'translate-x-0'"
                    ></div>
                  </button>
                  <div
                    v-else
                    class="w-11 h-6 rounded-full p-0.5 shrink-0"
                    :class="spectatable ? 'bg-board-green' : 'bg-glass-border'"
                  >
                    <div
                      class="w-5 h-5 rounded-full bg-white shadow-md"
                      :class="spectatable ? 'translate-x-5' : 'translate-x-0'"
                    ></div>
                  </div>
                </div>
                <div class="flex items-center justify-between gap-3 sm:col-span-2">
                  <div class="min-w-0">
                    <p class="text-sm font-medium">{{ $t('room.passwordLabel') }}</p>
                    <p class="text-[11px] text-text-secondary mt-0.5">
                      {{ $t('room.passwordHint') }}
                    </p>
                  </div>
                  <div class="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <span class="text-xs font-mono text-text-secondary tracking-widest">●●●●●●</span>
                    <template v-if="isHost">
                      <input
                        v-if="showPasswordInput"
                        v-model="passwordInput"
                        type="text"
                        maxlength="64"
                        :placeholder="$t('room.passwordPlaceholder')"
                        class="w-28 sm:w-32 bg-[rgba(255,255,255,0.03)] border border-glass-border rounded-lg py-1 px-2 text-xs text-text-primary focus:outline-none focus:border-gold/30"
                        @keyup.enter="applyPassword"
                      >
                      <button
                        v-if="showPasswordInput"
                        type="button"
                        class="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                        @click="applyPassword"
                      >
                        {{ $t('room.save') }}
                      </button>
                      <button
                        v-else
                        type="button"
                        class="text-[11px] text-gold/70 hover:text-gold transition-colors flex items-center gap-1"
                        @click="showPasswordInput = true"
                      >
                        <Copy class="w-3 h-3" />{{ $t('room.editPassword') }}
                      </button>
                      <button
                        type="button"
                        class="text-[11px] text-rose-400/70 hover:text-rose-400 transition-colors"
                        @click="clearPassword"
                      >
                        {{ $t('room.clearPassword') }}
                      </button>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <!-- 观战席 -->
            <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2">
                  <Eye class="w-4 h-4 text-gold" />
                  <h2 class="text-sm font-semibold uppercase tracking-wider">
                    {{ $t('room.spectateSeat') }}
                  </h2>
                </div>
                <span class="text-xs text-gold bg-gold/10 px-2 py-0.5 rounded-full">
                  {{ $t('room.spectators', { n: spectatorCount }) }}
                </span>
              </div>
              <div v-if="spectatorCount === 0" class="text-xs text-text-secondary text-center py-3">
                {{ $t('room.noSpectators') }}
              </div>
              <div v-else class="flex items-center gap-3 flex-wrap">
                <div
                  v-for="s in spectators"
                  :key="s.userId"
                  class="flex items-center gap-2 px-3 py-2 rounded-xl bg-[rgba(255,255,255,0.03)] border border-glass-border w-full sm:w-auto"
                >
                  <div
                    class="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center"
                  >
                    <span class="text-[10px] text-purple-400">
                      {{ s.username.charAt(0).toUpperCase() }}
                    </span>
                  </div>
                  <div>
                    <p class="text-xs font-medium">{{ s.username }}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 右：房间聊天 -->
          <aside
            class="lg:col-span-4 lg:sticky top-20 lg:h-[calc(100vh-9rem)] max-h-[45vh] lg:max-h-none"
          >
            <ChatPanel :room-id="roomId ?? roomIdParam" :fill-height="true" class="h-full" />
          </aside>
        </div>
      </template>
    </main>
    <CopyFallbackDialog :text="pendingCopy" :title="$t('room.invite')" @close="clearPending" />
  </div>
</template>

<style scoped>
@keyframes float {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-8px);
  }
}
@keyframes ready-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.4);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(52, 211, 153, 0);
  }
}
@keyframes waiting-dots {
  0%,
  80%,
  100% {
    opacity: 0.2;
  }
  40% {
    opacity: 1;
  }
}
</style>
