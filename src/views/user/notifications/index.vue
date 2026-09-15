<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationStore } from '@/stores/notification'
import UiCard from '@/components/UiCard.vue'
import UiButton from '@/components/UiButton.vue'
import UiSpinner from '@/components/UiSpinner.vue'
import UiEmptyState from '@/components/UiEmptyState.vue'
import UiErrorState from '@/components/UiErrorState.vue'

const router = useRouter()
const notifStore = useNotificationStore()
const loading = ref(true)
const error = ref('')
const markingAll = ref(false)

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
          </div>
        </div>
      </div>
    </div>
  </div>
</template>