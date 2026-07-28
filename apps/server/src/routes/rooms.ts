/**
 * 房间 REST API（T07，§4.2）。
 * 创建/列表/加入/退出。加入时校验私房口令并触发 WS 侧开局。
 */
import type { FastifyInstance } from 'fastify'
import { CreateRoomRequestSchema, RoomListQuerySchema } from '@othello-platform/shared'
import { authGuard, getUserId } from '../middleware/auth-guard.js'
import { AppError } from '../middleware/error-handler.js'
import * as roomService from '../services/room-service.js'
import type { RoomManager } from '../room/room-manager.js'
import type { JwtPayload } from '../auth/jwt.js'

export function roomRoutes(rooms: RoomManager) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/api/v1/rooms', { preHandler: [authGuard] }, async (request) => {
      const q = RoomListQuerySchema.parse(request.query)
      return roomService.listRooms(q)
    })

    app.post('/api/v1/rooms', { preHandler: [authGuard] }, async (request, reply) => {
      const body = CreateRoomRequestSchema.parse(request.body)
      const ownerId = getUserId(request)
      const room = await roomService.createRoom({
        name: body.name,
        ownerId,
        mode: body.mode,
        aiLevel:
          body.mode === 'human_vs_ai' ? ((body.aiLevel ?? 3) as 0 | 1 | 2 | 3 | 4 | 5) : null,
        password: body.password,
      })
      return reply.status(201).send(room)
    })

    app.post('/api/v1/rooms/:id/join', { preHandler: [authGuard] }, async (request, reply) => {
      const id = Number((request.params as Record<string, string>)['id'])
      const userId = getUserId(request)
      const username = (request.user as JwtPayload).username
      const body = (request.body ?? {}) as { password?: string }

      const row = await roomService.getRoomById(id)
      if (!row) {
        throw new AppError('ROOM_NOT_FOUND', '房间不存在', 404)
      }
      await roomService.verifyRoomPassword(row, body.password)

      // 触发 WS 侧座位分配与开局
      await rooms.joinRoom(userId, username, id)
      return reply.status(200).send({ ok: true })
    })

    app.post('/api/v1/rooms/:id/quit', { preHandler: [authGuard] }, async (request) => {
      const id = Number((request.params as Record<string, string>)['id'])
      await rooms.leaveRoom(getUserId(request), id)
      return { ok: true }
    })

    // 观战大厅：列出进行中对局（T14，F-E-10）
    app.get('/api/v1/spectate/games', { preHandler: [authGuard] }, async () => {
      const games = await rooms.listActiveGames()
      return { games }
    })
  }
}
