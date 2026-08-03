/**
 * 规则引擎公共 API。
 * 全部为纯函数：同输入同输出，不持有对局状态。
 * 内部走 bitboard 加速，对外暴露 Board(Uint8Array) + Pos 接口。
 */
import {
  type Color, type Pos,
  opponent,
} from './constants.js'
import {
  type Board,
  type Bitboard,
  createInitialBoard,
  boardToBitboard,
  bitboardToBoard,
  countPieces,
  indexOf,
  inBounds,
  ownMask,
  oppMask,
} from './board.js'
import {
  legalMovesBB,
  flippedBB,
  applyMoveBB,
  bitsToPositions,
  popcount,
} from './bitboard.js'

export type { Board, Bitboard }
export { createInitialBoard, countPieces }

/** 对局结果 */
export type GameResult = 'BLACK' | 'WHITE' | 'DRAW'

/**
 * 枚举某方的所有合法落子。
 * 初盘黑方应恰好返回 (2,3)(3,2)(4,5)(5,4) 四个点。
 */
export function legalMoves(board: Board, color: Color): Pos[] {
  const bb = boardToBitboard(board)
  const moves = legalMovesBB(ownMask(bb, color), oppMask(bb, color))
  return bitsToPositions(moves)
}

/** 某方是否有合法手 */
export function hasLegalMove(board: Board, color: Color): boolean {
  const bb = boardToBitboard(board)
  return legalMovesBB(ownMask(bb, color), oppMask(bb, color)) !== 0n
}

/**
 * 落子并翻子，返回新棋盘与被翻子列表（纯函数，不改原棋盘）。
 * 若该位置非法（无翻子），返回 null。
 */
export function applyMove(
  board: Board,
  color: Color,
  pos: Pos,
): { board: Board, flipped: Pos[] } | null {
  if (!inBounds(pos.x, pos.y)) return null
  if (board[indexOf(pos)] !== 0) return null

  const bb = boardToBitboard(board)
  const own = ownMask(bb, color)
  const opp = oppMask(bb, color)
  const posBit = 1n << BigInt(indexOf(pos))

  const flipped = flippedBB(own, opp, posBit)
  if (flipped === 0n) return null

  const result = applyMoveBB(own, opp, posBit)
  const newBB: Bitboard
    = color === 'BLACK'
      ? { black: result.own, white: result.opp }
      : { black: result.opp, white: result.own }

  return {
    board: bitboardToBoard(newBB),
    flipped: bitsToPositions(flipped),
  }
}

/**
 * 是否终局：双方均无合法手。
 */
export function isGameOver(board: Board): boolean {
  return !hasLegalMove(board, 'BLACK') && !hasLegalMove(board, 'WHITE')
}

/**
 * 终局比子，返回胜方或平局。
 */
export function getResult(board: Board): GameResult {
  const { black, white } = countPieces(board)
  if (black > white) return 'BLACK'
  if (white > black) return 'WHITE'
  return 'DRAW'
}

/**
 * 计算下一回合：若对手有手则换手，否则仍为己方（对手 pass）。
 * 双方均无手时返回 null（终局）。
 */
export function nextTurn(board: Board, current: Color): Color | null {
  const opp = opponent(current)
  if (hasLegalMove(board, opp)) return opp
  if (hasLegalMove(board, current)) return current
  return null
}

/** 统计 bitboard 位数（导出供外部使用） */
export { popcount }
