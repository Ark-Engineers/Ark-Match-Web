import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'

import { API_BASE_URL } from '@/config'
import { STORAGE_KEYS } from '@/constants/storage-keys'
import { getJson, remove } from '@/utils/storage'

export const http: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  const session = getJson<{ tokenType?: string; accessToken?: string }>(STORAGE_KEYS.authSession)
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
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      remove(STORAGE_KEYS.authSession)
      try {
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
