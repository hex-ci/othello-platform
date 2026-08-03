<script setup lang="ts">
/**
 * BossKey 伪装遮罩（T19，F-E-14）。
 * active 时全屏覆盖一个中性"工作文档"页面并模糊底层，再按热键/按钮恢复。
 */
import { FileText } from '@lucide/vue'

const {
  active,
} = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{ restore: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="boss">
      <div
        v-if="active"
        class="fixed inset-0 z-[9999] bg-[#f5f6f8] text-[#2d3748] overflow-y-auto"
        style="font-family: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
      >
        <!-- 伪装文档页 -->
        <div class="max-w-3xl mx-auto px-8 py-12">
          <div class="flex items-center gap-3 mb-8 pb-4 border-b border-gray-300">
            <FileText class="w-6 h-6 text-gray-500" />
            <div>
              <h1 class="text-xl font-semibold text-gray-800">{{ $t('bossKey.title') }}</h1>
              <p class="text-xs text-gray-500 mt-0.5">{{ $t('bossKey.subtitle') }}</p>
            </div>
          </div>
          <div class="space-y-4 text-sm leading-relaxed text-gray-600">
            <p>{{ $t('bossKey.body1') }}</p>
            <p>{{ $t('bossKey.body2') }}</p>
            <div class="h-px bg-gray-200 my-6"></div>
            <div class="grid grid-cols-3 gap-4">
              <div v-for="n in 6" :key="n" class="h-20 rounded-lg bg-gray-100 border border-gray-200"></div>
            </div>
          </div>
        </div>

        <!-- 恢复提示（右下角，低调） -->
        <button
          type="button"
          class="fixed bottom-4 right-4 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
          @click="emit('restore')"
        >
          {{ $t('bossKey.hint') }}
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.boss-enter-active,
.boss-leave-active {
  transition: opacity 0.15s ease;
}
.boss-enter-from,
.boss-leave-to {
  opacity: 0;
}
</style>
