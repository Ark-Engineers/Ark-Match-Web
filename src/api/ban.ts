import { unwrap } from './user-http'

// --- types ---

export interface UserBanRecord {
  id: number
  targetType: string
  targetValue: string
  reason: string
  durationSeconds: number | null
  effectiveAt: string
  expiresAt: string | null
  status: string
  unbannedAt: string | null
  unbanType: string | null
  createdAt: string
}

export interface AppealItem {
  id: number
  userId: number
  banRecordId: number | null
  reason: string
  contact: string | null
  status: 'PENDING' | 'PROCESSED'
  adminReply: string | null
  handledAt: string | null
  createdAt: string
}

export interface PageResponse<T> {
  total: number
  page: number
  size: number
  items: T[]
}

// --- API calls ---

/** 查看当前用户自己的封禁记录 */
export async function listMyBanRecords(params: {
  status?: string
  page?: number
  size?: number
} = {}): Promise<PageResponse<UserBanRecord>> {
  return unwrap<PageResponse<UserBanRecord>>({ url: '/user/ban/records', method: 'GET', params })
}

/** 提交封禁申诉 */
export async function submitBanAppeal(data: {
  banRecordId: number
  reason: string
  contact?: string
}): Promise<AppealItem> {
  return unwrap<AppealItem>({ url: '/user/ban/appeals', method: 'POST', data })
}