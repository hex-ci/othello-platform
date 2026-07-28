/**
 * 房间持久化（T07，F-C-07）。
 * 私房口令 argon2id 哈希存储（§6.2）。
 */
import { query } from '../db/pool.js'
import { roomRowToDTO, type RoomRow, type RoomDTO } from '@othello-platform/shared'
import type { GameMode, AiLevel } from '@othello-platform/shared'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { AppError } from '../middleware/error-handler.js'

export interface CreateRoomInput {
  name: string
  ownerId: number
  mode: GameMode
  aiLevel: AiLevel | null
  password?: string
}

export async function createRoom(input: CreateRoomInput): Promise<RoomDTO> {
  const passwordHash = input.password ? await hashPassword(input.password) : null
  const res = await query(
    `INSERT INTO rooms (name, owner_id, mode, ai_level, password, status)
     VALUES ($1, $2, $3, $4, $5, 'waiting')
     RETURNING *`,
    [input.name, input.ownerId, input.mode, input.aiLevel, passwordHash],
  )
  return roomRowToDTO(res.rows[0] as RoomRow)
}

export async function listRooms(params: {
  status?: 'waiting' | 'playing' | 'finished'
  page: number
  limit: number
}): Promise<{ items: RoomDTO[]; total: number }> {
  const offset = (params.page - 1) * params.limit
  const where = params.status ? 'WHERE status = $1' : ''
  const countParams = params.status ? [params.status] : []

  const countRes = await query(`SELECT COUNT(*)::int AS total FROM rooms ${where}`, countParams)
  const total = (countRes.rows[0] as { total: number }).total

  const listParams = params.status ? [params.status, params.limit, offset] : [params.limit, offset]
  const listRes = await query(
    `SELECT * FROM rooms ${where} ORDER BY created_at DESC LIMIT $${params.status ? 2 : 1} OFFSET $${params.status ? 3 : 2}`,
    listParams,
  )
  return { items: (listRes.rows as RoomRow[]).map(roomRowToDTO), total }
}

export async function getRoomById(id: number): Promise<RoomRow | null> {
  const res = await query('SELECT * FROM rooms WHERE id = $1', [id])
  return (res.rows[0] as RoomRow | undefined) ?? null
}

export async function updateRoomStatus(
  id: number,
  status: 'waiting' | 'playing' | 'finished',
): Promise<void> {
  await query('UPDATE rooms SET status = $2 WHERE id = $1', [id, status])
}

/**
 * 设置玩家准备状态（人人房，未开局；附录C ready 子阶段）。
 * 根据 userId 是黑/白座位置对应字段；非房内玩家忽略。
 */
export async function setReady(
  roomId: number,
  userId: number,
  ready: boolean,
  blackId: number | null,
  whiteId: number | null,
): Promise<void> {
  if (userId === blackId) {
    await query('UPDATE rooms SET black_ready = $2 WHERE id = $1', [roomId, ready])
  } else if (userId === whiteId) {
    await query('UPDATE rooms SET white_ready = $2 WHERE id = $1', [roomId, ready])
  }
}

/** 开局时清零双方准备（进入 playing 前归位，避免遗留态影响重开） */
export async function clearReady(roomId: number): Promise<void> {
  await query('UPDATE rooms SET black_ready = false, white_ready = false WHERE id = $1', [roomId])
}

/** 更新房间是否允许观战（房主设置，017 迁移） */
export async function updateSpectatable(roomId: number, spectatable: boolean): Promise<void> {
  await query('UPDATE rooms SET spectatable = $2 WHERE id = $1', [roomId, spectatable])
}

/** 更新房间口令（null=清除，string=设置/修改；017 扩展） */
export async function updatePassword(roomId: number, password: string | null): Promise<void> {
  const passwordHash = password ? await hashPassword(password) : null
  await query('UPDATE rooms SET password = $2 WHERE id = $1', [roomId, passwordHash])
}

/** 启动时清理僵尸 waiting 房间：重启后内存座位已丢失，这些房间不可能再正常开局 */
export async function cleanupStaleWaitingRooms(): Promise<number> {
  const res = await query("UPDATE rooms SET status = 'finished' WHERE status = 'waiting'")
  return res.rowCount ?? 0
}

/** 校验私房口令；无口令房间直接通过 */
export async function verifyRoomPassword(room: RoomRow, password?: string): Promise<void> {
  if (!room.password) return
  if (!password) {
    throw new AppError('VALIDATION_ERROR', '该房间需要口令', 403)
  }
  const ok = await verifyPassword(room.password, password)
  if (!ok) {
    throw new AppError('VALIDATION_ERROR', '房间口令错误', 403)
  }
}
