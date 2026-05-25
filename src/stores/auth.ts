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

type StoredAuthSession = {
  value: AuthSession
  expireAt: number
}

function parseJwtExpMs(token: string): number | null {
  const t = String(token || '').trim()
  const parts = t.split('.')
  if (parts.length < 2) return null
  const payload = parts[1] ?? ''
  if (!payload) return null
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const json = atob(base64)
    const obj = JSON.parse(json) as any
    const exp = Number(obj?.exp ?? 0)
    if (!Number.isFinite(exp) || exp <= 0) return null
    return exp * 1000
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const raw = getJson<StoredAuthSession | AuthSession>(STORAGE_KEYS.authSession)
  const restored =
    raw && typeof raw === 'object' && 'value' in (raw as any) && 'expireAt' in (raw as any)
      ? (raw as StoredAuthSession)
      : null

  const legacy = restored ? null : raw && typeof raw === 'object' && 'accessToken' in (raw as any) ? (raw as AuthSession) : null

  const session = ref<AuthSession | null>(restored?.value ?? legacy ?? null)
  const sessionExpireAt = ref<number | null>(
    restored?.expireAt ?? (legacy?.accessToken ? parseJwtExpMs(legacy.accessToken) : null),
  )

  const isAuthenticated = computed(() => Boolean(session.value?.accessToken))
  const role = computed(() => session.value?.role ?? null)

  function ensureSessionValid(): boolean {
    if (session.value?.accessToken && !sessionExpireAt.value) {
      sessionExpireAt.value = parseJwtExpMs(session.value.accessToken)
    }
    const exp = sessionExpireAt.value
    if (!exp) return Boolean(session.value?.accessToken)
    if (Date.now() < exp) return Boolean(session.value?.accessToken)
    clearAllClientAuthState()
    return false
  }

  function setSession(next: AuthSession): void {
    session.value = next
    const parsed = parseJwtExpMs(next.accessToken)
    const expireAt = parsed ?? (Date.now() + Math.max(60, Number(next.accessExpiresIn || 0)) * 1000)
    sessionExpireAt.value = expireAt
    setJson(STORAGE_KEYS.authSession, { value: next, expireAt })
  }

  function clearSession(): void {
    session.value = null
    sessionExpireAt.value = null
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
    sessionExpireAt,
    isAuthenticated,
    role,
    ensureSessionValid,
    setSession,
    clearSession,
    clearAllClientAuthState,
  }
})

