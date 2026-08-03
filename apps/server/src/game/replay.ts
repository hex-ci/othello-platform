/**
 * 走子序列回放纯函数（T12 悔棋 / T23 崩溃回放共用）。
 * 无 IO 副作用：仅据 moves 重算棋盘与回合，供单测与运行时复用。
 */
import { createInitialBoard, applyMove, type Board, type Color as EngineColor, type Pos as EnginePos } from '@othello-platform/engine'
import type { MoveDTO } from '@othello-platform/shared'

/** 从走子序列重建棋盘与当前回合方 */
export function rebuildBoard(moves: MoveDTO[]): { board: Board, turn: EngineColor } {
  let board = createInitialBoard()
  let turn: EngineColor = 'BLACK'
  for (const m of moves) {
    if (!m.isPass && m.pos) {
      const applied = applyMove(board, m.color as EngineColor, m.pos as EnginePos)
      if (applied) board = applied.board
    }
    turn = m.color === 'BLACK' ? 'WHITE' : 'BLACK'
  }
  return { board, turn }
}
