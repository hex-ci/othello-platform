/**
 * 题库 / 每日挑战 / 作答记录（T21，F-E-17）。
 * 战术题来自种子数据（后续可由 analyzeGame 从历史对局生成）。
 */
import { query } from '../db/pool.js'
import { AppError } from '../middleware/error-handler.js'
import { legalMoves } from '@othello-platform/engine'
import { checkBadges } from './season-service.js'
import type {
  PuzzleDTO,
  PuzzleDifficulty,
  PuzzleTopic,
  DailyChallengeDTO,
  PuzzleAttemptDTO,
  PuzzleStatsDTO,
  AttemptRating,
  Color,
  Cell,
  Pos,
} from '@othello-platform/shared'

interface PuzzleRow {
  id: number
  puzzle_no: number
  difficulty: string
  topic: string
  turn: string
  board: number[]
  best_pos_x: number
  best_pos_y: number
  solution: string
  explanation: string
  explanation_en: string | null
}

function rowToDTO(r: PuzzleRow): PuzzleDTO {
  return {
    id: r.id,
    puzzleNo: r.puzzle_no,
    difficulty: r.difficulty as PuzzleDifficulty,
    topic: r.topic as PuzzleTopic,
    turn: r.turn as Color,
    board: r.board as Cell[],
    bestPos: { x: r.best_pos_x, y: r.best_pos_y },
    solution: r.solution,
    explanation: r.explanation,
    explanationEn: r.explanation_en,
  }
}

/** 列出题目（可按难度/专题筛选） */
export async function listPuzzles(filter?: {
  difficulty?: PuzzleDifficulty
  topic?: PuzzleTopic
}): Promise<PuzzleDTO[]> {
  const where: string[] = []
  const params: unknown[] = []
  if (filter?.difficulty) {
    params.push(filter.difficulty)
    where.push(`difficulty = $${params.length}`)
  }
  if (filter?.topic) {
    params.push(filter.topic)
    where.push(`topic = $${params.length}`)
  }
  const suffix = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const res = await query(`SELECT * FROM tactics_puzzles ${suffix} ORDER BY puzzle_no ASC`, params)
  return (res.rows as PuzzleRow[]).map(rowToDTO)
}

/** 单题 */
export async function getPuzzle(id: number): Promise<PuzzleDTO | null> {
  const res = await query('SELECT * FROM tactics_puzzles WHERE id = $1', [id])
  const row = res.rows[0] as PuzzleRow | undefined
  return row ? rowToDTO(row) : null
}

/** 当天每日挑战。
 *  puzzle_ids 存的是 puzzle_no（题号，1-10），非数据库 id。
 *  userId 可选：传入则查当日已答对题 id 填充 completedIds。
 */
export async function getDailyChallenge(
  date?: string,
  userId?: number,
): Promise<DailyChallengeDTO | null> {
  const target = date ?? localDateStr()
  let res = await query('SELECT * FROM daily_challenges WHERE challenge_date = $1', [target])
  let row = res.rows[0] as { challenge_date: string; puzzle_ids: number[] | string } | undefined
  // 当日无记录时自动生成：随机抽 5 题（按难度递增），幂等插入
  if (!row) {
    const pickRes = await query(
      `SELECT puzzle_no FROM tactics_puzzles ORDER BY difficulty, puzzle_no ASC`,
    )
    const allNos = (pickRes.rows as Array<{ puzzle_no: number }>).map((r) => r.puzzle_no)
    if (allNos.length === 0) return { challengeDate: target, puzzles: [], completedIds: [] }
    // 按难度分层抽样，取 5 题（不足则循环补）
    const picked: number[] = []
    const step = Math.max(1, Math.floor(allNos.length / 5))
    for (let i = 0; i < allNos.length && picked.length < 5; i += step) {
      picked.push(allNos[i]!)
    }
    while (picked.length < 5 && picked.length < allNos.length) {
      picked.push(allNos[picked.length]!)
    }
    await query(
      `INSERT INTO daily_challenges (challenge_date, puzzle_ids) VALUES ($1, $2)
       ON CONFLICT (challenge_date) DO NOTHING`,
      [target, picked],
    )
    res = await query('SELECT * FROM daily_challenges WHERE challenge_date = $1', [target])
    row = res.rows[0] as { challenge_date: string; puzzle_ids: number[] | string } | undefined
    if (!row) return { challengeDate: target, puzzles: [], completedIds: [] }
  }
  // node-postgres 可能把 int[] 返回为字符串 "{1,2,3}"，需归一化
  const nos: number[] = Array.isArray(row.puzzle_ids)
    ? row.puzzle_ids
    : (row.puzzle_ids as string)
        .replace(/[{}]/g, '')
        .split(',')
        .filter((s) => s.trim() !== '')
        .map((s) => Number(s.trim()))
  if (nos.length === 0) return { challengeDate: target, puzzles: [], completedIds: [] }
  // 按 puzzle_no 查询（种子存的就是 puzzle_no）
  const puzzlesRes = await query(`SELECT * FROM tactics_puzzles WHERE puzzle_no = ANY($1::int[])`, [
    nos,
  ])
  const puzzles = (puzzlesRes.rows as PuzzleRow[]).map(rowToDTO)
  // 按 nos 原始顺序排序
  const ordered = nos
    .map((no) => puzzles.find((p) => p.puzzleNo === no))
    .filter((p): p is PuzzleDTO => p !== null)
  // 查当日已答对题 id（P1：进度 done 需要真实完成数）
  let completedIds: number[] = []
  if (userId) {
    const doneRes = await query(
      `SELECT DISTINCT puzzle_id FROM puzzle_attempts
       WHERE user_id = $1 AND correct = true
         AND created_at::date = $2::date
       ORDER BY puzzle_id`,
      [userId, target],
    )
    completedIds = (doneRes.rows as Array<{ puzzle_id: number }>).map((r) => r.puzzle_id)
  }
  return {
    challengeDate: target,
    puzzles: ordered,
    completedIds,
  }
}

