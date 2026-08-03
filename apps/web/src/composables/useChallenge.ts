import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { getWsClient } from '@/api/ws-client'
import { useNotificationStore } from '@/stores/notification-store'

/**
 * 好友挑战交互（T17，F-E-16）。
 * 封装 challenge / challenge_response 的 WS 收发与结果反馈，
 * FriendsPage 与 ProfilePage 共用。
 *
 * 挑战通知统一存入 notificationStore（全局内存态），任何页面都能收到。
 * bindChallenge 在 App.vue 全局绑定一次，FriendsPage/ProfilePage 只读取 + 调用 action。
 *
 * 服务端对 challenge 强制校验好友 + 在线（room-manager.challenge）：
 * 非好友返回 NOT_FRIEND、对方离线返回 OPPONENT_OFFLINE，此处统一 toast 反馈。
 */

/** 我正发起挑战、等待对方应答的好友 id（模块级单例，仅发起方自己关心） */
const challengingId = ref<number | null>(null)

/** WS 事件是否已绑定（幂等：App.vue 全局只 bind 一次） */
let bound = false

export function useChallenge() {
  const router = useRouter()
  const { t } = useI18n()
  const notifyStore = useNotificationStore()

  /** 对方向我发起的挑战（从 notificationStore 派生，全局共享） */
  const incomingChallenge = computed(() => notifyStore.pendingChallenge)

  function sendChallenge(friendId: number): void {
    challengingId.value = friendId
    getWsClient().send('challenge', { toUserId: friendId, aiLevel: null })
  }

  function respondChallenge(accept: boolean): void {
    const challenge = notifyStore.pendingChallenge
    if (!challenge) return
    getWsClient().send('challenge_response', {
      fromUserId: challenge.fromUserId,
      accept,
    })
    notifyStore.clearChallenge()
  }

  /**
   * 订阅 WS 挑战事件（幂等，全局只绑定一次）。
   * 在 App.vue onMounted 调用一次即可，所有页面共享 incomingChallenge/challengingId。
   */
  function bindChallenge(): () => void {
    if (bound) return () => {}
    bound = true
    const ws = getWsClient()
    const unsubs: (() => void)[] = []

    // 收到别人的挑战 → 写入 notificationStore（任何页面都能收到）
    unsubs.push(
      ws.on('challenge', (p) => {
        const payload = p as { fromUserId: number, fromUsername: string }
        notifyStore.pushChallenge(payload)
      }),
    )

    // 我发起的挑战结果：接受 → 跳对局页；拒绝 → toast
    unsubs.push(
      ws.on('challenge_result', (p) => {
        const payload = p as {
          accepted: boolean
          roomId: number | null
          gameId: string | null
          opponentUsername?: string | null
        }
        challengingId.value = null
        if (payload.accepted && payload.roomId !== null) {
          void router.push(`/game/${payload.roomId}`)
        }
        else {
          toast.error(
            payload.opponentUsername
              ? t('friends.challengeRejected', { name: payload.opponentUsername })
              : t('friends.challengeRejectedGeneric'),
          )
        }
      }),
    )

    // 服务端拒绝挑战（非好友 / 对方离线，T17/F-E-16 服务端校验）
    unsubs.push(
      ws.on('error', (p) => {
        const payload = p as { code: string, msg: string }
        if (payload.code === 'NOT_FRIEND') {
          challengingId.value = null
          toast.error(t('friends.challengeNotFriend'))
        }
        else if (payload.code === 'OPPONENT_OFFLINE') {
          challengingId.value = null
          toast.error(t('friends.challengeOffline'))
        }
      }),
    )

    return () => {
      bound = false
      for (const off of unsubs) off()
    }
  }

  return { challengingId, incomingChallenge, sendChallenge, respondChallenge, bindChallenge }
}
