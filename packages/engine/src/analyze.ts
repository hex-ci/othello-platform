/**
 * 复盘逐手分析（T20，F-E-09 增强）。
 * 纯函数：给定走子序列，对每一手用 NegaScout（中档深度）评估，
 * 产出归一化评估值（黑方视角 [-1,+1]）、AI 建议着法、与最佳手的分差、
 * 好/妙/失误分类，以及对局总结统计。
 *
 * 零副作用、无 IO，可单测，可前后端共用。
 */
import { type Color, type Pos, opponent } from './constants.js'
import { createInitialBoard, type Board } from './board.js'
import { applyMove, legalMoves, type GameResult } from './rules.js'
import { search, type SearchConfig } from './negascout.js'

/** 单手分析结果 */
export interface MoveAnalysis {
  /** 走子序号（从 1 开始，0 = 初始盘） */
  seq: number
  /** 走子方 */
  color: Color
  /** 实际落子（pass 时为 null） */
  pos: Pos | null
  isPass: boolean
  /** 归一化评估值，黑方视角 [-1,+1]（正=黑优） */
  eval: number
  /** AI 建议最佳着法（pass 或无合法手时为 null） */
  bestPos: Pos | null
  /** 建议手的归一化评估值，黑方视角 */
  bestEval: number
  /** 实际手与最佳手的分差（走子方视角，<=0），归一化单位 */
  delta: number
  /** 本手分类 */
  classification: 'brilliant' | 'good' | 'inaccuracy' | 'blunder' | 'normal'
}

/** 对局总结 */
export interface AnalysisSummary {
  /** 黑方平均评估（归一化） */
  blackAvg: number
  /** 白方平均评估（归一化） */
  whiteAvg: number
  /** 妙手总数（双方） */
  brilliantCount: number
  /** 失误总数（双方） */
  blunderCount: number
  /** 不准确总数 */
  inaccuracyCount: number
  /** 终局结果 */
  result: GameResult | null
}

/** 完整对局分析 */
export interface GameAnalysis {
  moves: MoveAnalysis[]
  summary: AnalysisSummary
}

/** 默认分析配置：L3 中档（深度 4 + 近终局 + 排序，无 TT） */
export const DEFAULT_ANALYSIS_CONFIG: SearchConfig = {
  maxDepth: 4,
  useTT: false,
  useEndgame: false,
  useNearEndgame: true,
  useMoveOrdering: true,
  timeLimitMs: 1_000,
}

/** 评估值归一化尺度：tanh(score / SCALE)，把 [-300,300] 映射到 ≈[-0.99,0.99] */
const EVAL_SCALE = 100
/** INF 界限（与 negascout.ts 一致） */
const INF = 1_000_000

/** 把走子方视角的原始评分归一化到 [-1,+1] */
function normalize(score: number): number {
  if (score >= INF - 1) return 1
  if (score <= -(INF - 1)) return -1
  return Math.tanh(score / EVAL_SCALE)
}

/** 走子方视角评分 → 黑方视角归一化 */
function toBlackView(score: number, color: Color): number {
  return color === 'BLACK' ? normalize(score) : -normalize(score)
}

/** 分类阈值（归一化单位，走子方视角 delta = actualEval - bestEval <= 0） */
const BLUNDER_THRESHOLD = -0.15
const INACCURACY_THRESHOLD = -0.05
const GOOD_THRESHOLD = -0.02
const BRILLIANT_EVAL_MIN = 0.2

/**
 * 分析整局走子序列。
 * @param moves 走子序列（color/pos/isPass）
 * @param config 搜索配置，默认 L3
 * @param result 可选终局结果，用于 summary
 */
