/**
 * 房间等待状态（附录C ready 子阶段，对照 docs/pages/04-room.html）。
 * 人人房双方就位后进入 ready 子阶段：双方 room_ready + 房主 room_start 才开局。
 * 监听 room_state 更新座位/准备状态；game_start 触发跳转到对局页。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getWsClient, WS_RECONNECT_EVENT } from '@/api/ws-client'
import { useAuthStore } from './auth-store'

interface RoomSpectator {
  userId: number
  username: string
}

interface RoomStatePayload {
  roomId: number
  gameId: string | null
  blackId: number | null
  whiteId: number | null
  status: 'waiting' | 'playing' | 'finished'
  blackReady?: boolean
  whiteReady?: boolean
  blackName?: string | null
  whiteName?: string | null
  ownerId?: number | null
  roomName?: string
  spectatable?: boolean
  spectators?: RoomSpectator[]
}

export const useRoomStore = defineStore('room', () => {
  const router = useRouter()
  const auth = useAuthStore()

  const roomId = ref<number | null>(null)
  const gameId = ref<string | null>(null)
  const blackId = ref<number | null>(null)
  const whiteId = ref<number | null>(null)
  const blackName = ref<string | null>(null)
  const whiteName = ref<string | null>(null)
  const blackReady = ref(false)
  const whiteReady = ref(false)
  const ownerId = ref<number | null>(null)
  const roomName = ref<string>('')
  const spectatable = ref(true)
  const spectators = ref<RoomSpectator[]>([])
  const status = ref<'idle' | 'waiting' | 'playing' | 'finished'>('idle')
  /** 房间错误态：not_found/finished，页面据此渲染错误卡片而非跳转 */
  const errorState = ref<{ kind: 'not_found' | 'finished' | 'full', msg: string } | null>(null)

  const myUserId = computed(() => {
    const raw = auth.userId
    return raw === null ? null : Number(raw)
  })
  const isHost = computed(
    () => ownerId.value !== null && myUserId.value !== null && ownerId.value === myUserId.value,
  )
  const myColor = computed<'BLACK' | 'WHITE' | null>(() => {
    if (myUserId.value === null) return null
    if (blackId.value === myUserId.value) return 'BLACK'
    if (whiteId.value === myUserId.value) return 'WHITE'
    return null
  })
  const myReady = computed(() => {
    if (myColor.value === 'BLACK') return blackReady.value
    if (myColor.value === 'WHITE') return whiteReady.value
    return false
  })
  const bothReady = computed(() => blackReady.value && whiteReady.value)
  const bothSeated = computed(() => blackId.value !== null && whiteId.value !== null)

  let unsubs: (() => void)[] = []
  let connected = false

  function connect(): void {
    if (connected) return
    connected = true
    const ws = getWsClient()

    unsubs.push(
      ws.on('room_state', (p) => {
        const payload = p as RoomStatePayload
        if (roomId.value !== null && payload.roomId !== roomId.value) return
        roomId.value = payload.roomId
        gameId.value = payload.gameId
        blackId.value = payload.blackId
        whiteId.value = payload.whiteId
        blackName.value = payload.blackName ?? null
        whiteName.value = payload.whiteName ?? null
        blackReady.value = payload.blackReady ?? false
        whiteReady.value = payload.whiteReady ?? false
        ownerId.value = payload.ownerId ?? null
        roomName.value = payload.roomName ?? ''
        spectatable.value = payload.spectatable ?? true
        spectators.value = payload.spectators ?? []
        status.value = payload.status === 'playing' ? 'playing' : 'waiting'
      }),
    )

    // game_start → 双方准备完成且房主开局，跳转到对局页
    unsubs.push(
      ws.on('game_start', () => {
        if (roomId.value !== null) {
          const target = `/game/${roomId.value}`
          void router.push(target)
        }
      }),
    )

    // 断线重连：重新加入房间拉取最新状态
    unsubs.push(
      ws.on(WS_RECONNECT_EVENT, () => {
        if (roomId.value !== null) {
          ws.send('room_join', { roomId: roomId.value })
        }
      }),
    )

    // 错误处理：房间不存在/已结束/已满 → 设 errorState，页面渲染错误卡片（不跳转）
    unsubs.push(
      ws.on('error', (p) => {
        const payload = p as { code?: string, msg?: string }
        if (payload.code === 'ROOM_NOT_FOUND') {
          errorState.value = { kind: 'not_found', msg: payload.msg ?? '房间不存在' }
        }
        else if (payload.code === 'ROOM_FINISHED') {
          errorState.value = { kind: 'finished', msg: payload.msg ?? '该房间对局已结束' }
        }
        else if (payload.code === 'ROOM_FULL') {
          errorState.value = { kind: 'full', msg: payload.msg ?? '房间已满' }
        }
      }),
    )
  }

  function joinRoom(id: number): void {
    roomId.value = id
    getWsClient().send('room_join', { roomId: id })
  }

  function setReady(ready: boolean): void {
    if (roomId.value === null) return
    getWsClient().send('room_ready', { roomId: roomId.value, ready })
  }

  function startGame(): void {
    if (roomId.value === null) return
    getWsClient().send('room_start', { roomId: roomId.value })
  }

  /** 加入房间旁观（观战席） */
  function spectateJoin(id: number): void {
    roomId.value = id
    getWsClient().send('room_spectate_join', { roomId: id })
  }

  /** 退出房间旁观 */
  function spectateLeave(): void {
    if (roomId.value === null) return
    getWsClient().send('room_spectate_leave', { roomId: roomId.value })
  }

  /** 房主修改房间设置 */
  function updateSettings(input: {
    colorAssign?: 'swap' | 'keep'
    spectatable?: boolean
    password?: string | null
  }): void {
    if (roomId.value === null) return
    getWsClient().send('room_update_settings', { roomId: roomId.value, ...input })
  }

  async function leaveRoom(): Promise<void> {
    if (roomId.value !== null) {
      // REST 退出（服务端清理座位/关闭房间）
      try {
        const { quitRoom } = await import('@/api/rooms')
        await quitRoom(roomId.value)
      }
      catch {
        /* 忽略，导航回大厅 */
      }
    }
    disconnect()
  }

  function disconnect(): void {
    for (const off of unsubs) off()
    unsubs = []
    connected = false
    reset()
  }

  function reset(): void {
    roomId.value = null
    gameId.value = null
    blackId.value = null
    whiteId.value = null
    blackName.value = null
    whiteName.value = null
    blackReady.value = false
    whiteReady.value = false
    ownerId.value = null
    roomName.value = ''
    spectatable.value = true
    spectators.value = []
    status.value = 'idle'
    errorState.value = null
  }

  return {
    roomId,
    gameId,
    blackId,
    whiteId,
    blackName,
    whiteName,
    blackReady,
    whiteReady,
    ownerId,
    roomName,
    spectatable,
    spectators,
    status,
    errorState,
    isHost,
    myColor,
    myReady,
    bothReady,
    bothSeated,
    connect,
    joinRoom,
    setReady,
    startGame,
    spectateJoin,
    spectateLeave,
    updateSettings,
    leaveRoom,
    disconnect,
  }
})
