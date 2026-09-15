import type { AxiosRequestConfig } from 'axios'

import { request } from './request'

/** main 后端统一响应包 { code, message, data } */
export type ApiResp<T = unknown> = { code: number; message: string; data: T }

/**
 * 以 main 的统一请求层 request 为基础发起请求，并解包业务码：
 * - code !== 0 时抛出带 code 的 Error，供页面展示 message；
 * - 成功时返回 data。
 * 用于用户侧（v1 移植）页面，保证与 main 的鉴权/封禁/刷新逻辑一致。
 */
export async function unwrap<T = unknown>(config: AxiosRequestConfig): Promise<T> {
  const r = await request<ApiResp<T>>(config)
  if (!r || r.code !== 0) {
    const e = new Error(r?.message || '请求失败') as Error & { code?: number }
    e.code = r?.code
    throw e
  }
  return r.data as T
}