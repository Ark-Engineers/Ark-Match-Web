import type { RouteRecordRaw } from 'vue-router'

export const userRoutes: RouteRecordRaw[] = [
  {
    path: '/user',
    name: 'user',
    redirect: '/home',
  },
  {
    path: '/user/profile',
    name: 'user-profile',
    component: () => import('@/views/user/profile/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/user/ark-bind/callback',
    name: 'user-ark-bind-callback',
    component: () => import('@/views/user/ark-bind/callback/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/user/ark-bind',
    name: 'user-ark-bind',
    component: () => import('@/views/user/ark-bind/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/user/profile/:userId',
    name: 'user-profile-view',
    component: () => import('@/views/user/profile/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/user/appeal',
    name: 'user-appeal',
    component: () => import('@/views/user/appeal/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/user/ban-records',
    name: 'user-ban-records',
    component: () => import('@/views/user/ban-records/index.vue'),
    meta: { requiresAuth: true },
  },
  // ---- v1 迁移页面 ----
  {
    path: '/profile',
    name: 'profile-edit',
    redirect: '/user/profile',
    meta: { requiresAuth: true },
  },
  {
    path: '/match-status',
    name: 'match-status',
    component: () => import('@/views/user/match-status/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/pending-matches',
    name: 'pending-matches',
    component: () => import('@/views/user/pending-matches/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/match/:id',
    name: 'match-detail',
    component: () => import('@/views/user/match-detail/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/notifications',
    name: 'notifications',
    component: () => import('@/views/user/notifications/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/user/lmd',
    name: 'user-lmd',
    component: () => import('@/views/user/lmd/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/notices',
    name: 'notices',
    component: () => import('@/views/user/notices/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/survey-refresh',
    name: 'survey-refresh',
    component: () => import('@/views/user/survey-refresh/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/ban-appeal',
    name: 'user-ban-appeal',
    component: () => import('@/views/user/ban-appeal/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/online',
    name: 'online',
    component: () => import('@/views/user/online/index.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/online/room',
    name: 'online-room',
    component: () => import('@/views/user/online/room.vue'),
    meta: { requiresAuth: true },
  },
]
