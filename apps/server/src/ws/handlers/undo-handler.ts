import { UndoRequestPayloadSchema } from '@othello-platform/shared'
import type { WsHandler } from '../context.js'

export const undoHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = UndoRequestPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'undo 参数无效')
    return
  }
  if (conn.userId === null) return
  const { gameId } = parsed.data
  await rooms.requestUndo(conn.userId, gameId)
}
