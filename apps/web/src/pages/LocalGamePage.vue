<script setup lang="ts">
/**
 * 离线人机练习场（F-C-05「马上玩」，对照设计稿 16-local）。
 * 全高棋盘页布局（与 OnlineGamePage 一致）：顶栏（返回出口）+ 左棋盘 + 右侧栏
 * （比分 / 回合状态 / 难度 / 操作 / 小贴士）。免登录、不计分。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Home,
  ArrowLeft,
  ChevronDown,
  Lightbulb,
  Undo2,
  RotateCw,
  GraduationCap,
} from '@lucide/vue'
import { useGameStore } from '@/stores/game-store'
import type { AiLevel } from '@othello-platform/engine'
import BoardCanvas from '@/components/game/BoardCanvas.vue'
import ScoreBar from '@/components/game/ScoreBar.vue'
import GameOverDialog from '@/components/game/GameOverDialog.vue'

const router = useRouter()
const store = useGameStore()
const { t } = useI18n()

const LEVELS = computed<{ value: AiLevel; label: string }[]>(() => [
  { value: 0, label: t('aiLevel.l0') },
  { value: 1, label: t('aiLevel.l1') },
  { value: 2, label: t('aiLevel.l2') },
  { value: 3, label: t('aiLevel.l3') },
  { value: 4, label: t('aiLevel.l4') },
  { value: 5, label: t('aiLevel.l5') },
])

function onLevelChange(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value) as AiLevel
  store.newGame(value)
}

/** 回合状态文案（侧栏状态卡） */
const turnText = computed(() => {
  if (store.gameStatus !== 'playing') return t('local.gameOver')
  if (store.isThinking) return t('local.aiThinking')
  return store.turn === 'BLACK' ? t('local.yourTurn') : t('local.aiTurn')
})

const isMyTurn = computed(() => store.turn === 'BLACK' && store.gameStatus === 'playing')
</script>

