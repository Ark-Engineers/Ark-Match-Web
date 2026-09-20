import { unwrap } from './user-http'

/** 后端收件箱条目（GET /user/notifications items 结构） */
export interface InboxItem {
  id: number
  notificationId: number
  type: string
  title: string
  content: string
  level: string
  linkUrl: string | null
  payloadJson: string | null
  lmdAmount: number
  lmdClaimExpireAt: string | null
  expireAt: string | null
  notificationCreatedAt: string | null
  read: boolean
  readAt: string | null
  claimed: boolean
  claimedAt: string | null
  deliveredAt: string | null
}

export interface InboxPage {
  total: number
  page: number
  size: number
  items: InboxItem[]
}

export async function getNotifications(page = 1, size = 20, read?: 0 | 1): Promise<InboxPage> {
  return unwrap<InboxPage>({ url: '/user/notifications', method: 'GET', params: { page, size, read } })
}

export async function getUnreadCount(): Promise<number> {
  return unwrap<number>({ url: '/user/notifications/unread-count', method: 'GET' })
}

export async function markAsRead(notificationId: number): Promise<void> {
  return unwrap<void>({ url: '/user/notifications/read', method: 'POST', data: { notificationId } })
}
