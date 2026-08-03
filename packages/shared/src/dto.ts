/**
 * DTO 映射：snake_case（DB）↔ camelCase（代码）。
 * 集中管理，避免散落。
 */
import type { UserDTO, RoomDTO, MoveDTO, GameDTO, ChatDTO, Pos } from './contracts.js'

// ─── DB 行类型（snake_case）───

export interface UserRow {
  id: number
  username: string
  email: string | null
  password_hash: string
  email_verified: boolean
  elo: number
  classic_score: number
  wins: number
  losses: number
  draws: number
  games_played: number
  status: number
  last_login_at: string | null
  created_at: string
  deleted_at: string | null
}

export interface RoomRow {
  id: number
  name: string
  owner_id: number | null
  mode: string
  ai_level: number | null
  password: string | null
  status: string
  created_at: string
  // 016 迁移：人人房准备阶段（附录C ready 子阶段）
  black_ready: boolean
  white_ready: boolean
  // 017 迁移：是否允许观战（房主设置）
  spectatable: boolean
}

export interface MoveRow {
  id: number
  game_id: number
  seq: number
  color: string
  pos_x: number | null
  pos_y: number | null
  is_pass: boolean
  flipped: Pos[] | string // JSONB：pg 读出为已解析数组，兼容字符串形式
  board_snapshot: string | null
  created_at: string
}

export interface GameRow {
  id: number
  room_id: number | null
  black_id: number | null
  white_id: number | null
  ai_level: number | null
  ai_color: string | null
  mode: string
  status: string
  result: string | null
  end_reason: string | null
  started_at: string
  ended_at: string | null
  move_count: number
  share_token: string | null
}

export interface ChatRow {
  id: number
  room_id: number | null
  game_id: number | null
  user_id: number
  username: string
  channel: string
  message: string
  created_at: string
}

// ─── 映射函数 ───

export function userRowToDTO(row: UserRow): UserDTO {
  // pg BIGINT-as-string：id 为 BIGSERIAL，node-postgres 默认返回字符串，
  // 统一 Number() 归一化，避免下游 Map<number> 键类型不一致（CLAUDE.md 系统性坑）
  return {
    id: Number(row.id),
    username: row.username,
    elo: row.elo,
    classicScore: row.classic_score,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    gamesPlayed: row.games_played,
  }
}

export function roomRowToDTO(row: RoomRow): RoomDTO {
  // pg BIGINT-as-string：id 为 BIGSERIAL，node-postgres 默认返回字符串。
  // room.id 作为 RoomManager.rooms/userRoom 的 Map 键，必须为 number，
  // 否则 joinRoom(roomId: number) 查不到字符串键 → 新建空 seat → 永不开局 → 30s 超时
  return {
    id: Number(row.id),
    name: row.name,
    mode: row.mode as RoomDTO['mode'],
    aiLevel: row.ai_level as RoomDTO['aiLevel'],
    status: row.status as RoomDTO['status'],
    hasPassword: row.password !== null && row.password !== '',
  }
}

export function moveRowToDTO(row: MoveRow): MoveDTO {
  // flipped 为 JSONB 列：pg 读出时已自动解析为数组；兼容字符串形式（防御）
  const flipped
    = typeof row.flipped === 'string'
      ? (JSON.parse(row.flipped) as MoveDTO['flipped'])
      : (row.flipped as MoveDTO['flipped'])
  return {
    seq: row.seq,
    color: row.color as MoveDTO['color'],
    pos: row.pos_x !== null && row.pos_y !== null ? { x: row.pos_x, y: row.pos_y } : null,
    isPass: row.is_pass,
    flipped,
  }
}

/** 对局 id 对外格式：g_<数字id>（对齐契约示例 "g_101"） */
export function gameIdToString(id: number): string {
  return `g_${id}`
}

export function gameIdToNumber(gameId: string): number | null {
  const m = /^g_(\d+)$/.exec(gameId)
  return m ? Number(m[1]) : null
}

export function gameRowToDTO(row: GameRow): GameDTO {
  // pg BIGINT-as-string：room_id/black_id/white_id 为 BIGINT，统一 Number() 归一化
  // （id 经 gameIdToString 拼接不受影响，但保持入参为 number 更稳妥）
  return {
    id: gameIdToString(Number(row.id)),
    roomId: row.room_id !== null ? Number(row.room_id) : null,
    blackId: row.black_id !== null ? Number(row.black_id) : null,
    whiteId: row.white_id !== null ? Number(row.white_id) : null,
    aiLevel: row.ai_level as GameDTO['aiLevel'],
    aiColor: row.ai_color as GameDTO['aiColor'],
    mode: row.mode as GameDTO['mode'],
    status: row.status as GameDTO['status'],
    result: row.result as GameDTO['result'],
    endReason: row.end_reason as GameDTO['endReason'],
    moveCount: row.move_count,
    shareToken: row.share_token,
  }
}

export function chatRowToDTO(row: ChatRow): ChatDTO {
  // pg BIGINT-as-string：id/room_id/user_id/game_id 为 BIGINT/BIGSERIAL，统一 Number() 归一化
  return {
    id: Number(row.id),
    roomId: row.room_id !== null ? Number(row.room_id) : null,
    gameId: row.game_id !== null ? gameIdToString(Number(row.game_id)) : null,
    userId: Number(row.user_id),
    username: row.username,
    channel: row.channel as ChatDTO['channel'],
    message: row.message,
    createdAt: new Date(row.created_at).getTime(),
  }
}