/** 提交作答，判定对错并记录 */
export async function submitAttempt(params: {
  userId: number
  puzzleId: number
  answerPos: Pos | null // null = 跳过/未答
  timeMs: number
}): Promise<{ attempt: PuzzleAttemptDTO; correct: boolean }> {
  const puzzle = await getPuzzle(params.puzzleId)
  if (!puzzle) throw new AppError('GAME_NOT_FOUND', '题目不存在', 404)

  // 校验答案位置是否为该盘面下走子方的合法手（非法手直接判错但不报错）
  let correct = false
  if (params.answerPos) {
    const board = Uint8Array.from(puzzle.board)
    const legal = legalMoves(board, puzzle.turn)
    const isLegal = legal.some((p) => p.x === params.answerPos!.x && p.y === params.answerPos!.y)
    if (isLegal) {
      correct = params.answerPos.x === puzzle.bestPos.x && params.answerPos.y === puzzle.bestPos.y
    }
  }

  // 评级：按用时 + 正确性
  let rating: AttemptRating | null = null
  if (correct) {
    if (params.timeMs <= 15_000) rating = 'S'
    else if (params.timeMs <= 30_000) rating = 'A'
    else if (params.timeMs <= 60_000) rating = 'B'
    else rating = 'C'
  }

  const res = await query(
    `INSERT INTO puzzle_attempts (user_id, puzzle_id, answer_x, answer_y, correct, time_ms, rating)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, user_id, puzzle_id, answer_x, answer_y, correct, time_ms, rating, created_at`,
    [
      params.userId,
      params.puzzleId,
      params.answerPos?.x ?? null,
      params.answerPos?.y ?? null,
      correct,
      params.timeMs,
      rating,
    ],
  )
  const r = res.rows[0] as {
    id: string
    user_id: number
    puzzle_id: number
    answer_x: number | null
    answer_y: number | null
    correct: boolean
    time_ms: number
    rating: string | null
    created_at: Date
  }
  const attempt: PuzzleAttemptDTO = {
    id: Number(r.id),
    userId: r.user_id,
    puzzleId: r.puzzle_id,
    answerPos: r.answer_x !== null && r.answer_y !== null ? { x: r.answer_x, y: r.answer_y } : null,
    correct: r.correct,
    timeMs: r.time_ms,
    rating: r.rating as AttemptRating | null,
    createdAt: new Date(r.created_at).getTime(),
  }
  // 徽章检查：题库达人（解 10 题）
  if (correct) {
    const stats = await getMyStats(params.userId)
    void checkBadges(params.userId, { afterPuzzle: { solved: stats.solved } })
  }
  return { attempt, correct }
}

