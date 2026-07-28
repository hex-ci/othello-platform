import { describe, it, expect } from 'vitest'
import {
  createInitialBoard,
  think,
  hint,
  legalMoves,
  type AiLevel,
} from '../index.js'

describe('AI 引擎', () => {
  it('L0 返回合法手', async () => {
    const board = createInitialBoard()
    const pos = await think(board, 0, 'BLACK')
    expect(pos).not.toBeNull()
    const moves = legalMoves(board, 'BLACK')
    const set = new Set(moves.map((p) => `${p.x},${p.y}`))
    expect(set.has(`${pos!.x},${pos!.y}`)).toBe(true)
  })

  it('L1 返回合法手', async () => {
    const board = createInitialBoard()
    const pos = await think(board, 1, 'BLACK')
    expect(pos).not.toBeNull()
    const moves = legalMoves(board, 'BLACK')
    const set = new Set(moves.map((p) => `${p.x},${p.y}`))
    expect(set.has(`${pos!.x},${pos!.y}`)).toBe(true)
  })

  it('L3 返回合法手', async () => {
    const board = createInitialBoard()
    const pos = await think(board, 3, 'BLACK')
    expect(pos).not.toBeNull()
    const moves = legalMoves(board, 'BLACK')
    const set = new Set(moves.map((p) => `${p.x},${p.y}`))
    expect(set.has(`${pos!.x},${pos!.y}`)).toBe(true)
  })

  it('无合法手时返回 null', async () => {
    // 满棋盘
    const board = new Uint8Array(64).fill(1)
    const pos = await think(board, 3, 'BLACK')
    expect(pos).toBeNull()
  })

  it('hint 返回合法手', () => {
    const board = createInitialBoard()
    const pos = hint(board, 'BLACK')
    expect(pos).not.toBeNull()
    const moves = legalMoves(board, 'BLACK')
    const set = new Set(moves.map((p) => `${p.x},${p.y}`))
    expect(set.has(`${pos!.x},${pos!.y}`)).toBe(true)
  })

  it('各档难度均能完成一手', async () => {
    const board = createInitialBoard()
    for (const level of [0, 1, 2, 3, 4] as AiLevel[]) {
      const pos = await think(board, level, 'BLACK')
      expect(pos).not.toBeNull()
    }
  })
})
