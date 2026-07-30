<script setup lang="ts">
/**
 * 首页（双态，对照设计稿 00-home）：
 * - 未登录：棋盘视觉开场 +「马上玩」试玩漏斗（F-C-05 入口 → /local，免注册）
 * - 已登录：行动中枢 —— 快速开局矩阵 / 直播观战 / 最近对局 / 每日挑战
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Play,
  ArrowRight,
  Zap,
  Brain,
  Trophy,
  LineChart,
  BookOpen,
  Eye,
  Swords,
  PlusCircle,
  Monitor,
  Target,
  TrendingUp,
  ChevronDown,
  X,
} from '@lucide/vue'
import type { GameHistoryDTO, DailyChallengeDTO, GameMode, AiLevel } from '@othello-platform/shared'
import { useAuthStore } from '@/stores/auth-store'
import { useLobbyStore } from '@/stores/lobby-store'
import { useQuickAi } from '@/composables/useQuickAi'
import { getWsClient } from '@/api/ws-client'
import * as usersApi from '@/api/users'
import * as roomsApi from '@/api/rooms'
import PageNavBar from '@/components/PageNavBar.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import CreateRoomDialog from '@/components/lobby/CreateRoomDialog.vue'

const router = useRouter()
const auth = useAuthStore()
const lobby = useLobbyStore()
const { t, locale } = useI18n()

/** 双态分流：与路由守卫同口径（token 存在性） */
const isLoggedIn = computed(() => Boolean(auth.token))

// ─── 快速开局（composable，与大厅共用）───
const { aiQuickLevel, AI_LEVELS, joinError, createAndEnter, quickAi, onMatch, onCancelMatch } =
  useQuickAi()

const showCreate = ref(false)

async function onCreate(input: {
  name: string
  mode: GameMode
  aiLevel?: AiLevel
  password?: string
}) {
  await createAndEnter(input)
}

// ─── 已登录态数据 ───
const recentGames = ref<GameHistoryDTO[]>([])
const daily = ref<DailyChallengeDTO | null>(null)
const now = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null

const dailyDone = computed(() => daily.value?.completedIds.length ?? 0)
const dailyTotal = computed(() => daily.value?.puzzles.length ?? 0)

// ─── 装饰棋盘（中盘棋形示意；B=黑 W=白 .=空，index 36 = E5 最后一手）───
const BOARD_POS = '....B.....BBW....BBWW....BWWBW..BBWBBW....BWWBW....BBW..........'
const LAST_MOVE = 36
const boardCells = computed(() =>
  BOARD_POS.split('').map((c, i) => ({ stone: c, last: i === LAST_MOVE })),
)

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

/** 胜负徽章（我的视角）：result 为胜方色或 DRAW */
function resultOf(g: GameHistoryDTO): 'win' | 'lose' | 'draw' {
  if (g.result === 'DRAW' || g.result === null) return 'draw'
  const myWin =
    (g.myColor === 'BLACK' && g.result === 'BLACK') ||
    (g.myColor === 'WHITE' && g.result === 'WHITE')
  return myWin ? 'win' : 'lose'
}

