/**
 * 标准 Othello 记谱编码/解码（F-E-19）。
 * 格式：列 a-h + 行 1-8，如 `f5d6c3...`；pass 用 `--`。
 * 纯函数，零副作用，可单测。
 *
 * 约定（附录 A 术语表）：记谱 `notation`（如 `f5d6c3…`）。
 * 走子方顺序：黑先白后交替；decode 严格校验字符/长度/交替/合法性。
 */
import { type Color, type Pos, opponent } from './constants.js'
import { createInitialBoard, type Board } from './board.js'
import { legalMoves, applyMove } from './rules.js'

/** 记谱错误 */
export class NotationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotationError'
  }
}

/** 单手走子（记谱用，与 MoveDTO 同构子集） */
export interface NotationMove {
  color: Color
  pos: Pos | null // null = pass
  isPass: boolean
}

const COL_CHARS = 'abcdefgh'
const PASS_TOKEN = '--'

/** Pos → 记谱格子（如 {x:5,y:4} → "f5"） */
export function posToNotation(pos: Pos): string {
  return `${COL_CHARS[pos.x] ?? ''}${pos.y + 1}`
}

/** 记谱格子 → Pos（如 "f5" → {x:5,y:4}）；非法抛 NotationError */
export function notationToPos(token: string): Pos {
  if (token.length !== 2) {
    throw new NotationError(`非法格子记谱: "${token}"（应为 2 字符）`)
  }
  const col = COL_CHARS.indexOf(token[0]!.toLowerCase())
  const row = Number(token[1])
  if (col < 0 || !Number.isInteger(row) || row < 1 || row > 8) {
    throw new NotationError(`非法格子记谱: "${token}"`)
  }
  return { x: col, y: row - 1 }
}

/**
 * 编码走子序列为标准记谱字符串。
 * @param moves 走子序列
 * @returns 如 "f5d6c3--e4"
 */
export function encodeMoves(moves: ReadonlyArray<NotationMove>): string {
  return moves
    .map((m) => {
      if (m.isPass || m.pos === null) return PASS_TOKEN
      return posToNotation(m.pos)
    })
    .join('')
}

/**
 * 解码标准记谱字符串为走子序列。
 * 严格校验：仅 a-h/1-8/`--`、走子方黑先白后交替、每手落子合法（在当前盘面下为合法手）。
 * 非法抛 NotationError。
 * @param notation 如 "f5d6c3--e4"
 */
export function decodeMoves(notation: string): NotationMove[] {
  if (typeof notation !== 'string') {
    throw new NotationError('记谱必须为字符串')
  }
  const trimmed = notation.trim()
  if (trimmed.length === 0) return []

  const result: NotationMove[] = []
  let board: Board = createInitialBoard()
  let color: Color = 'BLACK'
  let i = 0

  while (i < trimmed.length) {
    const two = trimmed.slice(i, i + 2)
    // pass token
    if (two === PASS_TOKEN) {
      // pass 必须是当前方确实无合法手
      if (legalMoves(board, color).length > 0) {
        throw new NotationError(`第 ${result.length + 1} 手: 当前方有合法手，不可 pass`)
      }
      result.push({ color, pos: null, isPass: true })
      color = opponent(color)
      i += 2
      continue
    }

    // 普通格子：2 字符
    if (i + 2 > trimmed.length) {
      throw new NotationError(`记谱末尾不完整: "${trimmed.slice(i)}"`)
    }
    let pos: Pos
    try {
      pos = notationToPos(two)
    } catch (err) {
      throw new NotationError(`第 ${result.length + 1} 手: ${(err as Error).message}`)
    }

    // 校验落子合法
    const legal = legalMoves(board, color)
    const isLegal = legal.some((p) => p.x === pos.x && p.y === pos.y)
    if (!isLegal) {
      throw new NotationError(`第 ${result.length + 1} 手: ${two} 不是 ${color} 方的合法落子`)
    }

    const applied = applyMove(board, color, pos)
    if (applied === null) {
      throw new NotationError(`第 ${result.length + 1} 手: ${two} 落子失败`)
    }
    result.push({ color, pos, isPass: false })
    board = applied.board
    color = opponent(color)
    i += 2
  }

  return result
}

/** 校验记谱是否合法（不抛异常，返回 true/false） */
export function isValidNotation(notation: string): boolean {
  try {
    decodeMoves(notation)
    return true
  } catch {
    return false
  }
}