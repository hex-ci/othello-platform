import { describe, it, expect } from 'vitest'
import {
  createInitialBoard,
  boardToBitboard,
  bitboardToBoard,
  cellAt,
  setCell,
  indexOf,
  posOf,
  inBounds,
  countPieces,
  T_NONE,
  T_BLACK,
  T_WHITE,
} from '../index.js'

describe('Board 操作', () => {
  it('indexOf / posOf 往返一致', () => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const idx = indexOf({ x, y })
        expect(idx).toBe(y * 8 + x)
        expect(posOf(idx)).toEqual({ x, y })
      }
    }
  })

  it('inBounds 边界检测', () => {
    expect(inBounds(0, 0)).toBe(true)
    expect(inBounds(7, 7)).toBe(true)
    expect(inBounds(-1, 0)).toBe(false)
    expect(inBounds(8, 0)).toBe(false)
    expect(inBounds(0, -1)).toBe(false)
    expect(inBounds(0, 8)).toBe(false)
  })

  it('cellAt 读取正确', () => {
    const board = createInitialBoard()
    expect(cellAt(board, { x: 3, y: 3 })).toBe(T_WHITE)
    expect(cellAt(board, { x: 0, y: 0 })).toBe(T_NONE)
  })

  it('setCell 返回新棋盘，不改原棋盘', () => {
    const board = createInitialBoard()
    const newBoard = setCell(board, { x: 0, y: 0 }, T_BLACK)
    expect(cellAt(newBoard, { x: 0, y: 0 })).toBe(T_BLACK)
    expect(cellAt(board, { x: 0, y: 0 })).toBe(T_NONE)
  })

  it('countPieces 初盘 2黑2白', () => {
    const { black, white } = countPieces(createInitialBoard())
    expect(black).toBe(2)
    expect(white).toBe(2)
  })
})

describe('Board ↔ Bitboard 转换', () => {
  it('初盘往返一致', () => {
    const board = createInitialBoard()
    const bb = boardToBitboard(board)
    const restored = bitboardToBoard(bb)
    expect(restored).toEqual(board)
  })

  it('空棋盘往返一致', () => {
    const board = new Uint8Array(64)
    const bb = boardToBitboard(board)
    expect(bb.black).toBe(0n)
    expect(bb.white).toBe(0n)
    expect(bitboardToBoard(bb)).toEqual(board)
  })

  it('满棋盘往返一致', () => {
    const board = new Uint8Array(64)
    for (let i = 0; i < 64; i++) {
      board[i] = i % 2 === 0 ? T_BLACK : T_WHITE
    }
    const bb = boardToBitboard(board)
    expect(bitboardToBoard(bb)).toEqual(board)
  })

  it('bitboard 位数正确', () => {
    const bb = boardToBitboard(createInitialBoard())
    let blackCount = 0
    let whiteCount = 0
    let b = bb.black
    while (b) {
      b &= b - 1n
      blackCount++
    }
    let w = bb.white
    while (w) {
      w &= w - 1n
      whiteCount++
    }
    expect(blackCount).toBe(2)
    expect(whiteCount).toBe(2)
  })
})
