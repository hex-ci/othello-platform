/**
 * 聊天状态（T10）：public/room 消息，消费 WS chat 广播 + REST 历史。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ChatDTO, ChatBroadcastPayload } from '@othello-platform/shared'
import * as api from '@/api/rooms'
import { getWsClient } from '@/api/ws-client'

interface ChatMessage {
  userId: number
  username: string
  message: string
  ts: number
}

export const useChatStore = defineStore('chat', () => {
  const publicMessages = ref<ChatMessage[]>([])
  const roomMessages = ref<ChatMessage[]>([])
  const activeRoomId = ref<number | null>(null)

  let unsub: (() => void) | null = null

  function connect(): void {
    if (unsub) return
    const ws = getWsClient()
    unsub = ws.on('chat', (p) => {
      const payload = p as ChatBroadcastPayload
      const msg: ChatMessage = {
        userId: payload.userId,
        username: payload.username,
        message: payload.message,
        ts: payload.ts,
      }
      if (payload.channel === 'public') {
        publicMessages.value.push(msg)
      }
      else if (payload.roomId === activeRoomId.value) {
        roomMessages.value.push(msg)
      }
    })
  }

  async function loadPublicHistory(): Promise<void> {
    const res = await api.listChats({ channel: 'public' })
    publicMessages.value = res.messages.map((m: ChatDTO) => ({
      userId: m.userId,
      username: m.username,
      message: m.message,
      ts: m.createdAt,
    }))
  }

  async function sendPublic(message: string): Promise<void> {
    getWsClient().send('chat', { channel: 'public', message })
  }

  async function sendRoom(roomId: number, message: string): Promise<void> {
    getWsClient().send('chat', { channel: 'room', roomId, message })
  }

  function setActiveRoom(roomId: number | null): void {
    activeRoomId.value = roomId
    roomMessages.value = []
  }

  function disconnect(): void {
    unsub?.()
    unsub = null
  }

  return {
    publicMessages,
    roomMessages,
    activeRoomId,
    connect,
    loadPublicHistory,
    sendPublic,
    sendRoom,
    setActiveRoom,
    disconnect,
  }
})
