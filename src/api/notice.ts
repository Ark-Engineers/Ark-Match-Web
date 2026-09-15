import { unwrap } from './user-http'

export interface UserNotice {
  id: number
  title: string
  content: string
  level: string
  pinned: boolean
  publishAt: string | null
  expireAt: string | null
  read: boolean
}

export interface UserNoticePage {
  total: number
  page: number
  size: number
  items: UserNotice[]
}

/** 用户侧公告列表 */
export async function listUserNotices(params: {
  keyword?: string
  page?: number
  size?: number
}): Promise<UserNoticePage> {
  return unwrap<UserNoticePage>({ url: '/user/notices', method: 'GET', params })
}

/** 重要公告弹窗：无未读重要公告时返回 null */
export async function getNoticePopup(): Promise<UserNotice | null> {
  // 后端无公告时可能返回空 body，这里统一校验：只有带 id 才算有效公告，否则视为"无弹窗"
  try {
    const res = await unwrap<UserNotice>({ url: '/user/notices/popup', method: 'GET' })
    if (typeof res === 'object' && res !== null && 'id' in res) {
      return res as UserNotice
    }
    return null
  } catch {
    return null
  }
}

/** 公告详情（会标记已读） */
export async function getUserNotice(id: number): Promise<UserNotice> {
  return unwrap<UserNotice>({ url: `/user/notices/${id}`, method: 'GET' })
}

/** 标记公告已读 */
export async function markUserNoticeRead(noticeId: number): Promise<void> {
  return unwrap<void>({ url: '/user/notices/read', method: 'POST', data: { noticeId } })
}