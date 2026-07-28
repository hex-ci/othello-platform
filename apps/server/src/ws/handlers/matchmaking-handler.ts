/**
 * 匹配处理（T11，F-E-06）：入队/离队自动匹配队列。
 * 匹配成功由 MatchmakingService 建房开局并广播 match_found。
 */
import type { WsHandler } from '../context.js'

export const matchJoinHandler: WsHandler = async (ctx) => {
  const { conn, match } = ctx
  if (conn.userId === null || conn.username === null) return
  match.enqueue(conn.userId, conn.username)
}

export const matchLeaveHandler: WsHandler = async (ctx) => {
  const { conn, match } = ctx
  if (conn.userId === null) return
  match.dequeue(conn.userId)
  conn.send('match_left', {})
}
