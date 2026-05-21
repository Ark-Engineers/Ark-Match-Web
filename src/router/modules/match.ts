import type { RouteRecordRaw } from 'vue-router'

export const matchRoutes: RouteRecordRaw[] = [
  {
    path: '/match',
    name: 'match',
    component: () => import('@/views/user/match/index.vue'),
  },
]
