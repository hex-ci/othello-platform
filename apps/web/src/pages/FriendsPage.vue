<script setup lang="ts">
/**
 * 好友/社交页（T16，F-E-07）：好友列表 + 请求 + 屏蔽，对照设计稿 13-friends。
 * 邀战（challenge）按钮为 T17 预留占位。
 */
import { onMounted, ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Users, UserPlus, Ban, Check, X, Swords, Search } from '@lucide/vue'
import { useFriendStore } from '@/stores/friend-store'
import { getWsClient } from '@/api/ws-client'
import { useChallenge } from '@/composables/useChallenge'
import PageNavBar from '@/components/PageNavBar.vue'

const store = useFriendStore()
const { t } = useI18n()

const { friends, requests, sent, blocked, loading, onlineFriends } =
  storeToRefs(store)

type Tab = 'friends' | 'requests' | 'blocked'
const tab = ref<Tab>('friends')
const search = ref('')
const addName = ref('')
const addError = ref('')
const addOk = ref('')
const adding = ref(false)

// ─── 好友挑战（T17，F-E-16，逻辑抽到 useChallenge 与 ProfilePage 共用）───
// bindChallenge 在 App.vue 全局绑定，页面只读取 incomingChallenge/challengingId + 调用 action
const { challengingId, incomingChallenge, sendChallenge, respondChallenge } = useChallenge()

const filteredFriends = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return friends.value
  return friends.value.filter((f) => f.username.toLowerCase().includes(q))
})

const filteredOnline = computed(() => filteredFriends.value.filter((f) => f.online))
const filteredOffline = computed(() => filteredFriends.value.filter((f) => !f.online))

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

const AVATAR_COLORS = [
  'from-rose-500/30 to-rose-600/20 border-rose-500/30 text-rose-300',
  'from-emerald-500/30 to-emerald-600/20 border-emerald-500/30 text-emerald-300',
  'from-blue-500/30 to-blue-600/20 border-blue-500/30 text-blue-300',
  'from-purple-500/30 to-purple-600/20 border-purple-500/30 text-purple-300',
  'from-cyan-500/30 to-cyan-600/20 border-cyan-500/30 text-cyan-300',
  'from-amber-500/30 to-amber-600/20 border-amber-500/30 text-amber-300',
]

