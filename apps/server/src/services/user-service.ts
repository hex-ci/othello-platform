import { query } from '../db/pool.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { AppError } from '../middleware/error-handler.js'
import type {
  UserDTO,
  LeaderboardEntryDTO,
  EloHistoryPointDTO,
  GameHistoryDTO,
  AiStatDTO,
  ActivityDTO,
} from '@othello-platform/shared'
import { userRowToDTO, gameIdToString, type UserRow } from '@othello-platform/shared'

export async function createUser(
  username: string,
  password: string,
  email?: string,
): Promise<{ userId: number, elo: number, classicScore: number }> {
  const existing = await query('SELECT id FROM users WHERE username = $1', [username])
  if (existing.rowCount && existing.rowCount > 0) {
    throw new AppError('VALIDATION_ERROR', '用户名已存在', 409)
  }

  const passwordHash = await hashPassword(password)
  const result = await query(
    `INSERT INTO users (username, password_hash, email)
     VALUES ($1, $2, $3)
     RETURNING id, elo, classic_score`,
    [username, passwordHash, email ?? null],
  )

  const row = result.rows[0] as { id: number, elo: number, classic_score: number }
  return { userId: row.id, elo: row.elo, classicScore: row.classic_score }
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<UserRow> {
  const result = await query('SELECT * FROM users WHERE username = $1 AND deleted_at IS NULL', [username])
  const user = result.rows[0] as UserRow | undefined

  if (!user) {
    throw new AppError('AUTH_REQUIRED', '用户名或密码错误', 401)
  }

  const valid = await verifyPassword(user.password_hash, password)
  if (!valid) {
    throw new AppError('AUTH_REQUIRED', '用户名或密码错误', 401)
  }

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id])
  return user
}

export async function getUserById(id: number): Promise<UserDTO> {
  const result = await query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [id])
  const user = result.rows[0] as UserRow | undefined
  if (!user) {
    throw new AppError('VALIDATION_ERROR', '用户不存在', 404)
  }
  return userRowToDTO(user)
}

/** 按用户名查询（T16 添加好友用） */
export async function getUserByUsername(username: string): Promise<UserDTO> {
  const result = await query('SELECT * FROM users WHERE username = $1 AND deleted_at IS NULL', [username])
  const user = result.rows[0] as UserRow | undefined
  if (!user) {
    throw new AppError('VALIDATION_ERROR', '用户不存在', 404)
  }
  return userRowToDTO(user)
}

export async function updateUser(
  id: number,
  updates: { avatar?: string, bio?: string },
): Promise<void> {
  // v1: avatar/bio 字段暂未加入 users 表，预留接口
  // 后续迁移加列后启用
  void id
  void updates
}

/** 榜单查询（T16，F-E-08） */
export async function getLeaderboard(
  by: 'elo' | 'classic',
  limit: number,
): Promise<LeaderboardEntryDTO[]> {
  const orderBy = by === 'elo' ? 'elo DESC' : 'classic_score DESC'
  const res = await query(
    `SELECT id, username, elo, classic_score, wins, losses, draws, games_played
     FROM users
     WHERE deleted_at IS NULL AND games_played > 0
     ORDER BY ${orderBy}
     LIMIT $1`,
    [limit],
  )

  return (res.rows as UserRow[]).map((row, idx) => {
    const total = row.wins + row.losses + row.draws
    const winRate = total > 0 ? Math.round((row.wins / total) * 100) : 0
    return {
      rank: idx + 1,
      id: row.id,
      username: row.username,
      elo: row.elo,
      classicScore: row.classic_score,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      gamesPlayed: row.games_played,
      winRate,
    }
  })
}

