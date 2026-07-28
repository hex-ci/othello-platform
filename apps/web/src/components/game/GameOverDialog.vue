<script setup lang="ts">
/**
 * 本地对局结算弹窗（C 档）：复用 ResultCard 庆祝布局。
 */
import { computed } from 'vue'
import { RotateCcw } from '@lucide/vue'
import { useGameStore } from '@/stores/game-store'
import ResultCard from './ResultCard.vue'

const store = useGameStore()

const visible = computed(() => store.gameStatus === 'finished' && store.result !== null)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      >
        <div class="w-full max-w-md rounded-2xl bg-surface border border-glass-border p-6 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          <ResultCard
            :result="store.result!"
            :black-count="store.counts.black"
            :white-count="store.counts.white"
            :black-name="$t('local.youName')"
            :white-name="$t('local.aiName')"
            :black-is-you="true"
            :move-count="store.moveHistory.length"
          >
            <button
              class="w-full py-3.5 rounded-xl font-bold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 text-sm"
              @click="store.newGame()"
            >
              <RotateCcw class="w-4 h-4" />{{ $t('local.playAgain') }}
            </button>
          </ResultCard>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
