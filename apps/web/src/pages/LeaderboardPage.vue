<script setup lang="ts">
/**
 * 排行榜页（T16，F-E-08 + T22，F-E-18）：按 ELO / 经典积分排序，对照设计稿 10-leaderboard。
 * 段位用共享 tierOfElo（前后端共用，解决 D6 段位占位）；顶部赛季段位卡 + 徽章墙。
 */
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Trophy, Star, Crown, Award, Flame, Target, BookOpen } from '@lucide/vue'
import { tierOfElo, type TierName, type BadgeType } from '@othello-platform/shared'
import { useLeaderboardStore } from '@/stores/leaderboard-store'
import { useAuthStore } from '@/stores/auth-store'
import { useSeasonStore } from '@/stores/season-store'
import PageNavBar from '@/components/PageNavBar.vue'

const router = useRouter()
const lb = useLeaderboardStore()
const auth = useAuthStore()
const season = useSeasonStore()
const { t } = useI18n()

const { entries, by, loading } = storeToRefs(lb)

type Tab = 'elo' | 'classic' | 'winrate'
const tab = ref<Tab>('elo')

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

function badgeIcon(bt: BadgeType) {
  return BADGE_META[bt]?.icon ?? Award
}

function badgeCls(bt: BadgeType) {
  return BADGE_META[bt]?.cls ?? 'text-text-secondary'
}

const myTier = computed<{ name: string; cls: string }>(() => {
  const elo = season.myRating?.peakElo ?? 1500
  return tierOf(elo)
})

function switchTab(t: Tab) {
  tab.value = t
  if (t === 'elo') void lb.refresh('elo')
  else if (t === 'classic') void lb.refresh('classic')
}

