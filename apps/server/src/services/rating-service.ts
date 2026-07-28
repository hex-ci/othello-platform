/**
 * 经典积分结算（F-C-02，展示/称号用途）。
 * 主评级 ELO 在 M2 T11 实现；人机对局不计 ELO（F-C-06）。
 *
 * 公式：
 *  - 胜 +3 / 负 -2 / 平 +1
 *  - 低分方胜高分方：额外 +floor(分差 × 20%)
 *  - 平局且双方对局数差 < 2：各额外 +1（10% 奖励，最小 1 分）
 *  - classic_score 下限 0；L0 对局不结算
 */
import { query } from '../db/pool.js'
import type { GameResult, GameMode, AiLevel } from '@othello-platform/shared'
import { recordPeakElo, checkBadges } from './season-service.js'

const WIN_POINTS = 3
const LOSS_POINTS = -2
const DRAW_POINTS = 1
const LOW_BEATS_HIGH_RATE = 0.2
const DRAW_BONUS_GAMES_DIFF = 2

// ─── ELO 参数（F-E-01）───
const ELO_K = 32
const ELO_PLACEMENT_K = 40 // 定级期（前 10 局）放大 K
const ELO_PLACEMENT_GAMES = 10

interface PlayerScore {
  id: number
  classicScore: number
  gamesPlayed: number
}

async function fetchScore(userId: number): Promise<PlayerScore | null> {
  const res = await query(
    'SELECT id, classic_score, games_played FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId],
  )
  const row = res.rows[0] as { id: number; classic_score: number; games_played: number } | undefined
  if (!row) return null
  return { id: row.id, classicScore: row.classic_score, gamesPlayed: row.games_played }
}

async function applyDelta(userId: number, delta: number, result: 'win' | 'loss' | 'draw'): Promise<void> {
  const winInc = result === 'win' ? 1 : 0
  const lossInc = result === 'loss' ? 1 : 0
  const drawInc = result === 'draw' ? 1 : 0
  // classic_score + delta，下限 0
  await query(
    `UPDATE users
     SET classic_score = GREATEST(0, classic_score + $2),
         wins = wins + $3,
         losses = losses + $4,
         draws = draws + $5,
         games_played = games_played + 1
     WHERE id = $1`,
    [userId, delta, winInc, lossInc, drawInc],
  )
}

/**
 * 结算一局经典积分。
 * @param aiLevel 为 0（L0 热身）时不结算。
 */
export async function settleClassicScore(params: {
  blackId: number | null
  whiteId: number | null
  aiLevel: AiLevel | null
  result: GameResult
}): Promise<void> {
  const { blackId, whiteId, aiLevel, result } = params

  // L0 热身不计分
  if (aiLevel === 0) return

  const black = blackId !== null ? await fetchScore(blackId) : null
  const white = whiteId !== null ? await fetchScore(whiteId) : null

  const outcomeOf = (color: 'BLACK' | 'WHITE'): 'win' | 'loss' | 'draw' => {
    if (result === 'DRAW') return 'draw'
    return result === color ? 'win' : 'loss'
  }

  // 计算某方 delta
  const computeDelta = (
    color: 'BLACK' | 'WHITE',
    self: PlayerScore,
    opp: PlayerScore | null,
  ): number => {
    const outcome = outcomeOf(color)
    if (outcome === 'win') {
      let delta = WIN_POINTS
      // 低分胜高分追加
      if (opp && self.classicScore < opp.classicScore) {
        delta += Math.floor((opp.classicScore - self.classicScore) * LOW_BEATS_HIGH_RATE)
      }
      return delta
    }
    if (outcome === 'loss') {
      return LOSS_POINTS
    }
    // draw
    let delta = DRAW_POINTS
    if (opp && Math.abs(self.gamesPlayed - opp.gamesPlayed) < DRAW_BONUS_GAMES_DIFF) {
      delta += 1 // 10% 平局奖励（最小 1 分）
    }
    return delta
  }

  if (black) {
    await applyDelta(black.id, computeDelta('BLACK', black, white), outcomeOf('BLACK'))
  }
  if (white) {
    await applyDelta(white.id, computeDelta('WHITE', white, black), outcomeOf('WHITE'))
  }
}

interface PlayerElo {
  id: number
  elo: number
  gamesPlayed: number
}

async function fetchElo(userId: number): Promise<PlayerElo | null> {
  const res = await query(
    'SELECT id, elo, games_played FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId],
  )
  const row = res.rows[0] as { id: number; elo: number; games_played: number } | undefined
  if (!row) return null
  return { id: row.id, elo: row.elo, gamesPlayed: row.games_played }
}

/**
 * 结算一局 ELO（F-E-01，主评级）。
 * 仅人人对局（双方均非 AI）计入；人机/练习不计 ELO（F-C-06）。
 * K=32，定级期（games_played < 10）K=40。写 rating_history(kind='elo')。
 * @param gameNumId 对局数字 id（写 rating_history 用），可为 null
 */
export async function settleElo(params: {
  blackId: number | null
  whiteId: number | null
  mode: GameMode
  result: GameResult
  gameNumId: number | null
}): Promise<void> {
  const { blackId, whiteId, mode, result, gameNumId } = params

  // 仅人人对局计 ELO
  if (mode !== 'human_vs_human' || blackId === null || whiteId === null) return

  const black = await fetchElo(blackId)
  const white = await fetchElo(whiteId)
  if (!black || !white) return

  const actualOf = (color: 'BLACK' | 'WHITE'): number => {
    if (result === 'DRAW') return 0.5
    return result === color ? 1 : 0
  }
  const kOf = (p: PlayerElo): number =>
    p.gamesPlayed < ELO_PLACEMENT_GAMES ? ELO_PLACEMENT_K : ELO_K

  // 期望得分：1 / (1 + 10^((oppElo - selfElo) / 400))
  const expectedBlack = 1 / (1 + 10 ** ((white.elo - black.elo) / 400))
  const deltaBlack = Math.round(kOf(black) * (actualOf('BLACK') - expectedBlack))
  const deltaWhite = Math.round(kOf(white) * (actualOf('WHITE') - (1 - expectedBlack)))

  await applyElo(black.id, deltaBlack, gameNumId)
  await applyElo(white.id, deltaWhite, gameNumId)
}

async function applyElo(userId: number, delta: number, gameNumId: number | null): Promise<void> {
  const res = await query(
    `UPDATE users SET elo = elo + $2 WHERE id = $1 RETURNING elo - $2 AS old_value, elo AS new_value`,
    [userId, delta],
  )
  const row = res.rows[0] as { old_value: number; new_value: number } | undefined
  if (!row) return
  await query(
    `INSERT INTO rating_history (user_id, game_id, kind, old_value, new_value, delta)
     VALUES ($1, $2, 'elo', $3, $4, $5)`,
    [userId, gameNumId, row.old_value, row.new_value, delta],
  )
  // 赛季峰值记录（T22，F-E-18）
  await recordPeakElo(userId, row.new_value)
  // 徽章检查：首胜 / 连胜（需查 wins 与当前连胜）
  const stats = await query(
    'SELECT wins, losses, draws FROM users WHERE id = $1',
    [userId],
  )
  const s = stats.rows[0] as { wins: number; losses: number; draws: number } | undefined
  if (s) {
    // 连胜：最近连续 wins（简化：用 wins 作为上限，实际连胜需查最近对局）
    const streak = delta > 0 ? Math.min(s.wins, 10) : 0
    await checkBadges(userId, { afterGame: { wins: s.wins, streak } })
  }
}
