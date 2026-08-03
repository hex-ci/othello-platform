<script setup lang="ts">
/**
 * 聊天面板（T10）：public/room 切换，发消息。
 */
import { ref, computed, nextTick, watch, useTemplateRef } from 'vue'
import { Send, MessageCircle } from '@lucide/vue'
import { useChatStore } from '@/stores/chat-store'

const {
  roomId,
  fillHeight = false,
} = defineProps<{
  roomId: number | null
  /** true 时撑满父容器高度（大厅三栏），否则固定 h-64（对局侧栏） */
  fillHeight?: boolean
}>()

const chat = useChatStore()
const input = ref('')
const scrollRef = useTemplateRef('scrollEl')

const activeChannel = computed(() => (roomId !== null ? 'room' : 'public'))
const messages = computed(() =>
  activeChannel.value === 'public' ? chat.publicMessages : chat.roomMessages,
)

watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  },
)

async function send() {
  const text = input.value.trim()
  if (!text) return
  if (activeChannel.value === 'public') {
    await chat.sendPublic(text)
  }
  else if (roomId !== null) {
    await chat.sendRoom(roomId, text)
  }
  input.value = ''
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// 头像配色（按用户名稳定取色）
const AVATAR_COLORS = [
  'bg-emerald-500/20 text-emerald-400',
  'bg-blue-500/20 text-blue-400',
  'bg-purple-500/20 text-purple-400',
  'bg-rose-500/20 text-rose-400',
  'bg-cyan-500/20 text-cyan-400',
  'bg-gold/20 text-gold',
]

function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}
</script>

<template>
  <div
    class="flex flex-col rounded-2xl backdrop-blur-xl bg-glass border border-glass-border"
    :class="fillHeight ? 'h-full' : 'h-64'"
  >
    <div class="flex items-center justify-between px-4 py-3 border-b border-glass-border">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-text-secondary">
        {{ activeChannel === 'public' ? $t('chat.publicRoom') : $t('chat.roomChat') }}
      </h2>
      <MessageCircle class="w-4 h-4 text-text-secondary" />
    </div>

    <div ref="scrollEl" class="flex-1 overflow-y-auto p-3 space-y-3">
      <div v-if="messages.length === 0" class="text-text-secondary text-sm text-center py-4">
        {{ $t('chat.noMessages') }}
      </div>
      <div v-for="(m, i) in messages" :key="`${m.ts}-${i}`" class="flex gap-2">
        <div
          class="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-1 text-[9px] font-medium"
          :class="avatarColor(m.username)"
        >
          {{ initial(m.username) }}
        </div>
        <div class="min-w-0">
          <p class="text-[10px] text-text-secondary mb-1">
            {{ m.username }} · {{ fmtTime(m.ts) }}
          </p>
          <div
            class="bg-[rgba(255,255,255,0.03)] border border-glass-border rounded-lg rounded-tl-none px-3 py-2 text-sm text-text-primary break-words"
          >
            {{ m.message }}
          </div>
        </div>
      </div>
    </div>

    <form class="flex gap-2 p-3 border-t border-glass-border" @submit.prevent="send">
      <input
        v-model="input"
        type="text"
        maxlength="500"
        :placeholder="$t('chat.inputPlaceholder')"
        class="flex-1 min-w-0 bg-[rgba(255,255,255,0.03)] border border-glass-border rounded-xl py-2.5 px-4 text-sm text-text-primary placeholder:text-[#4a4f58] focus:outline-none focus:border-gold/30 transition-colors"
        :aria-label="$t('chat.inputAria')"
      >
      <button
        type="submit"
        class="px-4 rounded-xl bg-gold/10 text-gold border border-gold/20 hover:bg-gold hover:text-primary transition-all flex items-center justify-center"
        :aria-label="$t('chat.sendAria')"
      >
        <Send class="w-4 h-4" />
      </button>
    </form>
  </div>
</template>
