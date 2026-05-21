import type { RouteRecordRaw } from 'vue-router'

export const userRoutes: RouteRecordRaw[] = [
  {
    path: '/user',
    name: 'user',
    redirect: '/user/home',
    children: [
      {
        path: 'home',
        name: 'user-home',
        component: () => import('@/views/user/home/index.vue'),
        meta: { requiresAuth: true, role: 'USER' },
      },
    ],
  },
]
