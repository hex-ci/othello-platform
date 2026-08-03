/**
 * 在线用户列表（T10，F-C-09）。
 * 基于 ConnectionHub 的在线连接聚合用户信息。
 */
import { query } from '../db/pool.js'
import type { ConnectionHub } from '../ws/hub.js'
import type { OnlineUserDTO } from '@othello-platform/shared'

export async function getOnlineUsers(hub: ConnectionHub): Promise<OnlineUserDTO[]> {
  const ids = hub.onlineUserIds()
  if (ids.length === 0) return []
  const res = await query('SELECT id, username FROM users WHERE id = ANY($1::bigint[])', [ids])
  return (res.rows as { id: number, username: string }[]).map(r => ({ id: r.id, username: r.username }))
}
