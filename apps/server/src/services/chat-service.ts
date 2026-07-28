/**
 * 聊天持久化（T10，F-C-09）。
 * public/room 频道写 chats 表；按 channel + since 拉取历史。
 */
import { query } from '../db/pool.js'
import { chatRowToDTO, type ChatRow, type ChatDTO } from '@othello-platform/shared'

export interface PostChatInput {
  channel: 'public' | 'room'
  roomId: number | null
  userId: number
  message: string
}

export async function postChat(input: PostChatInput): Promise<ChatDTO> {
  const res = await query(
    `INSERT INTO chats (room_id, game_id, user_id, channel, message)
     VALUES ($1, NULL, $2, $3, $4)
     RETURNING id, room_id, game_id, user_id, channel, message, created_at`,
    [input.roomId, input.userId, input.channel, input.message],
  )
  const row = res.rows[0] as Omit<ChatRow, 'username'>
  return {
    id: row.id,
    roomId: row.room_id,
    gameId: null,
    userId: row.user_id,
    username: '', // 由 handler 用连接的 username 补全广播
    channel: row.channel as ChatDTO['channel'],
    message: row.message,
    createdAt: new Date(row.created_at).getTime(),
  }
}

export async function listChats(params: {
  channel: 'public' | 'room'
  roomId?: number
  since?: number
  limit?: number
  /** 需屏蔽的用户 id 列表（T16，F-E-07）：过滤其消息 */
  blockedUserIds?: number[]
}): Promise<ChatDTO[]> {
  const limit = params.limit ?? 50
  const clauses: string[] = ['c.channel = $1']
  const args: unknown[] = [params.channel]

  if (params.channel === 'room' && params.roomId !== undefined) {
    args.push(params.roomId)
    clauses.push(`c.room_id = $${args.length}`)
  }
  if (params.since !== undefined) {
    args.push(new Date(params.since).toISOString())
    clauses.push(`c.created_at > $${args.length}`)
  }
  if (params.blockedUserIds && params.blockedUserIds.length > 0) {
    args.push(params.blockedUserIds)
    clauses.push(`c.user_id <> ALL($${args.length}::bigint[])`)
  }
  args.push(limit)

  const res = await query(
    `SELECT c.id, c.room_id, c.game_id, c.user_id, u.username, c.channel, c.message, c.created_at
     FROM chats c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY c.created_at ASC
     LIMIT $${args.length}`,
    args,
  )
  return (res.rows as ChatRow[]).map(chatRowToDTO)
}
