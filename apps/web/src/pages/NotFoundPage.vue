<script setup lang="ts">
/**
 * 404 页（对照设计稿 15-not-found）：棋子拼出 "404"（0 = 白子）+ 初始局面棋盘
 * （A1 为"迷失格"金色 ? 脉冲）+ 趣味文案 + 三出口。游戏平台风格。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Home, Users, Play } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth-store'

const router = useRouter()
const auth = useAuthStore()

// 初始局面（仅中央 4 子）；A1（index 0）为"迷失格"
const BOARD_POS = '...........................WB......BW...........................'
const LOST_CELL = 0

const boardCells = computed(() =>
  BOARD_POS.split('').map((c, i) => ({ stone: c, lost: i === LOST_CELL })),
)

/** 未登录不展示"去大厅"（会被守卫踢回登录页） */
const isLoggedIn = computed(() => Boolean(auth.token))
</script>

<template>
  <div class="min-h-screen bg-primary text-text-primary">
    <!-- 极简顶栏：Logo（回首页） -->
    <nav
      class="fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-xl bg-[rgba(15,17,23,0.85)] border-b border-glass-border"
    >
      <div class="max-w-[1440px] mx-auto h-full px-4 sm:px-8 flex items-center justify-between">
        <button class="flex items-center gap-3 cursor-pointer group" @click="router.push('/')">
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
          <span class="text-lg font-bold tracking-wide group-hover:text-gold transition-colors"
          >Othello</span
          >
        </button>
        <button
          class="text-xs text-text-secondary hover:text-gold transition-colors flex items-center gap-1.5"
          @click="router.push('/')"
        >
          <Home class="w-3.5 h-3.5" />{{ $t('notFound.backHome') }}
        </button>
      </div>
    </nav>

    <main class="pt-16 min-h-screen relative overflow-hidden">
      <!-- 氛围层 -->
      <div
        class="absolute -top-40 left-[-12%] w-[680px] h-[680px] rounded-full bg-board-green/15 blur-[140px] pointer-events-none"
      ></div>
      <div
        class="absolute bottom-[-25%] right-[-8%] w-[560px] h-[560px] rounded-full bg-gold/10 blur-[130px] pointer-events-none"
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
        class="max-w-[1440px] mx-auto px-4 sm:px-8 min-h-[calc(100vh-4rem)] grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center py-14 relative"
      >
        <!-- 左：404 + 文案 + 出口 -->
        <div class="lg:col-span-7">
          <p class="text-[11px] uppercase tracking-[0.35em] text-gold/80 mb-6 font-mono">
            {{ $t('notFound.errorCode') }}
          </p>

          <!-- 巨型 404：中间的 "0" 是一颗棋子 -->
          <div
            class="flex items-center gap-2 select-none"
            :style="{ fontSize: 'clamp(6.5rem, 17vw, 12.5rem)', lineHeight: '0.9' }"
          >
            <span class="font-black text-gold tracking-tighter">4</span>
            <span
              class="stone-hero rounded-full inline-block shrink-0 animate-[nfFloat_5s_ease-in-out_infinite,nfSpin_9s_ease-in-out_infinite]"
              :style="{ width: '0.72em', height: '0.72em' }"
            ></span>
            <span class="font-black text-gold tracking-tighter">4</span>
          </div>

          <h1 class="text-2xl xl:text-3xl font-black mt-8 tracking-tight">
            {{ $t('notFound.title') }}
          </h1>
          <p class="text-text-secondary text-sm mt-3 max-w-md leading-relaxed">
            {{ $t('notFound.desc') }}
          </p>

          <!-- 出口按钮 -->
          <div class="flex flex-wrap items-center gap-3.5 mt-9">
            <button
              class="group flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-gold text-primary font-bold text-sm hover:bg-gold-light hover:-translate-y-0.5 transition-all shadow-[0_8px_28px_rgba(212,168,67,0.3)]"
              @click="router.push('/')"
            >
              <Home class="w-4 h-4" />{{ $t('notFound.backHome') }}
            </button>
            <button
              v-if="isLoggedIn"
              class="flex items-center gap-2.5 px-6 py-3.5 rounded-xl text-sm font-medium text-text-primary border border-glass-border bg-glass hover:border-gold/40 hover:text-gold transition-all"
              @click="router.push('/lobby')"
            >
              <Users class="w-4 h-4" />{{ $t('notFound.goLobby') }}
            </button>
            <button
              class="flex items-center gap-2.5 px-6 py-3.5 rounded-xl text-sm font-medium text-emerald-300 border border-board-green/50 bg-board-green/10 hover:bg-board-green/20 transition-all"
              @click="router.push('/local')"
            >
              <Play class="w-4 h-4 fill-current" />{{ $t('notFound.playNow') }}
            </button>
          </div>

          <p class="text-[11px] text-text-secondary/70 mt-6 font-mono">{{ $t('notFound.tip') }}</p>
        </div>

        <!-- 右：棋盘（初始局面 + 迷失的 A1） -->
        <div class="lg:col-span-5 relative">
          <div
            class="absolute -top-9 -right-5 w-9 h-9 rounded-full stone-w opacity-60 animate-[nfFloatAlt_7s_ease-in-out_infinite]"
          ></div>
          <div
            class="absolute -bottom-7 -left-5 w-11 h-11 rounded-full stone-b opacity-70 animate-[nfFloat_6s_ease-in-out_infinite]"
          ></div>
          <div
            class="relative rounded-2xl p-3 bg-gradient-to-br from-[#0d4a28] to-[#0a3a20] border border-board-green/40 shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
          >
            <div class="grid grid-cols-8 grid-rows-8 rounded-lg overflow-hidden aspect-square">
              <div
                v-for="(cell, i) in boardCells"
                :key="i"
                class="board-cell flex items-center justify-center"
              >
                <div v-if="cell.stone === 'B'" class="w-[76%] h-[76%] rounded-full stone-b"></div>
                <div v-else-if="cell.stone === 'W'" class="w-[76%] h-[76%] rounded-full stone-w"></div>
                <div
                  v-else-if="cell.lost"
                  class="w-[80%] h-[80%] rounded-md flex items-center justify-center text-gold font-black font-mono text-xl animate-[lostGlow_2s_ease-in-out_infinite]"
                >
                  ?
                </div>
              </div>
            </div>
            <!-- 覆盖层：坐标提示 -->
            <div
              class="absolute bottom-6 right-6 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(15,17,23,0.82)] border border-gold/40 backdrop-blur-sm"
            >
              <span class="w-2 h-2 rounded-full bg-gold"></span>
              <span class="text-[10px] text-gold font-mono">{{ $t('notFound.a1Tag') }}</span>
            </div>
          </div>
          <div
            class="flex items-center justify-between mt-4 px-1 text-[11px] text-text-secondary font-mono"
          >
            <span>{{ $t('notFound.initialBoard') }}</span>
            <span class="text-gold/70">{{ $t('notFound.moveZero') }}</span>
            <span>{{ $t('notFound.initialScore') }}</span>
          </div>
        </div>
      </div>
    </main>
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
/* 404 里充当 "0" 的大棋子：白子 + 金色光晕 */
.stone-hero {
  background: radial-gradient(circle at 35% 30%, #ffffff, #c9ced6 68%);
  box-shadow:
    0 10px 40px rgba(212, 168, 67, 0.35),
    0 0 0 3px rgba(212, 168, 67, 0.5),
    inset 0 -4px 10px rgba(0, 0, 0, 0.15);
}
.board-cell {
  background: linear-gradient(135deg, #1a6b3c, #17613a);
  border: 1px solid rgba(0, 0, 0, 0.28);
}

@keyframes nfFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-14px);
  }
}
@keyframes nfFloatAlt {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(10px);
  }
}
@keyframes nfSpin {
  0%,
  100% {
    transform: rotate(-8deg);
  }
  50% {
    transform: rotate(8deg);
  }
}
@keyframes lostGlow {
  0%,
  100% {
    box-shadow:
      0 0 0 2px #d4a843,
      0 0 12px rgba(212, 168, 67, 0.5);
  }
  50% {
    box-shadow:
      0 0 0 3px #e8c96a,
      0 0 32px rgba(212, 168, 67, 0.95);
  }
}
</style>
