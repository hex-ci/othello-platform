/**
 * 观战处理（T14，F-E-05/10）：spectate_join / spectate_leave。
 * 只读订阅进行中对局，实时接收走子，不可落子、不影响对局。
 */
import { SpectateJoinPayloadSchema, SpectateLeavePayloadSchema } from '@othello-platform/shared'
import type { WsHandler } from '../context.js'

export const spectateJoinHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = SpectateJoinPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'spectate_join 参数无效')
    return
  }
  if (conn.userId === null) return
  await rooms.spectateJoin(conn.userId, parsed.data.gameId)
}

export const spectateLeaveHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = SpectateLeavePayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'spectate_leave 参数无效')
    return
  }
  if (conn.userId === null) return
  rooms.spectateLeave(conn.userId, parsed.data.gameId)
}
