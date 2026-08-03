/**
 * 用户资料相关 REST API（F-C-10~13，对照设计稿 09-profile）。
 */
import { apiFetch } from './client'
import type {
  UserDTO,
  BadgeDTO,
  EloHistoryPointDTO,
  GameHistoryDTO,
  AiStatDTO,
  ActivityDTO,
  FriendStatusDTO,
} from '@othello-platform/shared'

/** 查看用户资料（本人或对手公开资料） */
export async function getUser(userId: number): Promise<UserDTO> {
  return apiFetch<UserDTO>(`/users/${userId}`)
}

/** 按用户名查询（添加好友/资料页跳转用） */
export async function getUserByName(name: string): Promise<UserDTO> {
  return apiFetch<UserDTO>(`/users/by-name/${encodeURIComponent(name)}`)
}

/** 我与对方的关系状态（profile 页"发起挑战/加好友"按钮用，T17/F-E-16） */
export async function getFriendStatus(userId: number): Promise<FriendStatusDTO> {
  return apiFetch<FriendStatusDTO>(`/users/${userId}/friend-status`)
}

/** 修改本人资料（v1 预留 avatar/bio） */
export async function updateUser(
  userId: number,
  updates: { avatar?: string, bio?: string },
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

/** 用户徽章 */
export async function getUserBadges(userId: number): Promise<BadgeDTO[]> {
  const res = await apiFetch<{ badges: BadgeDTO[] }>(`/users/${userId}/badges`)
  return res.badges
}

/** ELO 走势（近 20 局） */
export async function getEloHistory(userId: number): Promise<EloHistoryPointDTO[]> {
  const res = await apiFetch<{ points: EloHistoryPointDTO[] }>(`/users/${userId}/elo-history`)
  return res.points
}

/** 对局历史（近 20 局） */
export async function getGameHistory(userId: number): Promise<GameHistoryDTO[]> {
  const res = await apiFetch<{ games: GameHistoryDTO[] }>(`/users/${userId}/games`)
  return res.games
}

/** AI 对战统计（按难度聚合） */
export async function getAiStats(userId: number): Promise<AiStatDTO[]> {
  const res = await apiFetch<{ stats: AiStatDTO[] }>(`/users/${userId}/ai-stats`)
  return res.stats
}

/** 最近 7 天活跃度 */
export async function getActivity(userId: number): Promise<ActivityDTO[]> {
  const res = await apiFetch<{ activity: ActivityDTO[] }>(`/users/${userId}/activity`)
  return res.activity
}
