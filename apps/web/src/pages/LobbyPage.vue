<script setup lang="ts">
/**
 * 大厅页（T07/T10）：固定顶栏 + 三栏（在线玩家 / 房间列表+操作 / 公共聊天）+ 底部状态栏。
 * 布局对齐设计稿 03-lobby；仅渲染真实字段（人数/观战/ELO 等未实现，忽略）。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Plus,
  Zap,
  Cpu,
  LogOut,
  ChevronDown,
  Radar,
  X,
  Eye,
  Users,
  Trophy,
  Settings,
  Brain,
  Star,
  Clock,
  Home,
} from '@lucide/vue'
import type { RoomDTO, GameMode, AiLevel, UserDTO } from '@othello-platform/shared'
import { useLobbyStore } from '@/stores/lobby-store'
import { useChatStore } from '@/stores/chat-store'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationStore } from '@/stores/notification-store'
import { useChallenge } from '@/composables/useChallenge'
import { useQuickAi } from '@/composables/useQuickAi'
import { getWsClient } from '@/api/ws-client'
import * as api from '@/api/rooms'
import * as usersApi from '@/api/users'
import RoomList from '@/components/lobby/RoomList.vue'
import CreateRoomDialog from '@/components/lobby/CreateRoomDialog.vue'
import JoinPasswordDialog from '@/components/lobby/JoinPasswordDialog.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'

const router = useRouter()
const lobby = useLobbyStore()
const chat = useChatStore()
const auth = useAuthStore()
const { t, locale } = useI18n()

const showCreate = ref(false)
const showJoinPwd = ref(false)
const pendingJoinRoom = ref<RoomDTO | null>(null)
const now = ref('')
/** 本人资料（顶栏积分胶囊用，真实数据） */
const me = ref<UserDTO | null>(null)
/** 中栏 tab：等待中房间 / 进行中对局（可观战），对齐设计稿 03-lobby */
const activeTab = ref<'waiting' | 'spectate'>('waiting')
let refreshTimer: ReturnType<typeof setInterval> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null

// 快速开局逻辑（在线人机建房 / 进房导航 / 自动匹配）提取至 useQuickAi，与首页共用
const {
  aiQuickLevel,
  AI_LEVELS,
  joinError,
  enterRoom,
  createAndEnter,
  quickAi,
  onMatch,
  onCancelMatch,
} = useQuickAi()

// 挑战发起方状态（composable 须在 setup 顶层调用，内部含 useI18n）
const { challengingId } = useChallenge()

// 头像配色（按 id 稳定取色）
const AVATAR_COLORS = [
  'from-emerald-500/20 to-emerald-600/10 border-emerald-500/20 text-emerald-400',
  'from-blue-500/20 to-blue-600/10 border-blue-500/20 text-blue-400',
  'from-purple-500/20 to-purple-600/10 border-purple-500/20 text-purple-400',
  'from-rose-500/20 to-rose-600/10 border-rose-500/20 text-rose-400',
  'from-cyan-500/20 to-cyan-600/10 border-cyan-500/20 text-cyan-400',
  'from-amber-500/20 to-amber-600/10 border-amber-500/20 text-amber-400',
]

function avatarClass(id: number): string {
  return AVATAR_COLORS[id % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

const waitingRooms = computed(() => lobby.rooms.filter((r) => r.status === 'waiting'))

function tickClock() {
  now.value = new Date().toLocaleString(locale.value, { hour12: false })
}

onMounted(async () => {
  getWsClient().connect()
  chat.connect()
  await Promise.all([
    lobby.refreshRooms('waiting'),
    lobby.refreshOnline(),
    lobby.refreshSpectateGames(),
    lobby.refreshTopElo(),
    chat.loadPublicHistory(),
    loadMe(),
  ])
  tickClock()
  refreshTimer = setInterval(() => {
    void lobby.refreshRooms('waiting')
    void lobby.refreshOnline()
    void lobby.refreshSpectateGames()
    void lobby.refreshTopElo()
  }, 5_000)
  clockTimer = setInterval(tickClock, 1_000)
})

/** 拉取本人资料（顶栏 ELO / 经典积分胶囊） */
async function loadMe() {
  if (auth.userId === null) return
  try {
    me.value = await usersApi.getUser(auth.userId)
  } catch {
    me.value = null
  }
}

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (clockTimer) clearInterval(clockTimer)
})

