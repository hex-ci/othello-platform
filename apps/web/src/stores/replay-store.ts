/**
 * 复盘状态（T15，F-E-09/11）。
 * 加载已结束对局的走子历史，本地用 engine 逐步回放，
 * 支持播放/暂停/单步前进后退/跳转/变速，显示翻子与比分变化。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createInitialBoard,
  applyMove,
  countPieces,
  type Board,
  type Color,
  type Pos,
} from '@othello-platform/engine'
import type { GameDTO, MoveDTO, GameAnalysisDTO } from '@othello-platform/shared'
import * as api from '@/api/rooms'

interface StepFrame {
  /** 本步走子后的棋盘 */
  board: Board
  move: MoveDTO | null // null 表示初始盘（第 0 帧）
  blackCount: number
  whiteCount: number
}

const SPEEDS = [0.5, 1, 2] as const
const BASE_INTERVAL_MS = 1000

export const useReplayStore = defineStore('replay', () => {
  const game = ref<GameDTO | null>(null)
  const blackName = ref<string | null>(null)
  const whiteName = ref<string | null>(null)
  const frames = ref<StepFrame[]>([])
  const currentStep = ref(0)
  const playing = ref(false)
  const speed = ref<number>(1)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const analysis = ref<GameAnalysisDTO | null>(null)
  const analyzing = ref(false)
  const analysisError = ref<string | null>(null)

  let playTimer: ReturnType<typeof setTimeout> | null = null

  const totalSteps = computed(() => frames.value.length - 1)
  const currentFrame = computed(() => frames.value[currentStep.value] ?? frames.value[0])
  const board = computed<Board>(() => currentFrame.value?.board ?? createInitialBoard())
  const blackCount = computed(() => currentFrame.value?.blackCount ?? 2)
  const whiteCount = computed(() => currentFrame.value?.whiteCount ?? 2)
  const isFinished = computed(() => currentStep.value >= totalSteps.value)

  /** 由走子序列预计算每步棋盘快照（含初始盘） */
  function buildFrames(moves: MoveDTO[]): StepFrame[] {
    const result: StepFrame[] = []
    let b = createInitialBoard()
    result.push({ board: b, move: null, blackCount: 2, whiteCount: 2 })
    for (const m of moves) {
      if (!m.isPass && m.pos) {
        const applied = applyMove(b, m.color as Color, m.pos as Pos)
        if (applied) b = applied.board
      }
      const counts = countPieces(b)
      result.push({ board: b, move: m, blackCount: counts.black, whiteCount: counts.white })
    }
    return result
  }

  async function loadById(gameId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const data = await api.getReplay(gameId)
      hydrate(data)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载复盘失败'
    } finally {
      loading.value = false
    }
  }

  async function loadByToken(token: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const data = await api.getReplayByToken(token)
      hydrate(data)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '分享链接无效或已失效'
    } finally {
      loading.value = false
    }
  }

  /** 由记谱序列构建本地复盘帧（F-E-19 导入记谱，无服务端数据） */
  function loadFromMoves(moves: Array<{ color: Color; pos: Pos | null; isPass: boolean }>): void {
    stop()
    game.value = null
    blackName.value = null
    whiteName.value = null
    analysis.value = null
    analysisError.value = null
    // 转为 MoveDTO 形态供 buildFrames 使用
    const moveDtos: MoveDTO[] = moves.map((m, i) => ({
      seq: i + 1,
      color: m.color,
      pos: m.pos,
      isPass: m.isPass,
      flipped: [],
    }))
    frames.value = buildFrames(moveDtos)
    currentStep.value = 0
  }

  function hydrate(data: api.ReplayData): void {
    game.value = data.game
    blackName.value = data.blackName
    whiteName.value = data.whiteName
    frames.value = buildFrames(data.moves)
    currentStep.value = 0
    analysis.value = null
    analysisError.value = null
    stop()
  }

  /** 触发 AI 复盘分析（懒加载，失败不阻塞复盘主流程） */
  async function loadAnalysis(): Promise<void> {
    if (!game.value) return
    if (analysis.value || analyzing.value) return
    analyzing.value = true
    analysisError.value = null
    try {
      // 先尝试读缓存
      try {
        analysis.value = await api.getAnalysis(game.value.id)
      } catch {
        // 缓存不存在 → 触发分析
        analysis.value = await api.analyzeGame(game.value.id)
      }
    } catch (err) {
      analysisError.value = err instanceof Error ? err.message : 'AI 分析失败'
    } finally {
      analyzing.value = false
    }
  }

  // ─── 播放控制 ───

  function stepForward(): void {
    if (currentStep.value < totalSteps.value) currentStep.value += 1
  }

  function stepBack(): void {
    if (currentStep.value > 0) currentStep.value -= 1
  }

  function goToStart(): void {
    currentStep.value = 0
  }

  function goToEnd(): void {
    currentStep.value = totalSteps.value
  }

  function goTo(step: number): void {
    currentStep.value = Math.max(0, Math.min(totalSteps.value, step))
  }

  function cycleSpeed(): void {
    const idx = SPEEDS.indexOf(speed.value as (typeof SPEEDS)[number])
    speed.value = SPEEDS[(idx + 1) % SPEEDS.length] ?? 1
    if (playing.value) {
      stop()
      play()
    }
  }

  function play(): void {
    if (playing.value) return
    if (isFinished.value) currentStep.value = 0
    playing.value = true
    scheduleNext()
  }

  function pause(): void {
    playing.value = false
    if (playTimer) {
      clearTimeout(playTimer)
      playTimer = null
    }
  }

  function togglePlay(): void {
    if (playing.value) pause()
    else play()
  }

  function stop(): void {
    pause()
  }

  function scheduleNext(): void {
    if (!playing.value) return
    playTimer = setTimeout(() => {
      if (currentStep.value >= totalSteps.value) {
        pause()
        return
      }
      stepForward()
      scheduleNext()
    }, BASE_INTERVAL_MS / speed.value)
  }

  function reset(): void {
    stop()
    game.value = null
    frames.value = []
    currentStep.value = 0
    error.value = null
    analysis.value = null
    analysisError.value = null
    analyzing.value = false
  }

  return {
    game,
    blackName,
    whiteName,
    frames,
    currentStep,
    playing,
    speed,
    loading,
    error,
    analysis,
    analyzing,
    analysisError,
    totalSteps,
    currentFrame,
    board,
    blackCount,
    whiteCount,
    isFinished,
    loadById,
    loadByToken,
    loadFromMoves,
    loadAnalysis,
    stepForward,
    stepBack,
    goToStart,
    goToEnd,
    goTo,
    cycleSpeed,
    play,
    pause,
    togglePlay,
    reset,
  }
})
