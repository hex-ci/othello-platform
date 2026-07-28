/**
 * 崩溃回放纯函数单测（T23 §6.1）。
 * 验证 rebuildBoard 回放走子序列与 GameRuntime 直接落子产生等价 board/turn。
 */
import { describe, test, expect } from 'vitest'
import { rebuildBoard } from '../game/replay.js'
import { GameRuntime } from '../game/game-runtime.js'
import { legalMoves } from '@othello-platform/engine'
import type { MoveDTO } from '@othello-platform/shared'

/** 用 GameRuntime 直接落子 n 手（每手取首个合法手），收集 MoveDTO 序列 */
function playLegalMoves(count: number): { moves: MoveDTO[]; runtime: GameRuntime } {
  const rt = new GameRuntime({
    gameId: 'g_test',
    roomId: 1,
    mode: 'human_vs_human',
    black: { userId: 1, isAi: false },
    white: { userId: 2, isAi: false },
    aiLevel: null,
    aiColor: null,
  })
  const moves: MoveDTO[] = []
  for (let i = 0; i < count; i++) {
    const color = rt.turn
    const legal = legalMoves(rt.board, color)
    const pos = legal[0]
    if (!pos) break
    const res = rt.tryMove(color, pos)
    if (!res.ok) throw new Error(`tryMove failed at ${JSON.stringify(pos)}: ${res.code}`)
    moves.push({ seq: res.seq, color, pos, isPass: false, flipped: res.flipped })
  }
  return { moves, runtime: rt }
}

describe('rebuildBoard 崩溃回放等价性（T23）', () => {
  test('空序列 → 初盘 BLACK 先手', () => {
    const { board, turn } = rebuildBoard([])
    const rt = new GameRuntime({
      gameId: 'g', roomId: null, mode: 'human_vs_human',
      black: { userId: 1, isAi: false }, white: { userId: 2, isAi: false },
      aiLevel: null, aiColor: null,
    })
    expect(Array.from(board)).toEqual(Array.from(rt.board))
    expect(turn).toBe(rt.turn)
  })

  test('单手回放与直接落子等价', () => {
    const { moves, runtime } = playLegalMoves(1)
    const { board, turn } = rebuildBoard(moves)
    expect(Array.from(board)).toEqual(Array.from(runtime.board))
    expect(turn).toBe(runtime.turn)
  })

  test('多手序列（6 手）回放等价', () => {
    const { moves, runtime } = playLegalMoves(6)
    expect(moves.length).toBe(6)
    const { board, turn } = rebuildBoard(moves)
    expect(Array.from(board)).toEqual(Array.from(runtime.board))
    expect(turn).toBe(runtime.turn)
    expect(runtime.seq).toBe(6)
  })

  test('pass 手不影响棋盘仅切换回合', () => {
    const moves: MoveDTO[] = [
      { seq: 1, color: 'BLACK', pos: { x: 2, y: 3 }, isPass: false, flipped: [{ x: 3, y: 3 }] },
      { seq: 2, color: 'WHITE', pos: null, isPass: true, flipped: [] },
    ]
    const { board, turn } = rebuildBoard(moves)
    // pass 后轮到 BLACK（WHITE pass → 回到 BLACK）
    expect(turn).toBe('BLACK')
    // 棋盘只应用了第一手
    const first = moves[0]
    if (!first) throw new Error('moves[0] missing')
    const { board: boardAfterOne } = rebuildBoard([first])
    expect(Array.from(board)).toEqual(Array.from(boardAfterOne))
  })
})
