/**
 * NegaScout α-β 搜索（纯函数，bitboard 加速）。
 * 支持：走法排序、置换表（L4+）、残局穷举（≤12 空格）、近终局启发（≤14 空格）。
 */
import { type Color, opponent } from './constants.js'
import {
  type Board,
  boardToBitboard,
} from './board.js'
import { legalMovesBB, applyMoveBB, popcount, bitsToPositions } from './bitboard.js'
import { POSITION_WEIGHTS } from './weights.js'

const FULL = 0xFFFF_FFFF_FFFF_FFFFn
const INF = 1_000_000

/** 置换表条目 */
interface TTEntry {
  depth: number
  score: number
  flag: 'exact' | 'lower' | 'upper'
}

/** 搜索配置 */
export interface SearchConfig {
  maxDepth: number
  useTT: boolean
  useEndgame: boolean
  useNearEndgame: boolean
  useMoveOrdering: boolean
  timeLimitMs: number
}

/** 搜索结果 */
export interface SearchResult {
  posIndex: number
  score: number
}

let aborted = false

export function abortSearch(): void {
  aborted = true
}

export function resetAbort(): void {
  aborted = false
}

/**
 * 评估函数（静态）。
 * 正值对 color 有利。
 */
function evaluate(ownBB: bigint, oppBB: bigint, _color: Color): number {
  const empties = ~(ownBB | oppBB) & FULL
  const emptyCount = popcount(empties)

  // 子数差（近终局权重更大）
  const ownCount = popcount(ownBB)
  const oppCount = popcount(oppBB)
  const diff = ownCount - oppCount

  // 位置权重
  let posScore = 0
  let own = ownBB
  while (own !== 0n) {
    const lsb = own & -own
    const idx = Number(log2(lsb))
    posScore += POSITION_WEIGHTS[idx] ?? 0
    own ^= lsb
  }
  let opp = oppBB
  while (opp !== 0n) {
    const lsb = opp & -opp
    const idx = Number(log2(lsb))
    posScore -= POSITION_WEIGHTS[idx] ?? 0
    opp ^= lsb
  }

  // 行动力（合法手数差）
  const ownMoves = popcount(legalMovesBB(ownBB, oppBB))
  const oppMoves = popcount(legalMovesBB(oppBB, ownBB))
  const mobility = ownMoves - oppMoves

  // 终局：纯子数差（放大）
  if (emptyCount === 0) {
    return diff > 0 ? INF - 1 : diff < 0 ? -(INF - 1) : 0
  }

  // 近终局（≤14 空格）：子数差权重增大
  if (emptyCount <= 14) {
    return diff * 50 + posScore + mobility * 5
  }

  // 常规：位置 + 行动力为主
  return posScore + mobility * 10 + diff * 2
}

function log2(n: bigint): bigint {
  let r = 0n
  let v = n
  while (v > 1n) { v >>= 1n; r++ }
  return r
}

/** 走法排序：按位置权重降序 */
function orderMoves(moveBits: bigint): number[] {
  const indices: number[] = []
  let b = moveBits
  while (b !== 0n) {
    const lsb = b & -b
    indices.push(Number(log2(lsb)))
    b ^= lsb
  }
  indices.sort((a, b) => (POSITION_WEIGHTS[b] ?? 0) - (POSITION_WEIGHTS[a] ?? 0))
  return indices
}

/**
 * 残局穷举（精确解）。
 * 返回当前方（color）视角的精确分差（正 = 己方多子）。
 */
function solveEndgame(
  ownBB: bigint,
  oppBB: bigint,
  color: Color,
  tt: Map<string, TTEntry> | null,
): number {
  if (aborted) return 0

  const empties = ~(ownBB | oppBB) & FULL
  if (empties === 0n) {
    const diff = popcount(ownBB) - popcount(oppBB)
    return diff > 0 ? INF - 1 : diff < 0 ? -(INF - 1) : 0
  }

  const key = `${ownBB.toString(36)}:${oppBB.toString(36)}`
  if (tt) {
    const entry = tt.get(key)
    if (entry) return entry.score
  }

  const moves = legalMovesBB(ownBB, oppBB)
  let best: number

  if (moves === 0n) {
    // 己方无手 → pass，对手走
    const oppColor = opponent(color)
    best = -solveEndgame(oppBB, ownBB, oppColor, tt)
  } else {
    best = -INF
    let b = moves
    while (b !== 0n) {
      const lsb = b & -b
      const result = applyMoveBB(ownBB, oppBB, lsb)
      const oppColor = opponent(color)
      const score = -solveEndgame(result.opp, result.own, oppColor, tt)
      if (score > best) best = score
      if (aborted) break
      b ^= lsb
    }
  }

  if (tt) tt.set(key, { depth: 64, score: best, flag: 'exact' })
  return best
}

