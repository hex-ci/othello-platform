/**
 * 赛季状态（T22，F-E-18）。
 * 当前赛季 + 我的赛季段位 + 徽章。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SeasonDTO, UserSeasonRatingDTO, BadgeDTO, TierName } from '@othello-platform/shared'
import { tierOfElo } from '@othello-platform/shared'
import * as api from '@/api/rooms'

export const useSeasonStore = defineStore('season', () => {
  const currentSeason = ref<SeasonDTO | null>(null)
  const myRating = ref<UserSeasonRatingDTO | null>(null)
  const badges = ref<BadgeDTO[]>([])
  const loading = ref(false)

  async function loadCurrent(): Promise<void> {
    try {
      currentSeason.value = await api.getCurrentSeason()
    } catch {
      currentSeason.value = null
    }
  }

  async function loadMySeason(): Promise<void> {
    loading.value = true
    try {
      const res = await api.getMySeason()
      currentSeason.value = res.season
      myRating.value = res.rating
      badges.value = res.badges
    } catch {
      // 未登录等
    } finally {
      loading.value = false
    }
  }

  /** 当前段位（基于赛季峰值 ELO，无记录则用 1500 起步） */
  function currentTier(elo: number): TierName {
    return tierOfElo(elo)
  }

  return {
    currentSeason,
    myRating,
    badges,
    loading,
    loadCurrent,
    loadMySeason,
    currentTier,
  }
})