/** ELO 走势（资料页 F-C-10~13，对照设计稿 09-profile）：近 limit 局 rating_history */
export async function getEloHistory(userId: number, limit = 20): Promise<EloHistoryPointDTO[]> {
  const res = await query(
    `SELECT game_id, new_value, delta, created_at
     FROM rating_history
     WHERE user_id = $1 AND kind = 'elo'
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  )
  return (res.rows as { game_id: number, new_value: number, delta: number, created_at: string }[]).map(r => ({
    gameId: gameIdToString(r.game_id),
    elo: r.new_value,
    delta: r.delta,
    createdAt: r.created_at,
  }))
}

/** 对局历史（资料页）：近 limit 局已结束对局，关联对手用户名 */
export async function getGameHistory(userId: number, limit = 20): Promise<GameHistoryDTO[]> {
  const res = await query(
    `SELECT g.id, g.mode, g.result, g.end_reason, g.move_count, g.ended_at,
            g.black_id, g.white_id, g.ai_color,
            CASE WHEN g.black_id = $1 THEN g.white_id ELSE g.black_id END AS opponent_id,
            CASE WHEN g.black_id = $1 THEN w.username ELSE b.username END AS opponent_name
     FROM games g
     LEFT JOIN users b ON b.id = g.black_id
     LEFT JOIN users w ON w.id = g.white_id
     WHERE (g.black_id = $1 OR g.white_id = $1) AND g.status = 'finished'
     ORDER BY g.ended_at DESC NULLS LAST
     LIMIT $2`,
    [userId, limit],
  )
  return (res.rows as Array<{
    id: number
    mode: string
    result: string | null
    end_reason: string | null
    move_count: number
    ended_at: string | null
    black_id: number | null
    white_id: number | null
    ai_color: string | null
    opponent_id: number | null
    opponent_name: string | null
  }>).map(r => ({
    gameId: gameIdToString(r.id),
    opponentId: r.opponent_id,
    opponentName: r.opponent_name ?? (r.ai_color !== null ? 'AI' : '未知'),
    mode: r.mode as GameHistoryDTO['mode'],
    myColor: r.black_id === userId ? 'BLACK' : 'WHITE',
    result: r.result as GameHistoryDTO['result'],
    endReason: r.end_reason,
    moveCount: r.move_count,
    endedAt: r.ended_at,
  }))
}

/** AI 对战统计（资料页）：按 ai_level 聚合已结束的人机对局 */
export async function getAiStats(userId: number): Promise<AiStatDTO[]> {
  const res = await query(
    `SELECT g.ai_level,
            COUNT(*)::int AS games,
            SUM(CASE WHEN (g.black_id = $1 AND g.result = 'BLACK')
                      OR (g.white_id = $1 AND g.result = 'WHITE') THEN 1 ELSE 0 END)::int AS wins,
            SUM(CASE WHEN (g.black_id = $1 AND g.result = 'WHITE')
                      OR (g.white_id = $1 AND g.result = 'BLACK') THEN 1 ELSE 0 END)::int AS losses,
            SUM(CASE WHEN g.result = 'DRAW' THEN 1 ELSE 0 END)::int AS draws
     FROM games g
     WHERE g.mode = 'human_vs_ai' AND (g.black_id = $1 OR g.white_id = $1) AND g.status = 'finished'
     GROUP BY g.ai_level
     ORDER BY g.ai_level ASC`,
    [userId],
  )
  return (res.rows as Array<{ ai_level: number, games: number, wins: number, losses: number, draws: number }>).map(r => ({
    aiLevel: r.ai_level,
    games: r.games,
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
    winRate: r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0,
  }))
}

/** 最近 N 天活跃度（资料页）：按日期聚合计数 */
export async function getActivity(userId: number, days = 7): Promise<ActivityDTO[]> {
  const res = await query(
    `SELECT to_char(g.ended_at, 'YYYY-MM-DD') AS date, COUNT(*)::int AS games
     FROM games g
     WHERE (g.black_id = $1 OR g.white_id = $1) AND g.status = 'finished' AND g.ended_at IS NOT NULL
       AND g.ended_at >= now() - interval '${days} days'
     GROUP BY date
     ORDER BY date ASC`,
    [userId],
  )
  return (res.rows as Array<{ date: string, games: number }>).map(r => ({
    date: r.date,
    games: r.games,
  }))
}
