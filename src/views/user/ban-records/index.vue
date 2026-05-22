<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { request } from '@/api'

type ApiResponse<T> = { code: number; message: string; data: T }

type UserBanRecord = {
  id: number
  targetType: string
  targetValue: string
  reason: string | null
  durationSeconds: number | null
  effectiveAt: string
  expiresAt: string | null
  status: string
  unbannedAt: string | null
  unbanType: string | null
  createdAt: string
}

type PageResponse<T> = { total: number; page: number; size: number; items: T[] }

const router = useRouter()

const query = reactive({
  status: '',
  page: 1,
  size: 20,
})

const loading = ref(false)
const error = ref('')
const pageData = ref<PageResponse<UserBanRecord>>({ total: 0, page: 1, size: 20, items: [] })

const totalPages = computed(() => Math.max(1, Math.ceil(pageData.value.total / pageData.value.size)))

function formatBanStatus(status: string): string {
  const s = String(status || '').toUpperCase()
  if (s === 'ACTIVE') return '生效中'
  if (s === 'EXPIRED') return '已解封（到期）'
  if (s === 'REVOKED') return '已解封（提前）'
  return status
}

function formatTargetType(targetType: string): string {
  const s = String(targetType || '').toUpperCase()
  if (s === 'IP') return 'IP'
  if (s === 'EMAIL') return '邮箱'
  if (s === 'USER') return '用户'
  return targetType
}

function resolveErrorMessage(err: unknown): string {
  const anyErr = err as any
  const msgFromApi = anyErr?.response?.data?.message
  if (typeof msgFromApi === 'string' && msgFromApi.trim()) return msgFromApi
  if (typeof anyErr?.message === 'string' && anyErr.message.trim()) return anyErr.message
  return '操作失败，请稍后重试'
}

async function loadRecords(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<PageResponse<UserBanRecord>>>({
      url: '/user/ban/records',
      method: 'GET',
      params: {
        status: query.status || undefined,
        page: query.page,
        size: query.size,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '查询失败'
      return
    }
    pageData.value = res.data
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function applyQuery(): Promise<void> {
  query.page = 1
  await loadRecords()
}

async function prevPage(): Promise<void> {
  query.page = Math.max(1, query.page - 1)
  await loadRecords()
}

async function nextPage(): Promise<void> {
  query.page = Math.min(totalPages.value, query.page + 1)
  await loadRecords()
}

onMounted(async () => {
  await loadRecords()
})
</script>

<template>
  <main style="padding: 16px; max-width: 1100px; margin: 0 auto">
    <header style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap">
      <div>
        <h1 style="margin: 0 0 4px">我的封禁记录</h1>
        <div style="opacity: 0.75">/user/ban-records</div>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <button @click="router.push('/user/appeal')" style="padding: 10px 12px">申诉入口</button>
        <button @click="router.back()" style="padding: 10px 12px">返回</button>
      </div>
    </header>

    <section style="margin-top: 16px; border: 1px solid #eee; border-radius: 12px; padding: 12px">
      <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end">
        <label style="display: grid; gap: 6px">
          <span>状态</span>
          <select v-model="query.status">
            <option value="">全部</option>
            <option value="ACTIVE">生效中</option>
            <option value="EXPIRED">已解封（到期）</option>
            <option value="REVOKED">已解封（提前）</option>
          </select>
        </label>
        <button @click="applyQuery" :disabled="loading" style="padding: 10px 12px">查询</button>
      </div>

      <div v-if="error" style="margin-top: 10px; color: #c00">{{ error }}</div>

      <div style="margin-top: 12px; overflow: auto">
        <table style="width: 100%; border-collapse: collapse; min-width: 900px">
          <thead>
            <tr>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">ID</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">类型</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">目标</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">状态</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">原因</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">生效</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">到期</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in pageData.items" :key="r.id">
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ r.id }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ formatTargetType(r.targetType) }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ r.targetValue }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ formatBanStatus(r.status) }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ r.reason || '-' }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ r.effectiveAt }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ r.expiresAt || '永久' }}</td>
            </tr>
            <tr v-if="!pageData.items.length">
              <td colspan="7" style="padding: 12px; opacity: 0.7">暂无记录</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top: 12px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
        <div style="opacity: 0.75">总数：{{ pageData.total }}，第 {{ pageData.page }} / {{ totalPages }} 页</div>
        <div style="display: flex; gap: 8px">
          <button @click="prevPage" :disabled="loading || query.page <= 1" style="padding: 6px 10px">上一页</button>
          <button @click="nextPage" :disabled="loading || query.page >= totalPages" style="padding: 6px 10px">下一页</button>
        </div>
      </div>
    </section>
  </main>
</template>
