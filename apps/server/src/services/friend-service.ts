/**
 * 好友/屏蔽服务（T16，F-E-07/08）。
 * friends 表单向存储：user_id 发起 → friend_id；status: pending/accepted/blocked。
 */
import { query } from '../db/pool.js'
import { AppError } from '../middleware/error-handler.js'
import type { FriendDTO, FriendStatus, RelationStatus } from '@othello-platform/shared'

interface FriendRow {
  id: number
  user_id: number
  friend_id: number
  status: FriendStatus
  username: string
  elo: number
}

/** 发送好友请求（pending） */
export async function sendFriendRequest(userId: number, friendId: number): Promise<void> {
  if (userId === friendId) {
    throw new AppError('VALIDATION_ERROR', '不能添加自己为好友', 400)
  }
  // 检查对方是否存在
  const target = await query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [
    friendId,
  ])
  if (target.rowCount === 0) {
    throw new AppError('VALIDATION_ERROR', '用户不存在', 404)
  }
  // 检查是否已有关系（任一方向）
  const existing = await query(
    `SELECT id, status FROM friends
     WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [userId, friendId],
  )
  if (existing.rowCount && existing.rowCount > 0) {
    const row = existing.rows[0] as { status: FriendStatus }
    if (row.status === 'accepted') throw new AppError('VALIDATION_ERROR', '已是好友', 409)
    if (row.status === 'blocked') throw new AppError('VALIDATION_ERROR', '无法添加该用户', 403)
    throw new AppError('VALIDATION_ERROR', '好友请求已存在', 409)
  }
  await query('INSERT INTO friends (user_id, friend_id, status) VALUES ($1, $2, $3)', [
    userId,
    friendId,
    'pending',
  ])
}

/** 接受好友请求 */
export async function acceptFriendRequest(userId: number, friendId: number): Promise<void> {
  const res = await query(
    `UPDATE friends SET status = 'accepted', updated_at = now()
     WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'
     RETURNING id`,
    [friendId, userId],
  )
  if (res.rowCount === 0) {
    throw new AppError('VALIDATION_ERROR', '好友请求不存在', 404)
  }
}

/** 拒绝好友请求（删除 pending 记录） */
export async function rejectFriendRequest(userId: number, friendId: number): Promise<void> {
  const res = await query(
    `DELETE FROM friends WHERE user_id = $1 AND friend_id = $2 AND status = 'pending' RETURNING id`,
    [friendId, userId],
  )
  if (res.rowCount === 0) {
    throw new AppError('VALIDATION_ERROR', '好友请求不存在', 404)
  }
}

/** 取消我发出的好友请求（删除 user_id=我 的 pending 记录） */
export async function cancelFriendRequest(userId: number, friendId: number): Promise<void> {
  const res = await query(
    `DELETE FROM friends WHERE user_id = $1 AND friend_id = $2 AND status = 'pending' RETURNING id`,
    [userId, friendId],
  )
  if (res.rowCount === 0) {
    throw new AppError('VALIDATION_ERROR', '好友请求不存在', 404)
  }
}

/** 删除好友 */
export async function removeFriend(userId: number, friendId: number): Promise<void> {
  const res = await query(
    `DELETE FROM friends
     WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)) AND status = 'accepted'
     RETURNING id`,
    [userId, friendId],
  )
  if (res.rowCount === 0) {
    throw new AppError('VALIDATION_ERROR', '好友关系不存在', 404)
  }
}

/** 屏蔽用户（若已有好友/请求关系则覆盖为 blocked） */
export async function blockUser(userId: number, friendId: number): Promise<void> {
  if (userId === friendId) {
    throw new AppError('VALIDATION_ERROR', '不能屏蔽自己', 400)
  }
  await query(
    `INSERT INTO friends (user_id, friend_id, status) VALUES ($1, $2, 'blocked')
     ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'blocked', updated_at = now()`,
    [userId, friendId],
  )
  // 同时删除对方对我的好友/请求关系
  await query('DELETE FROM friends WHERE user_id = $1 AND friend_id = $2', [friendId, userId])
}

/** 解除屏蔽 */
export async function unblockUser(userId: number, friendId: number): Promise<void> {
  const res = await query(
    `DELETE FROM friends WHERE user_id = $1 AND friend_id = $2 AND status = 'blocked' RETURNING id`,
    [userId, friendId],
  )
  if (res.rowCount === 0) {
    throw new AppError('VALIDATION_ERROR', '屏蔽关系不存在', 404)
  }
}

/** 列出好友/请求/屏蔽（含对方用户名、ELO、在线状态） */
export async function listFriends(
  userId: number,
  onlineIds: number[],
  status?: FriendStatus,
): Promise<FriendDTO[]> {
  // accepted: 双向均可；pending/blocked: 仅我发起或收到的
  const clauses: string[] = []
  const params: unknown[] = [userId]
  if (status === 'accepted') {
    clauses.push(`(f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'`)
  } else if (status === 'pending') {
    clauses.push(`(f.user_id = $1 OR f.friend_id = $1) AND f.status = 'pending'`)
  } else if (status === 'blocked') {
    clauses.push(`f.user_id = $1 AND f.status = 'blocked'`)
  } else {
    clauses.push(`(f.user_id = $1 OR f.friend_id = $1)`)
  }

  const res = await query(
    `SELECT f.id, f.user_id, f.friend_id, f.status, u.username, u.elo
     FROM friends f
     JOIN users u ON u.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
     WHERE ${clauses.join(' AND ')} AND u.deleted_at IS NULL
     ORDER BY f.updated_at DESC`,
    params,
  )

  // pg BIGINT-as-string 坑：user_id/friend_id/id 经 pg 返回为字符串，
  // 与 number 类型的 userId 比较会始终 false → otherId/direction/online 全错乱。
  // 统一 Number() 归一化（CLAUDE.md 系统性修复模式）。
  const onlineSet = new Set(onlineIds)
  return (res.rows as FriendRow[]).map((r) => {
    const uid = Number(r.user_id)
    const fid = Number(r.friend_id)
    const otherId = uid === userId ? fid : uid
    return {
      id: Number(r.id),
      userId: otherId,
      username: r.username,
      elo: r.elo,
      status: r.status,
      direction: uid === userId ? 'outgoing' : 'incoming',
      online: onlineSet.has(otherId),
    }
  })
}