const RESULT_CLS: Record<'win' | 'lose' | 'draw', string> = {
  win: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  lose: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
  draw: 'bg-gray-500/15 text-gray-400 border-gray-500/25',
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return t('home.justNow')
  if (min < 60) return t('home.minutesAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('home.hoursAgo', { n: hr })
  return t('home.daysAgo', { n: Math.floor(hr / 24) })
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return t('home.greetNight')
  if (h < 12) return t('home.greetMorning')
  if (h < 18) return t('home.greetAfternoon')
  return t('home.greetEvening')
}

function tickClock() {
  now.value = new Date().toLocaleString(locale.value, { hour12: false })
}

async function loadRecent() {
  if (auth.userId === null) return
  try {
    recentGames.value = (await usersApi.getGameHistory(auth.userId)).slice(0, 3)
  } catch {
    recentGames.value = []
  }
}

async function loadDaily() {
  try {
    daily.value = await roomsApi.getDailyChallenge()
  } catch {
    daily.value = null
  }
}

onMounted(async () => {
  if (!isLoggedIn.value) return
  getWsClient().connect()
  await Promise.all([
    lobby.refreshOnline(),
    lobby.refreshSpectateGames(),
    loadRecent(),
    loadDaily(),
  ])
  tickClock()
  refreshTimer = setInterval(() => {
    void lobby.refreshOnline()
    void lobby.refreshSpectateGames()
  }, 5_000)
  clockTimer = setInterval(tickClock, 1_000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<template>
  <div class="min-h-screen bg-primary text-text-primary">
    <!-- ═══ 未登录：棋盘开场 + 试玩漏斗 ═══ -->
    <template v-if="!isLoggedIn">
      <nav
        class="fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-xl bg-[rgba(15,17,23,0.85)] border-b border-glass-border"
      >
        <div class="max-w-[1440px] mx-auto h-full px-4 sm:px-8 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="w-9 h-9 rounded-lg bg-gradient-to-br from-board-green to-[#0d4a28] flex items-center justify-center"
            >
              <div class="grid grid-cols-2 gap-0.5">
                <div class="w-2.5 h-2.5 rounded-full bg-black"></div>
                <div class="w-2.5 h-2.5 rounded-full bg-white"></div>
                <div class="w-2.5 h-2.5 rounded-full bg-white"></div>
                <div class="w-2.5 h-2.5 rounded-full bg-black"></div>
              </div>
            </div>
            <span class="text-lg font-bold tracking-wide">Othello</span>
          </div>
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="hidden sm:block"><LanguageSwitcher /></div>
            <button
              type="button"
              class="px-3 sm:px-4 py-2 rounded-lg text-xs font-medium text-text-secondary border border-glass-border hover:text-text-primary hover:border-gold/30 transition-all"
              @click="router.push('/login')"
            >
              {{ $t('home.login') }}
            </button>
            <button
              type="button"
              class="px-3 sm:px-4 py-2 rounded-lg text-xs font-bold bg-gold text-primary hover:bg-gold-light transition-colors"
              @click="router.push('/register')"
            >
              {{ $t('home.register') }}
            </button>
          </div>
        </div>
      </nav>

      <main class="pt-16 min-h-screen relative overflow-hidden">
        <!-- 氛围层：棋盘绿光晕 + 网格纹理 -->
        <div
          class="absolute -top-32 right-[-10%] w-[720px] h-[720px] rounded-full bg-board-green/15 blur-[140px] pointer-events-none"
        ></div>
        <div
          class="absolute bottom-[-20%] left-[-8%] w-[520px] h-[520px] rounded-full bg-gold/8 blur-[120px] pointer-events-none"
        ></div>
        <div
          class="absolute inset-0 opacity-[0.03] pointer-events-none"
          :style="{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }"
        ></div>

        <div
          class="max-w-[1440px] mx-auto px-4 sm:px-8 min-h-[calc(100vh-4rem)] grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center py-12 relative"
        >
          <!-- 左：品牌 + 试玩漏斗 -->
          <div class="lg:col-span-7 text-center lg:text-left">
            <!-- eyebrow：堆叠态居中+两侧渐变线，宽屏左对齐无线 -->
            <div class="flex items-center justify-center lg:justify-start gap-3 mb-5">
              <span class="hidden lg:block w-0 h-0"></span>
              <span class="w-8 h-px bg-gradient-to-r from-transparent to-gold/50 lg:hidden"></span>
              <p class="text-[11px] uppercase tracking-[0.3em] text-gold/80 font-mono">
                {{ $t('home.tagline') }}
              </p>
              <span class="w-8 h-px bg-gradient-to-l from-transparent to-gold/50 lg:hidden"></span>
            </div>
            <h1
              class="text-4xl sm:text-5xl lg:text-5xl xl:text-6xl font-black leading-[1.08] tracking-tight"
            >
              <span class="block">{{ $t('home.headline1') }}</span>
              <span class="block mt-2 sm:mt-2.5 lg:mt-3 text-gold">
                {{ $t('home.headline2') }}
                <span class="inline-block w-3.5 h-3.5 rounded-full stone-b ml-2.5"></span>
              </span>
            </h1>
            <p class="text-text-secondary text-base mt-6 max-w-md mx-auto lg:mx-0 leading-relaxed">
              {{ $t('home.subhead') }}
            </p>

            <div class="flex flex-wrap items-center justify-center lg:justify-start gap-4 mt-9">
              <button
                type="button"
                class="group flex items-center gap-3 px-7 py-4 rounded-xl bg-gold text-primary font-bold text-sm hover:bg-gold-light hover:-translate-y-0.5 transition-all shadow-[0_8px_32px_rgba(212,168,67,0.28)]"
                @click="router.push('/local')"
              >
                <Play class="w-4 h-4 fill-current" />
                {{ $t('home.playNow') }}
                <ArrowRight class="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                type="button"
                class="px-6 py-4 rounded-xl text-sm font-medium text-text-primary border border-glass-border bg-glass hover:border-gold/40 hover:text-gold transition-all"
                @click="router.push('/register')"
              >
                {{ $t('home.createAccount') }}
              </button>
            </div>
            <p
              class="text-[11px] text-text-secondary mt-3 flex items-center justify-center lg:justify-start gap-1.5"
            >
              <Zap class="w-3 h-3 text-gold/70" />
              {{ $t('home.noSignupHint') }}
              <button
                type="button"
                class="text-gold/90 hover:text-gold underline underline-offset-2"
                @click="router.push('/login')"
              >
                {{ $t('home.goLogin') }}
              </button>
            </p>

            <!-- 特性 chips -->
            <div class="flex flex-wrap justify-center lg:justify-start gap-2.5 mt-10">
              <span
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-glass border border-glass-border text-[11px] text-text-secondary"
              >
                <Brain class="w-3 h-3 text-purple-400" />{{ $t('home.featAi') }}
              </span>
              <span
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-glass border border-glass-border text-[11px] text-text-secondary"
              >
                <Trophy class="w-3 h-3 text-gold" />{{ $t('home.featElo') }}
              </span>
              <span
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-glass border border-glass-border text-[11px] text-text-secondary"
              >
                <LineChart class="w-3 h-3 text-cyan-400" />{{ $t('home.featReplay') }}
              </span>
              <span
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-glass border border-glass-border text-[11px] text-text-secondary"
              >
                <BookOpen class="w-3 h-3 text-emerald-400" />{{ $t('home.featTactics') }}
              </span>
              <span
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-glass border border-glass-border text-[11px] text-text-secondary"
              >
                <Eye class="w-3 h-3 text-blue-400" />{{ $t('home.featSpectate') }}
              </span>
            </div>
          </div>

          <!-- 右：棋盘视觉 -->
          <div
            class="lg:col-span-5 relative max-w-sm sm:max-w-md mx-auto lg:mx-0 lg:max-w-none w-full"
          >
            <div
              class="absolute -top-8 -left-6 w-10 h-10 rounded-full stone-b opacity-70 animate-[float_6s_ease-in-out_infinite]"
            ></div>
            <div
              class="absolute -bottom-6 -right-4 w-7 h-7 rounded-full stone-w opacity-60 animate-[floatAlt_7s_ease-in-out_infinite]"
            ></div>
            <div
              class="relative rounded-2xl p-3 bg-gradient-to-br from-[#0d4a28] to-[#0a3a20] border border-board-green/40 shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
            >
              <div class="grid grid-cols-8 rounded-lg overflow-hidden aspect-square">
                <div
                  v-for="(cell, i) in boardCells"
                  :key="i"
                  class="board-cell flex items-center justify-center"
                >
                  <div
                    v-if="cell.stone === 'B'"
                    class="w-[76%] h-[76%] rounded-full stone-b"
                    :class="cell.last ? 'animate-[lastGlow_2.2s_ease-in-out_infinite]' : ''"
                  ></div>
                  <div
                    v-else-if="cell.stone === 'W'"
                    class="w-[76%] h-[76%] rounded-full stone-w"
                  ></div>
                </div>
              </div>
              <!-- 覆盖层：最后一手 / 回合指示 -->
              <div
                class="absolute top-6 right-6 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(15,17,23,0.82)] border border-gold/40 backdrop-blur-sm"
              >
                <span class="w-2 h-2 rounded-full bg-gold"></span>
                <span class="text-[10px] text-gold font-mono">{{ $t('home.lastMove') }}</span>
              </div>
              <div
                class="absolute bottom-6 left-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(15,17,23,0.82)] border border-glass-border backdrop-blur-sm"
              >
                <span
                  class="w-3 h-3 rounded-full stone-b animate-[livePulse_1.6s_ease-in-out_infinite]"
                ></span>
                <span class="text-[11px] text-text-primary">{{ $t('home.blackToMove') }}</span>
              </div>
            </div>
            <div
              class="flex items-center justify-between mt-4 px-1 text-[11px] text-text-secondary font-mono"
            >
              <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full stone-b inline-block"></span>
                {{ $t('home.blackScore', { n: 34 }) }}
              </span>
              <span class="text-gold/70">{{ $t('home.moveNumber', { n: 41 }) }}</span>
              <span class="flex items-center gap-1.5">
                {{ $t('home.whiteScore', { n: 30 }) }}
                <span class="w-2.5 h-2.5 rounded-full stone-w inline-block"></span>
              </span>
            </div>
          </div>
        </div>
      </main>
    </template>

    <!-- ═══ 已登录：行动中枢 ═══ -->
    <template v-else>
      <PageNavBar />

      <main class="pt-20 pb-12 max-w-[1440px] mx-auto px-4 sm:px-8">
        <!-- 问候行 -->
        <div class="flex items-end justify-between mb-8">
          <div>
            <p class="text-[11px] uppercase tracking-[0.25em] text-text-secondary mb-2 font-mono">
              {{ now }}
            </p>
            <h1 class="text-3xl font-black tracking-tight">
              {{ greeting() }}，{{ auth.username }}
            </h1>
          </div>
          <div
            class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/5 border border-emerald-500/20"
          >
            <span
              class="w-2 h-2 rounded-full bg-emerald-400 animate-[livePulse_1.6s_ease-in-out_infinite]"
            ></span>
            <span class="text-[11px] text-emerald-400 font-medium font-mono">
              {{
                $t('home.onlineStatus', {
                  users: lobby.onlineUsers.length,
                  games: lobby.spectateGames.length,
                })
              }}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <!-- 左列：快速开局 + 提升 -->
          <div class="lg:col-span-7 space-y-5">
            <!-- 快速开局 -->
            <section class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5">
              <div class="flex items-center justify-between mb-4">
                <span class="text-[10px] uppercase tracking-wider text-text-secondary">
                  {{ $t('home.quickStart') }}
                </span>
                <Swords class="w-3.5 h-3.5 text-gold/60" />
              </div>

              <!-- 在线人机（主入口，含难度选择） -->
              <div
                class="group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 p-4 rounded-xl border border-gold/25 bg-gold/5 hover:bg-gold/10 hover:border-gold/40 transition-all mb-2.5"
              >
                <div class="flex items-center gap-3.5">
                  <div
                    class="w-11 h-11 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center shrink-0"
                  >
                    <Brain class="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <p class="text-sm font-bold">{{ $t('home.onlineAi') }}</p>
                    <p class="text-[11px] text-text-secondary mt-0.5">
                      {{ $t('home.onlineAiHint') }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2.5 w-full sm:w-auto">
                  <div class="relative">
                    <select
                      v-model.number="aiQuickLevel"
                      class="appearance-none bg-[rgba(255,255,255,0.04)] border border-glass-border rounded-lg py-2 pl-2.5 pr-7 text-[11px] text-text-primary outline-none focus:border-gold/40 cursor-pointer"
                      :aria-label="$t('lobby.aiLevelLabel')"
                    >
                      <option v-for="lv in AI_LEVELS" :key="lv.value" :value="lv.value">
                        {{ lv.label }}
                      </option>
                    </select>
                    <ChevronDown
                      class="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-secondary pointer-events-none"
                    />
                  </div>
                  <button
                    type="button"
                    class="px-5 py-2.5 rounded-lg text-xs font-bold bg-gold text-primary hover:bg-gold-light transition-colors"
                    @click="quickAi"
                  >
                    {{ $t('home.start') }}
                  </button>
                </div>
              </div>

              <!-- 次级入口行 -->
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  class="group flex flex-col items-start gap-2.5 p-4 rounded-xl border border-glass-border bg-[rgba(255,255,255,0.02)] hover:border-emerald-500/35 hover:bg-emerald-500/5 transition-all text-left"
                  @click="showCreate = true"
                >
                  <PlusCircle class="w-5 h-5 text-emerald-400" />
                  <div>
                    <p class="text-xs font-bold">{{ $t('home.createRoom') }}</p>
                    <p class="text-[10px] text-text-secondary mt-0.5">
                      {{ $t('home.createRoomHint') }}
                    </p>
                  </div>
                </button>
                <button
                  v-if="lobby.matchStatus !== 'queuing'"
                  type="button"
                  class="group flex flex-col items-start gap-2.5 p-4 rounded-xl border border-glass-border bg-[rgba(255,255,255,0.02)] hover:border-cyan-500/35 hover:bg-cyan-500/5 transition-all text-left"
                  @click="onMatch"
                >
                  <Zap class="w-5 h-5 text-cyan-400" />
                  <div>
                    <p class="text-xs font-bold">{{ $t('home.autoMatch') }}</p>
                    <p class="text-[10px] text-text-secondary mt-0.5">
                      {{ $t('home.autoMatchHint') }}
                    </p>
                  </div>
                </button>
                <button
                  v-else
                  type="button"
                  class="group flex flex-col items-start gap-2.5 p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 transition-all text-left"
                  @click="onCancelMatch"
                >
                  <X class="w-5 h-5 text-rose-400" />
                  <div>
                    <p class="text-xs font-bold">{{ $t('home.cancelMatch') }}</p>
                    <p class="text-[10px] text-text-secondary mt-0.5">
                      {{ $t('home.matchingHint') }}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  class="group flex flex-col items-start gap-2.5 p-4 rounded-xl border border-glass-border bg-[rgba(255,255,255,0.02)] hover:border-gold/35 hover:bg-gold/5 transition-all text-left"
                  @click="router.push('/local')"
                >
                  <Monitor class="w-5 h-5 text-gold" />
                  <div>
                    <p class="text-xs font-bold">{{ $t('home.offlinePractice') }}</p>
                    <p class="text-[10px] text-text-secondary mt-0.5">
                      {{ $t('home.offlinePracticeHint') }}
                    </p>
                  </div>
                </button>
              </div>

              <div v-if="joinError" class="mt-3 text-xs text-red-400">{{ joinError }}</div>
            </section>

            <!-- 棋力提升 -->
            <section class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5">
              <div class="flex items-center justify-between mb-4">
                <span class="text-[10px] uppercase tracking-wider text-text-secondary">
                  {{ $t('home.improve') }}
                </span>
                <TrendingUp class="w-3.5 h-3.5 text-emerald-400/60" />
              </div>
              <div class="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  class="group flex items-center gap-3.5 p-4 rounded-xl border border-glass-border bg-[rgba(255,255,255,0.02)] hover:border-emerald-500/35 hover:bg-emerald-500/5 transition-all text-left"
                  @click="router.push('/tactics')"
                >
                  <div
                    class="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0"
                  >
                    <BookOpen class="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p class="text-xs font-bold">{{ $t('home.tactics') }}</p>
                    <p class="text-[10px] text-text-secondary mt-0.5">
                      {{ $t('home.tacticsHint') }}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  class="group p-4 rounded-xl border border-glass-border bg-[rgba(255,255,255,0.02)] hover:border-gold/35 hover:bg-gold/5 transition-all text-left"
                  @click="router.push('/tactics')"
                >
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <Target class="w-4 h-4 text-gold" />
                      <p class="text-xs font-bold">{{ $t('home.dailyChallenge') }}</p>
                    </div>
                    <span class="text-[10px] text-gold font-mono">
                      {{ dailyDone }}/{{ dailyTotal }}
                    </span>
                  </div>
                  <div class="h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                    <div
                      class="h-full rounded-full bg-gradient-to-r from-gold to-gold-light transition-all duration-500"
                      :style="{
                        width: dailyTotal ? `${(dailyDone / dailyTotal) * 100}%` : '0%',
                      }"
                    ></div>
                  </div>
                  <p class="text-[10px] text-text-secondary mt-2">
                    {{ $t('home.dailyHint', { n: dailyTotal - dailyDone }) }}
                  </p>
                </button>
              </div>
            </section>
          </div>

          <!-- 右列：直播 + 最近对局 -->
          <div class="lg:col-span-5 space-y-5">
            <!-- 直播观战 -->
            <section class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5">
              <div class="flex items-center justify-between mb-4">
                <span
                  class="text-[10px] uppercase tracking-wider text-text-secondary flex items-center gap-1.5"
                >
                  <span
                    class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-[livePulse_1.4s_ease-in-out_infinite]"
                  ></span>
                  {{ $t('home.live') }}
                </span>
                <button
                  type="button"
                  class="text-[10px] text-text-secondary hover:text-gold transition-colors"
                  @click="router.push('/lobby')"
                >
                  {{ $t('home.lobbyLink') }}
                </button>
              </div>
              <div
                v-if="lobby.spectateGames.length === 0"
                class="text-text-secondary text-xs text-center py-6"
              >
                {{ $t('lobby.noActiveGame') }}
              </div>
              <div v-else class="space-y-2.5">
                <div
                  v-for="g in lobby.spectateGames.slice(0, 3)"
                  :key="g.gameId"
                  class="group flex items-center justify-between p-3 rounded-xl border border-glass-border bg-[rgba(255,255,255,0.02)] hover:border-emerald-500/30 transition-all"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="flex -space-x-2 shrink-0">
                      <div
                        class="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500/40 to-blue-600/20 border border-[#0f1117] flex items-center justify-center text-[9px] font-bold text-blue-200"
                      >
                        {{ initial(g.blackName ?? '?') }}
                      </div>
                      <div
                        class="w-7 h-7 rounded-full bg-gradient-to-br from-rose-500/40 to-rose-600/20 border border-[#0f1117] flex items-center justify-center text-[9px] font-bold text-rose-200"
                      >
                        {{ initial(g.whiteName ?? '?') }}
                      </div>
                    </div>
                    <div class="min-w-0">
                      <p class="text-[11px] font-medium truncate">
                        {{ g.blackName ?? $t('common.blackSide') }}
                        <span class="text-text-secondary">vs</span>
                        {{ g.whiteName ?? $t('common.whiteSide') }}
                      </p>
                      <p class="text-[10px] text-text-secondary font-mono">
                        {{ $t('lobby.moveNumber', { n: g.moveCount }) }} · {{ g.spectatorCount }}
                        {{ $t('home.watching') }}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-glass text-text-secondary border border-glass-border group-hover:bg-emerald-500/15 group-hover:text-emerald-300 group-hover:border-emerald-500/30 transition-all shrink-0"
                    @click="router.push(`/spectate/${g.gameId}`)"
                  >
                    {{ $t('lobby.spectate') }}
                  </button>
                </div>
              </div>
            </section>

            <!-- 最近对局 -->
            <section class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5">
              <div class="flex items-center justify-between mb-4">
                <span class="text-[10px] uppercase tracking-wider text-text-secondary">
                  {{ $t('home.recentGames') }}
                </span>
                <button
                  type="button"
                  class="text-[10px] text-text-secondary hover:text-gold transition-colors"
                  @click="router.push(`/profile/${auth.userId}`)"
                >
                  {{ $t('home.allRecords') }}
                </button>
              </div>
              <div
                v-if="recentGames.length === 0"
                class="text-text-secondary text-xs text-center py-6"
              >
                {{ $t('home.noRecentGames') }}
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="g in recentGames"
                  :key="g.gameId"
                  class="group flex items-center justify-between p-3 rounded-xl hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                >
                  <div class="flex items-center gap-3">
                    <span
                      class="text-[10px] font-black px-2 py-1 rounded-md border"
                      :class="RESULT_CLS[resultOf(g)]"
                    >
                      {{ $t(`home.result_${resultOf(g)}`) }}
                    </span>
                    <div>
                      <p class="text-[11px] font-medium">vs {{ g.opponentName }}</p>
                      <p class="text-[10px] text-text-secondary font-mono">
                        {{ g.moveCount }} {{ $t('home.movesUnit') }} · {{ timeAgo(g.endedAt) }}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="px-3 py-1.5 rounded-lg text-[10px] font-medium text-text-secondary border border-glass-border opacity-0 group-hover:opacity-100 hover:border-gold/30 hover:text-gold transition-all"
                    @click="router.push(`/replay/${g.gameId}`)"
                  >
                    {{ $t('home.replay') }}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <!-- 创建房间对话框（复用大厅组件） -->
      <CreateRoomDialog v-model:open="showCreate" @create="onCreate" />
    </template>
  </div>
</template>

<style scoped>
/* 棋子 / 棋盘格样式（装饰棋盘，两态共用） */
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
.board-cell {
  background: linear-gradient(135deg, #1a6b3c, #17613a);
  border: 1px solid rgba(0, 0, 0, 0.28);
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-12px);
  }
}
@keyframes floatAlt {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(9px);
  }
}
@keyframes lastGlow {
  0%,
  100% {
    box-shadow:
      0 0 0 2px #d4a843,
      0 0 10px rgba(212, 168, 67, 0.45);
  }
  50% {
    box-shadow:
      0 0 0 2px #e8c96a,
      0 0 26px rgba(212, 168, 67, 0.85);
  }
}
@keyframes livePulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
