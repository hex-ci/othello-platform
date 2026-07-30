<script setup lang="ts">
/**
 * 资料页（F-C-10~13，对照设计稿 09-profile）。
 * 左栏：资料卡（头像/ELO/段位/简介占位/挑战+消息按钮仅对手/三宫格）
 * 右栏：三 tab（战绩统计 + ELO 走势 + AI 统计 + 活跃度 / 对局历史 / 成就徽章）
 */
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import {
  Trophy,
  Star,
  Crown,
  Award,
  Flame,
  Target,
  BookOpen,
  Swords,
  MessageCircle,
  Pencil,
  BarChart2,
  Lock,
  XCircle,
  MinusCircle,
  Shield,
  UserPlus,
  Check,
  Ban,
} from '@lucide/vue'
import { tierOfElo, type TierName, type BadgeType } from '@othello-platform/shared'
import { useProfileStore } from '@/stores/profile-store'
import { useAuthStore } from '@/stores/auth-store'
import { useFriendStore } from '@/stores/friend-store'
import { useChallenge } from '@/composables/useChallenge'
import { getWsClient } from '@/api/ws-client'
import PageNavBar from '@/components/PageNavBar.vue'

const route = useRoute()
const router = useRouter()
const profile = useProfileStore()
const auth = useAuthStore()
const friendStore = useFriendStore()
const { t } = useI18n()

const { user, eloHistory, gameHistory, aiStats, activity, badges, relation, loading, error } =
  storeToRefs(profile)

// ─── 好友挑战（T17，F-E-16，与 FriendsPage 共用 useChallenge）───
// bindChallenge 在 App.vue 全局绑定，页面只读取 challengingId + 调用 action
const { challengingId, sendChallenge } = useChallenge()

type Tab = 'stats' | 'history' | 'badges'
const tab = ref<Tab>('history')

const TIER_CLS: Record<TierName, string> = {
  king: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
  master: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  diamond: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  platinum: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  gold: 'bg-gold/15 text-gold border-gold/25',
  silver: 'bg-gray-500/15 text-gray-400 border-gray-500/25',
}

function tierOf(elo: number): { name: string; cls: string } {
  const tier = tierOfElo(elo)
  return { name: t(`tier.${tier}`), cls: TIER_CLS[tier] }
}

const BADGE_META: Record<BadgeType, { icon: typeof Award; cls: string }> = {
  first_win: { icon: Trophy, cls: 'text-gold' },
  streak_5: { icon: Flame, cls: 'text-orange-400' },
  streak_10: { icon: Flame, cls: 'text-rose-400' },
  season_king: { icon: Crown, cls: 'text-purple-400' },
  perfect_review: { icon: Star, cls: 'text-blue-400' },
  puzzle_master: { icon: BookOpen, cls: 'text-emerald-400' },
  weekly_champion: { icon: Target, cls: 'text-amber-400' },
}

const ALL_BADGE_TYPES: BadgeType[] = [
  'first_win',
  'streak_5',
  'streak_10',
  'season_king',
  'perfect_review',
  'puzzle_master',
  'weekly_champion',
]

