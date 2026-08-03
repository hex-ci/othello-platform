/**
 * 赛季 / 段位快照 / 徽章（T22，F-E-18）。
 * - 赛季仅记录该赛季 ELO 峰值与段位快照，不重置 users.elo（绝对值保持）
 * - 段位阈值来自 @othello-platform/shared tierOfElo（前后端共用，解决 D6 段位占位）
 * - 徽章幂等发放（UNIQUE(user_id, badge_type)）
 */
import { query } from '../db/pool.js'
import { tierOfElo, type TierName, type SeasonDTO, type UserSeasonRatingDTO, type BadgeDTO, type BadgeType, type SeasonStatus } from '@othello-platform/shared'
import { AppError } from '../middleware/error-handler.js'

interface SeasonRow {
  id: number
  name: string
  start_date: string
  end_date: string
  status: string
}

function rowToSeasonDTO(r: SeasonRow): SeasonDTO {
  return {
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status as SeasonStatus,
  }
}

/** 当前活跃赛季 */
export async function getCurrentSeason(): Promise<SeasonDTO | null> {
  const res = await query('SELECT * FROM seasons WHERE status = \'active\' ORDER BY id DESC LIMIT 1')
  const row = res.rows[0] as SeasonRow | undefined
  return row ? rowToSeasonDTO(row) : null
}

/** 必须有当前赛季，否则抛错 */
export async function requireCurrentSeason(): Promise<SeasonDTO> {
  const s = await getCurrentSeason()
  if (!s) throw new AppError('INTERNAL', '当前无活跃赛季', 500)
  return s
}

/** 用户在该赛季的段位快照 */
export async function getUserSeasonRating(userId: number, seasonId?: number): Promise<UserSeasonRatingDTO | null> {
  const sid = seasonId ?? (await getCurrentSeason())?.id
  if (!sid) return null
  const res = await query(
    'SELECT season_id, user_id, peak_elo, peak_tier, final_elo FROM user_season_ratings WHERE season_id = $1 AND user_id = $2',
    [sid, userId],
  )
  const row = res.rows[0] as { season_id: number, user_id: number, peak_elo: number, peak_tier: string, final_elo: number | null } | undefined
  if (!row) return null
  return {
    seasonId: row.season_id,
    userId: row.user_id,
    peakElo: row.peak_elo,
    peakTier: row.peak_tier as TierName,
    finalElo: row.final_elo,
  }
}

/**
 * 记录用户赛季 ELO 峰值（applyElo 后调用）。
 * 若无赛季记录则插入；若新 elo 更高则更新 peak_elo + peak_tier。
 */
export async function recordPeakElo(userId: number, newElo: number): Promise<void> {
  const season = await getCurrentSeason()
  if (!season) return
  const tier = tierOfElo(newElo)
  // upsert：已存在且新 elo 更高则更新
  await query(
    `INSERT INTO user_season_ratings (season_id, user_id, peak_elo, peak_tier)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (season_id, user_id)
     DO UPDATE SET peak_elo = EXCLUDED.peak_elo, peak_tier = EXCLUDED.peak_tier, updated_at = now()
     WHERE user_season_ratings.peak_elo < EXCLUDED.peak_elo`,
    [season.id, userId, newElo, tier],
  )
}

/** 结算赛季：冻结 final_elo，状态置 settled */
export async function settleSeason(seasonId: number): Promise<void> {
  // 把当前 users.elo 写入 final_elo
  await query(
    `UPDATE user_season_ratings usr
     SET final_elo = u.elo, updated_at = now()
     FROM users u
     WHERE usr.user_id = u.id AND usr.season_id = $1 AND usr.final_elo IS NULL`,
    [seasonId],
  )
  await query('UPDATE seasons SET status = \'settled\' WHERE id = $1', [seasonId])
}

// ─── 徽章 ───

/** 列出用户徽章 */
export async function listUserBadges(userId: number): Promise<BadgeDTO[]> {
  const res = await query(
    'SELECT id, user_id, badge_type, earned_at FROM user_badges WHERE user_id = $1 ORDER BY earned_at DESC',
    [userId],
  )
  return (res.rows as Array<{ id: string, user_id: number, badge_type: string, earned_at: Date }>).map(r => ({
    id: Number(r.id),
    userId: r.user_id,
    badgeType: r.badge_type as BadgeType,
    earnedAt: new Date(r.earned_at).getTime(),
  }))
}

/** 幂等发放徽章（已存在则跳过） */
export async function grantBadge(userId: number, badgeType: BadgeType): Promise<void> {
  await query(
    `INSERT INTO user_badges (user_id, badge_type) VALUES ($1, $2)
     ON CONFLICT (user_id, badge_type) DO NOTHING`,
    [userId, badgeType],
  )
}

/**
 * 检查并发放徽章（幂等）。
 * context 描述触发场景，用于决定检查哪些徽章。
 */
export async function checkBadges(
  userId: number,
  context: { afterGame?: { wins: number, streak: number }, afterPuzzle?: { solved: number }, afterReview?: { brilliant: number } },
): Promise<void> {
  if (context.afterGame) {
    const { wins, streak } = context.afterGame
    if (wins >= 1) await grantBadge(userId, 'first_win')
    if (streak >= 5) await grantBadge(userId, 'streak_5')
    if (streak >= 10) await grantBadge(userId, 'streak_10')
  }
  if (context.afterPuzzle) {
    if (context.afterPuzzle.solved >= 10) await grantBadge(userId, 'puzzle_master')
  }
  if (context.afterReview) {
    if (context.afterReview.brilliant >= 5) await grantBadge(userId, 'perfect_review')
  }
}

/** 当前赛季王者（peak_elo 最高） */
export async function getSeasonKing(seasonId: number): Promise<{ userId: number, peakElo: number } | null> {
  const res = await query(
    'SELECT user_id, peak_elo FROM user_season_ratings WHERE season_id = $1 ORDER BY peak_elo DESC LIMIT 1',
    [seasonId],
  )
  const row = res.rows[0] as { user_id: number, peak_elo: number } | undefined
  return row ? { userId: row.user_id, peakElo: row.peak_elo } : null
}
