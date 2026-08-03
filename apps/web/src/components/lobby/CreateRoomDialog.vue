<script setup lang="ts">
/**
 * 建房对话框（T07）：name/mode/aiLevel/口令。
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GameMode, AiLevel } from '@othello-platform/shared'

const { t } = useI18n()
const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  create: [input: { name: string, mode: GameMode, aiLevel?: AiLevel, password?: string }]
}>()

const name = ref('')
const mode = ref<GameMode>('human_vs_human')
const aiLevel = ref<AiLevel>(3)
const password = ref('')
const error = ref('')

function submit() {
  error.value = ''
  if (!name.value.trim()) {
    error.value = t('createRoom.errName')
    return
  }
  emit('create', {
    name: name.value.trim(),
    mode: mode.value,
    aiLevel: mode.value === 'human_vs_ai' ? aiLevel.value : undefined,
    password: password.value.trim() || undefined,
  })
  open.value = false
  name.value = ''
  password.value = ''
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        @click.self="open = false"
      >
        <div class="w-full max-w-md rounded-2xl bg-surface border border-glass-border p-6 shadow-2xl">
          <h2 class="text-xl font-semibold text-text-primary mb-4">{{ $t('createRoom.title') }}</h2>

          <form class="space-y-4" @submit.prevent="submit">
            <div>
              <label class="block text-sm text-text-secondary mb-1" for="room-name">{{ $t('createRoom.roomName') }}</label>
              <input
                id="room-name"
                v-model="name"
                type="text"
                maxlength="64"
                class="w-full bg-primary/40 border border-glass-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gold/40"
                :placeholder="$t('createRoom.roomNamePlaceholder')"
              >
            </div>

            <div>
              <label class="block text-sm text-text-secondary mb-1">{{ $t('createRoom.mode') }}</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="px-3 py-2 rounded-md border text-sm transition-colors"
                  :class="mode === 'human_vs_human' ? 'bg-gold text-primary border-gold' : 'border-glass-border text-text-secondary'"
                  @click="mode = 'human_vs_human'"
                >
                  {{ $t('createRoom.humanVsHuman') }}
                </button>
                <button
                  type="button"
                  class="px-3 py-2 rounded-md border text-sm transition-colors"
                  :class="mode === 'human_vs_ai' ? 'bg-gold text-primary border-gold' : 'border-glass-border text-text-secondary'"
                  @click="mode = 'human_vs_ai'"
                >
                  {{ $t('createRoom.humanVsAi') }}
                </button>
              </div>
            </div>

            <div v-if="mode === 'human_vs_ai'">
              <label class="block text-sm text-text-secondary mb-1" for="room-ai-level">{{ $t('createRoom.aiLevel') }}</label>
              <select
                id="room-ai-level"
                v-model.number="aiLevel"
                class="w-full bg-primary/40 border border-glass-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gold/40"
              >
                <option v-for="lv in 6" :key="lv - 1" :value="lv - 1">L{{ lv - 1 }}</option>
              </select>
            </div>

            <div>
              <label class="block text-sm text-text-secondary mb-1" for="room-password">{{ $t('createRoom.password') }}</label>
              <input
                id="room-password"
                v-model="password"
                type="password"
                maxlength="64"
                class="w-full bg-primary/40 border border-glass-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gold/40"
                :placeholder="$t('createRoom.passwordPlaceholder')"
              >
            </div>

            <div v-if="error" class="text-red-400 text-sm">{{ error }}</div>

            <div class="flex gap-3 pt-2">
              <button
                type="button"
                class="flex-1 px-4 py-2 rounded-md border border-glass-border text-text-secondary hover:text-text-primary transition-colors"
                @click="open = false"
              >
                {{ $t('common.cancel') }}
              </button>
              <button
                type="submit"
                class="flex-1 px-4 py-2 rounded-md bg-gold text-primary font-medium hover:bg-gold-light transition-colors"
              >
                {{ $t('createRoom.create') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
