/**
 * 赛季 / 段位 / 徽章 REST API（T22，F-E-18）。
 */
import type { FastifyInstance } from 'fastify'
import { authGuard, getUserId } from '../middleware/auth-guard.js'
import { AppError } from '../middleware/error-handler.js'
import * as seasonService from '../services/season-service.js'

export async function seasonRoutes(app: FastifyInstance): Promise<void> {
  // 当前赛季（无需鉴权）
  app.get('/api/v1/seasons/current', async () => {
    const season = await seasonService.getCurrentSeason()
    if (!season) throw new AppError('GAME_NOT_FOUND', '当前无活跃赛季', 404)
    return season
  })

  // 我的赛季段位 + 徽章（鉴权）
  app.get('/api/v1/seasons/me', { preHandler: [authGuard] }, async (request) => {
    const userId = Number(getUserId(request))
    const season = await seasonService.getCurrentSeason()
    if (!season) throw new AppError('GAME_NOT_FOUND', '当前无活跃赛季', 404)
    const rating = await seasonService.getUserSeasonRating(userId, season.id)
    const badges = await seasonService.listUserBadges(userId)
    return { season, rating, badges }
  })

  // 指定用户徽章（鉴权）
  app.get('/api/v1/users/:id/badges', { preHandler: [authGuard] }, async (request) => {
    const raw = (request.params as Record<string, string>)['id']
    const userId = Number(raw)
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('VALIDATION_ERROR', '无效的用户 ID', 400)
    }
    const badges = await seasonService.listUserBadges(userId)
    return { badges }
  })
}