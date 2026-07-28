/**
 * 题库状态（T21，F-E-17）。
 * 加载题库列表 / 每日挑战 / 当前题目 / 作答判定 / 战绩统计。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  PuzzleDTO,
  DailyChallengeDTO,
  PuzzleAttemptDTO,
  PuzzleStatsDTO,
  PuzzleDifficulty,
  PuzzleTopic,
  Pos,
} from '@othello-platform/shared'
import * as api from '@/api/rooms'

export const useTacticsStore = defineStore('tactics', () => {
  const puzzles = ref<PuzzleDTO[]>([])
  const allPuzzles = ref<PuzzleDTO[]>([])
  const daily = ref<DailyChallengeDTO | null>(null)
  const currentPuzzle = ref<PuzzleDTO | null>(null)
  const answerPos = ref<Pos | null>(null)
  const attemptResult = ref<{
    correct: boolean
    rating: string | null
    timeMs: number
    skipped?: boolean
  } | null>(null)
  const showExplanation = ref(false)
  const showHint = ref(false)
  const stats = ref<PuzzleStatsDTO | null>(null)
  const recentAttempts = ref<(PuzzleAttemptDTO & { puzzleNo?: number; topic?: string })[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const filter = ref<{ difficulty?: PuzzleDifficulty; topic?: PuzzleTopic }>({})

  let startTime = 0

  const filteredPuzzles = computed(() => puzzles.value)

  async function loadPuzzles(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      // 全量加载一次用于难度计数（P3：按钮显示各难度独立题数）
      if (allPuzzles.value.length === 0) {
        const allRes = await api.listPuzzles()
        allPuzzles.value = allRes.puzzles
      }
      const res = await api.listPuzzles(filter.value)
      puzzles.value = res.puzzles
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载题库失败'
    } finally {
      loading.value = false
    }
  }

  async function loadDaily(): Promise<void> {
    try {
      daily.value = await api.getDailyChallenge()
    } catch {
      daily.value = null
    }
  }

  async function loadStats(): Promise<void> {
    try {
      stats.value = await api.getMyPuzzleStats()
      const att = await api.listMyAttempts(5)
      recentAttempts.value = att.attempts as (PuzzleAttemptDTO & {
        puzzleNo?: number
        topic?: string
      })[]
    } catch {
      // 未登录等
    }
  }

  function selectPuzzle(p: PuzzleDTO): void {
    currentPuzzle.value = p
    answerPos.value = null
    attemptResult.value = null
    showExplanation.value = false
    showHint.value = false
    startTime = Date.now()
  }

  /** 重做某题（最近答题点击）：若已在当前列表则直接选中，否则按 id 加载 */
  async function retryPuzzle(puzzleId: number): Promise<void> {
    const existing =
      puzzles.value.find((p) => p.id === puzzleId) ??
      allPuzzles.value.find((p) => p.id === puzzleId)
    if (existing) {
      selectPuzzle(existing)
      return
    }
    loading.value = true
    error.value = null
    try {
      const p = await api.getPuzzle(puzzleId)
      selectPuzzle(p)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载题目失败'
    } finally {
      loading.value = false
    }
  }

  function toggleHint(): void {
    showHint.value = !showHint.value
  }

  function setAnswer(pos: Pos): void {
    if (attemptResult.value) return
    answerPos.value = pos
  }

  function clearAnswer(): void {
    if (attemptResult.value) return
    answerPos.value = null
  }

  async function submit(authToken?: string | null): Promise<void> {
    if (!currentPuzzle.value || attemptResult.value) return
    // P10：未登录不提交，避免 401 触发全局跳转丢失已落子
    if (!authToken) {
      error.value = '请先登录后再提交'
      return
    }
    const timeMs = Date.now() - startTime
    try {
      const res = await api.submitAttempt(currentPuzzle.value.id, answerPos.value, timeMs)
      attemptResult.value = { correct: res.correct, rating: res.attempt.rating, timeMs }
      void loadStats()
      // P1：刷新每日挑战进度（completedIds 更新）
      void loadDaily()
    } catch (err) {
      error.value = err instanceof Error ? err.message : '提交失败'
    }
  }

  function skip(): void {
    attemptResult.value = {
      correct: false,
      rating: null,
      timeMs: Date.now() - startTime,
      skipped: true,
    }
    showExplanation.value = true
  }

  /** 切到下一题。返回 false 表示已是最后一题（P6：供组件提示） */
  function nextPuzzle(): boolean {
    if (!currentPuzzle.value) return false
    const idx = puzzles.value.findIndex((p) => p.id === currentPuzzle.value!.id)
    const next = puzzles.value[idx + 1]
    if (next) {
      selectPuzzle(next)
      return true
    }
    return false
  }

  function setFilter(f: { difficulty?: PuzzleDifficulty; topic?: PuzzleTopic }): void {
    filter.value = f
    void loadPuzzles().then(() => {
      // P8：筛选后自动切到列表第一题（避免显示不在筛选范围的题）
      if (puzzles.value.length > 0) selectPuzzle(puzzles.value[0]!)
    })
  }

  function reset(): void {
    currentPuzzle.value = null
    answerPos.value = null
    attemptResult.value = null
    showExplanation.value = false
  }

  return {
    puzzles,
    allPuzzles,
    daily,
    currentPuzzle,
    answerPos,
    attemptResult,
    showExplanation,
    showHint,
    stats,
    recentAttempts,
    loading,
    error,
    filter,
    filteredPuzzles,
    loadPuzzles,
    loadDaily,
    loadStats,
    selectPuzzle,
    retryPuzzle,
    setAnswer,
    clearAnswer,
    toggleHint,
    submit,
    skip,
    nextPuzzle,
    setFilter,
    reset,
  }
})
