import {
  T_NONE, T_BLACK, T_WHITE,
  BOARD_SIZE, CELL_COUNT,
  type Cell, type Color, type Pos,
  colorToCell,
} from './constants.js'

/** 棋盘：Uint8Array(64)，索引 = y * 8 + x */
export type Board = Uint8Array

/** Bitboard：两个 bigint 分别表示黑/白占位 */
export interface Bitboard {
  readonly black: bigint
  readonly white: bigint
}

/** pos → 线性索引 */
export function indexOf(pos: Pos): number {
  return pos.y * BOARD_SIZE + pos.x
}

/** 线性索引 → pos */
export function posOf(index: number): Pos {
  return { x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE) }
}

/** 坐标是否在棋盘内 */
export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE
}

/** 读取某格（不可变） */
export function cellAt(board: Board, pos: Pos): Cell {
  return board[indexOf(pos)] as Cell
}

/** 返回设置了某格的新棋盘（不可变） */
export function setCell(board: Board, pos: Pos, cell: Cell): Board {
  const next = board.slice()
  next[indexOf(pos)] = cell
  return next
}

/**
 * 创建初始棋盘：
 * (3,3)=白 (3,4)=黑 (4,3)=黑 (4,4)=白，其余为空，先手为黑。
 */
export function createInitialBoard(): Board {
  const board = new Uint8Array(CELL_COUNT)
  board[indexOf({ x: 3, y: 3 })] = T_WHITE
  board[indexOf({ x: 4, y: 3 })] = T_BLACK
  board[indexOf({ x: 3, y: 4 })] = T_BLACK
  board[indexOf({ x: 4, y: 4 })] = T_WHITE
  return board
}

/** 统计双方子数 */
export function countPieces(board: Board): { black: number; white: number } {
  let black = 0
  let white = 0
  for (let i = 0; i < CELL_COUNT; i++) {
    if (board[i] === T_BLACK) black++
    else if (board[i] === T_WHITE) white++
  }
  return { black, white }
}

/** Board → Bitboard */
export function boardToBitboard(board: Board): Bitboard {
  let black = 0n
  let white = 0n
  for (let i = 0; i < CELL_COUNT; i++) {
    const bit = 1n << BigInt(i)
    if (board[i] === T_BLACK) black |= bit
    else if (board[i] === T_WHITE) white |= bit
  }
  return { black, white }
}

/** Bitboard → Board */
export function bitboardToBoard(bb: Bitboard): Board {
  const board = new Uint8Array(CELL_COUNT)
  for (let i = 0; i < CELL_COUNT; i++) {
    const bit = 1n << BigInt(i)
    if (bb.black & bit) board[i] = T_BLACK
    else if (bb.white & bit) board[i] = T_WHITE
  }
  return board
}

/** 将 color 对应的 bitboard 取出 */
export function ownMask(bb: Bitboard, color: Color): bigint {
  return color === 'BLACK' ? bb.black : bb.white
}

/** 将对手的 bitboard 取出 */
export function oppMask(bb: Bitboard, color: Color): bigint {
  return color === 'BLACK' ? bb.white : bb.black
}

/** 把 color 的 cell 写入 board（用于 applyMove 内部） */
export function applyColorCell(board: Board, pos: Pos, color: Color): void {
  board[indexOf(pos)] = colorToCell(color)
}

export { T_NONE, T_BLACK, T_WHITE }