function avatarCls(id: number): string {
  return AVATAR_COLORS[id % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!
}

async function onAdd() {
  const name = addName.value.trim()
  if (!name) return
  adding.value = true
  addError.value = ''
  addOk.value = ''
  try {
    // 先按用户名查 id（复用在线/用户接口不可用时降级提示）
    const res = await fetch(`/api/v1/users/by-name/${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
    })
    if (!res.ok) {
      addError.value = t('friends.addUserNotFound')
      return
    }
    const user = (await res.json()) as { id: number }
    await store.sendRequest(user.id)
    addOk.value = t('friends.addOk', { name })
    addName.value = ''
    await store.refresh()
  } catch {
    addError.value = t('friends.addFail')
  } finally {
    adding.value = false
  }
}

onMounted(() => {
  getWsClient().connect()
  void store.refresh()
})
</script>

<template>
  <div class="min-h-screen bg-primary text-text-primary">
    <!-- 顶栏（设计稿 09/10/12/13 统一） -->
    <PageNavBar />

    <main class="pt-20 max-w-[1440px] mx-auto px-4 sm:px-8 pb-12">
      <!-- 标题 + 添加好友 -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 class="text-3xl font-bold flex items-center gap-3">
            <Users class="w-7 h-7 text-gold" />{{ $t('friends.title') }}
          </h1>
          <p class="text-text-secondary text-sm mt-2">{{ $t('friends.subtitle') }}</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="relative w-full sm:w-auto">
            <Search
              class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary"
            />
            <input
              v-model="search"
              type="text"
              :placeholder="$t('friends.searchPlaceholder')"
              class="bg-[rgba(255,255,255,0.03)] border border-glass-border rounded-xl py-2 pl-9 pr-4 text-xs text-text-primary placeholder:text-[#4a4f58] focus:outline-none focus:border-gold/30 w-full sm:w-48"
            >
          </div>
        </div>
      </div>

      <!-- 收到的挑战横幅（T17） -->
      <div
        v-if="incomingChallenge"
        class="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3"
      >
        <Swords class="w-5 h-5 text-amber-400 flex-shrink-0" />
        <span class="flex-1 text-sm text-amber-200">{{
          $t('friends.challengeIncoming', { name: incomingChallenge.fromUsername })
        }}</span>
        <button
          class="px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
          @click="respondChallenge(true)"
        >
          {{ $t('common.accept') }}
        </button>
        <button
          class="px-4 py-1.5 rounded-lg text-xs font-medium bg-glass text-text-secondary border border-glass-border hover:bg-[rgba(255,255,255,0.08)] transition-all"
          @click="respondChallenge(false)"
        >
          {{ $t('common.reject') }}
        </button>
      </div>

      <!-- 挑战被拒/非好友/离线等反馈改用 toast（useChallenge 内统一处理） -->

      <!-- 统计卡 -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-5">
          <div class="flex items-center gap-2 mb-2">
            <Users class="w-4 h-4 text-gold" /><span
              class="text-[10px] uppercase tracking-wider text-text-secondary"
            >{{ $t('friends.statTotal') }}</span
            >
          </div>
          <p class="text-2xl font-bold font-mono">{{ friends.length }}</p>
        </div>
        <div class="backdrop-blur-xl bg-glass border border-emerald-500/20 rounded-2xl p-5">
          <div class="flex items-center gap-2 mb-2">
            <span
              class="w-4 h-4 rounded-full bg-emerald-400/20 border border-emerald-400/40"
            ></span><span class="text-[10px] uppercase tracking-wider text-text-secondary">{{
              $t('friends.statOnline')
            }}</span>
          </div>
          <p class="text-2xl font-bold text-emerald-400 font-mono">{{ onlineFriends.length }}</p>
        </div>
        <div class="backdrop-blur-xl bg-glass border border-amber-500/20 rounded-2xl p-5">
          <div class="flex items-center gap-2 mb-2">
            <UserPlus class="w-4 h-4 text-amber-400" /><span
              class="text-[10px] uppercase tracking-wider text-text-secondary"
            >{{ $t('friends.statPending') }}</span
            >
          </div>
          <p class="text-2xl font-bold text-amber-400 font-mono">{{ requests.length }}</p>
        </div>
        <div class="backdrop-blur-xl bg-glass border border-rose-500/20 rounded-2xl p-5">
          <div class="flex items-center gap-2 mb-2">
            <Ban class="w-4 h-4 text-rose-400" /><span
              class="text-[10px] uppercase tracking-wider text-text-secondary"
            >{{ $t('friends.statBlocked') }}</span
            >
          </div>
          <p class="text-2xl font-bold text-rose-400 font-mono">{{ blocked.length }}</p>
        </div>
      </div>

      <!-- 添加好友 -->
      <div
        class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-4 mb-6 flex items-center gap-3"
      >
        <input
          v-model="addName"
          type="text"
          :placeholder="$t('friends.addPlaceholder')"
          class="flex-1 bg-[rgba(255,255,255,0.03)] border border-glass-border rounded-xl py-2 px-4 text-xs text-text-primary placeholder:text-[#4a4f58] focus:outline-none focus:border-gold/30"
          @keydown.enter="onAdd"
        >
        <button
          class="px-4 py-2 rounded-xl text-xs font-medium text-[#0f1117] bg-gradient-to-r from-gold to-gold-light transition-all flex items-center gap-1.5 disabled:opacity-50"
          :disabled="adding"
          @click="onAdd"
        >
          <UserPlus class="w-3.5 h-3.5" />{{
            adding ? $t('friends.addSending') : $t('friends.addFriend')
          }}
        </button>
        <span v-if="addError" class="text-[11px] text-rose-400">{{ addError }}</span>
        <span v-else-if="addOk" class="text-[11px] text-emerald-400 flex items-center gap-1"
        ><Check class="w-3 h-3" />{{ addOk }}</span
        >
      </div>

      <!-- 标签页 -->
      <div class="flex items-center gap-1 mb-6 border-b border-glass-border">
        <button
          class="px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2"
          :class="
            tab === 'friends'
              ? 'text-gold border-b-2 border-gold bg-gold/5 rounded-t-lg'
              : 'text-text-secondary hover:text-text-primary'
          "
          @click="tab = 'friends'"
        >
          {{ $t('friends.tabFriends') }}
          <span class="text-[9px] bg-gold/20 text-gold px-1.5 py-0.5 rounded-full">{{
            friends.length
          }}</span>
        </button>
        <button
          class="px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2"
          :class="
            tab === 'requests'
              ? 'text-gold border-b-2 border-gold bg-gold/5 rounded-t-lg'
              : 'text-text-secondary hover:text-text-primary'
          "
          @click="tab = 'requests'"
        >
          {{ $t('friends.tabRequests') }}
          <span class="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">{{
            requests.length + sent.length
          }}</span>
        </button>
        <button
          class="px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2"
          :class="
            tab === 'blocked'
              ? 'text-gold border-b-2 border-gold bg-gold/5 rounded-t-lg'
              : 'text-text-secondary hover:text-text-primary'
          "
          @click="tab = 'blocked'"
        >
          {{ $t('friends.tabBlocked') }}
          <span class="text-[9px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-full">{{
            blocked.length
          }}</span>
        </button>
      </div>

      <div v-if="loading" class="text-center text-text-secondary text-sm py-8">
        {{ $t('common.loading') }}
      </div>

      <!-- 好友标签页（设计稿 13-friends：在线/离线分组） -->
      <div v-else-if="tab === 'friends'">
        <div
          v-if="filteredFriends.length === 0"
          class="text-center text-text-secondary text-sm py-8"
        >
          {{ $t('friends.noFriends') }}
        </div>
        <template v-else>
          <!-- 在线分组 -->
          <div v-if="filteredOnline.length > 0" class="mb-6">
            <div class="flex items-center gap-2 mb-4">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <h2 class="text-sm font-semibold uppercase tracking-wider text-emerald-400">
                {{ $t('common.online') }} · {{ filteredOnline.length }}
              </h2>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div
                v-for="f in filteredOnline"
                :key="f.id"
                class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-4 hover:border-gold/30 transition-all"
              >
                <div class="flex items-center gap-3">
                  <div class="relative">
                    <div
                      class="w-12 h-12 rounded-full bg-gradient-to-br border flex items-center justify-center"
                      :class="avatarCls(f.userId)"
                    >
                      <span class="text-sm font-bold">{{ initial(f.username) }}</span>
                    </div>
                    <div
                      class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#0f1117]"
                    ></div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-medium truncate">{{ f.username }}</p>
                      <span class="text-[9px] text-gold/80">{{ f.elo }}</span>
                    </div>
                    <p class="text-[10px] text-emerald-400">
                      {{ $t('friends.onlineCanInvite') }}
                    </p>
                  </div>
                  <div class="flex gap-1.5">
                    <button
                      :disabled="challengingId === f.userId"
                      :title="$t('friends.inviteTitle')"
                      class="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      @click="sendChallenge(f.userId)"
                    >
                      <Swords class="w-3 h-3" />{{
                        challengingId === f.userId
                          ? $t('friends.inviteWaiting')
                          : $t('friends.invite')
                      }}
                    </button>
                    <button
                      class="p-1.5 rounded-lg bg-glass text-text-secondary border border-glass-border hover:text-rose-400 transition-all"
                      :title="$t('friends.blockTitle')"
                      @click="store.block(f.userId)"
                    >
                      <Ban class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 离线分组 -->
          <div v-if="filteredOffline.length > 0">
            <div class="flex items-center gap-2 mb-4">
              <span class="w-2 h-2 rounded-full bg-text-secondary"></span>
              <h2 class="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                {{ $t('common.offline') }} · {{ filteredOffline.length }}
              </h2>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div
                v-for="f in filteredOffline"
                :key="f.id"
                class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-4 opacity-70"
              >
                <div class="flex items-center gap-3">
                  <div class="relative">
                    <div
                      class="w-12 h-12 rounded-full bg-gradient-to-br border flex items-center justify-center grayscale"
                      :class="avatarCls(f.userId)"
                    >
                      <span class="text-sm font-bold">{{ initial(f.username) }}</span>
                    </div>
                    <div
                      class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-text-secondary border-2 border-[#0f1117]"
                    ></div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">{{ f.username }}</p>
                    <p class="text-[10px] text-text-secondary">{{ $t('common.offline') }}</p>
                  </div>
                  <button
                    class="p-1.5 rounded-lg bg-glass text-text-secondary border border-glass-border hover:text-rose-400 transition-all"
                    :title="$t('friends.blockTitle')"
                    @click="store.block(f.userId)"
                  >
                    <Ban class="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 请求标签页 -->
      <div v-else-if="tab === 'requests'" class="space-y-6">
        <!-- 收到的请求 -->
        <div>
          <p class="text-[10px] uppercase tracking-wider text-text-secondary mb-3">
            {{ $t('friends.receivedRequests') }}
          </p>
          <div
            v-if="requests.length === 0"
            class="text-center text-text-secondary text-sm py-6 bg-glass/40 border border-glass-border rounded-2xl"
          >
            {{ $t('friends.noReceived') }}
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="r in requests"
              :key="r.id"
              class="backdrop-blur-xl bg-glass border border-amber-500/20 rounded-2xl p-4 flex items-center gap-3"
            >
              <div
                class="w-11 h-11 rounded-full bg-gradient-to-br border flex items-center justify-center"
                :class="avatarCls(r.userId)"
              >
                <span class="text-sm font-bold">{{ initial(r.username) }}</span>
              </div>
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium">{{ r.username }}</p>
                  <span class="text-[9px] text-gold/80">{{ r.elo }}</span>
                </div>
                <p class="text-[10px] text-text-secondary">{{ $t('friends.requestAddYou') }}</p>
              </div>
              <div class="flex gap-2">
                <button
                  class="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-1"
                  @click="store.accept(r.userId)"
                >
                  <Check class="w-3 h-3" />{{ $t('common.accept') }}
                </button>
                <button
                  class="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-glass text-text-secondary border border-glass-border hover:bg-[rgba(255,255,255,0.08)] transition-all flex items-center gap-1"
                  @click="store.reject(r.userId)"
                >
                  <X class="w-3 h-3" />{{ $t('common.reject') }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 我发出的请求 -->
        <div>
          <p class="text-[10px] uppercase tracking-wider text-text-secondary mb-3">
            {{ $t('friends.sentRequests') }}
          </p>
          <div
            v-if="sent.length === 0"
            class="text-center text-text-secondary text-sm py-6 bg-glass/40 border border-glass-border rounded-2xl"
          >
            {{ $t('friends.noSent') }}
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="s in sent"
              :key="s.id"
              class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-4 flex items-center gap-3 opacity-90"
            >
              <div
                class="w-11 h-11 rounded-full bg-gradient-to-br border flex items-center justify-center"
                :class="avatarCls(s.userId)"
              >
                <span class="text-sm font-bold">{{ initial(s.username) }}</span>
              </div>
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium">{{ s.username }}</p>
                  <span class="text-[9px] text-gold/80">{{ s.elo }}</span>
                </div>
                <p class="text-[10px] text-amber-400/80">{{ $t('friends.waitingAccept') }}</p>
              </div>
              <button
                class="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-glass text-text-secondary border border-glass-border hover:text-rose-400 hover:border-rose-500/20 transition-all flex items-center gap-1"
                @click="store.cancel(s.userId)"
              >
                <X class="w-3 h-3" />{{ $t('friends.withdraw') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 屏蔽标签页 -->
      <div v-else-if="tab === 'blocked'" class="grid grid-cols-2 gap-4">
        <div
          v-if="blocked.length === 0"
          class="col-span-2 text-center text-text-secondary text-sm py-8"
        >
          {{ $t('friends.noBlocked') }}
        </div>
        <div
          v-for="b in blocked"
          :key="b.id"
          class="backdrop-blur-xl bg-glass border border-rose-500/15 rounded-2xl p-4 flex items-center gap-3 opacity-80"
        >
          <div
            class="w-10 h-10 rounded-full bg-[rgba(255,255,255,0.03)] border border-glass-border flex items-center justify-center grayscale"
          >
            <Users class="w-4 h-4 text-text-secondary" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-text-secondary truncate">{{ b.username }}</p>
            <p class="text-[10px] text-text-secondary">{{ $t('friends.blockedNote') }}</p>
          </div>
          <button
            class="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-glass text-text-secondary border border-glass-border hover:text-text-primary transition-all"
            @click="store.unblock(b.userId)"
          >
            {{ $t('friends.unblock') }}
          </button>
        </div>
      </div>
    </main>
  </div>
</template>