export function analyzeGame(
  moves: ReadonlyArray<{ color: Color; pos: Pos | null; isPass: boolean }>,
  config: SearchConfig = DEFAULT_ANALYSIS_CONFIG,
  result: GameResult | null = null,
): GameAnalysis {
  const analyses: MoveAnalysis[] = []
  let board: Board = createInitialBoard()

  let prevEvalBlack = 0 // 上一手黑方视角评估（pass 手沿用）
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]!
    const seq = i + 1
    const color = m.color

    if (m.isPass || m.pos === null) {
      // pass：无落子，评估沿用前值，无建议
      analyses.push({
        seq,
        color,
        pos: null,
        isPass: true,
        eval: prevEvalBlack,
        bestPos: null,
        bestEval: prevEvalBlack,
        delta: 0,
        classification: 'normal',
      })
      // pass 不改变棋盘
      continue
    }

    // 走子前棋盘上枚举合法手并搜索最佳
    const legal = legalMoves(board, color)
    if (legal.length === 0) {
      // 不应发生（既然有走子记录），防御性跳过
      analyses.push({
        seq,
        color,
        pos: m.pos,
        isPass: false,
        eval: prevEvalBlack,
        bestPos: null,
        bestEval: prevEvalBlack,
        delta: 0,
        classification: 'normal',
      })
      continue
    }

    // 最佳手搜索
    const bestResult = search(board, color, config)
    const bestPosIndex = bestResult?.posIndex ?? 0
    const bestPos = legal.find((p) => p.y * 8 + p.x === bestPosIndex) ?? legal[0]!
    const bestScoreColor = bestResult?.score ?? 0

    // 实际手评分：在走子前棋盘上落实际手，再以对手视角搜索
    const afterActual = applyMove(board, color, m.pos)
    let actualScoreColor: number
    if (afterActual === null) {
      // 非法手（不应发生），按最差处理
      actualScoreColor = -INF
    } else {
      const oppResult = search(afterActual.board, opponent(color), config)
      actualScoreColor = oppResult === null ? INF : -(oppResult.score)
    }

    // 归一化到黑方视角
    const evalBlack = toBlackView(actualScoreColor, color)
    const bestEvalBlack = toBlackView(bestScoreColor, color)
    prevEvalBlack = evalBlack

    // delta：走子方视角（actual - best，<=0）
    const deltaColor = (actualScoreColor - bestScoreColor) / EVAL_SCALE
    const delta = Math.max(-2, Math.min(0, deltaColor))

    // 分类
    let classification: MoveAnalysis['classification']
    if (delta < BLUNDER_THRESHOLD) classification = 'blunder'
    else if (delta < INACCURACY_THRESHOLD) classification = 'inaccuracy'
    else if (delta >= GOOD_THRESHOLD && Math.abs(evalBlack) >= BRILLIANT_EVAL_MIN) classification = 'brilliant'
    else if (delta >= GOOD_THRESHOLD) classification = 'good'
    else classification = 'normal'

    analyses.push({
      seq,
      color,
      pos: m.pos,
      isPass: false,
      eval: evalBlack,
      bestPos,
      bestEval: bestEvalBlack,
      delta,
      classification,
    })

    // 推进棋盘到走子后
    if (afterActual) board = afterActual.board
  }

  // 汇总
  const blackEvals: number[] = []
  const whiteEvals: number[] = []
  let brilliantCount = 0
  let blunderCount = 0
  let inaccuracyCount = 0
  for (const a of analyses) {
    if (a.isPass) continue
    if (a.color === 'BLACK') blackEvals.push(a.eval)
    else whiteEvals.push(a.eval)
    if (a.classification === 'brilliant') brilliantCount++
    else if (a.classification === 'blunder') blunderCount++
    else if (a.classification === 'inaccuracy') inaccuracyCount++
  }
  const blackAvg = blackEvals.length > 0 ? blackEvals.reduce((s, v) => s + v, 0) / blackEvals.length : 0
  const whiteAvg = whiteEvals.length > 0 ? whiteEvals.reduce((s, v) => s + v, 0) / whiteEvals.length : 0

  return {
    moves: analyses,
    summary: {
      blackAvg,
      whiteAvg,
      brilliantCount,
      blunderCount,
      inaccuracyCount,
      result,
    },
  }
}

