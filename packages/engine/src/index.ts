// @othello-platform/engine — 纯函数规则引擎 + AI
// 零副作用、无 IO，可编译 WASM

export {
  T_NONE, T_BLACK, T_WHITE,
  BOARD_SIZE, CELL_COUNT,
  DIRECTIONS,
  colorToCell, opponent,
  type Cell, type Color, type Pos,
} from './constants.js'

export {
  type Board, type Bitboard,
  createInitialBoard, countPieces,
  cellAt, setCell, indexOf, posOf, inBounds,
  boardToBitboard, bitboardToBoard,
  ownMask, oppMask,
} from './board.js'

export {
  legalMovesBB, flippedBB, applyMoveBB,
  popcount, bitsToPositions,
} from './bitboard.js'

export {
  legalMoves, hasLegalMove, applyMove,
  isGameOver, getResult, nextTurn,
  type GameResult,
} from './rules.js'

export { POSITION_WEIGHTS, weightAt } from './weights.js'

export {
  search, abortSearch, resetAbort,
  type SearchConfig, type SearchResult,
} from './negascout.js'

export {
  think, stop, hint,
  DEFAULT_AI_LEVEL,
  type AiLevel,
} from './ai.js'

export {
  analyzeGame, DEFAULT_ANALYSIS_CONFIG,
  type MoveAnalysis, type AnalysisSummary, type GameAnalysis,
} from './analyze.js'

export {
  encodeMoves, decodeMoves, isValidNotation,
  posToNotation, notationToPos,
  NotationError,
  type NotationMove,
} from './notation.js'
