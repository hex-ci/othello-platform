/**
 * 领域基础类型（附录 C §C.1）。
 * 契约单一来源，web/server 共用。
 */

export type Color = 'BLACK' | 'WHITE'
export type Cell = 0 | 1 | 2 // T_NONE | T_BLACK | T_WHITE
export type Pos = { x: number, y: number } // 0..7
export type AiLevel = 0 | 1 | 2 | 3 | 4 | 5 // L0 热身不计分

export type GameMode = 'human_vs_ai' | 'human_vs_human'
export type GameResult = 'BLACK' | 'WHITE' | 'DRAW'
export type EndReason = 'normal' | 'resign' | 'draw_agree' | 'disconnect' | 'timeout'
export type RoomStatus = 'waiting' | 'playing' | 'finished'
export type GameStatus = 'playing' | 'finished' | 'cancelled'

export interface MoveDTO {
  seq: number
  color: Color
  pos: Pos | null // null 表示 pass
  isPass: boolean
  flipped: Pos[]
}

export interface GameStateDTO {
  gameId: string
  board: Cell[] // 长度 64
  turn: Color
  blackCount: number
  whiteCount: number
  status: GameStatus
}

export interface RoomDTO {
  id: number
  name: string
  mode: GameMode
  aiLevel: AiLevel | null
  status: RoomStatus
  hasPassword: boolean
}

export interface UserDTO {
  id: number
  username: string
  elo: number
  classicScore: number
  wins: number
  losses: number
  draws: number
  gamesPlayed: number
}

/** 资料页：ELO 走势单点（F-C-10~13，对照设计稿 09-profile） */
export interface EloHistoryPointDTO {
  gameId: string
  elo: number
  delta: number
  createdAt: string
}

/** 资料页：对局历史单条 */
export interface GameHistoryDTO {
  gameId: string
  opponentId: number | null
  opponentName: string
  mode: GameMode
  myColor: 'BLACK' | 'WHITE'
  result: 'BLACK' | 'WHITE' | 'DRAW' | null
  endReason: string | null
  moveCount: number
  endedAt: string | null
}

/** 资料页：AI 对战统计（按难度聚合） */
export interface AiStatDTO {
  aiLevel: number
  games: number
  wins: number
  losses: number
  draws: number
  winRate: number
}

/** 资料页：最近 N 天活跃度 */
export interface ActivityDTO {
  date: string // YYYY-MM-DD
  games: number
}

/** 好友/屏蔽关系（T16，F-E-07） */
export type FriendStatus = 'pending' | 'accepted' | 'blocked'

export interface FriendDTO {
  id: number
  /** 对方用户 id */
  userId: number
  username: string
  elo: number
  status: FriendStatus
  /** 请求方向：outgoing=我发出待接受，incoming=对方发给我 */
  direction: 'outgoing' | 'incoming'
  online: boolean
}

/**
 * 我与某用户的关系状态（profile 页"发起挑战/加好友"按钮用，T17/F-E-16）。
 * - none：无关系
 * - accepted：已是好友
 * - pending-out：我发出待对方接受
 * - pending-in：对方发给我待我接受
 * - blocked：我屏蔽了对方（单向，只看自己是否屏蔽）
 */
export type RelationStatus = 'none' | 'accepted' | 'pending-out' | 'pending-in' | 'blocked'

/** friend-status 接口返回（GET /api/v1/users/:id/friend-status） */
export interface FriendStatusDTO {
  status: RelationStatus
  isFriend: boolean
}

/** 榜单条目（T16，F-E-08） */
export interface LeaderboardEntryDTO {
  rank: number
  id: number
  username: string
  elo: number
  classicScore: number
  wins: number
  losses: number
  draws: number
  gamesPlayed: number
  winRate: number
}

export interface GameDTO {
  id: string // 形如 "g_101"
  roomId: number | null
  blackId: number | null
  whiteId: number | null
  aiLevel: AiLevel | null
  aiColor: Color | null
  mode: GameMode
  status: GameStatus
  result: GameResult | null
  endReason: EndReason | null
  moveCount: number
  shareToken: string | null
}

export interface ChatDTO {
  id: number
  roomId: number | null
  gameId: string | null
  userId: number
  username: string
  channel: 'public' | 'room'
  message: string
  createdAt: number // epoch ms
}

