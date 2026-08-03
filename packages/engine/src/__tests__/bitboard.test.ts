import { describe, it, expect } from 'vitest'
import {
  legalMovesBB,
  flippedBB,
  applyMoveBB,
  popcount,
  bitsToPositions,
  boardToBitboard,
  createInitialBoard,
  ownMask,
  oppMask,
} from '../index.js'

describe('Bitboard 位运算', () => {
  it('初盘黑方合法手 = 4', () => {
    const bb = boardToBitboard(createInitialBoard())
    const moves = legalMovesBB(ownMask(bb, 'BLACK'), oppMask(bb, 'BLACK'))
    expect(popcount(moves)).toBe(4)
  })

  it('初盘白方合法手 = 4', () => {
    const bb = boardToBitboard(createInitialBoard())
    const moves = legalMovesBB(ownMask(bb, 'WHITE'), oppMask(bb, 'WHITE'))
    expect(popcount(moves)).toBe(4)
  })

  it('初盘黑方合法手位置正确', () => {
    const bb = boardToBitboard(createInitialBoard())
    const moves = legalMovesBB(ownMask(bb, 'BLACK'), oppMask(bb, 'BLACK'))
    const positions = bitsToPositions(moves)
    const set = new Set(positions.map(p => `${p.x},${p.y}`))
    expect(set.has('2,3')).toBe(true)
    expect(set.has('3,2')).toBe(true)
    expect(set.has('4,5')).toBe(true)
    expect(set.has('5,4')).toBe(true)
  })

  it('flippedBB：黑 (2,3) 翻 (3,3)', () => {
    const bb = boardToBitboard(createInitialBoard())
    const own = ownMask(bb, 'BLACK')
    const opp = oppMask(bb, 'BLACK')
    const posBit = 1n << BigInt(3 * 8 + 2) // (2,3)
    const flipped = flippedBB(own, opp, posBit)
    expect(popcount(flipped)).toBe(1)
    const positions = bitsToPositions(flipped)
    expect(positions[0]).toEqual({ x: 3, y: 3 })
  })

  it('flippedBB：无翻子位置返回 0n', () => {
    const bb = boardToBitboard(createInitialBoard())
    const own = ownMask(bb, 'BLACK')
    const opp = oppMask(bb, 'BLACK')
    const posBit = 1n << BigInt(0) // (0,0) 无翻子
    expect(flippedBB(own, opp, posBit)).toBe(0n)
  })

  it('applyMoveBB：黑 (2,3) 后黑=4 白=1', () => {
    const bb = boardToBitboard(createInitialBoard())
    const own = ownMask(bb, 'BLACK')
    const opp = oppMask(bb, 'BLACK')
    const posBit = 1n << BigInt(3 * 8 + 2)
    const result = applyMoveBB(own, opp, posBit)
    expect(popcount(result.own)).toBe(4)
    expect(popcount(result.opp)).toBe(1)
  })

  it('popcount 基本', () => {
    expect(popcount(0n)).toBe(0)
    expect(popcount(1n)).toBe(1)
    expect(popcount(0xFFn)).toBe(8)
    expect(popcount(0xFFFF_FFFF_FFFF_FFFFn)).toBe(64)
  })

  it('bitsToPositions 空', () => {
    expect(bitsToPositions(0n)).toEqual([])
  })

  it('bitsToPositions 单位', () => {
    const positions = bitsToPositions(1n << BigInt(9)) // (1,1)
    expect(positions).toEqual([{ x: 1, y: 1 }])
  })

  it('不绕列：A 列左侧不产生合法手', () => {
    // 只在 (0,3)=黑 (1,3)=白 放子，黑不应在 (2,3) 以外有来自西侧的合法手
    // 构造：白在 (1,3)，黑在 (0,3)，黑合法手不应包含绕列位置
    const board = new Uint8Array(64)
    board[3 * 8 + 0] = 1 // 黑 (0,3)
    board[3 * 8 + 1] = 2 // 白 (1,3)
    const bb = boardToBitboard(board)
    const moves = legalMovesBB(bb.black, bb.white)
    const positions = bitsToPositions(moves)
    // 黑应在 (2,3) 有合法手（东方向翻白）
    expect(positions.some(p => p.x === 2 && p.y === 3)).toBe(true)
    // 不应有 x<0 或 x>7 的位置
    for (const p of positions) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(7)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(7)
    }
  })
})
