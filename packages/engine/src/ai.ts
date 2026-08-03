/**
 * AI 对外接口：think(board, level, color) / stop()。
 * L0 热身（随机，不计分）→ L5 专家。
 * 纯 TS 实现，后续可迁移 WASM。
 */
import { type Board } from './board.js'
import { type Color, type Pos } from './constants.js'
import { legalMoves } from './rules.js'
import { search, abortSearch, type SearchConfig } from './negascout.js'

/** AI 难度档（0-5） */
export type AiLevel = 0 | 1 | 2 | 3 | 4 | 5

/** 各档搜索配置 */
const LEVEL_CONFIGS: Record<AiLevel, SearchConfig> = {
  // L0 热身：随机合法手
  0: { maxDepth: 0, useTT: false, useEndgame: false, useNearEndgame: false, useMoveOrdering: false, timeLimitMs: 100 },
  // L1 入门：深度 1 + 概率选次优
  1: { maxDepth: 1, useTT: false, useEndgame: false, useNearEndgame: false, useMoveOrdering: false, timeLimitMs: 200 },
  // L2 简单：深度 2
  2: { maxDepth: 2, useTT: false, useEndgame: false, useNearEndgame: false, useMoveOrdering: false, timeLimitMs: 500 },
  // L3 中等（默认）：深度 4 + 近终局 + 排序
  3: { maxDepth: 4, useTT: false, useEndgame: false, useNearEndgame: true, useMoveOrdering: true, timeLimitMs: 1000 },
  // L4 困难：深度 6 + 残局 + 置换表
  4: { maxDepth: 6, useTT: true, useEndgame: true, useNearEndgame: true, useMoveOrdering: true, timeLimitMs: 2000 },
  // L5 专家：深度 10 全特性
  5: { maxDepth: 10, useTT: true, useEndgame: true, useNearEndgame: true, useMoveOrdering: true, timeLimitMs: 3000 },
}

/** 默认难度 */
export const DEFAULT_AI_LEVEL: AiLevel = 3

/**
 * AI 思考，返回最佳落子。
 * L0 随机选合法手；L1 有概率选次优；L2+ 走 NegaScout。
 */
export async function think(board: Board, level: AiLevel, color: Color): Promise<Pos | null> {
  const moves = legalMoves(board, color)
  if (moves.length === 0) return null

  // L0：纯随机
  if (level === 0) {
    return moves[Math.floor(Math.random() * moves.length)] ?? null
  }

  // L1：深度 1 搜索，30% 概率选次优
  if (level === 1) {
    const config = LEVEL_CONFIGS[1]
    const result = search(board, color, config)
    if (!result) return moves[0] ?? null
    if (Math.random() < 0.3 && moves.length > 1) {
      // 随机选一个非最优的
      const bestIdx = result.posIndex
      const others = moves.filter(p => p.y * 8 + p.x !== bestIdx)
      return others[Math.floor(Math.random() * others.length)] ?? moves[0] ?? null
    }
    return { x: result.posIndex % 8, y: Math.floor(result.posIndex / 8) }
  }

  // L2+：NegaScout 搜索
  const config = LEVEL_CONFIGS[level]
  const result = search(board, color, config)
  if (!result) return moves[0] ?? null
  return { x: result.posIndex % 8, y: Math.floor(result.posIndex / 8) }
}

/** 中断当前搜索 */
export function stop(): void {
  abortSearch()
}

/**
 * 获取提示（hint）：返回当前局面的最佳合法手。
 * 复用 L3 配置搜索。
 */
export function hint(board: Board, color: Color): Pos | null {
  const moves = legalMoves(board, color)
  if (moves.length === 0) return null
  const config = LEVEL_CONFIGS[3]
  const result = search(board, color, config)
  if (!result) return moves[0] ?? null
  return { x: result.posIndex % 8, y: Math.floor(result.posIndex / 8) }
}
