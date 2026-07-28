/**
 * 对局 REST API（T08，§4.2）。
 * 查询对局/走子历史（复盘/重连基础）+ 取消本局。
 * 终局只由服务端产生，无客户端上报入口。
 */
import type { FastifyInstance } from 'fastify'
import { gameIdToNumber } from '@othello-platform/shared'
import { authGuard } from '../middleware/auth-guard.js'
import { AppError } from '../middleware/error-handler.js'
import * as gameService from '../services/game-service.js'

export async function gameRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/games/:id', { preHandler: [authGuard] }, async (request) => {
    const numId = parseGameId(request)
    const game = await gameService.getGameById(numId)
    if (!game) throw new AppError('GAME_NOT_FOUND', '对局不存在', 404)
    return game
  })

  app.get('/api/v1/games/:id/moves', { preHandler: [authGuard] }, async (request) => {
    const numId = parseGameId(request)
    const moves = await gameService.getGameMoves(numId)
    return { moves }
  })

  app.post('/api/v1/games/:id/cancel', { preHandler: [authGuard] }, async (request) => {
    const numId = parseGameId(request)
    const game = await gameService.getGameById(numId)
    if (!game) throw new AppError('GAME_NOT_FOUND', '对局不存在', 404)
    if (game.status !== 'playing') {
      throw new AppError('VALIDATION_ERROR', '对局已结束，无法取消', 409)
    }
    await gameService.cancelGame(numId)
    return { ok: true }
  })

  // 生成/返回复盘分享令牌（T15，F-E-11）
  app.post('/api/v1/games/:id/share', { preHandler: [authGuard] }, async (request) => {
    const numId = parseGameId(request)
    const game = await gameService.getGameById(numId)
    if (!game) throw new AppError('GAME_NOT_FOUND', '对局不存在', 404)
    const token = await gameService.ensureShareToken(numId)
    return { token }
  })

  // 复盘数据（本局玩家，鉴权）：按对局 id 拉取
  app.get('/api/v1/games/:id/replay', { preHandler: [authGuard] }, async (request) => {
    const numId = parseGameId(request)
    const data = await gameService.getReplayById(numId)
    if (!data) throw new AppError('GAME_NOT_FOUND', '对局不存在', 404)
    return data
  })

  // 复盘分享链接（无鉴权，F-E-11）：按分享令牌拉取
  app.get('/api/v1/replay/:token', async (request) => {
    const token = (request.params as Record<string, string>)['token']
    if (!token) throw new AppError('VALIDATION_ERROR', '缺少分享令牌', 400)
    const data = await gameService.getReplayByShareToken(token)
    if (!data) throw new AppError('GAME_NOT_FOUND', '分享链接无效或已失效', 404)
    return data
  })

  // AI 复盘分析（T20）：触发分析并缓存，命中缓存直接返回
  app.post('/api/v1/games/:id/analyze', { preHandler: [authGuard] }, async (request) => {
    const numId = parseGameId(request)
    return await gameService.computeAndStoreAnalysis(numId)
  })

  // 读取已缓存的 AI 复盘分析
  app.get('/api/v1/games/:id/analyze', { preHandler: [authGuard] }, async (request) => {
    const numId = parseGameId(request)
    const analysis = await gameService.getAnalysis(numId)
    if (!analysis) throw new AppError('GAME_NOT_FOUND', '分析结果不存在，请先触发分析', 404)
    return analysis
  })
}

function parseGameId(request: { params: unknown }): number {
  const raw = (request.params as Record<string, string>)['id']
  if (!raw) {
    throw new AppError('VALIDATION_ERROR', '无效的对局 ID', 400)
  }
  // 兼容 "g_101" 与 "101"
  const numId = raw.startsWith('g_') ? gameIdToNumber(raw) : Number(raw)
  if (numId === null || !Number.isInteger(numId) || numId <= 0) {
    throw new AppError('VALIDATION_ERROR', '无效的对局 ID', 400)
  }
  return numId
}
