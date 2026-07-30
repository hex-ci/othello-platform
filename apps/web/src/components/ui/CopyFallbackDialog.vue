<script setup lang="ts">
/**
 * 剪贴板复制失败时的降级弹窗：展示待复制文本，用户可全选后手动复制。
 * 非 HTTPS 环境下 navigator.clipboard 不可用，避免直接报错，改为引导手动复制。
 */
import { ref, watch, nextTick } from 'vue'
import { X, Copy, Check } from '@lucide/vue'

const props = defineProps<{
  /** 待手动复制的文本，为 null 时关闭 */
  text: string | null
  title?: string
}>()

const emit = defineEmits<{ close: [] }>()

const inputRef = ref<HTMLInputElement | null>(null)
const selected = ref(false)

// 打开时自动全选文本，方便用户直接 Ctrl+C
watch(
  () => props.text,
  async (val) => {
    selected.value = false
    if (val) {
      await nextTick()
      inputRef.value?.focus()
      inputRef.value?.select()
    }
  },
)

function selectAll() {
  inputRef.value?.focus()
  inputRef.value?.select()
  selected.value = true
  setTimeout(() => (selected.value = false), 1500)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="text !== null"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        @click.self="emit('close')"
      >
        <div
          class="w-full max-w-md rounded-2xl bg-surface border border-glass-border p-6 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
        >
          <div class="flex items-start justify-between mb-4">
            <div>
              <h3 class="text-base font-bold text-text-primary">
                {{ title ?? $t('copy.fallbackTitle') }}
              </h3>
              <p class="text-xs text-text-secondary mt-1">{{ $t('copy.fallbackDesc') }}</p>
            </div>
            <button
              class="text-text-secondary hover:text-text-primary transition-colors p-1 -m-1"
              :aria-label="$t('common.close')"
              @click="emit('close')"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <input
            ref="inputRef"
            :value="text"
            readonly
            class="w-full px-3 py-2.5 rounded-xl bg-black/30 border border-glass-border text-sm text-text-primary font-mono focus:outline-none focus:border-gold/50"
            @click="($event.target as HTMLInputElement).select()"
          >

          <div class="flex gap-2 mt-4">
            <button
              class="flex-1 py-2.5 rounded-xl font-bold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 text-sm"
              @click="selectAll"
            >
              <Check v-if="selected" class="w-4 h-4" />
              <Copy v-else class="w-4 h-4" />
              {{ selected ? $t('copy.selected') : $t('copy.selectAll') }}
            </button>
            <button
              class="px-4 py-2.5 rounded-xl border border-glass-border text-text-secondary hover:text-text-primary hover:border-gold/40 transition-colors text-sm"
              @click="emit('close')"
            >
              {{ $t('common.close') }}
            </button>
          </div>
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
