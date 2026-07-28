/**
 * 房间/对局/聊天/在线 REST API（T07/T08/T10）。
 */
import { apiFetch } from './client'
import type {
  RoomDTO,
  GameDTO,
  MoveDTO,
  ChatDTO,
  OnlineUserDTO,
  GameMode,
  AiLevel,
  FriendDTO,
  LeaderboardEntryDTO,
  GameAnalysisDTO,
  PuzzleDTO,
  DailyChallengeDTO,
  PuzzleAttemptDTO,
  PuzzleStatsDTO,
  PuzzleDifficulty,
  PuzzleTopic,
  Pos,
  SeasonDTO,
  UserSeasonRatingDTO,
  BadgeDTO,
} from '@othello-platform/shared'

// ─── 房间 ───

export async function listRooms(params?: { status?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return apiFetch<{ items: RoomDTO[]; total: number }>(`/rooms${suffix}`)
}

export async function createRoom(input: {
  name: string
  mode: GameMode
  aiLevel?: AiLevel
  password?: string
}) {
  return apiFetch<RoomDTO>('/rooms', { method: 'POST', body: JSON.stringify(input) })
}

export async function joinRoom(roomId: number, password?: string) {
  return apiFetch<{ ok: boolean }>(`/rooms/${roomId}/join`, {
    method: 'POST',
    body: JSON.stringify(password ? { password } : {}),
  })
}

export async function quitRoom(roomId: number) {
  return apiFetch<{ ok: boolean }>(`/rooms/${roomId}/quit`, { method: 'POST' })
}

// ─── 对局 ───

export async function getGame(gameId: string) {
  return apiFetch<GameDTO>(`/games/${gameId}`)
}

export async function getGameMoves(gameId: string) {
  return apiFetch<{ moves: MoveDTO[] }>(`/games/${gameId}/moves`)
}

export async function cancelGame(gameId: string) {
  return apiFetch<{ ok: boolean }>(`/games/${gameId}/cancel`, { method: 'POST' })
}

// ─── 聊天 / 在线 ───

export async function listChats(params: { channel: 'public' | 'room'; roomId?: number; since?: number }) {
  const qs = new URLSearchParams({ channel: params.channel })
  if (params.roomId !== undefined) qs.set('roomId', String(params.roomId))
  if (params.since !== undefined) qs.set('since', String(params.since))
  return apiFetch<{ messages: ChatDTO[] }>(`/chats?${qs.toString()}`)
}

export async function postChat(input: { channel: 'public' | 'room'; roomId?: number; message: string }) {
  return apiFetch<ChatDTO>('/chats', { method: 'POST', body: JSON.stringify(input) })
}

export async function getOnline() {
  return apiFetch<{ users: OnlineUserDTO[] }>('/online')
}

// ─── 观战大厅（T14）───

export interface SpectateGameInfo {
  gameId: string
  blackId: number | null
  whiteId: number | null
  blackName: string | null
  whiteName: string | null
  blackCount: number
  whiteCount: number
  moveCount: number
  spectatorCount: number
}

export async function listSpectateGames() {
  return apiFetch<{ games: SpectateGameInfo[] }>('/spectate/games')
}

// ─── 复盘（T15）───

export interface ReplayData {
  game: GameDTO
  moves: MoveDTO[]
  blackName: string | null
  whiteName: string | null
}

export async function getReplay(gameId: string) {
  return apiFetch<ReplayData>(`/games/${gameId}/replay`)
}

export async function getReplayByToken(token: string) {
  return apiFetch<ReplayData>(`/replay/${token}`)
}

export async function createShareToken(gameId: string) {
  return apiFetch<{ token: string }>(`/games/${gameId}/share`, { method: 'POST' })
}

// ─── AI 复盘分析（T20）───

export async function analyzeGame(gameId: string) {
  return apiFetch<GameAnalysisDTO>(`/games/${gameId}/analyze`, { method: 'POST' })
}

export async function getAnalysis(gameId: string) {
  return apiFetch<GameAnalysisDTO>(`/games/${gameId}/analyze`)
}

// ─── 题库 / 每日挑战（T21，F-E-17）───

export async function listPuzzles(filter?: { difficulty?: PuzzleDifficulty; topic?: PuzzleTopic }) {
  const qs = new URLSearchParams()
  if (filter?.difficulty) qs.set('difficulty', filter.difficulty)
  if (filter?.topic) qs.set('topic', filter.topic)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return apiFetch<{ puzzles: PuzzleDTO[] }>(`/puzzles${suffix}`)
}

export async function getPuzzle(id: number) {
  return apiFetch<PuzzleDTO>(`/puzzles/${id}`)
}

export async function getDailyChallenge(date?: string) {
  const qs = date ? `?date=${date}` : ''
  return apiFetch<DailyChallengeDTO>(`/daily-challenge${qs}`)
}

export async function submitAttempt(puzzleId: number, answerPos: Pos | null, timeMs: number) {
  return apiFetch<{ attempt: PuzzleAttemptDTO; correct: boolean }>(`/puzzles/${puzzleId}/attempt`, {
    method: 'POST',
    body: JSON.stringify({
      answerX: answerPos?.x ?? null,
      answerY: answerPos?.y ?? null,
      timeMs,
    }),
  })
}

export async function listMyAttempts(limit = 10) {
  return apiFetch<{ attempts: PuzzleAttemptDTO[] }>(`/puzzles/my-attempts?limit=${limit}`)
}

export async function getMyPuzzleStats() {
  return apiFetch<PuzzleStatsDTO>('/puzzles/my-stats')
}

// ─── 赛季 / 徽章（T22，F-E-18）───

export async function getCurrentSeason() {
  return apiFetch<SeasonDTO>('/seasons/current')
}

export async function getMySeason() {
  return apiFetch<{ season: SeasonDTO; rating: UserSeasonRatingDTO | null; badges: BadgeDTO[] }>('/seasons/me')
}

export async function getUserBadges(userId: number) {
  return apiFetch<{ badges: BadgeDTO[] }>(`/users/${userId}/badges`)
}

// ─── 好友 / 屏蔽（T16，F-E-07）───

export async function listFriends(status?: 'pending' | 'accepted' | 'blocked') {
  const qs = status ? `?status=${status}` : ''
  return apiFetch<{ friends: FriendDTO[] }>(`/friends${qs}`)
}

export async function sendFriendRequest(friendId: number) {
  return apiFetch<{ ok: boolean }>('/friends/request', {
    method: 'POST',
    body: JSON.stringify({ friendId }),
  })
}

export async function acceptFriendRequest(friendId: number) {
  return apiFetch<{ ok: boolean }>('/friends/accept', {
    method: 'POST',
    body: JSON.stringify({ friendId }),
  })
}

export async function rejectFriendRequest(friendId: number) {
  return apiFetch<{ ok: boolean }>('/friends/reject', {
    method: 'POST',
    body: JSON.stringify({ friendId }),
  })
}

export async function cancelFriendRequest(friendId: number) {
  return apiFetch<{ ok: boolean }>('/friends/cancel', {
    method: 'POST',
    body: JSON.stringify({ friendId }),
  })
}

export async function removeFriend(friendId: number) {
  return apiFetch<{ ok: boolean }>(`/friends/${friendId}`, { method: 'DELETE' })
}

export async function blockUser(friendId: number) {
  return apiFetch<{ ok: boolean }>('/friends/block', {
    method: 'POST',
    body: JSON.stringify({ friendId }),
  })
}

export async function unblockUser(friendId: number) {
  return apiFetch<{ ok: boolean }>('/friends/unblock', {
    method: 'POST',
    body: JSON.stringify({ friendId }),
  })
}

// ─── 榜单（T16，F-E-08）───

export async function getLeaderboard(by: 'elo' | 'classic' = 'elo', limit = 50) {
  return apiFetch<{ entries: LeaderboardEntryDTO[] }>(`/leaderboard?by=${by}&limit=${limit}`)
}
