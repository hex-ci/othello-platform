/**
 * move 处理（T08）：落子经服务端权威校验（F-C-03）。
 * 显式携带 color（§4.3），校验归属后交由 RoomManager 编排。
 */
import { MovePayloadSchema } from '@othello-platform/shared'
import type { WsHandler } from '../context.js'

export const moveHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = MovePayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'move 参数无效')
    return
  }
  if (conn.userId === null) return
  const { gameId, color, pos } = parsed.data
  await rooms.handleMove(conn.userId, gameId, color, pos)
}
