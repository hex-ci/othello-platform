/**
 * 快速开局（首页 + 大厅共用）：在线人机快速建房、进房导航、自动匹配。
 * 从 LobbyPage 提取（DRY），行为与原实现一致。
 */
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { AiLevel, GameMode } from '@othello-platform/shared'
import { useLobbyStore } from '@/stores/lobby-store'
import * as api from '@/api/rooms'

export function useQuickAi() {
  const router = useRouter()
  const { t } = useI18n()
  const lobby = useLobbyStore()

  const aiQuickLevel = ref<AiLevel>(3)
  const joinError = ref('')

  const AI_LEVELS = computed<{ value: AiLevel; label: string }[]>(() => [
    { value: 0, label: t('aiLevel.l0') },
    { value: 1, label: t('aiLevel.l1') },
    { value: 2, label: t('aiLevel.l2') },
    { value: 3, label: t('aiLevel.l3') },
    { value: 4, label: t('aiLevel.l4') },
    { value: 5, label: t('aiLevel.l5') },
  ])

  async function enterRoom(roomId: number, mode: GameMode, password?: string): Promise<void> {
    try {
      await api.joinRoom(roomId, password)
      // 人机房直接进对局页（join 即开局）；人人房先进房间准备页（附录C ready 子阶段）
      if (mode === 'human_vs_ai') {
        await router.push(`/game/${roomId}`)
      } else {
        await router.push(`/room/${roomId}`)
      }
    } catch (err) {
      joinError.value = err instanceof Error ? err.message : t('lobby.joinFail')
    }
  }

  /** 建房并进入（CreateRoomDialog 提交回调共用） */
  async function createAndEnter(input: {
    name: string
    mode: GameMode
    aiLevel?: AiLevel
    password?: string
  }): Promise<void> {
    joinError.value = ''
    try {
      const room = await api.createRoom(input)
      await enterRoom(room.id, input.mode, input.password)
    } catch (err) {
      joinError.value = err instanceof Error ? err.message : t('lobby.createFail')
    }
  }

  /** 按所选难度快速创建人机房并进入 */
  async function quickAi(): Promise<void> {
    joinError.value = ''
    try {
      const room = await api.createRoom({
        name: t('lobby.aiRoomName', {
          level: AI_LEVELS.value.find((l) => l.value === aiQuickLevel.value)?.label ?? 'L3',
        }),
        mode: 'human_vs_ai',
        aiLevel: aiQuickLevel.value,
      })
      await enterRoom(room.id, 'human_vs_ai')
    } catch (err) {
      joinError.value = err instanceof Error ? err.message : t('lobby.createFail')
    }
  }

  // ─── 自动匹配（T11，F-E-06）───
  function onMatch(): void {
    lobby.joinMatch()
  }

  function onCancelMatch(): void {
    lobby.leaveMatch()
  }

  // 匹配成功 → 导航到对局页
  watch(
    () => lobby.matchStatus,
    (status) => {
      if (status === 'found' && lobby.matchRoomId !== null) {
        const roomId = lobby.matchRoomId
        lobby.resetMatch()
        void router.push(`/game/${roomId}`)
      }
    },
  )

  return {
    aiQuickLevel,
    AI_LEVELS,
    joinError,
    enterRoom,
    createAndEnter,
    quickAi,
    onMatch,
    onCancelMatch,
  }
}
