import type { FastifyInstance } from 'fastify'
import { UpdateUserRequestSchema, LeaderboardQuerySchema } from '@othello-platform/shared'
import {
  getUserById,
  getUserByUsername,
  updateUser,
  getLeaderboard,
  getEloHistory,
  getGameHistory,
  getAiStats,
  getActivity,
} from '../services/user-service.js'
import { authGuard, getUserId } from '../middleware/auth-guard.js'
import { getRelation } from '../services/friend-service.js'

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // 榜单（T16，F-E-08）：按 ELO 或经典积分排序
  app.get('/api/v1/leaderboard', { preHandler: [authGuard] }, async (request) => {
    const q = LeaderboardQuerySchema.parse(request.query)
    const entries = await getLeaderboard(q.by, q.limit)
    return { entries }
  })

  // 按用户名查询（T16 添加好友用）
  app.get('/api/v1/users/by-name/:name', { preHandler: [authGuard] }, async (request, reply) => {
    const name = (request.params as Record<string, string>)['name']
    if (!name) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', msg: '用户名不能为空' } })
    }
    const user = await getUserByUsername(name)
    return reply.status(200).send(user)
  })

  app.get('/api/v1/users/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const id = Number((request.params as Record<string, string>)['id'])
    if (!Number.isInteger(id) || id <= 0) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', msg: '无效的用户 ID' } })
    }
    const user = await getUserById(id)
    return reply.status(200).send(user)
  })

  app.patch('/api/v1/users/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const id = Number((request.params as Record<string, string>)['id'])
    const currentUserId = getUserId(request)

    if (id !== currentUserId) {
      return reply.status(403).send({ error: { code: 'AUTH_REQUIRED', msg: '只能修改自己的资料' } })
    }

    const body = UpdateUserRequestSchema.parse(request.body)
    await updateUser(id, body)
    return reply.status(200).send({ ok: true })
  })

  // ── 资料页（F-C-10~13，对照设计稿 09-profile）──

  // ELO 走势（近 20 局）
  app.get('/api/v1/users/:id/elo-history', { preHandler: [authGuard] }, async (request) => {
    const id = Number((request.params as Record<string, string>)['id'])
    return { points: await getEloHistory(id, 20) }
  })

  // 对局历史（近 20 局）
  app.get('/api/v1/users/:id/games', { preHandler: [authGuard] }, async (request) => {
    const id = Number((request.params as Record<string, string>)['id'])
    return { games: await getGameHistory(id, 20) }
  })

  // AI 对战统计（按难度聚合）
  app.get('/api/v1/users/:id/ai-stats', { preHandler: [authGuard] }, async (request) => {
    const id = Number((request.params as Record<string, string>)['id'])
    return { stats: await getAiStats(id) }
  })

  // 最近 7 天活跃度
  app.get('/api/v1/users/:id/activity', { preHandler: [authGuard] }, async (request) => {
    const id = Number((request.params as Record<string, string>)['id'])
    return { activity: await getActivity(id, 7) }
  })

  // 我与对方的关系状态（profile 页"发起挑战/加好友"按钮用，T17/F-E-16）
  app.get(
    '/api/v1/users/:id/friend-status',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const id = Number((request.params as Record<string, string>)['id'])
      const currentUserId = getUserId(request)
      if (!Number.isInteger(id) || id <= 0) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', msg: '无效的用户 ID' } })
      }
      if (id === currentUserId) {
        return reply
          .status(400)
          .send({ error: { code: 'VALIDATION_ERROR', msg: '不能查询自己的关系状态' } })
      }
      const status = await getRelation(currentUserId, id)
      return reply.status(200).send({ status, isFriend: status === 'accepted' })
    },
  )
}
