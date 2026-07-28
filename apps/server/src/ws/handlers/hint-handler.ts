import { HintRequestPayloadSchema } from '@othello-platform/shared'
import type { WsHandler } from '../context.js'

export const hintHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = HintRequestPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'hint 参数无效')
    return
  }
  if (conn.userId === null) return
  const { gameId } = parsed.data
  await rooms.requestHint(conn.userId, gameId)
}
