/**
 * 断线重连处理（T13，F-E-04）：reconnect(lastSeq) → state_sync。
 * 窗口内重连不判逃跑，回 board + 增量 moves 恢复至断线点。
 */
import { ReconnectPayloadSchema } from '@othello-platform/shared'
import type { WsHandler } from '../context.js'

export const reconnectHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = ReconnectPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'reconnect 参数无效')
    return
  }
  if (conn.userId === null) return
  const { gameId, lastSeq } = parsed.data
  await rooms.handleReconnect(conn.userId, gameId, lastSeq)
}
