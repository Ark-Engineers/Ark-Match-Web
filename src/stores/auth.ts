import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { STORAGE_KEYS } from '@/constants/storage-keys'
import { getJson, remove, setJson } from '@/utils/storage'

export type UserRole = 'ADMIN' | 'USER' | string

export type AuthSession = {
  tokenType: string
  accessToken: string
  accessExpiresIn: number
  refreshToken: string
  refreshExpiresIn: number
  userId: number
  role: UserRole
  weight: number
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(getJson<AuthSession>(STORAGE_KEYS.authSession))

  const isAuthenticated = computed(() => Boolean(session.value?.accessToken))
  const role = computed(() => session.value?.role ?? null)

  function setSession(next: AuthSession): void {
    session.value = next
    setJson(STORAGE_KEYS.authSession, next)
  }

  function clearSession(): void {
    session.value = null
    remove(STORAGE_KEYS.authSession)
  }

  function clearAllClientAuthState(): void {
    clearSession()
    try {
      localStorage.removeItem('token')
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      sessionStorage.clear()
    } catch {}
  }

  return {
    session,
    isAuthenticated,
    role,
    setSession,
    clearSession,
    clearAllClientAuthState,
  }
})

