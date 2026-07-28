/**
 * 对局与走子历史持久化（T08）。
 * games 为复盘/观战/审计基础；moves 落子序列冻结支撑重连/复盘（§4.1）。
 */
import { query } from '../db/pool.js'
import { AppError } from '../middleware/error-handler.js'
import {
  gameRowToDTO,
  moveRowToDTO,
  gameIdToString,
  type GameRow,
  type MoveRow,
  type MoveDTO,
  type GameDTO,
  type GameAnalysisDTO,
  type MoveAnalysisDTO,
} from '@othello-platform/shared'
import {
  analyzeGame,
  DEFAULT_ANALYSIS_CONFIG,
  type Color,
  type Pos,
} from '@othello-platform/engine'
import type { GameMode, AiLevel, GameResult, EndReason } from '@othello-platform/shared'

export interface CreateGameInput {
  roomId: number | null
  blackId: number | null
  whiteId: number | null
  mode: GameMode
  aiLevel: AiLevel | null
  aiColor: Color | null
}

export async function createGame(input: CreateGameInput): Promise<{ id: number; gameId: string }> {
  const res = await query(
    `INSERT INTO games (room_id, black_id, white_id, mode, ai_level, ai_color, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'playing')
     RETURNING id`,
    [input.roomId, input.blackId, input.whiteId, input.mode, input.aiLevel, input.aiColor],
  )
  // pg BIGINT-as-string：games.id 为 BIGSERIAL，node-postgres 返回字符串，
  // 统一 Number() 归一化（CLAUDE.md 系统性坑）
  const id = Number((res.rows[0] as { id: string | number }).id)
  return { id, gameId: gameIdToString(id) }
}

/** 每 N 手存一次全量快照，控制存储（§4.1 待确认问题 4：增量为主，定期快照） */
const SNAPSHOT_EVERY = 20

