/**
 * 房间/对局共享类型与常量（从 room-manager.ts 提取）。
 */
import type { GameMode, AiLevel } from '@othello-platform/shared'
import type { GameRuntime } from '../game/game-runtime.js'
import type { MoveTimer } from '../game/move-timer.js'

/** 断线重连窗口（F-E-04）：窗口内重连不判逃跑，超时判负 */
export const RECONNECT_WINDOW_MS = Number(process.env['RECONNECT_WINDOW_MS'] ?? 30_000)

export interface RoomSeat {
  roomId: number
  mode: GameMode
  aiLevel: AiLevel | null
  blackId: number | null
  whiteId: number | null
  gameId: string | null
  /** 人人房准备阶段（附录C ready 子阶段）：与 DB rooms.black_ready/white_ready 同步 */
  blackReady: boolean
  whiteReady: boolean
  /** 房主 userId（Number 归一化；仅房主可开局） */
  ownerId: number | null
  /** 房间名（显示用，与 DB rooms.name 同步） */
  roomName: string
  /** 是否允许观战（房主设置，与 DB 同步） */
  spectatable: boolean
  /** 房间等待期旁观者 userId 集合（观战席，T14 扩展） */
  roomSpectators: Set<number>
}

export interface ActiveGame {
  runtime: GameRuntime
  timer: MoveTimer
  /** 串行化锁：避免并发落子竞态 */
  busy: boolean
  /** 观战者 userId 集合（只读订阅，T14） */
  spectators: Set<number>
}
