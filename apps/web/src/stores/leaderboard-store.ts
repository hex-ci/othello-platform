/**
 * 榜单状态（T16，F-E-08）。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LeaderboardEntryDTO } from '@othello-platform/shared'
import * as api from '@/api/rooms'

export const useLeaderboardStore = defineStore('leaderboard', () => {
  const entries = ref<LeaderboardEntryDTO[]>([])
  const by = ref<'elo' | 'classic'>('elo')
  const loading = ref(false)

  async function refresh(mode: 'elo' | 'classic' = by.value): Promise<void> {
    by.value = mode
    loading.value = true
    try {
      const res = await api.getLeaderboard(mode, 50)
      entries.value = res.entries
    }
    finally {
      loading.value = false
    }
  }

  return { entries, by, loading, refresh }
})