function rankCls(rank: number): string {
  if (rank === 1) return 'text-gold'
  if (rank === 2) return 'text-gray-300'
  if (rank === 3) return 'text-amber-600'
  return 'text-text-secondary'
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

const top3 = computed(() => entries.value.slice(0, 3))
const rest = computed(() => entries.value.slice(3))

/** 领奖台（确定类型，避免模板索引访问的 undefined） */
const podium = computed(() => {
  const [first, second, third] = top3.value
  if (!first || !second || !third) return null
  return { first, second, third }
})

onMounted(() => {
  void lb.refresh('elo')
  void season.loadMySeason()
})
</script>

<template>
  <div class="min-h-screen bg-primary text-text-primary">
    <!-- 顶栏（设计稿 09/10/12/13 统一） -->
    <PageNavBar />

    <main class="pt-20 max-w-[1440px] mx-auto px-4 sm:px-8 pb-12">
      <!-- 赛季段位卡 + 徽章墙（T22，F-E-18） -->
      <div v-if="season.currentSeason" class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <!-- 当前段位 -->
        <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5">
          <div class="flex items-center justify-between mb-3">
            <span class="text-[10px] uppercase tracking-wider text-text-secondary">{{
              $t('season.current')
            }}</span>
            <span class="text-[10px] text-gold">{{ season.currentSeason.name }}</span>
          </div>
          <div class="flex items-center gap-4">
            <div
              class="w-14 h-14 rounded-xl border-2 flex items-center justify-center"
              :class="myTier.cls"
            >
              <Trophy class="w-7 h-7" />
            </div>
            <div>
              <p class="text-2xl font-black" :class="myTier.cls.split(' ')[1]">
                {{ myTier.name }}{{ $t('leaderboard.tierSuffix') }}
              </p>
              <p class="text-xs text-text-secondary mt-0.5">
                {{ $t('season.peakElo') }}:
                <span class="font-mono text-gold">{{ season.myRating?.peakElo ?? 1500 }}</span>
              </p>
            </div>
          </div>
        </div>

        <!-- 赛季信息 -->
        <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5">
          <div class="flex items-center justify-between mb-3">
            <span class="text-[10px] uppercase tracking-wider text-text-secondary">{{
              $t('season.title')
            }}</span>
            <span
              class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              >{{ $t('season.active') }}</span
            >
          </div>
          <p class="text-sm font-bold mb-1">{{ season.currentSeason.name }}</p>
          <p class="text-xs text-text-secondary">
            {{ season.currentSeason.startDate.slice(0, 10) }} →
            {{ season.currentSeason.endDate.slice(0, 10) }}
          </p>
          <p
            v-if="season.myRating?.finalElo !== null && season.myRating?.finalElo !== undefined"
            class="text-xs text-text-secondary mt-2"
          >
            {{ $t('season.finalElo') }}:
            <span class="font-mono">{{ season.myRating.finalElo }}</span>
          </p>
        </div>

        <!-- 徽章墙 -->
        <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5">
          <div class="flex items-center justify-between mb-3">
            <span class="text-[10px] uppercase tracking-wider text-text-secondary">{{
              $t('badge.title')
            }}</span>
            <span class="text-[10px] text-text-secondary">{{ season.badges.length }}/7</span>
          </div>
          <div
            v-if="season.badges.length === 0"
            class="text-text-secondary text-xs text-center py-4"
          >
            {{ $t('badge.empty') }}
          </div>
          <div v-else class="grid grid-cols-4 gap-2">
            <div
              v-for="b in season.badges"
              :key="b.id"
              class="aspect-square rounded-lg bg-[rgba(255,255,255,0.02)] border border-glass-border flex flex-col items-center justify-center gap-1"
              :title="t(`badge.${b.badgeType}`)"
            >
              <component
                :is="badgeIcon(b.badgeType)"
                class="w-5 h-5"
                :class="badgeCls(b.badgeType)"
              />
              <span class="text-[8px] text-text-secondary text-center leading-tight">{{
                t(`badge.${b.badgeType}`)
              }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 标题 -->
      <div class="flex items-end justify-between mb-8">
        <div>
          <h1 class="text-3xl font-bold flex items-center gap-3">
            <Trophy class="w-7 h-7 text-gold" />{{ $t('leaderboard.title') }}
          </h1>
          <p class="text-text-secondary text-sm mt-2">{{ $t('leaderboard.subtitle') }}</p>
        </div>
      </div>

      <!-- TOP 3 领奖台 -->
      <div v-if="podium" class="grid grid-cols-3 gap-5 mb-8">
        <!-- 第 2 名 -->
        <div
          class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-6 text-center mt-6"
        >
          <div class="relative inline-block mb-3">
            <div
              class="w-16 h-16 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center mx-auto"
            >
              <span class="text-xl font-bold text-gray-700">{{
                initial(podium.second.username)
              }}</span>
            </div>
            <div
              class="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gray-300 border-2 border-[#0f1117] flex items-center justify-center"
            >
              <span class="text-[11px] font-black text-gray-700">2</span>
            </div>
          </div>
          <p class="font-bold text-sm">{{ podium.second.username }}</p>
          <p class="text-2xl font-black text-gray-300 mt-1 font-mono">
            {{ by === 'elo' ? podium.second.elo : podium.second.classicScore }}
          </p>
          <span
            class="inline-block mt-2 text-[9px] px-2 py-0.5 rounded-full border"
            :class="tierOf(podium.second.elo).cls"
            >{{ tierOf(podium.second.elo).name }}{{ $t('leaderboard.tierSuffix') }}</span
          >
        </div>
        <!-- 第 1 名 -->
        <div
          class="backdrop-blur-xl bg-gold/5 border border-gold/40 rounded-2xl p-6 text-center relative overflow-hidden animate-[float_5s_ease-in-out_infinite]"
        >
          <div class="relative">
            <div class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gold mb-2">
              <Crown class="w-4 h-4 text-[#0f1117]" />
            </div>
            <div class="relative inline-block mb-3">
              <div
                class="w-20 h-20 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center mx-auto border-4 border-gold/30"
              >
                <span class="text-2xl font-bold text-[#0f1117]">{{
                  initial(podium.first.username)
                }}</span>
              </div>
              <div
                class="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gold border-2 border-[#0f1117] flex items-center justify-center"
              >
                <span class="text-xs font-black text-[#0f1117]">1</span>
              </div>
            </div>
            <p class="font-bold text-base text-gold">{{ podium.first.username }}</p>
            <p class="text-3xl font-black text-gold mt-1 font-mono">
              {{ by === 'elo' ? podium.first.elo : podium.first.classicScore }}
            </p>
            <span
              class="inline-block mt-2 text-[10px] px-2.5 py-1 rounded-full border"
              :class="tierOf(podium.first.elo).cls"
              >{{ tierOf(podium.first.elo).name }}{{ $t('leaderboard.tierSuffix') }}</span
            >
          </div>
        </div>
        <!-- 第 3 名 -->
        <div
          class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-6 text-center mt-6"
        >
          <div class="relative inline-block mb-3">
            <div
              class="w-16 h-16 rounded-full bg-gradient-to-br from-amber-700 to-amber-800 flex items-center justify-center mx-auto"
            >
              <span class="text-xl font-bold text-amber-200">{{
                initial(podium.third.username)
              }}</span>
            </div>
            <div
              class="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-amber-700 border-2 border-[#0f1117] flex items-center justify-center"
            >
              <span class="text-[11px] font-black text-amber-200">3</span>
            </div>
          </div>
          <p class="font-bold text-sm">{{ podium.third.username }}</p>
          <p class="text-2xl font-black text-amber-600 mt-1 font-mono">
            {{ by === 'elo' ? podium.third.elo : podium.third.classicScore }}
          </p>
          <span
            class="inline-block mt-2 text-[9px] px-2 py-0.5 rounded-full border"
            :class="tierOf(podium.third.elo).cls"
            >{{ tierOf(podium.third.elo).name }}{{ $t('leaderboard.tierSuffix') }}</span
          >
        </div>
      </div>

      <!-- 筛选栏 -->
      <div class="flex items-center justify-between mb-5">
        <div
          class="flex items-center gap-1 bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-xl p-1"
        >
          <button
            class="px-4 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            :class="
              tab === 'elo'
                ? 'bg-gold/10 text-gold border border-gold/20'
                : 'text-text-secondary hover:text-text-primary'
            "
            @click="switchTab('elo')"
          >
            <Trophy class="w-3.5 h-3.5" />{{ $t('leaderboard.tabElo') }}
          </button>
          <button
            class="px-4 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            :class="
              tab === 'classic'
                ? 'bg-gold/10 text-gold border border-gold/20'
                : 'text-text-secondary hover:text-text-primary'
            "
            @click="switchTab('classic')"
          >
            <Star class="w-3.5 h-3.5" />{{ $t('leaderboard.tabClassic') }}
          </button>
        </div>
      </div>

      <!-- 表格 -->
      <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl overflow-hidden">
        <div
          class="grid grid-cols-[60px_1fr_120px_120px_120px_100px] gap-4 px-6 py-3 border-b border-glass-border text-[10px] uppercase tracking-wider text-text-secondary"
        >
          <span>{{ $t('leaderboard.colRank') }}</span
          ><span>{{ $t('leaderboard.colPlayer') }}</span
          ><span>{{ by === 'elo' ? $t('leaderboard.colElo') : $t('leaderboard.colClassic') }}</span
          ><span>{{ $t('leaderboard.colWinrate') }}</span
          ><span>{{ $t('leaderboard.colGames') }}</span
          ><span>{{ $t('leaderboard.colTier') }}</span>
        </div>
        <div v-if="loading" class="px-6 py-8 text-center text-text-secondary text-sm">
          {{ $t('common.loading') }}
        </div>
        <div
          v-else-if="entries.length === 0"
          class="px-6 py-8 text-center text-text-secondary text-sm"
        >
          {{ $t('leaderboard.noData') }}
        </div>
        <div v-else class="divide-y divide-glass-border">
          <div
            v-for="e in entries"
            :key="e.id"
            class="grid grid-cols-[60px_1fr_120px_120px_120px_100px] gap-4 px-6 py-3.5 items-center hover:bg-[rgba(255,255,255,0.02)] transition-colors cursor-pointer"
            :class="e.id === auth.userId ? 'bg-gold/5 border-l-2 border-gold' : ''"
            :title="$t('profile.viewProfile')"
            @click="router.push(`/profile/${e.id}`)"
          >
            <span class="text-sm font-bold font-mono" :class="rankCls(e.rank)">{{ e.rank }}</span>
            <div class="flex items-center gap-3">
              <div
                class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/30 to-blue-600/20 flex items-center justify-center"
              >
                <span class="text-[10px] font-bold text-blue-300">{{ initial(e.username) }}</span>
              </div>
              <p class="text-sm font-medium">
                {{ e.username
                }}<span v-if="e.id === auth.userId" class="ml-1 text-[9px] text-gold">{{
                  $t('common.youSuffix')
                }}</span>
              </p>
            </div>
            <span class="text-sm font-bold font-mono" :class="e.rank <= 3 ? rankCls(e.rank) : ''">{{
              by === 'elo' ? e.elo : e.classicScore
            }}</span>
            <span class="text-xs text-emerald-400 font-mono">{{ e.winRate }}%</span>
            <span class="text-xs text-text-secondary font-mono">{{ e.gamesPlayed }}</span>
            <span
              class="text-[9px] px-2 py-0.5 rounded-full border inline-block w-fit"
              :class="tierOf(e.elo).cls"
              >{{ tierOf(e.elo).name }}</span
            >
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
