<script setup lang="ts">
/**
 * 战术题库 / 每日挑战页（T21，F-E-17）。
 * 三栏布局对照设计稿 docs/pages/12-tactics.html：
 * 左：每日挑战 + 难度筛选 + 专题
 * 中：题目棋盘 + 提交 + 判定
 * 右：战绩 + 最近答题 + 连做奖励
 */
import { onMounted, onUnmounted, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import {
  CalendarCheck,
  Flame,
  X,
  Lightbulb,
  Eraser,
  SkipForward,
  Check,
  CheckCircle2,
  Eye,
} from '@lucide/vue'
import { T_BLACK, T_WHITE, legalMoves, type Board, type Pos } from '@othello-platform/engine'
import { useTacticsStore } from '@/stores/tactics-store'
import { useAuthStore } from '@/stores/auth-store'
import Piece from '@/components/game/Piece.vue'
import PageNavBar from '@/components/PageNavBar.vue'
import { toast } from 'vue-sonner'

const tactics = useTacticsStore()
const auth = useAuthStore()
const { t, locale } = useI18n()

const {
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
} = storeToRefs(tactics)

const DIFFICULTIES = computed(() => [
  { value: undefined, label: t('tactics.diffAll'), color: 'bg-text-secondary', default: true },
  { value: 'beginner' as const, label: t('tactics.diffBeginner'), color: 'bg-emerald-400' },
  { value: 'easy' as const, label: t('tactics.diffEasy'), color: 'bg-blue-400' },
  { value: 'medium' as const, label: t('tactics.diffMedium'), color: 'bg-amber-400' },
  { value: 'hard' as const, label: t('tactics.diffHard'), color: 'bg-rose-400' },
  { value: 'expert' as const, label: t('tactics.diffExpert'), color: 'bg-purple-400' },
])

const TOPICS = computed(() => [
  { value: 'corner' as const, label: t('tactics.topicCorner') },
  { value: 'edge' as const, label: t('tactics.topicEdge') },
  { value: 'x_square' as const, label: t('tactics.topicXSquare') },
  { value: 'endgame' as const, label: t('tactics.topicEndgame') },
  { value: 'maximize_flip' as const, label: t('tactics.topicMaximizeFlip') },
  { value: 'fewer_discs' as const, label: t('tactics.topicFewerDiscs') },
])

/** P3：各难度独立题数（基于全量题库，不受当前筛选影响） */
const diffCounts = computed(() => {
  const counts: Record<string, number> = {
    beginner: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    expert: 0,
  }
  for (const p of allPuzzles.value) {
    counts[p.difficulty] = (counts[p.difficulty] ?? 0) + 1
  }
  return counts
})

/** P5：当前筛选下的题数（"全部难度"按钮用） */
const totalCount = computed(() => allPuzzles.value.length)

const COL_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

const board = computed<Board>(() => {
  if (!currentPuzzle.value) return new Uint8Array(64)
  return Uint8Array.from(currentPuzzle.value.board)
})

const turn = computed(() => currentPuzzle.value?.turn ?? 'BLACK')

/** 当前盘面的合法手（只高亮 legalMoves 计算出的合法落子，避免误点非法手被判错） */
const legalSet = computed<Set<number>>(() => {
  if (!currentPuzzle.value || attemptResult.value) return new Set()
  const b = board.value
  const moves = legalMoves(b, turn.value as 'BLACK' | 'WHITE')
  return new Set(moves.map(p => p.y * 8 + p.x))
})

function onCellClick(x: number, y: number): void {
  if (attemptResult.value) return
  const idx = y * 8 + x
  if (!legalSet.value.has(idx)) return
  tactics.setAnswer({ x, y })
}

function posLabel(p: Pos | null): string {
  if (!p) return '-'
  return `${COL_LABELS[p.x] ?? ''}${p.y + 1}`
}

/** 提示线索：只给答案首字母（如 "f_"），不泄露完整解 */
const hintText = computed(() => {
  const sol = currentPuzzle.value?.solution ?? ''
  return sol.length > 1 ? `${sol[0]}_` : sol
})

/** 按当前语言选择解析文本 */
const puzzleExplanation = computed(() => {
  const p = currentPuzzle.value
  if (!p) return ''
  return locale.value === 'en' && p.explanationEn ? p.explanationEn : p.explanation
})

/** P6：下一题，已是最后一题时 toast 提示 */
function onNextPuzzle(): void {
  const ok = tactics.nextPuzzle()
  if (!ok) {
    toast.info(t('tactics.lastPuzzle'))
  }
}

/** P10：提交，未登录时 toast 提示而非跳转 login */
function onSubmit(): void {
  if (!auth.token) {
    toast.error(t('tactics.loginRequired'))
    return
  }
  void tactics.submit(auth.token)
}

// error 变化时 toast 提示（submit 失败等）
watch(error, (err) => {
  if (err) toast.error(err)
})

const todayDate = computed(() => {
  const d = new Date()
  return `${d.getMonth() + 1}月${d.getDate()}日`
})

const dailyProgress = computed(() => {
  const d = daily.value
  if (!d) return { done: 0, total: 0 }
  const puzzleIds = new Set(d.puzzles.map(p => p.id))
  const done = d.completedIds.filter(id => puzzleIds.has(id)).length
  return { done, total: d.puzzles.length }
})

function diffBadge(diff: string): string {
  const m: Record<string, string> = {
    beginner: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    easy: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    hard: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
    expert: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  }
  return m[diff] ?? m['beginner']!
}

function diffLabel(diff: string): string {
  const m: Record<string, string> = {
    beginner: t('tactics.diffBeginner'),
    easy: t('tactics.diffEasy'),
    medium: t('tactics.diffMedium'),
    hard: t('tactics.diffHard'),
    expert: t('tactics.diffExpert'),
  }
  return m[diff] ?? diff
}

function topicLabel(topic: string): string {
  const m: Record<string, string> = {
    corner: t('tactics.topicCorner'),
    edge: t('tactics.topicEdge'),
    x_square: t('tactics.topicXSquare'),
    endgame: t('tactics.topicEndgame'),
    maximize_flip: t('tactics.topicMaximizeFlip'),
    fewer_discs: t('tactics.topicFewerDiscs'),
  }
  return m[topic] ?? topic
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const accuracyPct = computed(() => {
  if (!stats.value) return 0
  return Math.round(stats.value.accuracy * 100)
})

onMounted(async () => {
  await Promise.all([
    tactics.loadPuzzles(),
    tactics.loadDaily(),
    auth.isAuthenticated ? tactics.loadStats() : Promise.resolve(),
  ])
  // 默认选第一题
  if (puzzles.value.length > 0 && !currentPuzzle.value) {
    tactics.selectPuzzle(puzzles.value[0]!)
  }
})

onUnmounted(() => {
  tactics.reset()
})
</script>

<template>
  <div class="min-h-screen bg-primary text-text-primary">
    <!-- 顶栏（设计稿 09/10/12/13 统一） -->
    <PageNavBar />

    <main class="pt-20 max-w-[1440px] mx-auto px-4 sm:px-8 pb-12">
      <div class="grid grid-cols-12 gap-6">
        <!-- 左：每日挑战 + 难度 + 专题 -->
        <aside class="col-span-12 lg:col-span-3 space-y-4">
          <!-- 每日挑战 -->
          <div
            class="backdrop-blur-xl bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/25 rounded-2xl p-5"
          >
            <div class="flex items-center gap-2 mb-3">
              <div class="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <CalendarCheck class="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p class="text-xs font-semibold text-purple-400">{{ $t('tactics.subtitle') }}</p>
                <p class="text-[9px] text-text-secondary">{{ todayDate }}</p>
              </div>
            </div>
            <div class="flex items-center justify-between mb-3">
              <p class="text-2xl font-black text-purple-400 font-mono">
                {{ dailyProgress.done }}/{{ dailyProgress.total }}
              </p>
              <span class="text-[10px] text-text-secondary">{{ $t('tactics.completed') }}</span>
            </div>
            <div class="flex items-center gap-1.5 mb-3">
              <div
                v-for="i in dailyProgress.total"
                :key="i"
                class="flex-1 h-1.5 rounded-full"
                :class="i <= dailyProgress.done ? 'bg-purple-400' : 'bg-[rgba(255,255,255,0.08)]'"
              ></div>
            </div>
            <div class="flex items-center gap-1.5 text-[10px] text-text-secondary">
              <Flame class="w-3 h-3 text-orange-400" />
              <span>{{ $t('tactics.streak', { n: stats?.streakDays ?? 0 }) }}</span>
              <span class="ml-auto">+50 {{ $t('tactics.completed') }}</span>
            </div>
          </div>

          <!-- 难度筛选 -->
          <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-4">
            <p class="text-[10px] uppercase tracking-wider text-text-secondary mb-3">
              {{ $t('tactics.difficultyFilter') }}
            </p>
            <div class="space-y-1.5">
              <button
                v-for="d in DIFFICULTIES"
                :key="d.label"
                type="button"
                class="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs"
                :class="
                  filter.difficulty === d.value
                    ? 'bg-gold/10 border border-gold/20 text-text-primary'
                    : 'hover:bg-[rgba(255,255,255,0.03)] text-text-secondary border border-transparent'
                "
                @click="tactics.setFilter({ difficulty: d.value })"
              >
                <span class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full" :class="d.color"></span>
                  {{ d.label }}
                </span>
                <span class="text-[9px] text-text-secondary">
                  {{ d.value ? diffCounts[d.value] : totalCount }}
                </span>
              </button>
            </div>
          </div>

          <!-- 专题 -->
          <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-4">
            <p class="text-[10px] uppercase tracking-wider text-text-secondary mb-3">
              {{ $t('tactics.topicFilter') }}
            </p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="tp in TOPICS"
                :key="tp.value"
                type="button"
                class="text-[10px] px-2 py-1 rounded-full border transition-colors cursor-pointer"
                :class="
                  filter.topic === tp.value
                    ? 'bg-gold/10 text-gold border-gold/20'
                    : 'bg-[rgba(255,255,255,0.03)] text-text-secondary border-glass-border hover:text-text-primary'
                "
                @click="
                  tactics.setFilter({ topic: filter.topic === tp.value ? undefined : tp.value })
                "
              >
                {{ tp.label }}
              </button>
            </div>
          </div>
        </aside>

        <!-- 中：题目棋盘 -->
        <section class="col-span-12 lg:col-span-6">
          <div v-if="loading" class="text-center py-12 text-text-secondary">
            {{ $t('common.loading') }}
          </div>
          <div v-else-if="error" class="text-red-400 text-sm py-8 text-center">{{ error }}</div>
          <div v-else-if="!currentPuzzle" class="text-center py-12 text-text-secondary">
            {{ $t('tactics.noPuzzles') }}
          </div>
          <template v-else>
            <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-6">
              <!-- 题目头部 -->
              <div class="flex items-center justify-between mb-5">
                <div>
                  <div class="flex items-center gap-2 mb-1">
                    <h2 class="text-base font-bold">
                      {{ $t('tactics.puzzleN', { n: currentPuzzle.puzzleNo }) }} ·
                      {{ topicLabel(currentPuzzle.topic) }}
                    </h2>
                    <span
                      class="text-[9px] px-1.5 py-0.5 rounded font-medium border"
                      :class="diffBadge(currentPuzzle.difficulty)"
                    >
                      {{ diffLabel(currentPuzzle.difficulty) }}
                    </span>
                  </div>
                  <p class="text-xs text-text-secondary">
                    {{
                      currentPuzzle.turn === 'BLACK'
                        ? $t('tactics.blackFirst')
                        : $t('tactics.whiteFirst')
                    }}
                    · {{ $t('tactics.findBest') }}
                  </p>
                </div>
              </div>

              <!-- 题目提示 -->
              <div
                class="bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-xl px-4 py-3 mb-5 flex items-start gap-2"
              >
                <Lightbulb class="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                <p class="text-xs text-text-secondary leading-relaxed">
                  {{ puzzleExplanation }}
                </p>
              </div>

              <!-- 提示线索（点"提示"按钮后显示，只给答案首字母） -->
              <div
                v-if="showHint && !attemptResult"
                class="bg-gold/5 border border-gold/25 rounded-xl px-4 py-3 mb-5 flex items-center gap-2"
              >
                <Lightbulb class="w-4 h-4 text-gold flex-shrink-0" />
                <p class="text-xs text-gold leading-relaxed">
                  {{ $t('tactics.hintClue', { h: hintText }) }}
                </p>
              </div>

              <!-- 棋盘 -->
              <div class="flex justify-center mb-5">
                <div class="inline-block">
                  <div class="grid grid-cols-8 mb-1 pl-5">
                    <div
                      v-for="l in COL_LABELS"
                      :key="l"
                      class="text-center text-[10px] text-text-secondary font-mono"
                    >
                      {{ l }}
                    </div>
                  </div>
                  <div class="flex">
                    <div class="flex flex-col mr-1">
                      <div
                        v-for="n in 8"
                        :key="n"
                        class="w-4 h-[48px] flex items-center justify-center text-[10px] text-text-secondary font-mono"
                      >
                        {{ n }}
                      </div>
                    </div>
                    <div
                      class="grid grid-cols-8 border-2 border-board-dark rounded-lg overflow-hidden shadow-[0_0_40px_rgba(26,107,60,0.2),0_16px_40px_rgba(0,0,0,0.5)]"
                    >
                      <button
                        v-for="i in 64"
                        :key="i"
                        type="button"
                        class="w-[48px] h-[48px] bg-board-green border border-board-dark flex items-center justify-center transition-colors"
                        :class="
                          legalSet.has(i - 1) && !attemptResult
                            ? 'hover:bg-[#1f8045] cursor-pointer'
                            : 'cursor-default'
                        "
                        @click="onCellClick((i - 1) % 8, Math.floor((i - 1) / 8))"
                      >
                        <Piece
                          v-if="board[i - 1] === T_BLACK || board[i - 1] === T_WHITE"
                          :color="board[i - 1] === T_BLACK ? 'BLACK' : 'WHITE'"
                        />
                        <div
                          v-else-if="
                            answerPos &&
                              answerPos.x === (i - 1) % 8 &&
                              answerPos.y === Math.floor((i - 1) / 8)
                          "
                          class="w-3 h-3 rounded-full bg-gold/60 border border-gold animate-pulse"
                        ></div>
                        <div
                          v-else-if="
                            attemptResult &&
                              currentPuzzle.bestPos.x === (i - 1) % 8 &&
                              currentPuzzle.bestPos.y === Math.floor((i - 1) / 8)
                          "
                          class="w-3 h-3 rounded-full bg-emerald-400/80 border border-emerald-400"
                        ></div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 选择 + 提交 -->
              <div class="space-y-3">
                <div
                  class="flex items-center gap-3 bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-xl px-4 py-3"
                >
                  <span class="text-[10px] uppercase tracking-wider text-text-secondary">
                    {{ $t('tactics.yourChoice') }}
                  </span>
                  <div
                    class="w-4 h-4 rounded-full"
                    :class="
                      turn === 'BLACK'
                        ? 'bg-gradient-to-br from-gray-700 to-gray-900'
                        : 'bg-gradient-to-br from-white to-gray-200'
                    "
                  ></div>
                  <span v-if="answerPos" class="text-sm font-bold text-gold font-mono">
                    {{ posLabel(answerPos) }}
                  </span>
                  <span v-else class="text-xs text-text-secondary">
                    {{ $t('tactics.clickToPlace') }}
                  </span>
                  <button
                    v-if="!attemptResult && answerPos"
                    type="button"
                    class="ml-auto text-[10px] text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
                    @click="tactics.clearAnswer()"
                  >
                    <Eraser class="w-3 h-3" />{{ $t('tactics.clear') }}
                  </button>
                </div>
                <div class="flex gap-3">
                  <button
                    type="button"
                    class="flex-1 py-3 rounded-xl font-bold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all hover:-translate-y-0.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="!answerPos || !!attemptResult"
                    @click="onSubmit()"
                  >
                    <Check class="w-4 h-4" />{{ $t('tactics.submit') }}
                  </button>
                  <button
                    type="button"
                    class="px-5 py-3 rounded-xl font-medium border transition-all text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    :class="
                      showHint && !attemptResult
                        ? 'text-gold border-gold/30 bg-gold/10'
                        : 'text-text-secondary border-glass-border hover:border-gold/30 hover:text-gold'
                    "
                    :disabled="!!attemptResult"
                    @click="tactics.toggleHint()"
                  >
                    <Lightbulb class="w-4 h-4" />{{ $t('tactics.hint') }}
                  </button>
                  <button
                    type="button"
                    class="px-5 py-3 rounded-xl font-medium text-text-secondary border border-glass-border hover:text-text-primary transition-all text-sm flex items-center gap-2"
                    @click="tactics.skip()"
                  >
                    <SkipForward class="w-4 h-4" />{{ $t('tactics.skip') }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 判定结果 -->
            <div
              v-if="attemptResult"
              class="backdrop-blur-xl rounded-2xl p-5 mt-4"
              :class="
                attemptResult.correct
                  ? 'bg-emerald-500/5 border border-emerald-500/25'
                  : 'bg-rose-500/5 border border-rose-500/25'
              "
            >
              <div class="flex items-center gap-3 mb-3">
                <div
                  class="w-10 h-10 rounded-full flex items-center justify-center"
                  :class="attemptResult.correct ? 'bg-emerald-500/20' : 'bg-rose-500/20'"
                >
                  <CheckCircle2 v-if="attemptResult.correct" class="w-5 h-5 text-emerald-400" />
                  <X v-else class="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <p
                    class="text-sm font-bold"
                    :class="
                      attemptResult.correct
                        ? 'text-emerald-400'
                        : attemptResult.skipped
                          ? 'text-amber-400'
                          : 'text-rose-400'
                    "
                  >
                    {{
                      attemptResult.correct
                        ? $t('tactics.verdictCorrect')
                        : attemptResult.skipped
                          ? $t('tactics.verdictSkipped')
                          : $t('tactics.verdictWrong')
                    }}
                  </p>
                  <p v-if="attemptResult.correct" class="text-[10px] text-text-secondary">
                    {{
                      $t('tactics.timeUsed', {
                        t: formatTime(attemptResult.timeMs),
                        r: attemptResult.rating,
                        score: attemptResult.correct ? 10 : 0,
                      })
                    }}
                  </p>
                </div>
                <button
                  type="button"
                  class="ml-auto px-3 py-1.5 rounded-lg text-[11px] font-medium bg-glass text-text-secondary border border-glass-border hover:bg-[rgba(255,255,255,0.08)] transition-all flex items-center gap-1"
                  @click="showExplanation = !showExplanation"
                >
                  <Eye class="w-3 h-3" />{{ $t('tactics.viewExplanation') }}
                </button>
              </div>
              <div
                v-if="showExplanation"
                class="bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-lg p-3 text-xs text-text-secondary leading-relaxed"
              >
                <span class="text-gold font-medium">{{ $t('tactics.explanation') }}：</span>
                <span class="text-emerald-400 font-mono">{{ currentPuzzle.solution }}</span>
                {{ currentPuzzle.explanation }}
              </div>
              <button
                type="button"
                class="w-full mt-4 py-2.5 rounded-xl font-medium text-sm bg-glass border border-glass-border hover:border-gold/30 transition-colors"
                @click="onNextPuzzle()"
              >
                {{ $t('tactics.nextPuzzle') }} →
              </button>
            </div>
          </template>
        </section>

        <!-- 右：战绩 + 最近答题 + 连做奖励 -->
        <aside class="col-span-12 lg:col-span-3 space-y-4">
          <!-- 战绩 -->
          <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5">
            <p class="text-[10px] uppercase tracking-wider text-text-secondary mb-4">
              {{ $t('tactics.myStats') }}
            </p>
            <div class="grid grid-cols-2 gap-3">
              <div
                class="text-center bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-lg p-3"
              >
                <p class="text-xl font-bold text-emerald-400 font-mono">{{ stats?.solved ?? 0 }}</p>
                <p class="text-[9px] text-text-secondary mt-0.5">{{ $t('tactics.solved') }}</p>
              </div>
              <div
                class="text-center bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-lg p-3"
              >
                <p class="text-xl font-bold text-gold font-mono">{{ accuracyPct }}%</p>
                <p class="text-[9px] text-text-secondary mt-0.5">{{ $t('tactics.accuracy') }}</p>
              </div>
              <div
                class="text-center bg-[rgba(255,255,255,0.02)] border border-gold/20 rounded-lg p-3"
              >
                <p class="text-xl font-bold text-orange-400 font-mono">
                  {{ stats?.streakDays ?? 0 }}
                </p>
                <p class="text-[9px] text-orange-400/70 mt-0.5">{{ $t('tactics.streakDays') }}</p>
              </div>
              <div
                class="text-center bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-lg p-3"
              >
                <p class="text-xl font-bold text-text-primary font-mono">
                  {{ stats?.avgRating ?? '-' }}
                </p>
                <p class="text-[9px] text-text-secondary mt-0.5">{{ $t('tactics.avgRating') }}</p>
              </div>
            </div>
          </div>

          <!-- 最近答题 -->
          <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5">
            <p class="text-[10px] uppercase tracking-wider text-text-secondary mb-3">
              {{ $t('tactics.recentAttempts') }}
            </p>
            <div
              v-if="recentAttempts.length === 0"
              class="text-text-secondary text-xs text-center py-4"
            >
              -
            </div>
            <div v-else class="space-y-2">
              <button
                v-for="(a, i) in recentAttempts.slice(0, 5)"
                :key="i"
                type="button"
                class="w-full flex items-center gap-3 text-xs rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-[rgba(255,255,255,0.04)] cursor-pointer text-left"
                :title="$t('tactics.retryTitle')"
                @click="tactics.retryPuzzle(a.puzzleId)"
              >
                <span
                  class="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  :class="a.correct ? 'bg-emerald-500/15' : 'bg-rose-500/15'"
                >
                  <Check v-if="a.correct" class="w-3 h-3 text-emerald-400" />
                  <X v-else class="w-3 h-3 text-rose-400" />
                </span>
                <span class="flex-1 truncate">
                  {{ $t('tactics.puzzleN', { n: a.puzzleNo ?? a.puzzleId }) }}
                </span>
                <span
                  v-if="a.rating"
                  class="text-[9px]"
                  :class="a.correct ? 'text-emerald-400' : 'text-rose-400'"
                >
                  {{ a.rating }}
                </span>
                <span v-else class="text-[9px] text-gold">{{ $t('tactics.retry') }}</span>
              </button>
            </div>
          </div>

          <!-- 连做奖励 -->
          <div
            class="backdrop-blur-xl bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/25 rounded-2xl p-5"
          >
            <div class="flex items-center gap-2 mb-3">
              <Flame class="w-4 h-4 text-orange-400" />
              <span class="text-xs font-semibold text-orange-400">
                {{ $t('tactics.streakReward') }}
              </span>
            </div>
            <p class="text-[10px] text-text-secondary mb-3">{{ $t('tactics.streak', { n: 7 }) }}</p>
            <div class="flex items-center justify-between text-[10px]">
              <span class="text-text-secondary">{{ $t('tactics.reward3') }}</span>
              <span class="text-emerald-400">{{ $t('tactics.reward3Desc') }}</span>
            </div>
            <div class="flex items-center justify-between text-[10px] mt-1.5">
              <span class="text-text-secondary">{{ $t('tactics.reward7') }}</span>
              <span class="text-gold">{{ $t('tactics.reward7Desc') }}</span>
            </div>
            <div class="flex items-center justify-between text-[10px] mt-1.5 opacity-50">
              <span class="text-text-secondary">{{ $t('tactics.reward30') }}</span>
              <span class="text-purple-400">{{ $t('tactics.reward30Desc') }}</span>
            </div>
          </div>
        </aside>
      </div>
    </main>
  </div>
</template>
