import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getNotifications, markAsRead, getUnreadCount } from '@/api/notification'
import type { InboxItem } from '@/api/notification'

export type NotificationItem = InboxItem

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<NotificationItem[]>([])
  const total = ref(0)
  const unreadCount = ref(0)
  const loading = ref(false)
  const error = ref('')

  async function fetchNotifications(page = 1, size = 20, read?: 0 | 1) {
    loading.value = true
    error.value = ''
    try {
      const data = await getNotifications(page, size, read)
      notifications.value = data?.items ?? []
      total.value = data?.total ?? 0
    } catch (e: any) {
      error.value = e.message || '通知加载失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchUnreadCount() {
    try {
      const count = await getUnreadCount()
      unreadCount.value = count || 0
    } catch { /* non-critical */ }
  }

  async function markRead(notificationId: number) {
    try {
      await markAsRead(notificationId)
      const item = notifications.value.find(n => n.notificationId === notificationId)
      if (item) item.read = true
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    } catch { /* non-critical */ }
  }

  /** 后端未提供批量已读接口，逐条标记当前页未读通知 */
  async function markAllRead() {
    const unread = notifications.value.filter(n => !n.read)
    if (!unread.length) return
    await Promise.all(unread.map(n => markAsRead(n.notificationId).catch(() => null)))
    unread.forEach(n => { n.read = true })
    unreadCount.value = 0
  }

  return {
    notifications, total, unreadCount, loading, error,
    fetchNotifications, fetchUnreadCount, markRead, markAllRead,
  }
})
