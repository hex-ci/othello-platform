/**
 * 资料页状态（F-C-10~13，对照设计稿 09-profile）。
 * 加载指定用户的资料、ELO 走势、对局历史、AI 统计、活跃度、徽章。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  UserDTO,
  BadgeDTO,
  EloHistoryPointDTO,
  GameHistoryDTO,
  AiStatDTO,
  ActivityDTO,
  RelationStatus,
} from '@othello-platform/shared'
import * as usersApi from '@/api/users'
import { useAuthStore } from '@/stores/auth-store'

export const useProfileStore = defineStore('profile', () => {
  const user = ref<UserDTO | null>(null)
  const eloHistory = ref<EloHistoryPointDTO[]>([])
  const gameHistory = ref<GameHistoryDTO[]>([])
  const aiStats = ref<AiStatDTO[]>([])
  const activity = ref<ActivityDTO[]>([])
  const badges = ref<BadgeDTO[]>([])
  /** 我与该用户的关系（profile 页"发起挑战/加好友"按钮用，T17/F-E-16） */
  const relation = ref<RelationStatus>('none')
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadProfile(userId: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const auth = useAuthStore()
      const isMe = Number(auth.userId) === userId
      const [u, elo, games, ai, act, bdg, fs] = await Promise.all([
        usersApi.getUser(userId),
        usersApi.getEloHistory(userId),
        usersApi.getGameHistory(userId),
        usersApi.getAiStats(userId),
        usersApi.getActivity(userId),
        usersApi.getUserBadges(userId),
        // 看自己资料时不查关系状态（服务端对 id===self 返回 400）
        isMe
          ? Promise.resolve({ status: 'none' as RelationStatus, isFriend: false })
          : usersApi.getFriendStatus(userId),
      ])
      user.value = u
      eloHistory.value = elo
      gameHistory.value = games
      aiStats.value = ai
      activity.value = act
      badges.value = bdg
      relation.value = fs.status
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : '加载资料失败'
      user.value = null
    }
    finally {
      loading.value = false
    }
  }

  /** 仅刷新关系状态（加好友/接受请求后局部更新，避免重载整个资料） */
  async function refreshRelation(userId: number): Promise<void> {
    const auth = useAuthStore()
    if (Number(auth.userId) === userId) {
      relation.value = 'none'
      return
    }
    const fs = await usersApi.getFriendStatus(userId)
    relation.value = fs.status
  }

  function reset(): void {
    user.value = null
    eloHistory.value = []
    gameHistory.value = []
    aiStats.value = []
    activity.value = []
    badges.value = []
    relation.value = 'none'
    error.value = null
  }

  return {
    user,
    eloHistory,
    gameHistory,
    aiStats,
    activity,
    badges,
    relation,
    loading,
    error,
    loadProfile,
    refreshRelation,
    reset,
  }
})
