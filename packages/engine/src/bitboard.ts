/**
 * Bitboard 位运算实现。
 * 索引 i = y * 8 + x，bit i 对应 1n << BigInt(i)。
 * 使用 64 位掩码防止位移溢出。
 */

const FULL = 0xFFFF_FFFF_FFFF_FFFFn

/** 非 A 列（x≠0）掩码，用于防止左移绕列 */
const NOT_A_FILE = 0xFEFE_FEFE_FEFE_FEFEn
/** 非 H 列（x≠7）掩码，用于防止右移绕列 */
const NOT_H_FILE = 0x7F7F_7F7F_7F7F_7F7Fn

/** 8 方向的位移量与对应列掩码（掩码排除源位中会绕列的列） */
const SHIFTS: readonly { shift: bigint, mask: bigint }[] = [
  { shift: 1n, mask: NOT_H_FILE }, // 东 (x+1)：排除 H 列防绕到 A 列
  { shift: -1n, mask: NOT_A_FILE }, // 西 (x-1)：排除 A 列防绕到 H 列
  { shift: 8n, mask: FULL }, // 南 (y+1)
  { shift: -8n, mask: FULL }, // 北 (y-1)
  { shift: 9n, mask: NOT_H_FILE }, // 东南：含东，排除 H 列
  { shift: 7n, mask: NOT_A_FILE }, // 西南：含西，排除 A 列
  { shift: -7n, mask: NOT_H_FILE }, // 东北：含东，排除 H 列
  { shift: -9n, mask: NOT_A_FILE }, // 西北：含西，排除 A 列
]

function shiftDir(bits: bigint, shift: bigint, mask: bigint): bigint {
  const masked = bits & mask
  return shift > 0n ? (masked << shift) & FULL : masked >> -shift
}

/**
 * 计算某方的所有合法落子位（bitboard）。
 * 沿 8 方向扫描：从己方子出发，经过连续对方子后到达的空位即合法。
 */
export function legalMovesBB(own: bigint, opp: bigint): bigint {
  const empty = ~(own | opp) & FULL
  let moves = 0n

  for (const { shift, mask } of SHIFTS) {
    // 从己方子出发，沿方向找紧邻的对方子
    let candidates = shiftDir(own, shift, mask) & opp
    // 继续延伸连续的对方子
    candidates |= shiftDir(candidates, shift, mask) & opp
    candidates |= shiftDir(candidates, shift, mask) & opp
    candidates |= shiftDir(candidates, shift, mask) & opp
    candidates |= shiftDir(candidates, shift, mask) & opp
    candidates |= shiftDir(candidates, shift, mask) & opp
    // 对方子序列末端必须是空位
    moves |= shiftDir(candidates, shift, mask) & empty
  }

  return moves
}

/**
 * 计算在 pos 落子后被翻转的对方子（bitboard）。
 * 返回 0n 表示该位置不合法（无翻子）。
 */
export function flippedBB(own: bigint, opp: bigint, posBit: bigint): bigint {
  let flipped = 0n

  for (const { shift, mask } of SHIFTS) {
    let line = 0n
    let cur = shiftDir(posBit, shift, mask) & opp
    while (cur !== 0n) {
      line |= cur
      cur = shiftDir(cur, shift, mask)
      if (cur & own) {
        flipped |= line
        break
      }
      cur &= opp
    }
  }

  return flipped
}

/**
 * 执行落子：返回新的 own/opp 与 flipped。
 * 调用方须先确认 posBit 是合法手。
 */
export function applyMoveBB(
  own: bigint,
  opp: bigint,
  posBit: bigint,
): { own: bigint, opp: bigint, flipped: bigint } {
  const flipped = flippedBB(own, opp, posBit)
  const newOwn = own | posBit | flipped
  const newOpp = opp & ~flipped
  return { own: newOwn, opp: newOpp, flipped }
}

/** 统计 bitboard 中的位数（popcount） */
export function popcount(bits: bigint): number {
  let count = 0
  let b = bits
  while (b !== 0n) {
    b &= b - 1n
    count++
  }
  return count
}

/** 将 bitboard 转为 Pos 数组 */
export function bitsToPositions(bits: bigint): { x: number, y: number }[] {
  const positions: { x: number, y: number }[] = []
  let b = bits
  while (b !== 0n) {
    const lsb = b & -b
    const index = Number(log2Big(lsb))
    positions.push({ x: index % 8, y: Math.floor(index / 8) })
    b ^= lsb
  }
  return positions
}

/** 计算 bigint 的 log2（即最高位索引） */
function log2Big(n: bigint): bigint {
  let result = 0n
  let v = n
  while (v > 1n) {
    v >>= 1n
    result++
  }
  return result
}