function badgeIcon(bt: BadgeType) {
  return BADGE_META[bt]?.icon ?? Award
}
function badgeCls(bt: BadgeType) {
  return BADGE_META[bt]?.cls ?? 'text-text-secondary'
}
function hasBadge(bt: BadgeType): boolean {
  return badges.value.some((b) => b.badgeType === bt)
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

const profileUserId = computed<number | null>(() => {
  const id = Number(route.params.id)
  return Number.isInteger(id) && id > 0 ? id : null
})

const isMe = computed(() => {
  if (!user.value || !auth.userId) return false
  return Number(user.value.id) === Number(auth.userId)
})

const winRate = computed(() => {
  if (!user.value) return 0
  const total = user.value.wins + user.value.losses + user.value.draws
  return total > 0 ? Math.round((user.value.wins / total) * 100) : 0
})

/** ELO 走势柱状高度（百分比，按 min/max 归一化） */
function eloBarHeight(pt: { elo: number }): string {
  if (eloHistory.value.length === 0) return '20%'
  const elos = eloHistory.value.map((p) => p.elo)
  const min = Math.min(...elos)
  const max = Math.max(...elos)
  if (max === min) return '50%'
  const pct = ((pt.elo - min) / (max - min)) * 70 + 20
  return `${Math.round(pct)}%`
}

function eloBarColor(delta: number): string {
  if (delta > 0) return 'bg-emerald-500/40'
  if (delta < 0) return 'bg-red-500/40'
  return 'bg-gray-500/40'
}

/** 对局历史结果标记 */
function matchDot(result: string | null, myColor: string): string {
  if (result === 'DRAW') return 'bg-gray-400'
  if (result === null) return 'bg-gray-400'
  const won =
    (myColor === 'BLACK' && result === 'BLACK') || (myColor === 'WHITE' && result === 'WHITE')
  return won ? 'bg-emerald-400' : 'bg-red-400'
}

/** 对局比分（人机局无走子比分，显示 moveCount 手） */
function matchScore(g: { moveCount: number }): string {
  return `${g.moveCount} 手`
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0)
    return `今天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  if (diffDays === 1)
    return `昨天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  if (diffDays < 7) return `${diffDays}天前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 7 天活跃度热力图（补齐缺失日期） */
const activityMap = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {}
  for (const a of activity.value) m[a.date] = a.games
  return m
})

function last7Days(): { date: string; label: string }[] {
  const days: { date: string; label: string }[] = []
  const labels = ['一', '二', '三', '四', '五', '六', '日']
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
    const dayIdx = (d.getDay() + 6) % 7 // 周一=0
    days.push({ date: dateStr, label: labels[dayIdx] ?? '-' })
  }
  return days
}

function activityLevel(games: number): string {
  if (games === 0) return 'bg-[rgba(255,255,255,0.03)]'
  if (games <= 1) return 'bg-board-green/30'
  if (games <= 3) return 'bg-board-green/50'
  if (games <= 5) return 'bg-board-green/70'
  return 'bg-board-green'
}

async function loadProfile(): Promise<void> {
  if (profileUserId.value === null) return
  await profile.loadProfile(profileUserId.value)
}

function goReplay(gameId: string): void {
  void router.push(`/replay/${gameId}`)
}

/** 加好友（relation=none 时）：发请求后刷新关系状态 */
async function addFriend(): Promise<void> {
  if (!user.value) return
  const targetId = Number(user.value.id)
  try {
    await friendStore.sendRequest(targetId)
    toast.success(t('profile.addFriendOk', { name: user.value.username }))
    await profile.refreshRelation(targetId)
  } catch {
    toast.error(t('profile.addFriendFail'))
  }
}

/** 接受好友请求（relation=pending-in 时）：接受后刷新关系状态 */
async function acceptFriend(): Promise<void> {
  if (!user.value) return
  const targetId = Number(user.value.id)
  try {
    await friendStore.accept(targetId)
    await profile.refreshRelation(targetId)
  } catch {
    toast.error(t('profile.addFriendFail'))
  }
}

/** 发起挑战（relation=accepted 时）：走 WS，服务端校验好友+在线 */
function challengeUser(): void {
  if (!user.value) return
  sendChallenge(Number(user.value.id))
}

watch(
  () => route.params.id,
  () => {
    void loadProfile()
  },
)

onMounted(() => {
  // 确保 WS 连接（reload/直接进 profile 页时未建立，challenge 需 WS 收发）
  getWsClient().connect()
  void loadProfile()
})
</script>

<template>
  <div class="min-h-screen bg-primary text-text-primary">
    <!-- 顶栏（设计稿 09/10/12/13 统一） -->
    <PageNavBar />

    <main class="pt-20 max-w-[1440px] mx-auto px-4 sm:px-8 pb-12">
      <!-- 加载态 -->
      <div v-if="loading" class="text-center text-text-secondary text-sm py-20">
        {{ $t('common.loading') }}
      </div>
      <!-- 错误态 -->
      <div v-else-if="error || !user" class="text-center text-text-secondary text-sm py-20">
        {{ error || $t('profile.notFound') }}
        <button
          class="block mx-auto mt-4 px-4 py-2 rounded-lg bg-gold/10 text-gold border border-gold/20 text-xs"
          @click="router.push('/lobby')"
        >
          {{ $t('common.backToLobby') }}
        </button>
      </div>

      <div v-else class="grid grid-cols-12 gap-8">
        <!-- 左栏：资料卡 -->
        <div class="col-span-12 lg:col-span-4">
          <div
            class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
          >
            <!-- 头像 -->
            <div class="flex flex-col items-center mb-6">
              <div class="relative">
                <div
                  class="w-24 h-24 rounded-full bg-gradient-to-br from-board-green via-[#1a8b4c] to-gold/40 flex items-center justify-center shadow-[0_4px_24px_rgba(26,107,60,0.3)]"
                >
                  <span class="text-3xl font-bold">{{ initial(user.username) }}</span>
                </div>
                <button
                  v-if="isMe"
                  disabled
                  :title="$t('profile.editAvatarComingSoon')"
                  class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#1e2028] border border-glass-border flex items-center justify-center opacity-50 cursor-not-allowed"
                >
                  <Pencil class="w-3 h-3 text-text-secondary" />
                </button>
              </div>
              <h2 class="text-xl font-bold mt-4">{{ user.username }}</h2>
              <span
                v-if="isMe"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mt-2"
              >
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span class="text-[10px] text-emerald-400">{{ $t('profile.onlineTag') }}</span>
              </span>
            </div>

            <!-- 评级展示 -->
            <div class="space-y-3 mb-6">
              <div
                class="backdrop-blur-sm bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-xl p-4 text-center"
              >
                <p class="text-[10px] uppercase tracking-wider text-text-secondary mb-1">
                  {{ $t('profile.eloRating') }}
                </p>
                <p class="text-3xl font-bold text-gold font-mono">{{ user.elo }}</p>
              </div>
              <div
                class="backdrop-blur-sm bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-xl p-3 text-center"
              >
                <p class="text-[10px] uppercase tracking-wider text-text-secondary mb-1">
                  {{ $t('profile.classicScore') }}
                </p>
                <p class="text-lg font-bold text-text-primary font-mono">{{ user.classicScore }}</p>
              </div>
            </div>

            <!-- 段位徽章 -->
            <div class="flex items-center justify-center mb-6">
              <div
                class="inline-flex items-center gap-2 px-4 py-2 rounded-full border"
                :class="tierOf(user.elo).cls"
              >
                <Shield class="w-4 h-4" />
                <span class="text-sm font-semibold"
                >{{ tierOf(user.elo).name }}{{ $t('leaderboard.tierSuffix') }}</span
                >
              </div>
            </div>

            <!-- 个人简介（v1 占位，DB 无 bio 列） -->
            <div class="mb-6">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] uppercase tracking-wider text-text-secondary">{{
                  $t('profile.bio')
                }}</span>
                <button
                  v-if="isMe"
                  disabled
                  :title="$t('profile.editBioComingSoon')"
                  class="text-text-secondary opacity-50 cursor-not-allowed"
                >
                  <Pencil class="w-3 h-3" />
                </button>
              </div>
              <p
                class="text-sm text-text-secondary leading-relaxed bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-xl p-3"
              >
                {{ isMe ? $t('profile.bioPlaceholder') : $t('profile.bioEmpty') }}
              </p>
            </div>

            <!-- 操作按钮（仅对手资料）：按关系状态动态切换（T17/F-E-16） -->
            <div v-if="!isMe" class="space-y-2 mb-6">
              <!-- 无关系 → 加好友 -->
              <button
                v-if="relation === 'none'"
                class="w-full py-3 rounded-xl font-semibold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all duration-300 hover:-translate-y-0.5 text-sm flex items-center justify-center gap-2"
                @click="addFriend"
              >
                <UserPlus class="w-4 h-4" />{{ $t('profile.addFriend') }}
              </button>
              <!-- 我发出的请求待对方接受 → 禁用 -->
              <button
                v-else-if="relation === 'pending-out'"
                disabled
                class="w-full py-3 rounded-xl font-semibold text-text-secondary border border-glass-border opacity-60 cursor-not-allowed text-sm flex items-center justify-center gap-2"
              >
                <UserPlus class="w-4 h-4" />{{ $t('profile.pendingOut') }}
              </button>
              <!-- 对方发给我待我接受 -->
              <button
                v-else-if="relation === 'pending-in'"
                class="w-full py-3 rounded-xl font-semibold text-[#0f1117] bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_4px_20px_rgba(16,185,129,0.3)] hover:shadow-[0_6px_30px_rgba(16,185,129,0.5)] transition-all duration-300 hover:-translate-y-0.5 text-sm flex items-center justify-center gap-2"
                @click="acceptFriend"
              >
                <Check class="w-4 h-4" />{{ $t('profile.acceptRequest') }}
              </button>
              <!-- 已是好友 → 发起挑战（等待应答时禁用） -->
              <button
                v-else-if="relation === 'accepted'"
                :disabled="challengingId === Number(user.id)"
                class="w-full py-3 rounded-xl font-semibold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all duration-300 hover:-translate-y-0.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                @click="challengeUser"
              >
                <Swords class="w-4 h-4" />{{
                  challengingId === Number(user.id)
                    ? $t('profile.challengeWaiting')
                    : $t('profile.challenge')
                }}
              </button>
              <!-- 我屏蔽了对方 → 禁用 -->
              <button
                v-else-if="relation === 'blocked'"
                disabled
                class="w-full py-3 rounded-xl font-semibold text-text-secondary border border-glass-border opacity-60 cursor-not-allowed text-sm flex items-center justify-center gap-2"
              >
                <Ban class="w-4 h-4" />{{ $t('profile.blockedByMe') }}
              </button>
              <!-- 次按钮：发消息（未实现，保留设计稿元素，禁用占位） -->
              <button
                disabled
                :title="$t('common.comingSoon')"
                class="w-full py-2.5 rounded-xl font-medium text-text-secondary border border-glass-border opacity-50 cursor-not-allowed text-sm flex items-center justify-center gap-2"
              >
                <MessageCircle class="w-4 h-4" />{{ $t('profile.message') }}
              </button>
            </div>

            <!-- 战绩三宫格 -->
            <div class="grid grid-cols-3 gap-2 pt-4 border-t border-glass-border">
              <div class="text-center">
                <p class="text-lg font-bold text-text-primary font-mono">{{ user.gamesPlayed }}</p>
                <p class="text-[10px] text-text-secondary">{{ $t('profile.games') }}</p>
              </div>
              <div class="text-center">
                <p class="text-lg font-bold text-emerald-400 font-mono">{{ winRate }}%</p>
                <p class="text-[10px] text-text-secondary">{{ $t('profile.winrate') }}</p>
              </div>
              <div class="text-center">
                <p class="text-lg font-bold text-gold font-mono">{{ user.wins }}</p>
                <p class="text-[10px] text-text-secondary">{{ $t('profile.wins') }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 右栏：三 tab -->
        <div class="col-span-12 lg:col-span-8">
          <!-- Tab Header -->
          <div class="flex items-center gap-1 mb-6 border-b border-glass-border pb-3">
            <button
              class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              :class="
                tab === 'stats'
                  ? 'text-gold border-b-2 border-gold bg-gold/5'
                  : 'text-text-secondary hover:text-text-primary'
              "
              @click="tab = 'stats'"
            >
              {{ $t('profile.tabStats') }}
            </button>
            <button
              class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              :class="
                tab === 'history'
                  ? 'text-gold border-b-2 border-gold bg-gold/5'
                  : 'text-text-secondary hover:text-text-primary'
              "
              @click="tab = 'history'"
            >
              {{ $t('profile.tabHistory') }}
            </button>
            <button
              class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              :class="
                tab === 'badges'
                  ? 'text-gold border-b-2 border-gold bg-gold/5'
                  : 'text-text-secondary hover:text-text-primary'
              "
              @click="tab = 'badges'"
            >
              {{ $t('profile.tabBadges') }}
            </button>
          </div>

          <!-- Tab 1: 战绩统计 -->
          <div v-if="tab === 'stats'">
            <!-- 战绩概览标题（设计稿 09-profile） -->
            <h3
              class="text-xs uppercase tracking-wider text-text-secondary mb-4 flex items-center gap-2"
            >
              <BarChart2 class="w-3.5 h-3.5 text-gold" />{{ $t('profile.statsOverview') }}
            </h3>
            <!-- 胜负平三卡 -->
            <div class="grid grid-cols-3 gap-4 mb-6">
              <div
                class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-5 text-center"
              >
                <div
                  class="w-10 h-10 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-3"
                >
                  <Trophy class="w-5 h-5 text-emerald-400" />
                </div>
                <p class="text-2xl font-bold text-emerald-400 font-mono">{{ user.wins }}</p>
                <p class="text-xs text-text-secondary mt-1">{{ $t('profile.wins') }}</p>
              </div>
              <div
                class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-5 text-center"
              >
                <div
                  class="w-10 h-10 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-3"
                >
                  <XCircle class="w-5 h-5 text-red-400" />
                </div>
                <p class="text-2xl font-bold text-red-400 font-mono">{{ user.losses }}</p>
                <p class="text-xs text-text-secondary mt-1">{{ $t('profile.losses') }}</p>
              </div>
              <div
                class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-5 text-center"
              >
                <div
                  class="w-10 h-10 mx-auto rounded-full bg-gray-500/10 border border-gray-500/20 flex items-center justify-center mb-3"
                >
                  <MinusCircle class="w-5 h-5 text-gray-400" />
                </div>
                <p class="text-2xl font-bold text-gray-400 font-mono">{{ user.draws }}</p>
                <p class="text-xs text-text-secondary mt-1">{{ $t('profile.draws') }}</p>
              </div>
            </div>

            <!-- ELO 走势 -->
            <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-5 mb-6">
              <div class="flex items-center justify-between mb-3">
                <span
                  class="text-xs uppercase tracking-wider text-text-secondary flex items-center gap-2"
                >
                  <BarChart2 class="w-3.5 h-3.5 text-gold" />{{ $t('profile.eloTrend') }}
                </span>
                <span class="text-sm font-bold text-gold font-mono">{{ user.elo }}</span>
              </div>
              <div
                v-if="eloHistory.length === 0"
                class="text-text-secondary text-xs text-center py-4"
              >
                {{ $t('profile.noEloHistory') }}
              </div>
              <div v-else class="relative h-16 flex items-end gap-[3px]">
                <div
                  v-for="(pt, idx) in [...eloHistory].reverse()"
                  :key="idx"
                  class="flex-1 rounded-t-sm"
                  :class="eloBarColor(pt.delta)"
                  :style="{ height: eloBarHeight(pt) }"
                ></div>
              </div>
              <div v-if="eloHistory.length > 0" class="flex justify-between mt-2">
                <span class="text-[9px] text-text-secondary">{{
                  eloHistory[eloHistory.length - 1]?.elo
                }}</span>
                <span class="text-[9px] text-gold">{{ user.elo }}</span>
              </div>
            </div>

            <!-- AI 对战统计 -->
            <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-5 mb-6">
              <span class="text-xs uppercase tracking-wider text-text-secondary mb-3 block">{{
                $t('profile.aiStats')
              }}</span>
              <div v-if="aiStats.length === 0" class="text-text-secondary text-xs text-center py-4">
                {{ $t('profile.noAiStats') }}
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="s in aiStats"
                  :key="s.aiLevel"
                  class="flex items-center justify-between py-2 border-b border-glass-border last:border-0"
                >
                  <span class="text-sm text-text-primary">AI L{{ s.aiLevel }}</span>
                  <div class="flex items-center gap-4">
                    <span class="text-xs text-text-secondary font-mono"
                    >{{ s.games }} {{ $t('profile.gamesUnit') }}</span
                    >
                    <span
                      class="text-xs font-medium font-mono"
                      :class="
                        s.winRate >= 50
                          ? 'text-emerald-400'
                          : s.winRate >= 25
                            ? 'text-[#f1c40f]'
                            : 'text-red-400'
                      "
                    >{{ s.winRate }}%</span
                    >
                  </div>
                </div>
              </div>
            </div>

            <!-- 最近 7 天活跃度 -->
            <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-5">
              <span class="text-xs uppercase tracking-wider text-text-secondary mb-3 block">{{
                $t('profile.activity')
              }}</span>
              <div class="flex items-center gap-2">
                <div
                  v-for="d in last7Days()"
                  :key="d.date"
                  class="flex-1 flex flex-col items-center gap-1"
                >
                  <div
                    class="w-full h-8 rounded-md"
                    :class="activityLevel(activityMap[d.date] || 0)"
                  ></div>
                  <span class="text-[9px] text-text-secondary">{{ d.label }}</span>
                </div>
              </div>
              <div class="flex items-center justify-end gap-2 mt-2">
                <span class="text-[9px] text-text-secondary">{{ $t('profile.less') }}</span>
                <div class="w-3 h-3 rounded-sm bg-[rgba(255,255,255,0.03)]"></div>
                <div class="w-3 h-3 rounded-sm bg-board-green/40"></div>
                <div class="w-3 h-3 rounded-sm bg-board-green/70"></div>
                <div class="w-3 h-3 rounded-sm bg-board-green"></div>
                <span class="text-[9px] text-text-secondary">{{ $t('profile.more') }}</span>
              </div>
            </div>
          </div>

          <!-- Tab 2: 对局历史 -->
          <div v-if="tab === 'history'">
            <div
              v-if="gameHistory.length === 0"
              class="text-text-secondary text-sm text-center py-12"
            >
              {{ $t('profile.noHistory') }}
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="g in gameHistory"
                :key="g.gameId"
                class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-4 flex items-center justify-between hover:border-glass-border/80 transition-colors"
              >
                <div class="flex items-center gap-4">
                  <span class="w-2.5 h-2.5 rounded-full" :class="matchDot(g.result, g.myColor)"></span>
                  <div>
                    <p class="text-sm font-medium text-text-primary">
                      vs
                      <span
                        :class="g.mode === 'human_vs_ai' ? 'text-text-secondary' : 'text-gold'"
                      >{{ g.opponentName }}</span
                      >
                    </p>
                    <p class="text-[11px] text-text-secondary">{{ formatDate(g.endedAt) }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-6">
                  <span class="text-sm font-bold text-text-primary font-mono">{{
                    matchScore(g)
                  }}</span>
                  <span class="text-[10px] text-text-secondary">{{
                    g.mode === 'human_vs_ai' ? $t('profile.aiMode') : $t('profile.pvpMode')
                  }}</span>
                  <button
                    class="px-3 py-1.5 rounded-lg text-[11px] font-medium text-text-secondary border border-glass-border hover:border-gold/30 hover:text-gold transition-colors"
                    @click="goReplay(g.gameId)"
                  >
                    {{ $t('profile.replay') }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab 3: 成就徽章 -->
          <div v-if="tab === 'badges'">
            <div class="grid grid-cols-3 gap-4">
              <div
                v-for="bt in ALL_BADGE_TYPES"
                :key="bt"
                class="backdrop-blur-xl bg-glass rounded-xl p-5 text-center transition-colors"
                :class="
                  hasBadge(bt) ? 'border border-gold/30' : 'border border-glass-border opacity-50'
                "
              >
                <div
                  class="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3"
                  :class="
                    hasBadge(bt)
                      ? `bg-gold/10 border border-gold/30`
                      : 'bg-[rgba(255,255,255,0.03)] border border-glass-border'
                  "
                >
                  <component
                    :is="hasBadge(bt) ? badgeIcon(bt) : Lock"
                    class="w-6 h-6"
                    :class="hasBadge(bt) ? badgeCls(bt) : 'text-text-secondary'"
                  />
                </div>
                <p
                  class="text-sm font-semibold"
                  :class="hasBadge(bt) ? 'text-text-primary' : 'text-text-secondary'"
                >
                  {{ t(`badge.${bt}`) }}
                </p>
                <p class="text-[10px] text-text-secondary mt-1">{{ t(`badge.${bt}_desc`) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