/**
 * NegaScout 搜索。
 * 返回 color 视角的评分（正 = 有利）。
 */
function negascout(
  ownBB: bigint,
  oppBB: bigint,
  color: Color,
  depth: number,
  alpha: number,
  beta: number,
  config: SearchConfig,
  tt: Map<string, TTEntry> | null,
): number {
  if (aborted) return 0

  const empties = ~(ownBB | oppBB) & FULL
  const emptyCount = popcount(empties)

  // 终局
  if (emptyCount === 0) {
    const diff = popcount(ownBB) - popcount(oppBB)
    return diff > 0 ? INF - 1 : diff < 0 ? -(INF - 1) : 0
  }

  // 残局穷举
  if (config.useEndgame && emptyCount <= 12) {
    return solveEndgame(ownBB, oppBB, color, tt)
  }

  // 叶子节点
  if (depth <= 0) {
    return evaluate(ownBB, oppBB, color)
  }

  // 置换表查询
  const key = `${ownBB.toString(36)}:${oppBB.toString(36)}:${color}`
  if (tt && config.useTT) {
    const entry = tt.get(key)
    if (entry && entry.depth >= depth) {
      if (entry.flag === 'exact') return entry.score
      if (entry.flag === 'lower' && entry.score > alpha) alpha = entry.score
      if (entry.flag === 'upper' && entry.score < beta) beta = entry.score
      if (alpha >= beta) return entry.score
    }
  }

  const moves = legalMovesBB(ownBB, oppBB)
  const oppColor = opponent(color)

  // 无手 → pass
  if (moves === 0n) {
    return -negascout(oppBB, ownBB, oppColor, depth - 1, -beta, -alpha, config, tt)
  }

  const orderedIndices = config.useMoveOrdering
    ? orderMoves(moves)
    : bitsToPositions(moves).map((p) => p.y * 8 + p.x)

  let best = -INF
  let flag: 'exact' | 'lower' | 'upper' = 'upper'
  let searchFull = true

  for (const idx of orderedIndices) {
    if (aborted) break
    const posBit = 1n << BigInt(idx)
    const result = applyMoveBB(ownBB, oppBB, posBit)

    let score: number
    if (searchFull) {
      score = -negascout(result.opp, result.own, oppColor, depth - 1, -beta, -alpha, config, tt)
    } else {
      // 零窗口搜索
      score = -negascout(result.opp, result.own, oppColor, depth - 1, -alpha - 1, -alpha, config, tt)
      if (score > alpha && score < beta) {
        // 重新搜索
        score = -negascout(result.opp, result.own, oppColor, depth - 1, -beta, -score, config, tt)
      }
    }

    if (score > best) {
      best = score
      if (score > alpha) {
        alpha = score
        flag = 'exact'
        if (alpha >= beta) {
          flag = 'lower'
          break
        }
      }
    }

    searchFull = false
  }

  if (tt && config.useTT) {
    tt.set(key, { depth, score: best, flag })
  }

  return best
}

/**
 * 搜索最佳着法。
 * @param board 当前棋盘
 * @param color 当前执子方
 * @param config 搜索配置
 * @returns 最佳落子索引（0-63）和评分，无合法手返回 null
 */
export function search(
  board: Board,
  color: Color,
  config: SearchConfig,
): SearchResult | null {
  resetAbort()
  const startTime = Date.now()

  const bb = boardToBitboard(board)
  const own = color === 'BLACK' ? bb.black : bb.white
  const opp = color === 'BLACK' ? bb.white : bb.black

  const moves = legalMovesBB(own, opp)
  if (moves === 0n) return null

  const tt: Map<string, TTEntry> | null = config.useTT ? new Map() : null
  const orderedIndices = config.useMoveOrdering
    ? orderMoves(moves)
    : bitsToPositions(moves).map((p) => p.y * 8 + p.x)

  let bestIndex = orderedIndices[0] ?? 0
  let bestScore = -INF

  // 迭代加深
  for (let depth = 1; depth <= config.maxDepth; depth++) {
    if (aborted) break
    if (Date.now() - startTime > config.timeLimitMs) break

    let alpha = -INF
    let currentBest = orderedIndices[0] ?? 0
    let currentBestScore = -INF

    for (const idx of orderedIndices) {
      if (aborted || Date.now() - startTime > config.timeLimitMs) break
      const posBit = 1n << BigInt(idx)
      const result = applyMoveBB(own, opp, posBit)
      const oppColor = opponent(color)
      const score = -negascout(
        result.opp, result.own, oppColor,
        depth - 1, -INF, -alpha, config, tt,
      )
      if (score > currentBestScore) {
        currentBestScore = score
        currentBest = idx
      }
      if (score > alpha) alpha = score
    }

    bestIndex = currentBest
    bestScore = currentBestScore
  }

  return { posIndex: bestIndex, score: bestScore }
}