<template>
  <div class="min-h-screen bg-primary text-text-primary">
    <!-- 顶栏：Logo + 离线练习标题 + 不计分 badge + 返回出口 -->
    <nav
      class="fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-xl bg-[rgba(15,17,23,0.85)] border-b border-glass-border"
    >
      <div class="max-w-[1440px] mx-auto h-full px-4 sm:px-8 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <button type="button" class="flex items-center gap-3 cursor-pointer group" @click="router.push('/')">
            <div
              class="w-9 h-9 rounded-lg bg-gradient-to-br from-board-green to-[#0d4a28] flex items-center justify-center"
            >
              <div class="grid grid-cols-2 gap-0.5">
                <div class="w-2.5 h-2.5 rounded-full bg-black"></div>
                <div class="w-2.5 h-2.5 rounded-full bg-white"></div>
                <div class="w-2.5 h-2.5 rounded-full bg-white"></div>
                <div class="w-2.5 h-2.5 rounded-full bg-black"></div>
              </div>
            </div>
            <span class="text-lg font-bold tracking-wide group-hover:text-gold transition-colors">
              Othello
            </span>
          </button>
          <span class="hidden sm:block text-sm font-semibold text-text-secondary">·</span>
          <span class="hidden sm:block text-sm font-semibold">{{ $t('local.pageTitle') }}</span>
          <span
            class="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium"
          >
            {{ $t('local.unrated') }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-text-secondary hover:text-gold hover:bg-glass transition-all"
            @click="router.push('/')"
          >
            <Home class="w-3.5 h-3.5" /><span class="hidden sm:inline">
              {{ $t('common.home') }}
            </span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-text-secondary hover:text-gold hover:bg-glass transition-all"
            @click="router.push('/lobby')"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">
              {{ $t('common.backToLobby') }}
            </span>
          </button>
        </div>
      </div>
    </nav>

    <main class="pt-16 min-h-screen relative overflow-hidden">
      <!-- 氛围层 -->
      <div
        class="absolute top-1/3 left-[-10%] w-[600px] h-[600px] rounded-full bg-board-green/12 blur-[130px] pointer-events-none"
      ></div>
      <div
        class="absolute bottom-[-15%] right-[-6%] w-[480px] h-[480px] rounded-full bg-gold/8 blur-[120px] pointer-events-none"
      ></div>
      <div
        class="absolute inset-0 opacity-[0.03] pointer-events-none"
        :style="{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }"
      ></div>

      <div
        class="max-w-[1440px] mx-auto px-4 sm:px-8 min-h-[calc(100vh-4rem)] flex flex-col lg:flex-row relative"
      >
        <!-- 左：棋盘（居中） -->
        <div class="flex-1 flex items-center justify-center py-8">
          <BoardCanvas />
        </div>

        <!-- 右：侧栏 -->
        <aside
          class="w-full lg:w-72 p-5 flex flex-col gap-4 lg:border-l border-glass-border overflow-y-auto"
        >
          <!-- 比分卡 -->
          <ScoreBar />

          <!-- 回合状态卡 -->
          <div
            class="backdrop-blur-xl rounded-2xl p-4 flex items-center gap-3 border transition-colors"
            :class="
              isMyTurn
                ? 'bg-gold/5 border-gold/25'
                : store.gameStatus === 'playing'
                  ? 'bg-glass border-glass-border'
                  : 'bg-emerald-500/5 border-emerald-500/25'
            "
          >
            <div
              class="w-9 h-9 rounded-full shrink-0"
              :class="[
                store.turn === 'BLACK' ? 'stone-b' : 'stone-w',
                store.gameStatus === 'playing'
                  ? 'animate-[turnPulse_1.8s_ease-in-out_infinite]'
                  : '',
              ]"
            ></div>
            <div>
              <p class="text-sm font-bold" :class="isMyTurn ? 'text-gold' : 'text-text-primary'">
                {{ turnText }}
              </p>
              <p class="text-[10px] text-text-secondary mt-0.5">
                {{
                  store.gameStatus !== 'playing'
                    ? $t('local.overHint')
                    : isMyTurn
                      ? $t('local.turnHint')
                      : $t('local.waitHint')
                }}
              </p>
            </div>
          </div>

          <!-- 难度选择 -->
          <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-4">
            <label
              for="ai-level"
              class="text-[10px] uppercase tracking-wider text-text-secondary block mb-2.5"
            >
              {{ $t('local.difficulty') }}
            </label>
            <div class="relative">
              <select
                id="ai-level"
                :value="store.aiLevel"
                class="w-full appearance-none bg-[rgba(255,255,255,0.04)] border border-glass-border rounded-lg py-2.5 pl-3 pr-8 text-xs text-text-primary outline-none focus:border-gold/40 cursor-pointer"
                @change="onLevelChange"
              >
                <option v-for="level in LEVELS" :key="level.value" :value="level.value">
                  {{ level.label }}
                </option>
              </select>
              <ChevronDown
                class="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-secondary pointer-events-none"
              />
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              class="group flex flex-col items-center gap-1.5 p-3 rounded-xl border border-glass-border bg-[rgba(255,255,255,0.02)] hover:border-amber-500/35 hover:bg-amber-500/5 transition-all"
              @click="store.showHint()"
            >
              <Lightbulb class="w-4 h-4 text-amber-400" />
              <span
                class="text-[10px] font-medium text-text-secondary group-hover:text-amber-300 transition-colors"
              >
                {{ $t('local.hint') }}
              </span>
            </button>
            <button
              type="button"
              class="group flex flex-col items-center gap-1.5 p-3 rounded-xl border border-glass-border bg-[rgba(255,255,255,0.02)] hover:border-cyan-500/35 hover:bg-cyan-500/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              :disabled="store.moveHistory.length < 2 || store.isThinking"
              @click="store.undoMove()"
            >
              <Undo2 class="w-4 h-4 text-cyan-400" />
              <span
                class="text-[10px] font-medium text-text-secondary group-hover:text-cyan-300 transition-colors"
              >
                {{ $t('local.undo') }}
              </span>
            </button>
            <button
              type="button"
              class="group flex flex-col items-center gap-1.5 p-3 rounded-xl border border-glass-border bg-[rgba(255,255,255,0.02)] hover:border-gold/35 hover:bg-gold/5 transition-all"
              @click="store.newGame()"
            >
              <RotateCw class="w-4 h-4 text-gold" />
              <span
                class="text-[10px] font-medium text-text-secondary group-hover:text-gold transition-colors"
              >
                {{ $t('local.newGame') }}
              </span>
            </button>
          </div>

          <!-- 练习小贴士 -->
          <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-4 mt-auto">
            <div class="flex items-center gap-2 mb-2">
              <GraduationCap class="w-3.5 h-3.5 text-emerald-400" />
              <span class="text-[10px] uppercase tracking-wider text-text-secondary">
                {{ $t('local.practiceTipTitle') }}
              </span>
            </div>
            <p class="text-[11px] text-text-secondary leading-relaxed">
              {{ $t('local.practiceTip') }}
            </p>
          </div>
        </aside>
      </div>
    </main>

    <!-- 终局弹窗 -->
    <GameOverDialog />
  </div>
</template>

<style scoped>
.stone-b {
  background: radial-gradient(circle at 35% 30%, #4a4a4a, #0a0a0a 62%);
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.55),
    inset 0 1px 2px rgba(255, 255, 255, 0.14);
}
.stone-w {
  background: radial-gradient(circle at 35% 30%, #ffffff, #c9ced6 68%);
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.45),
    inset 0 -1px 2px rgba(0, 0, 0, 0.12);
}
@keyframes turnPulse {
  0%,
  100% {
    box-shadow:
      0 0 0 2px rgba(212, 168, 67, 0.55),
      0 0 14px rgba(212, 168, 67, 0.35);
  }
  50% {
    box-shadow:
      0 0 0 3px rgba(212, 168, 67, 0.9),
      0 0 26px rgba(212, 168, 67, 0.6);
  }
}
</style>
