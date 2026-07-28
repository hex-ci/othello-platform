<script setup lang="ts">
/**
 * 加入口令房对话框：输入口令后提交，由父组件调 joinRoom(roomId, password)。
 * 样式复用 CreateRoomDialog 的玻璃卡片 + transition。
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Lock } from '@lucide/vue'

const { t } = useI18n()
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  roomName: string
}>()

const emit = defineEmits<{
  submit: [password: string]
  cancel: []
}>()

const password = ref('')
const error = ref('')

// 弹窗打开时重置输入与错误态
watch(open, (next) => {
  if (next) {
    password.value = ''
    error.value = ''
  }
})

function submit() {
  error.value = ''
  if (!password.value.trim()) {
    error.value = t('lobby.passwordRequired')
    return
  }
  emit('submit', password.value)
  open.value = false
}

function cancel() {
  emit('cancel')
  open.value = false
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        @click.self="cancel"
      >
        <div
          class="w-full max-w-md rounded-2xl bg-surface border border-glass-border p-6 shadow-2xl"
        >
          <div class="flex items-center gap-2 mb-4">
            <Lock class="w-5 h-5 text-amber-400/80" />
            <h2 class="text-xl font-semibold text-text-primary">{{ $t('lobby.enterPassword') }}</h2>
          </div>

          <p class="text-sm text-text-secondary mb-4">
            {{ $t('lobby.passwordRequired') }}
            <span class="text-text-primary font-medium">{{ props.roomName }}</span>
          </p>

          <form class="space-y-4" @submit.prevent="submit">
            <div>
              <label class="block text-sm text-text-secondary mb-1" for="join-room-password">{{
                $t('createRoom.password')
              }}</label>
              <input
                id="join-room-password"
                v-model="password"
                type="password"
                maxlength="64"
                autofocus
                class="w-full bg-primary/40 border border-glass-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gold/40"
                :placeholder="$t('createRoom.passwordPlaceholder')"
              />
            </div>

            <div v-if="error" class="text-red-400 text-sm">{{ error }}</div>

            <div class="flex gap-3 pt-2">
              <button
                type="button"
                class="flex-1 px-4 py-2 rounded-md border border-glass-border text-text-secondary hover:text-text-primary transition-colors"
                @click="cancel"
              >
                {{ $t('common.cancel') }}
              </button>
              <button
                type="submit"
                class="flex-1 px-4 py-2 rounded-md bg-gold text-primary font-medium hover:bg-gold-light transition-colors"
              >
                {{ $t('roomList.join') }}
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