async function onCreate(input: {
  name: string
  mode: GameMode
  aiLevel?: AiLevel
  password?: string
}) {
  await createAndEnter(input)
}

async function onJoin(room: RoomDTO) {
  joinError.value = ''
  // 有口令房由 RoomList 发 join-with-password 事件 → 弹口令输入框；无口令房直接进
  if (room.hasPassword) {
    pendingJoinRoom.value = room
    showJoinPwd.value = true
    return
  }
  await enterRoom(room.id, room.mode)
}

/** RoomList 对有口令房 emit join-with-password → 弹口令输入框 */
function onJoinWithPassword(room: RoomDTO) {
  joinError.value = ''
  pendingJoinRoom.value = room
  showJoinPwd.value = true
}

/** 口令弹窗提交 → 携带口令加入 */
async function onJoinPwdSubmit(password: string) {
  const room = pendingJoinRoom.value
  if (!room) return
  joinError.value = ''
  await enterRoom(room.id, room.mode, password)
  pendingJoinRoom.value = null
}

/** 快速加入：进入第一个等待中的公开房间（跳过口令房） */
async function quickJoin() {
  joinError.value = ''
  const target = waitingRooms.value.find((r) => !r.hasPassword)
  if (!target) {
    joinError.value = t('lobby.noRoomToJoin')
    return
  }
  await enterRoom(target.id, target.mode)
}

function onLogout() {
  // 清理全局通知与挑战发起方状态（登出后不再属于当前用户）
  useNotificationStore().clearAll()
  challengingId.value = null
  void auth.logout()
  void router.push('/login')
}
</script>

