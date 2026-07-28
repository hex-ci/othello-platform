/** 棋子/空位状态常量 */
export const T_NONE = 0 as const
export const T_BLACK = 1 as const
export const T_WHITE = 2 as const

export type Cell = typeof T_NONE | typeof T_BLACK | typeof T_WHITE

/** 执子色（对外协议用大写字符串） */
export type Color = 'BLACK' | 'WHITE'

/** 坐标（x 为列, y 为行, 均 0–7） */
export interface Pos {
  readonly x: number
  readonly y: number
}

/** 8 方向向量 [dx, dy] */
export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const

/** 棋盘尺寸 */
export const BOARD_SIZE = 8
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE

/** Color → Cell 映射 */
export function colorToCell(color: Color): typeof T_BLACK | typeof T_WHITE {
  return color === 'BLACK' ? T_BLACK : T_WHITE
}

/** 对手色 */
export function opponent(color: Color): Color {
  return color === 'BLACK' ? 'WHITE' : 'BLACK'
}
