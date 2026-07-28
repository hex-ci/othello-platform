import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      // 首页（双态：未登录=试玩漏斗，登录=行动中枢），对照设计稿 00-home
      path: '/',
      name: 'home',
      component: () => import('@/pages/HomePage.vue'),
    },
    {
      // 离线人机练习场（F-C-05「马上玩」，免登录，不计分）
      path: '/local',
      name: 'local-game',
      component: () => import('@/pages/LocalGamePage.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/LoginPage.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/pages/RegisterPage.vue'),
    },
    {
      path: '/lobby',
      name: 'lobby',
      component: () => import('@/pages/LobbyPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/game/:id',
      name: 'online-game',
      component: () => import('@/pages/OnlineGamePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      // 房间准备页（人人房，附录C ready 子阶段）：双方准备 + 房主开局后跳 /game/:id
      path: '/room/:id',
      name: 'room',
      component: () => import('@/pages/RoomPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/spectate/:id',
      name: 'spectate',
      component: () => import('@/pages/SpectatePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      // 复盘：对局 id（g_数字）或分享令牌（16 位 base64url）。分享链接无需登录。
      path: '/replay/:id',
      name: 'replay',
      component: () => import('@/pages/ReplayPage.vue'),
    },
    {
      path: '/friends',
      name: 'friends',
      component: () => import('@/pages/FriendsPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/leaderboard',
      name: 'leaderboard',
      component: () => import('@/pages/LeaderboardPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      // 资料页（F-C-10~13，对照设计稿 09-profile）
      path: '/profile/:id',
      name: 'profile',
      component: () => import('@/pages/ProfilePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/pages/SettingsPage.vue'),
    },
    {
      path: '/tactics',
      name: 'tactics',
      component: () => import('@/pages/TacticsPage.vue'),
    },
    {
      // 404 兜底：未匹配路径 → 趣味 NotFoundPage（对照设计稿 15-not-found）
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/pages/NotFoundPage.vue'),
    },
  ],
})

// 登录守卫：需鉴权页面未登录则跳转登录页
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !localStorage.getItem('token')) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  return true
})