/** 用户最近 N 次作答 */
export async function listMyAttempts(userId: number, limit = 10): Promise<PuzzleAttemptDTO[]> {
  const res = await query(
    `SELECT a.id, a.user_id, a.puzzle_id, a.answer_x, a.answer_y, a.correct, a.time_ms, a.rating, a.created_at,
            p.puzzle_no, p.topic
     FROM puzzle_attempts a
     JOIN tactics_puzzles p ON p.id = a.puzzle_id
     WHERE a.user_id = $1
     ORDER BY a.created_at DESC
     LIMIT $2`,
    [userId, limit],
  )
  return (res.rows as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r['id'] as string),
    userId: Number(r['user_id'] as number),
    puzzleId: Number(r['puzzle_id'] as number),
    answerPos:
      r['answer_x'] !== null && r['answer_y'] !== null
        ? { x: r['answer_x'] as number, y: r['answer_y'] as number }
        : null,
    correct: r['correct'] as boolean,
    timeMs: r['time_ms'] as number,
    rating: r['rating'] as AttemptRating | null,
    createdAt: new Date(r['created_at'] as Date).getTime(),
    // 额外字段供前端展示（P5：显示 puzzleNo 而非 puzzleId）
    puzzleNo: r['puzzle_no'] !== undefined ? Number(r['puzzle_no'] as string | number) : undefined,
    topic: r['topic'] !== undefined ? (r['topic'] as string) : undefined,
  }))
}

/** 本地时区当天日期字符串 YYYY-MM-DD（避免 UTC 跨日导致连做断档） */
function localDateStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 用户战绩统计。
 *  solved / accuracy 按「去重题目」口径：solved = 解出的不同题数，
 *  accuracy = 解出题数 / 尝试过的不同题数。重试同一题只记历史不刷高数字，
 *  避免重复刷同一题骗高 solved 与「题库达人」徽章（业界惯例：Chess.com/Lichess 均去重）。
 */
export async function getMyStats(userId: number): Promise<PuzzleStatsDTO> {
  const res = await query(
    `SELECT
       COUNT(DISTINCT puzzle_id) FILTER (WHERE correct) AS solved,
       COUNT(DISTINCT puzzle_id) AS total,
       AVG(CASE WHEN correct AND rating IS NOT NULL THEN
         CASE rating WHEN 'S' THEN 4 WHEN 'A' THEN 3 WHEN 'B' THEN 2 WHEN 'C' THEN 1 END
       END) AS avg_rating_num
     FROM puzzle_attempts
     WHERE user_id = $1`,
    [userId],
  )
  const r = res.rows[0] as { solved: string; total: string; avg_rating_num: string | null }
  const solved = Number(r.solved ?? 0)
  const total = Number(r.total ?? 0)
  const accuracy = total > 0 ? solved / total : 0
  const avgRatingNum = r.avg_rating_num ? Number(r.avg_rating_num) : null
  const avgRating: AttemptRating | null =
    avgRatingNum === null
      ? null
      : avgRatingNum >= 3.5
        ? 'S'
        : avgRatingNum >= 2.5
          ? 'A'
          : avgRatingNum >= 1.5
            ? 'B'
            : 'C'

  // 连做天数：从今天往前数连续有答对的天数（本地时区，避免 UTC 跨日断档）
  const today = localDateStr()
  const streakRes = await query(
    `SELECT DISTINCT (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')::date AS d
     FROM puzzle_attempts
     WHERE user_id = $1 AND correct = true
     ORDER BY d DESC
     LIMIT 60`,
    [userId],
  )
  const dates = (streakRes.rows as Array<{ d: Date | string }>).map((row) => {
    // node-postgres 把 DATE 返回为 Date 对象，统一转 YYYY-MM-DD 字符串
    if (row.d instanceof Date) {
      const y = row.d.getFullYear()
      const m = String(row.d.getMonth() + 1).padStart(2, '0')
      const day = String(row.d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    return String(row.d)
  })
  let streakDays = 0
  let cursor = today
  for (const d of dates) {
    if (d === cursor) {
      streakDays++
      const prev = new Date(Date.parse(cursor) - 86400000)
      const py = prev.getFullYear()
      const pm = String(prev.getMonth() + 1).padStart(2, '0')
      const pd = String(prev.getDate()).padStart(2, '0')
      cursor = `${py}-${pm}-${pd}`
    } else break
  }

  return { solved, totalAttempts: total, accuracy, streakDays, avgRating }
}
