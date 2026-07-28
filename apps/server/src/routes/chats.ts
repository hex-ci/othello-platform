/**
 * 聊天/在线 REST API（T10，§4.2）。
 * GET /chats 拉取历史；POST /chats 发消息；GET /online 在线列表。
 */
import type { FastifyInstance } from 'fastify'
import { ChatListQuerySchema, CreateChatRequestSchema } from '@othello-platform/shared'
import { authGuard, getUserId } from '../middleware/auth-guard.js'
import * as chatService from '../services/chat-service.js'
import * as friendService from '../services/friend-service.js'
import { getOnlineUsers } from '../services/online-service.js'
import type { ConnectionHub } from '../ws/hub.js'

export function chatRoutes(hub: ConnectionHub) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/api/v1/chats', { preHandler: [authGuard] }, async (request) => {
      const q = ChatListQuerySchema.parse(request.query)
      const userId = getUserId(request)
      // 过滤被屏蔽用户的消息（T16，F-E-07）
      const blockedUserIds = await friendService.getBlockedIds(userId)
      const messages = await chatService.listChats({
        channel: q.channel,
        roomId: q.roomId,
        since: q.since,
        blockedUserIds,
      })
      return { messages }
    })

    app.post('/api/v1/chats', { preHandler: [authGuard] }, async (request, reply) => {
      const body = CreateChatRequestSchema.parse(request.body)
      const userId = getUserId(request)
      const roomId = body.channel === 'room' ? (body.roomId ?? null) : null
      const chat = await chatService.postChat({
        channel: body.channel,
        roomId,
        userId,
        message: body.message,
      })
      return reply.status(201).send(chat)
    })

    app.get('/api/v1/online', { preHandler: [authGuard] }, async () => {
      const users = await getOnlineUsers(hub)
      return { users }
    })
  }
}
