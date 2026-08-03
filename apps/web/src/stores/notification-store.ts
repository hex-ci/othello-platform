/**
 * 全局通知存储（F-E-16 挑战接收 Bug 修复 + 未来消息提醒中心地基）。
 *
 * 统一管理 WS 推送的实时提醒（挑战/再战/好友请求等），前端内存态，
 * 不持久化（刷新清空，符合"实时提醒"语义）。
 *
 * 设计目标：
 * - 任何页面都能收到挑战（不要求对方停在好友页）
 * - 未来扩展：顶栏铃铛入口、未读计数、历史通知列表
 * - 统一 WS 事件监听入口（App.vue 全局绑定一次）
 *
 * 当前覆盖：好友挑战（challenge 事件）。
 * 未来可扩展：再战请求、好友请求、系统通知等。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/** 通知类型 */
export type NotificationType = 'challenge'

/** 好友挑战通知载荷 */
export interface ChallengeNotification {
  fromUserId: number
  fromUsername: string
}

/** 统一通知结构（便于未来扩展多类型） */
export interface AppNotification {
  id: string
  type: NotificationType
  /** 创建时间戳（Date.now，供排序/过期清理） */
  createdAt: number
  /** 类型特定载荷 */
  payload: ChallengeNotification
}

/** 通知保留时长：5 分钟（过期自动清理，避免历史堆积） */
const NOTIFICATION_TTL_MS = 5 * 60 * 1000

export const useNotificationStore = defineStore('notification', () => {
  /** 通知列表（按 createdAt 倒序，最新的在前） */
  const notifications = ref<AppNotification[]>([])

  /** 未读通知数（供顶栏铃铛，当前全部未读） */
  const unreadCount = computed(() => notifications.value.length)

  /** 当前待应答的挑战（兼容现有 useChallenge 的 incomingChallenge 语义） */
  const pendingChallenge = computed<ChallengeNotification | null>(() => {
    const found = notifications.value.find(n => n.type === 'challenge')
    return found ? (found.payload as ChallengeNotification) : null
  })

  /** 生成唯一 id（不用 Date.now/Math.random 以兼容 SSR/测试；用计数器+timestamp） */
  let counter = 0
  function nextId(): string {
    counter += 1
    return `n${counter}`
  }

  /** 添加通知（去重：同类型同 fromUserId 的挑战只保留最新一条） */
  function pushChallenge(payload: ChallengeNotification): void {
    // 移除同发起方的旧挑战（避免叠加）
    const filtered = notifications.value.filter(
      n => !(n.type === 'challenge' && n.payload.fromUserId === payload.fromUserId),
    )
    filtered.unshift({
      id: nextId(),
      type: 'challenge',
      createdAt: Date.now(),
      payload,
    })
    notifications.value = filtered
  }

  /** 移除指定通知（应答/拒绝后调用） */
  function dismiss(id: string): void {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }

  /** 移除当前挑战（兼容现有 respondChallenge 的 incomingChallenge=null 语义） */
  function clearChallenge(): void {
    notifications.value = notifications.value.filter(n => n.type !== 'challenge')
  }

  /** 清理过期通知（TTL 外的自动移除，供定时调用或读取时惰性清理） */
  function pruneExpired(): void {
    const now = Date.now()
    notifications.value = notifications.value.filter(n => now - n.createdAt < NOTIFICATION_TTL_MS)
  }

  /** 清空所有（登出/测试用） */
  function clearAll(): void {
    notifications.value = []
  }

  return {
    notifications,
    unreadCount,
    pendingChallenge,
    pushChallenge,
    dismiss,
    clearChallenge,
    pruneExpired,
    clearAll,
  }
})
