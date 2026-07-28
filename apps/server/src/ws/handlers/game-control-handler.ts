/**
 * 和棋/认输处理（T08，F-C-08）。
 * 取消本局经 REST POST /games/:id/cancel（§4.2）。
 */
import { DrawRequestPayloadSchema, DrawResponsePayloadSchema, ResignPayloadSchema } from '@othello-platform/shared'
import type { WsHandler } from '../context.js'

export const drawRequestHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = DrawRequestPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'draw_request 参数无效')
    return
  }
  if (conn.userId === null) return
  await rooms.drawRequest(conn.userId, parsed.data.gameId)
}

export const drawResponseHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = DrawResponsePayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'draw_response 参数无效')
    return
  }
  if (conn.userId === null) return
  await rooms.drawResponse(conn.userId, parsed.data.gameId, parsed.data.accept)
}

export const resignHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = ResignPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'resign 参数无效')
    return
  }
  if (conn.userId === null) return
  await rooms.resign(conn.userId, parsed.data.gameId, parsed.data.color)
}
