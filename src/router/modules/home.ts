import type { RouteRecordRaw } from 'vue-router'

export const homeRoutes: RouteRecordRaw[] = [
  {
    path: '/home',
    name: 'home',
    component: () => import('@/views/user/landing/index.vue'),
  },
  {
    path: '/',
    name: 'landing',
    component: () => import('@/views/user/landing/index.vue'),
  },
]