/** 检查 userId 是否屏蔽了 friendId（聊天过滤用） */
export async function isBlocked(userId: number, friendId: number): Promise<boolean> {
  const res = await query(
    `SELECT id FROM friends WHERE user_id = $1 AND friend_id = $2 AND status = 'blocked'`,
    [userId, friendId],
  )
  return (res.rowCount ?? 0) > 0
}

/**
 * 查询我与对方的关系状态（profile 页"发起挑战/加好友"按钮 + challenge WS 校验用，T17/F-E-16）。
 * 复用 listFriends 的 BIGINT-as-string 归一化模式：user_id 经 pg 返回为字符串，
 * 与 number 比较前必须 Number()。
 */
export async function getRelation(userId: number, otherId: number): Promise<RelationStatus> {
  if (userId === otherId) return 'none'
  const res = await query(
    `SELECT status, user_id FROM friends
     WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [userId, otherId],
  )
  if (!res.rowCount || res.rowCount === 0) return 'none'
  const row = res.rows[0] as { status: FriendStatus; user_id: string | number }
  const rowUserId = Number(row.user_id)
  switch (row.status) {
    case 'accepted':
      return 'accepted'
    case 'pending':
      // user_id === userId → 我发出的请求 → pending-out；否则对方发给我 → pending-in
      return rowUserId === userId ? 'pending-out' : 'pending-in'
    case 'blocked':
      // 屏蔽是单向：仅当 user_id === userId（我屏蔽了对方）才返回 blocked
      return rowUserId === userId ? 'blocked' : 'none'
    default:
      return 'none'
  }
}

/** 获取 userId 屏蔽的所有用户 id（聊天历史过滤用，T16） */
export async function getBlockedIds(userId: number): Promise<number[]> {
  const res = await query(
    `SELECT friend_id FROM friends WHERE user_id = $1 AND status = 'blocked'`,
    [userId],
  )
  return (res.rows as { friend_id: number }[]).map((r) => r.friend_id)
}
