/**
 * 题库 / 每日挑战 / 作答 REST API（T21，F-E-17）。
 */
import type { FastifyInstance } from 'fastify'
import { authGuard, getUserId } from '../middleware/auth-guard.js'
import { AppError } from '../middleware/error-handler.js'
import * as puzzleService from '../services/puzzle-service.js'
import type { PuzzleDifficulty, PuzzleTopic, Pos } from '@othello-platform/shared'

export async function puzzleRoutes(app: FastifyInstance): Promise<void> {
  // 列出题目（可按难度/专题筛选，无需鉴权）
  app.get('/api/v1/puzzles', async (request) => {
    const q = request.query as Record<string, string | undefined>
    const filter: { difficulty?: PuzzleDifficulty, topic?: PuzzleTopic } = {}
    if (q['difficulty']) filter.difficulty = q['difficulty'] as PuzzleDifficulty
    if (q['topic']) filter.topic = q['topic'] as PuzzleTopic
    const puzzles = await puzzleService.listPuzzles(filter)
    return { puzzles }
  })

  // 单题
  app.get('/api/v1/puzzles/:id', async (request) => {
    const id = parsePuzzleId(request)
    const puzzle = await puzzleService.getPuzzle(id)
    if (!puzzle) throw new AppError('GAME_NOT_FOUND', '题目不存在', 404)
    return puzzle
  })

  // 当天每日挑战（无鉴权也可查看题目，登录后附带 completedIds）
  app.get('/api/v1/daily-challenge', async (request) => {
    const q = request.query as Record<string, string | undefined>
    const date = q['date']
    // 可选鉴权：有 token 则解析 userId 填充 completedIds，无 token 跳过
    let userId: number | undefined
    try {
      await request.jwtVerify()
      userId = Number(getUserId(request))
      if (!Number.isFinite(userId)) userId = undefined
    }
    catch {
      // 无 token 或 token 无效，不拒绝，completedIds 留空
      userId = undefined
    }
    const challenge = await puzzleService.getDailyChallenge(date, userId)
    if (!challenge) throw new AppError('GAME_NOT_FOUND', '今日暂无每日挑战', 404)
    return challenge
  })

  // 提交作答（鉴权）
  app.post('/api/v1/puzzles/:id/attempt', { preHandler: [authGuard] }, async (request) => {
    const puzzleId = parsePuzzleId(request)
    const userId = Number(getUserId(request)) // BIGINT-as-string 归一化
    const body = request.body as { answerX?: number, answerY?: number, timeMs?: number } | null
    const answerPos: Pos | null
      = body && typeof body.answerX === 'number' && typeof body.answerY === 'number'
        ? { x: body.answerX, y: body.answerY }
        : null
    const timeMs = typeof body?.timeMs === 'number' ? body.timeMs : 0
    const result = await puzzleService.submitAttempt({ userId, puzzleId, answerPos, timeMs })
    return result
  })

  // 用户最近作答（鉴权）
  app.get('/api/v1/puzzles/my-attempts', { preHandler: [authGuard] }, async (request) => {
    const userId = Number(getUserId(request))
    const q = request.query as Record<string, string | undefined>
    const limit = q['limit'] ? Math.min(50, Math.max(1, Number(q['limit']))) : 10
    const attempts = await puzzleService.listMyAttempts(userId, limit)
    return { attempts }
  })

  // 用户战绩统计（鉴权）
  app.get('/api/v1/puzzles/my-stats', { preHandler: [authGuard] }, async (request) => {
    const userId = Number(getUserId(request))
    const stats = await puzzleService.getMyStats(userId)
    return stats
  })
}

function parsePuzzleId(request: { params: unknown }): number {
  const raw = (request.params as Record<string, string>)['id']
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('VALIDATION_ERROR', '无效的题目 ID', 400)
  }
  return id
}
