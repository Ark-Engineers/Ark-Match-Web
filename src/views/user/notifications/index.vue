<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationStore } from '@/stores/notification'
import { useUiStore } from '@/stores/ui'
import { requestClaimTicket, claimLmdMail } from '@/api/lmd'
import type { InboxItem } from '@/api/notification'
import UiButton from '@/components/UiButton.vue'
import UiSpinner from '@/components/UiSpinner.vue'
import UiEmptyState from '@/components/UiEmptyState.vue'
import UiErrorState from '@/components/UiErrorState.vue'

const router = useRouter()
const notifStore = useNotificationStore()
const uiStore = useUiStore()
const loading = ref(true)
const error = ref('')
const markingAll = ref(false)
const claimingIds = ref<Set<number>>(new Set())

onMounted(async () => {
  loading.value = true
  try {
    await notifStore.fetchNotifications()
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
})

async function handleMarkRead(notificationId: number) {
  await notifStore.markRead(notificationId)
}

async function handleMarkAllRead() {
  markingAll.value = true
  await notifStore.markAllRead()
  markingAll.value = false
}

function isLmdExpired(item: InboxItem): boolean {
  if (!item.lmdClaimExpireAt) return false
  return new Date(item.lmdClaimExpireAt).getTime() < Date.now()
}

async function handleClaim(item: InboxItem) {
  if (claimingIds.value.has(item.notificationId)) return
  claimingIds.value = new Set(claimingIds.value).add(item.notificationId)
  try {
    const { ticket } = await requestClaimTicket(item.notificationId)
    const result = await claimLmdMail(item.notificationId, ticket)
    uiStore.showToast(`领取成功，龙门币 +${result.amount}（余额 ${result.balance}）`, 'success')
    await notifStore.fetchNotifications()
    await notifStore.fetchUnreadCount()
  } catch (e: any) {
    uiStore.showToast(e.message || '领取失败', 'error')
  } finally {
    const next = new Set(claimingIds.value)
    next.delete(item.notificationId)
    claimingIds.value = next
  }
}

function formatTime(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function formatExpire(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const levelColors: Record<string, string> = {
  INFO: 'border-l-cyan-500',
  WARNING: 'border-l-amber-500',
  ERROR: 'border-l-red-500',
}
</script>

<template>
  <div class="min-h-screen">
    <div class="max-w-lg mx-auto px-4 py-8">
      <div class="flex items-center justify-between mb-8">
        <div class="flex items-center gap-4">
          <button class="text-gray-400 hover:text-white transition cursor-pointer" @click="router.back()">&larr; 返回</button>
          <h1 class="text-xl font-bold text-white">通知</h1>
        </div>
        <UiButton
          v-if="notifStore.notifications.length && notifStore.unreadCount > 0"
          variant="ghost"
          :loading="markingAll"
          @click="handleMarkAllRead"
        >
          全部已读
        </UiButton>
      </div>

      <UiSpinner v-if="loading" label="加载中..." />
      <UiErrorState v-else-if="error" :message="error" @retry="notifStore.fetchNotifications()" />
      <UiEmptyState
        v-else-if="!notifStore.notifications.length"
        title="暂无通知"
        description="当有新匹配或状态变更时，你会在这里收到通知"
      />

      <div v-else class="space-y-2">
        <div
          v-for="item in notifStore.notifications"
          :key="item.notificationId"
          class="bg-gray-900 border border-gray-800 rounded-lg border-l-4 cursor-pointer hover:border-gray-700 transition"
          :class="[
            item.read ? 'opacity-60' : levelColors[item.level] || 'border-l-gray-700',
          ]"
          @click="!item.read && handleMarkRead(item.notificationId)"
        >
          <div class="px-4 py-3">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span v-if="!item.read" class="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />
                  <p class="text-sm font-medium text-white truncate">{{ item.title }}</p>
                </div>
                <p class="text-xs text-gray-400 mt-1">{{ item.content }}</p>
              </div>
              <span class="text-xs text-gray-600 whitespace-nowrap">{{ formatTime(item.deliveredAt || item.notificationCreatedAt || '') }}</span>
            </div>

            <div
              v-if="item.lmdAmount > 0"
              class="mt-2 pt-2 border-t border-gray-800 flex items-center justify-between gap-2"
              @click.stop
            >
              <div class="text-xs">
                <span class="text-amber-400 font-semibold">龙门币 +{{ item.lmdAmount }}</span>
                <span v-if="item.lmdClaimExpireAt" class="text-gray-500 ml-2">
                  截止 {{ formatExpire(item.lmdClaimExpireAt) }}
                </span>
                <span v-else class="text-gray-500 ml-2">永久有效</span>
              </div>
              <span v-if="item.claimed" class="text-xs text-green-400">已领取</span>
              <span v-else-if="isLmdExpired(item)" class="text-xs text-gray-500">已过期</span>
              <UiButton
                v-else
                variant="primary"
                :loading="claimingIds.has(item.notificationId)"
                @click="handleClaim(item)"
              >
                领取
              </UiButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
