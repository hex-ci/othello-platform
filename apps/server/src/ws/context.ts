/**
 * WS 消息处理上下文：handler 通过它访问连接、广播器与服务。
 * 各 handler 在 router 注册，按 type 分发（附录 C §C.3）。
 */
import type { FastifyInstance } from 'fastify'
import type { ClientConnection } from './connection.js'
import type { ConnectionHub } from './hub.js'
import type { RoomManager } from '../room/room-manager.js'
import type { MatchmakingService } from '../services/matchmaking-service.js'

export interface WsContext {
  app: FastifyInstance
  hub: ConnectionHub
  rooms: RoomManager
  match: MatchmakingService
  conn: ClientConnection
}

/** 消息 handler：payload 为原始 unknown，由 handler 自行 Zod 校验 */
export type WsHandler = (ctx: WsContext, payload: unknown) => void | Promise<void>
