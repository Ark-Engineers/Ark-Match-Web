import type { RouteRecordRaw } from 'vue-router'

export const userRoutes: RouteRecordRaw[] = [
  {
    path: '/user',
    name: 'user',
    redirect: '/home',
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
]
