/**
 * 观战逻辑（T14，F-E-05/10）。
 * 从 room-manager.ts 提取，操作传入的共享状态。
 */
import type { FastifyInstance } from 'fastify'
import type { ConnectionHub } from '../ws/hub.js'
import * as gameService from '../services/game-service.js'
import { gameIdToNumber } from '@othello-platform/shared'
import type { ActiveGame } from './room-types.js'
import { usernameOf } from './room-utils.js'

/** 观战加入（只读订阅）：立即下发当前棋盘快照，后续随广播收走子 */
export async function spectateJoin(
  app: FastifyInstance,
  hub: ConnectionHub,
  games: Map<string, ActiveGame>,
  userId: number,
  gameId: string,
): Promise<void> {
  const active = games.get(gameId)
  if (!active) {
    hub.sendToUser(userId, 'error', { code: 'GAME_NOT_FOUND', msg: '对局不存在或已结束' })
    return
  }
  const { runtime } = active
  if (runtime.colorOf(userId) !== null) {
    hub.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '对局玩家无需观战' })
    return
  }
  active.spectators.add(userId)

  const gameNumId = gameIdToNumber(gameId)
  const moves = gameNumId !== null ? await gameService.getGameMovesSince(gameNumId, 0) : []
  const { blackCount, whiteCount } = runtime.counts()
  hub.sendToUser(userId, 'spectate_start', {
    gameId,
    turn: runtime.turn,
    board: Array.from(runtime.board),
    blackCount,
    whiteCount,
    blackId: runtime.config.black.userId,
    whiteId: runtime.config.white.userId,
    blackName: runtime.config.black.isAi
      ? 'AI'
      : await usernameOf(runtime.config.black.userId),
    whiteName: runtime.config.white.isAi
      ? 'AI'
      : await usernameOf(runtime.config.white.userId),
    remainingMs: active.timer.remainingMs(),
    status: runtime.status,
    spectatorCount: active.spectators.size,
    moves: moves.map(m => ({
      seq: m.seq,
      color: m.color,
      pos: m.pos,
      isPass: m.isPass,
      flipped: m.flipped,
    })),
  })
  app.log.info({ userId, gameId, spectators: active.spectators.size }, '观战者加入')
}

/** 观战离开 */
export function spectateLeave(
  app: FastifyInstance,
  games: Map<string, ActiveGame>,
  userId: number,
  gameId: string,
): void {
  const active = games.get(gameId)
  if (!active) return
  active.spectators.delete(userId)
  app.log.info({ userId, gameId, spectators: active.spectators.size }, '观战者离开')
}

/** 观战大厅：列出进行中对局（F-E-10） */
export async function listActiveGames(
  games: Map<string, ActiveGame>,
): Promise<
  {
    gameId: string
    blackId: number | null
    whiteId: number | null
    blackName: string | null
    whiteName: string | null
    blackCount: number
    whiteCount: number
    moveCount: number
    spectatorCount: number
  }[]
> {
  const result: {
    gameId: string
    blackId: number | null
    whiteId: number | null
    blackName: string | null
    whiteName: string | null
    blackCount: number
    whiteCount: number
    moveCount: number
    spectatorCount: number
  }[] = []
  for (const active of games.values()) {
    const rt = active.runtime
    if (rt.status !== 'playing') continue
    if (rt.config.mode === 'human_vs_ai') continue
    const { blackCount, whiteCount } = rt.counts()
    result.push({
      gameId: rt.gameId,
      blackId: rt.config.black.userId,
      whiteId: rt.config.white.userId,
      blackName: rt.config.black.isAi ? 'AI' : await usernameOf(rt.config.black.userId),
      whiteName: rt.config.white.isAi ? 'AI' : await usernameOf(rt.config.white.userId),
      blackCount,
      whiteCount,
      moveCount: rt.seq,
      spectatorCount: active.spectators.size,
    })
  }
  return result
}