export interface OnlineUserDTO {
  id: number
  username: string
}

/** AI 复盘分析（T20，F-E-09 增强） */
export type MoveClassification = 'brilliant' | 'good' | 'inaccuracy' | 'blunder' | 'normal'

export interface MoveAnalysisDTO {
  seq: number
  color: Color
  pos: Pos | null
  isPass: boolean
  /** 归一化评估值，黑方视角 [-1,+1]（正=黑优） */
  eval: number
  bestPos: Pos | null
  bestEval: number
  /** 实际手与最佳手的分差（走子方视角，<=0） */
  delta: number
  classification: MoveClassification
}

export interface AnalysisSummaryDTO {
  blackAvg: number
  whiteAvg: number
  brilliantCount: number
  blunderCount: number
  inaccuracyCount: number
  result: GameResult | null
}

export interface GameAnalysisDTO {
  gameId: string
  moves: MoveAnalysisDTO[]
  summary: AnalysisSummaryDTO
}

/** 战术题库 / 每日挑战 / 标准记谱（T21，F-E-17/19） */
export type PuzzleDifficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert'
export type PuzzleTopic
  = 'corner' | 'edge' | 'x_square' | 'endgame' | 'maximize_flip' | 'fewer_discs'

export interface PuzzleDTO {
  id: number
  difficulty: PuzzleDifficulty
  topic: PuzzleTopic
  /** 走子方（黑/白先） */
  turn: Color
  /** 盘面（长度 64，同 GameStateDTO.board） */
  board: Cell[]
  /** 最佳手坐标 */
  bestPos: Pos
  /** 标准记谱形式的解（如 "a1"） */
  solution: string
  /** 解析文本 */
  explanation: string
  /** 英文解析文本 */
  explanationEn: string | null
  /** 题号（展示用） */
  puzzleNo: number
}

export interface DailyChallengeDTO {
  challengeDate: string // YYYY-MM-DD
  puzzles: PuzzleDTO[]
  /** 当日已答对的题目 id（鉴权后填充，未登录为空数组） */
  completedIds: number[]
}

/** 作答评级 */
export type AttemptRating = 'S' | 'A' | 'B' | 'C'

export interface PuzzleAttemptDTO {
  id: number
  userId: number
  puzzleId: number
  answerPos: Pos | null
  correct: boolean
  timeMs: number
  rating: AttemptRating | null
  createdAt: number
}

export interface PuzzleStatsDTO {
  solved: number
  totalAttempts: number
  accuracy: number
  streakDays: number
  avgRating: AttemptRating | null
}

/** 赛季 / 段位 / 徽章（T22，F-E-18） */
export type TierName = 'king' | 'master' | 'diamond' | 'platinum' | 'gold' | 'silver'

/** 段位阈值（降序），首个满足 elo >= threshold 的即为该段位 */
export const TIER_THRESHOLDS: ReadonlyArray<{ tier: TierName, min: number }> = [
  { tier: 'king', min: 2000 },
  { tier: 'master', min: 1800 },
  { tier: 'diamond', min: 1600 },
  { tier: 'platinum', min: 1400 },
  { tier: 'gold', min: 1200 },
  { tier: 'silver', min: 0 },
] as const

/** 按 ELO 推段位（前后端共用单一来源，解决 D6 段位占位） */
export function tierOfElo(elo: number): TierName {
  for (const t of TIER_THRESHOLDS) {
    if (elo >= t.min) return t.tier
  }
  return 'silver'
}

export type SeasonStatus = 'active' | 'settled'

export interface SeasonDTO {
  id: number
  name: string
  startDate: string
  endDate: string
  status: SeasonStatus
}

export interface UserSeasonRatingDTO {
  seasonId: number
  userId: number
  peakElo: number
  peakTier: TierName
  finalElo: number | null
}

export type BadgeType
  = | 'first_win'
    | 'streak_5'
    | 'streak_10'
    | 'season_king'
    | 'perfect_review'
    | 'puzzle_master'
    | 'weekly_champion'

export interface BadgeDTO {
  id: number
  userId: number
  badgeType: BadgeType
  earnedAt: number
}
