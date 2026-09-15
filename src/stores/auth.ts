import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { STORAGE_KEYS } from '@/constants/storage-keys'
import { getJson, remove, setJson } from '@/utils/storage'
import * as authApi from '@/api/auth'
import { getMe as apiGetMe } from '@/api/user'

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
    profile.value = null
    nickname.value = ''
    userIdComputed.value = 0
    error.value = ''
  }

  // ---- v1 兼容接口（登录弹窗 / 用户侧迁移页面使用，仍以 main 的 session 持久化为主）----
  const profile = ref<any>(null)
  const nickname = ref('')
  const loading = ref(false)
  const error = ref('')
  const rememberedAccount = ref('')
  const rememberMe = ref(false)

  const userIdComputed = ref<number>(0)

  const isLoggedIn = computed(() => isAuthenticated.value)
  const isAdmin = computed(() => String(role.value ?? '').toUpperCase() === 'ADMIN' || String(role.value ?? '').toUpperCase() === 'SUPER_ADMIN')
  const userId = computed(() => userIdComputed.value || Number(session.value?.userId ?? 0) || 0)

  async function fetchProfile(): Promise<any | null> {
    if (!isLoggedIn.value) return null
    try {
      const data = await apiGetMe()
      profile.value = data
      if (data?.nickname) {
        nickname.value = data.nickname
      }
      if (Number(data?.userId || 0)) userIdComputed.value = Number(data.userId)
      return data
    } catch {
      return null
    }
  }

  async function login(account: string, password: string, remember = false, captchaId?: string, captchaText?: string) {
    loading.value = true
    error.value = ''
    try {
      const t = await authApi.login(account, password, captchaId ?? '', captchaText ?? '')
      setSession(t)
      if (Number(t.userId || 0)) userIdComputed.value = Number(t.userId)
      if (remember) localStorage.setItem('rememberedAccount', account)
      else localStorage.removeItem('rememberedAccount')
      return t
    } catch (e: any) {
      error.value = e.message ?? '登录失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function register(email: string, emailCode: string, password: string, confirmPassword: string, nicknameInput: string) {
    loading.value = true
    error.value = ''
    try {
      return await authApi.register({ email, emailCode, password, confirmPassword, nickname: nicknameInput })
    } catch (e: any) {
      error.value = e.message ?? '注册失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function logout(opts?: { all?: boolean; refreshToken?: string }) {
    try {
      const rt = opts?.refreshToken ?? session.value?.refreshToken
      if (opts?.all) await authApi.logoutAll()
      else await authApi.logout(rt ?? undefined)
    } catch {
      // 登出接口失败也强制清登录态
    } finally {
      clearAllClientAuthState()
    }
  }

  function clear(): void {
    clearAllClientAuthState()
  }

  // 会话过期定时检查：登录后每分钟校验 JWT exp，过期即登出并广播（供应用层引导重新登录）
  let watcherTimer: ReturnType<typeof setInterval> | null = null
  function startSessionWatcher(): void {
    stopSessionWatcher()
    if (typeof window === 'undefined') return
    watcherTimer = setInterval(() => {
      const exp = sessionExpireAt.value
      if (!session.value?.accessToken) return
      if (exp && typeof exp === 'number' && !Number.isNaN(exp) && Date.now() > exp) {
        clearAllClientAuthState()
        window.dispatchEvent(new CustomEvent('auth:force-logout'))
      }
    }, 60_000)
  }
  function stopSessionWatcher(): void {
    if (watcherTimer !== null) {
      clearInterval(watcherTimer)
      watcherTimer = null
    }
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
    // v1 兼容
    isLoggedIn,
    isAdmin,
    nickname,
    profile,
    userId,
    loading,
    error,
    rememberedAccount,
    rememberMe,
    login,
    register,
    logout,
    fetchProfile,
    clear,
    startSessionWatcher,
    stopSessionWatcher,
  }
})

