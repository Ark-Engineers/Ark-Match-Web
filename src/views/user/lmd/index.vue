<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getLmdBalance, getLmdTransactions, type LmdTxItem } from '@/api/lmd'
import UiButton from '@/components/UiButton.vue'
import UiSpinner from '@/components/UiSpinner.vue'
import UiErrorState from '@/components/UiErrorState.vue'
import UiEmptyState from '@/components/UiEmptyState.vue'

const router = useRouter()

const balance = ref(0)
const loading = ref(true)
const error = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const items = ref<LmdTxItem[]>([])
const loadingMore = ref(false)

const typeLabels: Record<string, string> = {
  MAIL_CLAIM: '邮件领取',
  ADMIN_ADJUST: '系统调整',
}

function typeLabel(type: string): string {
  return typeLabels[type] || type
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [b, p] = await Promise.all([getLmdBalance(), getLmdTransactions(1, pageSize)])
    balance.value = b.balance
    total.value = p.total
    items.value = p.items
    page.value = 1
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || items.value.length >= total.value) return
  loadingMore.value = true
  try {
    const p = await getLmdTransactions(page.value + 1, pageSize)
    items.value = items.value.concat(p.items)
    page.value += 1
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    loadingMore.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen">
    <div class="max-w-lg mx-auto px-4 py-8">
      <div class="flex items-center justify-between mb-8">
        <div class="flex items-center gap-4">
          <button class="text-gray-400 hover:text-white transition cursor-pointer" @click="router.back()">&larr; 返回</button>
          <h1 class="text-xl font-bold text-white">龙门币</h1>
        </div>
      </div>

      <UiSpinner v-if="loading" label="加载中..." />
      <UiErrorState v-else-if="error && !items.length" :message="error" @retry="load" />
      <template v-else>
        <div class="bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border border-amber-500/30 rounded-lg px-5 py-6 mb-6 text-center">
          <p class="text-xs text-amber-200/70 mb-1">当前余额</p>
          <p class="text-3xl font-bold text-amber-300">{{ balance }}</p>
          <p class="text-xs text-gray-500 mt-2">龙门币可通过系统邮件奖励获得</p>
        </div>

        <p class="text-sm font-medium text-gray-300 mb-3">流水记录</p>
        <UiEmptyState v-if="!items.length" title="暂无流水" description="领取龙门币邮件奖励后，这里会记录每一笔变动" />
        <div v-else class="space-y-2">
          <div
            v-for="tx in items"
            :key="tx.id"
            class="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between gap-3"
          >
            <div class="min-w-0">
              <p class="text-sm text-white">{{ typeLabel(tx.type) }}</p>
              <p class="text-xs text-gray-500 mt-1">
                {{ formatTime(tx.createdAt) }}
                <span v-if="tx.description" class="ml-2">{{ tx.description }}</span>
              </p>
            </div>
            <div class="text-right shrink-0">
              <p :class="tx.amount >= 0 ? 'text-green-400' : 'text-red-400'" class="text-sm font-semibold">
                {{ tx.amount >= 0 ? '+' : '' }}{{ tx.amount }}
              </p>
              <p class="text-xs text-gray-600">余额 {{ tx.balanceAfter }}</p>
            </div>
          </div>
          <div v-if="items.length < total" class="pt-2">
            <UiButton variant="secondary" block :loading="loadingMore" @click="loadMore">加载更多</UiButton>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
