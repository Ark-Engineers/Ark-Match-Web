import type { RouteRecordRaw } from 'vue-router'

export const adminRoutes: RouteRecordRaw[] = [
  {
    path: '/admin',
    name: 'admin',
    redirect: '/admin/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'admin-dashboard',
        component: () => import('@/views/admin/dashboard/index.vue'),
        meta: { requiresAuth: true, role: 'ADMIN' },
      },
      {
        path: 'ban',
        name: 'admin-ban',
        component: () => import('@/views/admin/ban/index.vue'),
        meta: { requiresAuth: true, role: 'ADMIN' },
      },
      {
        path: 'permission',
        name: 'admin-permission',
        component: () => import('@/views/admin/permission/index.vue'),
        meta: { requiresAuth: true, role: 'SUPER_ADMIN' },
      },
    ],
  },
]
