import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'

import { API_BASE_URL } from '@/config'
import { STORAGE_KEYS } from '@/constants/storage-keys'
import { getJson, remove } from '@/utils/storage'
import { handleBanBlockedIfNeeded } from '@/utils/ban-block'

type StoredAuthSession = {
  value?: { tokenType?: string; accessToken?: string }
  expireAt?: number
  tokenType?: string
  accessToken?: string
}

export const http: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  const raw = getJson<StoredAuthSession>(STORAGE_KEYS.authSession)
  const expireAt = Number(raw?.expireAt ?? 0)
  if (expireAt > 0 && Date.now() >= expireAt) {
    remove(STORAGE_KEYS.authSession)
    try {
      localStorage.removeItem('token')
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      sessionStorage.clear()
    } catch {}
    return config
  }

  const session = raw?.value ?? raw
  if (!session?.accessToken) return config

  const tokenType = session.tokenType || 'Bearer'
  config.headers = config.headers ?? {}
  if (!('Authorization' in config.headers)) {
    config.headers.Authorization = `${tokenType} ${session.accessToken}`
  }
  return config
})

http.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const anyData = error.response?.data as any
    await handleBanBlockedIfNeeded(anyData)
    if (error.response?.status === 401) {
      remove(STORAGE_KEYS.authSession)
      try {
        localStorage.removeItem('token')
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
        sessionStorage.clear()
      } catch {}
    }
    return Promise.reject(error)
  },
)

export async function request<T = unknown>(config: AxiosRequestConfig): Promise<T> {
  const response = await http.request<T>(config)
  return response.data
}
