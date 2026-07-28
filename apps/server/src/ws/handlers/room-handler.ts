/**
 * room_join / room_ready / room_start / room_spectate_* / room_update_settings 处理
 * （T07，附录C ready 子阶段 + T14 房间观战席扩展）。
 * 人机房 join 即开局；人人房双方就位后需双方准备 + 房主开局。
 */
import {
  RoomJoinPayloadSchema,
  RoomReadyPayloadSchema,
  RoomStartPayloadSchema,
  RoomSpectateJoinPayloadSchema,
  RoomSpectateLeavePayloadSchema,
  RoomUpdateSettingsPayloadSchema,
} from '@othello-platform/shared'
import type { WsHandler } from '../context.js'

export const roomJoinHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = RoomJoinPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'room_join 参数无效')
    return
  }
  if (conn.userId === null || conn.username === null) return
  await rooms.joinRoom(conn.userId, conn.username, parsed.data.roomId)
}

/** 玩家准备/取消准备（人人房，未开局） */
export const roomReadyHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = RoomReadyPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'room_ready 参数无效')
    return
  }
  if (conn.userId === null) return
  await rooms.setReady(conn.userId, parsed.data.roomId, parsed.data.ready)
}

/** 房主开局（双方均准备后生效） */
export const roomStartHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = RoomStartPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'room_start 参数无效')
    return
  }
  if (conn.userId === null) return
  await rooms.startGameByHost(conn.userId, parsed.data.roomId)
}

/** 加入房间旁观（观战席，T14 扩展） */
export const roomSpectateJoinHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = RoomSpectateJoinPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'room_spectate_join 参数无效')
    return
  }
  if (conn.userId === null) return
  await rooms.spectateRoom(conn.userId, parsed.data.roomId)
}

/** 退出房间旁观 */
export const roomSpectateLeaveHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = RoomSpectateLeavePayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'room_spectate_leave 参数无效')
    return
  }
  if (conn.userId === null) return
  await rooms.leaveSpectateRoom(conn.userId, parsed.data.roomId)
}

/** 房主修改房间设置（未开局，双方未准备） */
export const roomUpdateSettingsHandler: WsHandler = async (ctx, payload) => {
  const { conn, rooms } = ctx
  const parsed = RoomUpdateSettingsPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'room_update_settings 参数无效')
    return
  }
  if (conn.userId === null) return
  await rooms.updateSettings(conn.userId, parsed.data.roomId, parsed.data)
}
