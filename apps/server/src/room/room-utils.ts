/**
 * 房间/对局无状态辅助函数（从 room-manager.ts 提取）。
 * 纯查询/广播工具，不持有状态。
 */
import type { FastifyInstance } from 'fastify'
import type { ConnectionHub } from '../ws/hub.js'
import type { GameRuntime } from '../game/game-runtime.js'
import { query } from '../db/pool.js'
import { gameIdToNumber } from '@othello-platform/shared'
import type { RoomSeat, ActiveGame } from './room-types.js'

/** 解析用户名（缺失返回 null，不阻断开局） */
export async function usernameOf(userId: number | null): Promise<string | null> {
  if (userId === null) return null
  try {
    const row = await query('SELECT username FROM users WHERE id = $1', [userId])
    return (row.rows[0]?.username as string | undefined) ?? null
  }
  catch {
    return null
  }
}

/** 写审计日志（失败不阻断主流程） */
export async function audit(
  app: FastifyInstance,
  userId: number,
  action: string,
  meta: unknown,
): Promise<void> {
  try {
    await query('INSERT INTO audit_logs (user_id, action, meta) VALUES ($1, $2, $3)', [
      userId > 0 ? userId : null,
      action,
      JSON.stringify(meta),
    ])
  }
  catch (err) {
    app.log.warn({ err }, '写审计日志失败')
  }
}

/** 构造 game_start 载荷（开局与状态同步共用） */
export async function gameStartPayload(runtime: GameRuntime, remainingMs: number) {
  const { black, white } = runtime.config
  return {
    gameId: runtime.gameId,
    blackId: black.userId,
    whiteId: white.userId,
    blackName: black.isAi ? 'AI' : await usernameOf(black.userId),
    whiteName: white.isAi ? 'AI' : await usernameOf(white.userId),
    turn: runtime.turn,
    board: Array.from(runtime.board),
    aiLevel: runtime.config.aiLevel,
    aiColor: runtime.config.aiColor,
    remainingMs,
  }
}

/** 向对局玩家 + 观战者广播 */
export function broadcastToGameByRuntime(
  hub: ConnectionHub,
  games: Map<string, ActiveGame>,
  runtime: GameRuntime,
  type: string,
  payload: unknown,
): void {
  const ids: number[] = []
  if (runtime.config.black.userId !== null) ids.push(runtime.config.black.userId)
  if (runtime.config.white.userId !== null) ids.push(runtime.config.white.userId)
  const active = games.get(runtime.gameId)
  if (active) for (const sid of active.spectators) ids.push(sid)
  hub.sendToUsers(ids, type, payload)
}

/** 向房间内玩家广播 */
export function broadcastToGame(
  hub: ConnectionHub,
  seat: RoomSeat,
  type: string,
  payload: unknown,
): void {
  const ids: number[] = []
  if (seat.blackId !== null) ids.push(seat.blackId)
  if (seat.whiteId !== null) ids.push(seat.whiteId)
  hub.sendToUsers(ids, type, payload)
}

/** 广播房间状态（含旁观者列表） */
export async function broadcastRoomState(
  hub: ConnectionHub,
  seat: RoomSeat,
): Promise<void> {
  const ids: number[] = []
  if (seat.blackId !== null) ids.push(seat.blackId)
  if (seat.whiteId !== null) ids.push(seat.whiteId)
  for (const sid of seat.roomSpectators) ids.push(sid)
  const blackName = seat.blackId !== null ? ((await usernameOf(seat.blackId)) ?? null) : null
  const whiteName = seat.whiteId !== null ? ((await usernameOf(seat.whiteId)) ?? null) : null
  const spectatorList = []
  for (const sid of seat.roomSpectators) {
    const name = (await usernameOf(sid)) ?? '旁观者'
    spectatorList.push({ userId: sid, username: name })
  }
  hub.sendToUsers(ids, 'room_state', {
    roomId: seat.roomId,
    gameId: seat.gameId,
    blackId: seat.blackId,
    whiteId: seat.whiteId,
    status: seat.gameId ? 'playing' : 'waiting',
    blackReady: seat.blackReady,
    whiteReady: seat.whiteReady,
    blackName,
    whiteName,
    ownerId: seat.ownerId,
    roomName: seat.roomName,
    spectatable: seat.spectatable,
    spectators: spectatorList,
  })
}

/** 从 DB 查已结束对局的对手 id（再战用） */
export async function lastOpponentOf(gameId: string, userId: number): Promise<number | null> {
  const numId = gameIdToNumber(gameId)
  if (numId === null) return null
  try {
    const res = await query('SELECT black_id, white_id FROM games WHERE id = $1', [numId])
    const row = res.rows[0] as { black_id: string | null, white_id: string | null } | undefined
    if (!row) return null
    const blackId = row.black_id !== null ? Number(row.black_id) : null
    const whiteId = row.white_id !== null ? Number(row.white_id) : null
    if (blackId === userId) return whiteId
    if (whiteId === userId) return blackId
    return null
  }
  catch {
    return null
  }
}

/** 从 DB 查已结束对局的原黑方 id（再战互换执子用） */
export async function lastBlackOf(gameId: string): Promise<number | null> {
  const numId = gameIdToNumber(gameId)
  if (numId === null) return null
  try {
    const res = await query('SELECT black_id FROM games WHERE id = $1', [numId])
    const raw = (res.rows[0] as { black_id: string | null } | undefined)?.black_id ?? null
    return raw !== null ? Number(raw) : null
  }
  catch {
    return null
  }
}

/** 对局中某玩家的对手 id（进行中） */
export function opponentOf(runtime: GameRuntime, userId: number): number | null {
  const { black, white } = runtime.config
  if (black.userId === userId) return white.userId
  if (white.userId === userId) return black.userId
  return null
}
