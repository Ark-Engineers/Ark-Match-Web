import type { RouteRecordRaw } from 'vue-router'

export const adminRoutes: RouteRecordRaw[] = [
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/admin/admin/index.vue'),
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
        path: 'notice',
        name: 'admin-notice',
        component: () => import('@/views/admin/notice/index.vue'),
        meta: { requiresAuth: true, role: 'ADMIN' },
      },
      {
        path: 'm/1',
        name: 'admin-users',
        component: () => import('@/views/admin/users/index.vue'),
        meta: { requiresAuth: true, role: 'ADMIN' },
      },
      {
        path: 'permission',
        name: 'admin-permission',
        component: () => import('@/views/admin/permission/index.vue'),
        meta: { requiresAuth: true, role: 'SUPER_ADMIN' },
      },
      {
        path: 'overview',
        name: 'admin-overview',
        component: () => import('@/views/admin/placeholder/index.vue'),
        meta: { requiresAuth: true, role: 'ADMIN', title: '数据概览' },
      },
      {
        path: 'settings',
        name: 'admin-settings',
        component: () => import('@/views/admin/placeholder/index.vue'),
        meta: { requiresAuth: true, role: 'ADMIN', title: '系统设置' },
      },
      {
        path: 'profile',
        name: 'admin-profile',
        component: () => import('@/views/user/profile/index.vue'),
        meta: { requiresAuth: true, role: 'ADMIN', title: '个人信息' },
      },
    ],
  },
]
