/**
 * 大厅状态（T07/T11）：房间列表 + 在线数 + 自动匹配队列。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  RoomDTO,
  OnlineUserDTO,
  MatchFoundPayload,
  LeaderboardEntryDTO,
} from '@othello-platform/shared'
import * as api from '@/api/rooms'
import type { SpectateGameInfo } from '@/api/rooms'
import { getWsClient } from '@/api/ws-client'

export type MatchStatus = 'idle' | 'queuing' | 'found'

export const useLobbyStore = defineStore('lobby', () => {
  const rooms = ref<RoomDTO[]>([])
  const total = ref(0)
  const onlineUsers = ref<OnlineUserDTO[]>([])
  const loading = ref(false)

  // ─── 迷你 ELO 榜单（设计稿 03-lobby 中栏，真实数据前 5）───
  const topElo = ref<LeaderboardEntryDTO[]>([])

  // ─── 观战大厅（T14）───
  const spectateGames = ref<SpectateGameInfo[]>([])

  // ─── 匹配（T11）───
  const matchStatus = ref<MatchStatus>('idle')
  const matchRoomId = ref<number | null>(null)
  const matchQueueSize = ref(0)
  const matchUnsubs: (() => void)[] = []
  let matchBound = false

  async function refreshRooms(status?: string, page = 1): Promise<void> {
    loading.value = true
    try {
      const res = await api.listRooms({ status, page, limit: 20 })
      rooms.value = res.items
      total.value = res.total
    }
    finally {
      loading.value = false
    }
  }

  async function refreshOnline(): Promise<void> {
    const res = await api.getOnline()
    onlineUsers.value = res.users
  }

  async function refreshSpectateGames(): Promise<void> {
    const res = await api.listSpectateGames()
    spectateGames.value = res.games
  }

  async function refreshTopElo(): Promise<void> {
    const res = await api.getLeaderboard('elo', 5)
    topElo.value = res.entries
  }

  /** 绑定匹配相关 WS 事件（幂等） */
  function bindMatch(): void {
    if (matchBound) return
    matchBound = true
    const ws = getWsClient()
    matchUnsubs.push(
      ws.on('match_queued', (p) => {
        matchQueueSize.value = (p as { size: number }).size
      }),
    )
    matchUnsubs.push(
      ws.on('match_found', (p) => {
        const payload = p as MatchFoundPayload
        matchStatus.value = 'found'
        matchRoomId.value = payload.roomId
      }),
    )
    matchUnsubs.push(
      ws.on('match_timeout', () => {
        matchStatus.value = 'idle'
      }),
    )
  }

  function joinMatch(): void {
    bindMatch()
    matchStatus.value = 'queuing'
    getWsClient().send('match_join', {})
  }

  function leaveMatch(): void {
    matchStatus.value = 'idle'
    getWsClient().send('match_leave', {})
  }

  function resetMatch(): void {
    matchStatus.value = 'idle'
    matchRoomId.value = null
  }

  return {
    rooms,
    total,
    onlineUsers,
    loading,
    topElo,
    matchStatus,
    matchRoomId,
    matchQueueSize,
    spectateGames,
    refreshRooms,
    refreshOnline,
    refreshSpectateGames,
    refreshTopElo,
    joinMatch,
    leaveMatch,
    resetMatch,
  }
})
