/**
 * 再战 / 好友挑战处理（T17，F-E-16）。
 */
import {
  RematchRequestPayloadSchema,
  RematchResponsePayloadSchema,
  RematchLeavePayloadSchema,
  ChallengePayloadSchema,
  ChallengeResponsePayloadSchema,
  type AiLevel,
} from '@othello-platform/shared'
import type { WsHandler } from '../context.js'

export const rematchRequestHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = RematchRequestPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'rematch_request 参数无效')
    return
  }
  if (conn.userId === null) return
  await rooms.rematchRequest(conn.userId, parsed.data.gameId)
}

export const rematchLeaveHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = RematchLeavePayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'rematch_leave 参数无效')
    return
  }
  if (conn.userId === null) return
  rooms.rematchLeave(conn.userId, parsed.data.gameId)
}

export const rematchResponseHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = RematchResponsePayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'rematch_response 参数无效')
    return
  }
  if (conn.userId === null) return
  await rooms.rematchResponse(conn.userId, parsed.data.gameId, parsed.data.accept)
}

export const challengeHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = ChallengePayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'challenge 参数无效')
    return
  }
  if (conn.userId === null) return
  await rooms.challenge(conn.userId, parsed.data.toUserId, parsed.data.aiLevel as AiLevel | null)
}

export const challengeResponseHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = ChallengeResponsePayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'challenge_response 参数无效')
    return
  }
  if (conn.userId === null) return
  await rooms.challengeResponse(parsed.data.fromUserId, conn.userId, parsed.data.accept)
}