export async function recordMove(params: {
  gameId: number
  seq: number
  color: Color
  pos: Pos | null
  isPass: boolean
  flipped: Pos[]
  boardSnapshot: number[] | null
}): Promise<void> {
  const snapshot =
    params.boardSnapshot !== null && params.seq % SNAPSHOT_EVERY === 0
      ? JSON.stringify(params.boardSnapshot)
      : null
  await query(
    `INSERT INTO moves (game_id, seq, color, pos_x, pos_y, is_pass, flipped, board_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.gameId,
      params.seq,
      params.color,
      params.pos?.x ?? null,
      params.pos?.y ?? null,
      params.isPass,
      JSON.stringify(params.flipped),
      snapshot,
    ],
  )
}

export async function finishGame(params: {
  gameId: number
  result: GameResult
  endReason: EndReason
  moveCount: number
}): Promise<void> {
  await query(
    `UPDATE games
     SET status = 'finished', result = $2, end_reason = $3, ended_at = now(), move_count = $4
     WHERE id = $1`,
    [params.gameId, params.result, params.endReason, params.moveCount],
  )
}

export async function cancelGame(gameId: number): Promise<void> {
  await query(`UPDATE games SET status = 'cancelled', ended_at = now() WHERE id = $1`, [gameId])
}

export async function getGameById(gameId: number): Promise<GameDTO | null> {
  const res = await query('SELECT * FROM games WHERE id = $1', [gameId])
  const row = res.rows[0] as GameRow | undefined
  return row ? gameRowToDTO(row) : null
}

export async function getGameMoves(gameId: number): Promise<MoveDTO[]> {
  const res = await query('SELECT * FROM moves WHERE game_id = $1 ORDER BY seq ASC', [gameId])
  return (res.rows as MoveRow[]).map(moveRowToDTO)
}

/** 删除 seq > keepSeq 的走子（T12 悔棋：回退被撤销的手） */
export async function deleteMovesAfter(gameId: number, keepSeq: number): Promise<void> {
  await query('DELETE FROM moves WHERE game_id = $1 AND seq > $2', [gameId, keepSeq])
}

/** 断线重连增量拉取（F-E-04）：返回 seq > lastSeq 的走子 */
export async function getGameMovesSince(gameId: number, lastSeq: number): Promise<MoveDTO[]> {
  const res = await query('SELECT * FROM moves WHERE game_id = $1 AND seq > $2 ORDER BY seq ASC', [
    gameId,
    lastSeq,
  ])
  return (res.rows as MoveRow[]).map(moveRowToDTO)
}

// ─── 复盘分享（T15，F-E-11）───

import { randomBytes } from 'node:crypto'

/**
 * 生成分享令牌（T23 安全修复 C1）。
 * 用 crypto.randomBytes 替代 Math.random()（后者可预测，导致分享链接可枚举）。
 * 12 字节 = 96 位熵，base64url 编码为 16 字符（符合 share_token VARCHAR(16) 列宽）。
 */
function randomShareToken(): string {
  return randomBytes(12).toString('base64url')
}

/** 生成（或返回已有）分享令牌，幂等 */
export async function ensureShareToken(gameId: number): Promise<string> {
  const existing = await query('SELECT share_token FROM games WHERE id = $1', [gameId])
  const token = (existing.rows[0] as { share_token: string | null } | undefined)?.share_token
  if (token) return token
  const fresh = randomShareToken()
  await query('UPDATE games SET share_token = $2 WHERE id = $1', [gameId, fresh])
  return fresh
}

/** 复盘数据：对局 + 走子 + 双方用户名（分享链接无鉴权访问用） */
export interface ReplayData {
  game: GameDTO
  moves: MoveDTO[]
  blackName: string | null
  whiteName: string | null
}

async function buildReplayData(row: GameRow): Promise<ReplayData> {
  const moves = await getGameMoves(row.id)
  const names = await query(
    `SELECT
       (SELECT username FROM users WHERE id = $1) AS black_name,
       (SELECT username FROM users WHERE id = $2) AS white_name`,
    [row.black_id, row.white_id],
  )
  const n = names.rows[0] as { black_name: string | null; white_name: string | null } | undefined
  return {
    game: gameRowToDTO(row),
    moves,
    blackName: n?.black_name ?? null,
    whiteName: n?.white_name ?? null,
  }
}

export async function getReplayById(gameId: number): Promise<ReplayData | null> {
  const res = await query('SELECT * FROM games WHERE id = $1', [gameId])
  const row = res.rows[0] as GameRow | undefined
  return row ? buildReplayData(row) : null
}

export async function getReplayByShareToken(token: string): Promise<ReplayData | null> {
  const res = await query('SELECT * FROM games WHERE share_token = $1', [token])
  const row = res.rows[0] as GameRow | undefined
  return row ? buildReplayData(row) : null
}

// ─── AI 复盘分析（T20，F-E-09 增强）───

/** 读取已缓存的分析结果 */
export async function getAnalysis(gameId: number): Promise<GameAnalysisDTO | null> {
  const res = await query('SELECT analysis FROM game_analyses WHERE game_id = $1', [gameId])
  const row = res.rows[0] as { analysis: unknown } | undefined
  return row ? (row.analysis as GameAnalysisDTO) : null
}

/**
 * 计算并缓存分析。仅对已结束对局可调用。
 * 已存在缓存则直接返回（幂等）。
 */
export async function computeAndStoreAnalysis(gameId: number): Promise<GameAnalysisDTO> {
  const cached = await getAnalysis(gameId)
  if (cached) return cached

  const game = await getGameById(gameId)
  if (!game) throw new AppError('GAME_NOT_FOUND', '对局不存在', 404)
  if (game.status !== 'finished') {
    throw new AppError('VALIDATION_ERROR', '对局尚未结束，无法分析', 409)
  }

  const moves = await getGameMoves(gameId)
  const analysis = analyzeGame(
    moves.map((m) => ({ color: m.color, pos: m.pos, isPass: m.isPass })),
    DEFAULT_ANALYSIS_CONFIG,
    game.result,
  )

  const dto: GameAnalysisDTO = {
    gameId: game.id,
    moves: analysis.moves.map((m): MoveAnalysisDTO => ({
      seq: m.seq,
      color: m.color,
      pos: m.pos,
      isPass: m.isPass,
      eval: m.eval,
      bestPos: m.bestPos,
      bestEval: m.bestEval,
      delta: m.delta,
      classification: m.classification,
    })),
    summary: analysis.summary,
  }

  await query(
    `INSERT INTO game_analyses (game_id, analysis) VALUES ($1, $2)
     ON CONFLICT (game_id) DO UPDATE SET analysis = EXCLUDED.analysis`,
    [gameId, JSON.stringify(dto)],
  )
  return dto
}