<template>
  <div class="min-h-screen bg-primary text-text-primary">
    <!-- 固定顶栏（三栏：logo / 积分胶囊 / 用户控件，对齐设计稿 03-lobby） -->
    <nav
      class="fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-xl bg-[rgba(15,17,23,0.85)] border-b border-glass-border"
    >
      <div class="max-w-[1440px] mx-auto h-full px-8 flex items-center justify-between">
        <!-- 左：Logo -->
        <div class="flex items-center gap-3 flex-shrink-0">
          <div
            class="w-9 h-9 rounded-lg bg-gradient-to-br from-board-green to-[#0d4a28] flex items-center justify-center shadow-md"
          >
            <div class="grid grid-cols-2 gap-0.5">
              <div class="w-2.5 h-2.5 rounded-full bg-black" />
              <div class="w-2.5 h-2.5 rounded-full bg-white" />
              <div class="w-2.5 h-2.5 rounded-full bg-white" />
              <div class="w-2.5 h-2.5 rounded-full bg-black" />
            </div>
          </div>
          <span class="text-lg font-bold tracking-wide">Othello</span>
        </div>

        <!-- 中：我的积分（ELO + 经典积分胶囊），flex-1 居中避免与右侧控件重叠 -->
        <div class="hidden lg:flex items-center gap-4 flex-1 justify-center">
          <div
            class="flex items-center gap-2 bg-gold/5 border border-gold/20 rounded-full px-3 py-1.5"
          >
            <Trophy class="w-3 h-3 text-gold" />
            <span class="text-[11px] text-gold font-medium">{{
              $t('lobby.eloRating', { n: me?.elo ?? '—' })
            }}</span>
          </div>
          <div
            class="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-full px-3 py-1.5"
          >
            <Star class="w-3 h-3 text-emerald-400" />
            <span class="text-[11px] text-emerald-400 font-medium">{{
              $t('lobby.classicScore', { n: me?.classicScore ?? '—' })
            }}</span>
          </div>
        </div>

        <!-- 右：导航 + 用户信息 -->
        <div class="flex items-center justify-end gap-4 flex-shrink-0">
          <LanguageSwitcher />
          <button
            class="p-2 rounded-lg hover:bg-glass transition-colors text-text-secondary hover:text-gold"
            :title="$t('common.home')"
            @click="router.push('/')"
          >
            <Home class="w-4 h-4" />
          </button>
          <button
            class="p-2 rounded-lg hover:bg-glass transition-colors text-text-secondary hover:text-gold"
            :title="$t('lobby.titleFriends')"
            @click="router.push('/friends')"
          >
            <Users class="w-4 h-4" />
          </button>
          <button
            class="p-2 rounded-lg hover:bg-glass transition-colors text-text-secondary hover:text-gold"
            :title="$t('lobby.titleLeaderboard')"
            @click="router.push('/leaderboard')"
          >
            <Trophy class="w-4 h-4" />
          </button>
          <button
            class="p-2 rounded-lg hover:bg-glass transition-colors text-text-secondary hover:text-gold"
            :title="$t('tactics.title')"
            @click="router.push('/tactics')"
          >
            <Brain class="w-4 h-4" />
          </button>
          <button
            class="p-2 rounded-lg hover:bg-glass transition-colors text-text-secondary hover:text-gold"
            :title="$t('settings.title')"
            @click="router.push('/settings')"
          >
            <Settings class="w-4 h-4" />
          </button>
          <div
            v-if="auth.userId"
            class="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
            :title="$t('profile.viewProfile')"
            @click="router.push(`/profile/${auth.userId}`)"
          >
            <div
              class="w-8 h-8 rounded-full bg-gradient-to-br from-gold/30 to-gold/10 border border-gold/30 flex items-center justify-center text-gold text-sm font-medium"
            >
              {{ initial(auth.username ?? '') }}
            </div>
            <div class="flex items-center">
              <span class="text-sm font-medium">{{ auth.username }}</span>
              <span v-if="me" class="ml-2 text-xs text-gold bg-gold/10 px-2 py-0.5 rounded-full">{{
                me.elo
              }}</span>
            </div>
          </div>
          <button
            class="p-2 rounded-lg hover:bg-glass transition-colors text-text-secondary hover:text-text-primary"
            :title="$t('lobby.titleLogout')"
            @click="onLogout"
          >
            <LogOut class="w-4 h-4" />
          </button>
        </div>
      </div>
    </nav>

    <!-- 主体三栏（高度自适应视口，对齐设计稿 03-lobby） -->
    <main class="pt-20 pb-12 max-w-[1440px] mx-auto px-8">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:h-[calc(100vh-8rem)]">
        <!-- 左：在线玩家 -->
        <aside
          class="lg:col-span-3 backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5 flex flex-col max-h-[45vh] lg:max-h-none overflow-y-auto lg:overflow-hidden"
        >
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              {{ $t('lobby.onlinePlayers') }}
            </h2>
            <span class="text-xs text-gold bg-gold/10 px-2 py-0.5 rounded-full">{{
              $t('lobby.peopleCount', { count: lobby.onlineUsers.length })
            }}</span>
          </div>
          <div class="flex-1 overflow-y-auto space-y-2 pr-1">
            <div
              v-for="u in lobby.onlineUsers"
              :key="u.id"
              class="flex items-center gap-3 p-3 rounded-xl hover:bg-[rgba(255,255,255,0.03)] transition-colors cursor-pointer"
              :title="$t('profile.viewProfile')"
              @click="router.push(`/profile/${u.id}`)"
            >
              <div class="relative">
                <div
                  class="w-9 h-9 rounded-full bg-gradient-to-br border flex items-center justify-center text-sm font-medium"
                  :class="avatarClass(u.id)"
                >
                  {{ initial(u.username) }}
                </div>
                <div
                  class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-surface"
                />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{{ u.username }}</p>
              </div>
              <span
                class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                >{{ $t('lobby.onlineTag') }}</span
              >
            </div>
            <div
              v-if="lobby.onlineUsers.length === 0"
              class="text-text-secondary text-sm text-center py-6"
            >
              {{ $t('lobby.noOnline') }}
            </div>
          </div>
        </aside>

        <!-- 中：操作 + 迷你榜单 + 房间/观战 Tab -->
        <section class="lg:col-span-5 flex flex-col max-h-[60vh] lg:max-h-none">
          <!-- 操作按钮组 -->
          <div class="flex gap-3 mb-3">
            <button
              class="flex-1 py-3 rounded-xl font-semibold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all duration-300 flex items-center justify-center gap-2"
              @click="showCreate = true"
            >
              <Plus class="w-4 h-4" />{{ $t('lobby.createRoom') }}
            </button>
            <button
              class="flex-1 py-3 rounded-xl font-medium text-text-primary border border-board-green/50 bg-board-green/10 hover:bg-board-green/20 transition-all duration-300 flex items-center justify-center gap-2"
              @click="quickJoin"
            >
              <Zap class="w-4 h-4" />{{ $t('lobby.quickJoin') }}
            </button>
            <!-- 自动匹配（T11，F-E-06）：按 ELO 邻近区间排队 -->
            <button
              v-if="lobby.matchStatus !== 'queuing'"
              class="flex-1 py-3 rounded-xl font-medium text-text-primary border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 transition-all duration-300 flex items-center justify-center gap-2"
              @click="onMatch"
            >
              <Radar class="w-4 h-4" />{{ $t('lobby.autoMatch') }}
            </button>
            <button
              v-else
              class="flex-1 py-3 rounded-xl font-medium text-text-primary border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 transition-all duration-300 flex items-center justify-center gap-2"
              @click="onCancelMatch"
            >
              <X class="w-4 h-4" />{{ $t('lobby.cancelMatch') }}
            </button>
          </div>
          <!-- 人机对战 + 难度 -->
          <div class="flex gap-3 mb-5">
            <button
              class="flex-1 py-2.5 rounded-xl font-medium text-[#0f1117] bg-gradient-to-r from-blue-400 to-cyan-400 shadow-[0_4px_16px_rgba(59,130,246,0.25)] hover:shadow-[0_6px_24px_rgba(59,130,246,0.4)] transition-all duration-300 flex items-center justify-center gap-2"
              @click="quickAi"
            >
              <Cpu class="w-4 h-4" />{{ $t('lobby.aiBattle') }}
            </button>
            <div class="relative">
              <select
                v-model.number="aiQuickLevel"
                class="appearance-none h-full bg-[rgba(255,255,255,0.03)] border border-glass-border rounded-xl py-2.5 pl-3 pr-8 text-xs text-text-primary focus:outline-none focus:border-gold/30 cursor-pointer"
                :aria-label="$t('lobby.aiLevelLabel')"
              >
                <option v-for="lv in AI_LEVELS" :key="lv.value" :value="lv.value">
                  {{ lv.label }}
                </option>
              </select>
              <ChevronDown
                class="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-secondary pointer-events-none"
              />
            </div>
          </div>

          <!-- 匹配排队状态（T11） -->
          <div
            v-if="lobby.matchStatus === 'queuing'"
            class="mb-5 px-4 py-3 rounded-xl border border-purple-500/30 bg-purple-500/10 flex items-center gap-3"
          >
            <Radar class="w-4 h-4 text-purple-400 animate-spin [animation-duration:3s]" />
            <div class="flex-1 text-sm">
              <p class="font-medium text-purple-300">{{ $t('lobby.matching') }}</p>
              <p class="text-[11px] text-text-secondary">{{ $t('lobby.matchingHint') }}</p>
            </div>
            <span class="text-[11px] text-text-secondary">{{
              $t('lobby.queueCount', { count: lobby.matchQueueSize })
            }}</span>
          </div>

          <div v-if="joinError" class="text-red-400 text-sm mb-3">{{ joinError }}</div>

          <!-- 迷你 ELO 榜单（真实数据前 5，对齐设计稿 03-lobby） -->
          <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-4 mb-4">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <Trophy class="w-3.5 h-3.5 text-gold" />
                <span
                  class="text-[11px] font-semibold uppercase tracking-wider text-text-secondary"
                >
                  {{ $t('lobby.miniLeaderboard') }}
                </span>
              </div>
              <button
                class="text-[10px] text-gold/70 hover:text-gold transition-colors"
                @click="router.push('/leaderboard')"
              >
                {{ $t('lobby.viewAll') }}
              </button>
            </div>
            <div class="flex items-center gap-3 overflow-x-auto">
              <div
                v-for="(e, i) in lobby.topElo"
                :key="e.id"
                class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 shrink-0"
                :class="
                  i === 0
                    ? 'bg-gold/5 border border-gold/10'
                    : 'bg-glass border border-glass-border'
                "
              >
                <span
                  class="text-[10px] font-bold"
                  :class="i === 0 ? 'text-gold' : 'text-text-secondary'"
                  >{{ i + 1 }}</span
                >
                <span class="text-[11px] font-medium max-w-20 truncate">{{ e.username }}</span>
                <span class="text-[10px]" :class="i === 0 ? 'text-gold' : 'text-text-secondary'">{{
                  e.elo
                }}</span>
              </div>
              <div v-if="lobby.topElo.length === 0" class="text-text-secondary text-[11px] py-1">
                {{ $t('leaderboard.noData') }}
              </div>
            </div>
          </div>

          <!-- 房间 / 观战 Tab 切换（对齐设计稿 03-lobby） -->
          <div
            class="flex items-center gap-1 mb-4 bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-xl p-1"
          >
            <button
              class="flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1"
              :class="
                activeTab === 'waiting'
                  ? 'bg-gold/10 text-gold border border-gold/20'
                  : 'text-text-secondary hover:text-text-primary border border-transparent'
              "
              @click="activeTab = 'waiting'"
            >
              <Clock class="w-3 h-3" />{{ $t('lobby.tabWaiting') }}
              <span class="text-[10px] opacity-70">({{ lobby.rooms.length }})</span>
            </button>
            <button
              class="flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1"
              :class="
                activeTab === 'spectate'
                  ? 'bg-gold/10 text-gold border border-gold/20'
                  : 'text-text-secondary hover:text-text-primary border border-transparent'
              "
              @click="activeTab = 'spectate'"
            >
              <Eye class="w-3 h-3" />{{ $t('lobby.tabSpectate') }}
              <span class="text-[10px] opacity-70">({{ lobby.spectateGames.length }})</span>
            </button>
          </div>

          <!-- Tab 内容：等待中房间 -->
          <div v-if="activeTab === 'waiting'" class="flex-1 overflow-y-auto pr-1">
            <RoomList
              :rooms="lobby.rooms"
              :loading="lobby.loading"
              @join="onJoin"
              @join-with-password="onJoinWithPassword"
            />
          </div>

          <!-- Tab 内容：进行中对局（可观战，T14，F-E-10） -->
          <div v-else class="flex-1 overflow-y-auto pr-1">
            <div
              v-if="lobby.spectateGames.length === 0"
              class="text-text-secondary text-xs text-center py-6"
            >
              {{ $t('lobby.noActiveGame') }}
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="g in lobby.spectateGames"
                :key="g.gameId"
                class="flex items-center gap-3 p-3 rounded-xl bg-glass border border-glass-border hover:border-purple-500/30 transition-colors"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 text-sm">
                    <span class="font-medium truncate">{{
                      g.blackName ?? $t('common.blackSide')
                    }}</span>
                    <span class="text-text-secondary text-xs">{{ g.blackCount }}</span>
                    <span class="text-text-secondary text-xs">vs</span>
                    <span class="text-text-secondary text-xs">{{ g.whiteCount }}</span>
                    <span class="font-medium truncate">{{
                      g.whiteName ?? $t('common.whiteSide')
                    }}</span>
                  </div>
                  <div class="flex items-center gap-3 text-[10px] text-text-secondary mt-1">
                    <span>{{ $t('lobby.moveNumber', { n: g.moveCount }) }}</span>
                    <span class="flex items-center gap-1"
                      ><Eye class="w-3 h-3" />{{ g.spectatorCount }}</span
                    >
                  </div>
                </div>
                <button
                  class="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-all flex items-center gap-1"
                  @click="router.push(`/spectate/${g.gameId}`)"
                >
                  <Eye class="w-3 h-3" />{{ $t('lobby.spectate') }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 右：公共聊天（ChatPanel 自带玻璃卡片，aside 仅作高度容器，避免双重边框） -->
        <aside class="lg:col-span-4 flex flex-col max-h-[45vh] lg:max-h-none lg:overflow-hidden">
          <ChatPanel :room-id="null" fill-height />
        </aside>
      </div>
    </main>

    <!-- 底部状态栏 -->
    <div
      class="fixed bottom-0 left-0 right-0 h-8 bg-[rgba(15,17,23,0.9)] border-t border-glass-border flex items-center px-8 text-[10px] text-text-secondary"
    >
      <div class="flex items-center gap-4 max-w-[1440px] mx-auto w-full">
        <span class="flex items-center gap-1"
          ><span class="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {{ $t('lobby.serverOk') }}</span
        >
        <span>{{ $t('lobby.onlineCount', { count: lobby.onlineUsers.length }) }}</span>
        <span class="ml-auto">{{ now }}</span>
      </div>
    </div>

    <CreateRoomDialog v-model:open="showCreate" @create="onCreate" />
    <JoinPasswordDialog
      v-model:open="showJoinPwd"
      :room-name="pendingJoinRoom?.name ?? ''"
      @submit="onJoinPwdSubmit"
    />
  </div>
</template>
