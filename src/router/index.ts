import { createRouter, createWebHistory } from 'vue-router'

import { routes } from './modules'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

function resolveHomePath(role: unknown): string {
  const picked = String(role ?? '').toUpperCase()
  if (picked) return '/home'
  return '/login'
}

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta?.guestOnly && auth.isAuthenticated) {
    return resolveHomePath(auth.role)
  }

  if (to.meta?.requiresAuth) {
    if (!auth.isAuthenticated) {
      return {
        path: '/login',
        query: { redirect: to.fullPath },
      }
    }

    const requiredRole = (to.meta as { role?: unknown }).role
    if (requiredRole) {
      const required = String(requiredRole).toUpperCase()
      const actual = String(auth.role ?? '').toUpperCase()
      const ok =
        required === actual ||
        (required === 'ADMIN' && actual === 'SUPER_ADMIN')
      if (!ok) return resolveHomePath(auth.role)
    }
  }
})

export default router
