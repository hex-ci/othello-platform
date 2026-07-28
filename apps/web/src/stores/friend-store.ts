/**
 * 好友/屏蔽状态（T16，F-E-07）。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FriendDTO } from '@othello-platform/shared'
import * as api from '@/api/rooms'

export const useFriendStore = defineStore('friend', () => {
  const friends = ref<FriendDTO[]>([])
  const requests = ref<FriendDTO[]>([])
  const sent = ref<FriendDTO[]>([])
  const blocked = ref<FriendDTO[]>([])
  const loading = ref(false)

  const onlineFriends = computed(() => friends.value.filter((f) => f.online))
  const offlineFriends = computed(() => friends.value.filter((f) => !f.online))

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const [f, r, b] = await Promise.all([
        api.listFriends('accepted'),
        api.listFriends('pending'),
        api.listFriends('blocked'),
      ])
      friends.value = f.friends
      // pending 中 incoming 才是待我处理的请求；outgoing 是我发出待对方接受的
      requests.value = r.friends.filter((x) => x.direction === 'incoming')
      sent.value = r.friends.filter((x) => x.direction === 'outgoing')
      blocked.value = b.friends
    } finally {
      loading.value = false
    }
  }

  async function sendRequest(friendId: number): Promise<void> {
    await api.sendFriendRequest(friendId)
  }

  async function accept(friendId: number): Promise<void> {
    await api.acceptFriendRequest(friendId)
    await refresh()
  }

  async function reject(friendId: number): Promise<void> {
    await api.rejectFriendRequest(friendId)
    await refresh()
  }

  async function cancel(friendId: number): Promise<void> {
    await api.cancelFriendRequest(friendId)
    await refresh()
  }

  async function remove(friendId: number): Promise<void> {
    await api.removeFriend(friendId)
    await refresh()
  }

  async function block(friendId: number): Promise<void> {
    await api.blockUser(friendId)
    await refresh()
  }

  async function unblock(friendId: number): Promise<void> {
    await api.unblockUser(friendId)
    await refresh()
  }

  return {
    friends,
    requests,
    sent,
    blocked,
    loading,
    onlineFriends,
    offlineFriends,
    refresh,
    sendRequest,
    accept,
    reject,
    cancel,
    remove,
    block,
    unblock,
  }
})
