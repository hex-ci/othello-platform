/**
 * 好友/屏蔽 REST API（T16，F-E-07）
 */
import type { FastifyInstance } from 'fastify'
import { FriendRequestSchema, FriendListQuerySchema } from '@othello-platform/shared'
import { authGuard, getUserId } from '../middleware/auth-guard.js'
import * as friendService from '../services/friend-service.js'
import type { ConnectionHub } from '../ws/hub.js'

export function friendRoutes(hub: ConnectionHub) {
  return async (app: FastifyInstance): Promise<void> => {
    // 列出好友/请求/屏蔽
    app.get('/api/v1/friends', { preHandler: [authGuard] }, async (request) => {
      const userId = getUserId(request)
      const query = FriendListQuerySchema.parse(request.query)
      const onlineIds = hub.onlineUserIds()
      const friends = await friendService.listFriends(userId, onlineIds, query.status)
      return { friends }
    })

    // 发送好友请求
    app.post('/api/v1/friends/request', { preHandler: [authGuard] }, async (request) => {
      const userId = getUserId(request)
      const body = FriendRequestSchema.parse(request.body)
      await friendService.sendFriendRequest(userId, body.friendId)
      return { ok: true }
    })

    // 接受好友请求
    app.post('/api/v1/friends/accept', { preHandler: [authGuard] }, async (request) => {
      const userId = getUserId(request)
      const body = FriendRequestSchema.parse(request.body)
      await friendService.acceptFriendRequest(userId, body.friendId)
      return { ok: true }
    })

    // 拒绝好友请求
    app.post('/api/v1/friends/reject', { preHandler: [authGuard] }, async (request) => {
      const userId = getUserId(request)
      const body = FriendRequestSchema.parse(request.body)
      await friendService.rejectFriendRequest(userId, body.friendId)
      return { ok: true }
    })

    // 取消我发出的好友请求
    app.post('/api/v1/friends/cancel', { preHandler: [authGuard] }, async (request) => {
      const userId = getUserId(request)
      const body = FriendRequestSchema.parse(request.body)
      await friendService.cancelFriendRequest(userId, body.friendId)
      return { ok: true }
    })

    // 删除好友
    app.delete('/api/v1/friends/:friendId', { preHandler: [authGuard] }, async (request) => {
      const userId = getUserId(request)
      const friendId = Number((request.params as { friendId: string }).friendId)
      await friendService.removeFriend(userId, friendId)
      return { ok: true }
    })

    // 屏蔽用户
    app.post('/api/v1/friends/block', { preHandler: [authGuard] }, async (request) => {
      const userId = getUserId(request)
      const body = FriendRequestSchema.parse(request.body)
      await friendService.blockUser(userId, body.friendId)
      return { ok: true }
    })

    // 解除屏蔽
    app.post('/api/v1/friends/unblock', { preHandler: [authGuard] }, async (request) => {
      const userId = getUserId(request)
      const body = FriendRequestSchema.parse(request.body)
      await friendService.unblockUser(userId, body.friendId)
      return { ok: true }
    })
  }
}
