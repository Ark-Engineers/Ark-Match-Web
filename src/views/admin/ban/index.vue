<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { http, request } from '@/api'

type ApiResponse<T> = { code: number; message: string; data: T }

type BanRecord = {
  id: number
  targetType: 'IP' | 'EMAIL' | 'USER' | string
  targetValue: string
  bannedUserId: number | null
  reportId: number
  adminId: number
  reason: string | null
  durationSeconds: number | null
  effectiveAt: string
  expiresAt: string | null
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | string
  unbannedAt: string | null
  unbannedBy: number | null
  unbanType: 'AUTO' | 'MANUAL' | string | null
  createdAt: string
  updatedAt: string
}

type PageResponse<T> = { total: number; page: number; size: number; items: T[] }

type BanOperationLog = {
  id: number
  recordId: number
  actorId: number | null
  actorRole: string | null
  actionType: string
  fromStatus: string | null
  toStatus: string
  createdAt: string
}

type UserSearchItem = {
  userId: number
  account: string
  nickname: string | null
  email: string
  role: string
  status: string
  lastLoginIp: string | null
  relatedIps: string[]
}

const router = useRouter()

const durations = [
  { label: '1小时', value: 3600 },
  { label: '1天', value: 86400 },
  { label: '7天', value: 604800 },
  { label: '30天', value: 2592000 },
  { label: '永久', value: null },
] as const

const ipForm = reactive({
  value: '',
  reportId: '',
  batch: '',
  reason: '',
  durationSeconds: durations[1].value as number | null,
})

const emailForm = reactive({
  value: '',
  reportId: '',
  batch: '',
  reason: '',
  durationSeconds: durations[1].value as number | null,
})

const userForm = reactive({
  userId: '',
  reportId: '',
  batch: '',
  reason: '',
  durationSeconds: durations[1].value as number | null,
})

const userSearchForm = reactive({
  userId: '',
  account: '',
  nickname: '',
  email: '',
  ip: '',
  limit: 20,
})

const userOpForm = reactive({
  reportId: '',
  reason: '',
  durationSeconds: durations[1].value as number | null,
})

const userSearchResults = ref<UserSearchItem[]>([])

const query = reactive({
  targetType: '',
  targetValue: '',
  bannedUserId: '',
  reportId: '',
  keyword: '',
  adminId: '',
  effectiveFrom: '',
  effectiveTo: '',
  status: '',
  page: 1,
  size: 20,
})

const loading = ref(false)
const error = ref('')

const pageData = ref<PageResponse<BanRecord>>({ total: 0, page: 1, size: 20, items: [] })
const selectedIds = ref<number[]>([])
const detailRecord = ref<BanRecord | null>(null)
const detailLogs = ref<BanOperationLog[]>([])
const detailLoading = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(pageData.value.total / pageData.value.size)))

const allSelectedInPage = computed(() => {
  const ids = pageData.value.items.map((x) => x.id)
  if (!ids.length) return false
  const set = new Set(selectedIds.value)
  return ids.every((id) => set.has(id))
})

function toggleSelectAllInPage(): void {
  const ids = pageData.value.items.map((x) => x.id)
  const set = new Set(selectedIds.value)
  if (ids.every((id) => set.has(id))) {
    ids.forEach((id) => set.delete(id))
  } else {
    ids.forEach((id) => set.add(id))
  }
  selectedIds.value = Array.from(set)
}

function toggleSelectOne(id: number): void {
  const set = new Set(selectedIds.value)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  selectedIds.value = Array.from(set)
}

function clearSelection(): void {
  selectedIds.value = []
}

function formatBanStatus(status: string): string {
  const s = String(status || '').toUpperCase()
  if (s === 'ACTIVE') return '生效中'
  if (s === 'EXPIRED') return '已解封（到期）'
  if (s === 'REVOKED') return '已解封（提前）'
  return status
}

function formatUnbanType(unbanType: string | null): string {
  const s = String(unbanType || '').toUpperCase()
  if (!s) return '-'
  if (s === 'AUTO') return '自动'
  if (s === 'MANUAL') return '手动'
  return unbanType || '-'
}

function formatActionType(actionType: string): string {
  const s = String(actionType || '').toUpperCase()
  if (s === 'BAN') return '封禁'
  if (s === 'UNBAN_MANUAL') return '提前解封'
  if (s === 'UNBAN_AUTO') return '到期解封'
  return actionType
}

function formatUserStatus(status: string): string {
  const s = String(status || '').toUpperCase()
  if (s === 'NORMAL') return '正常'
  if (s === 'SUSPENDED') return '限制'
  if (s === 'BANNED') return '封禁'
  return status
}

function formatTargetType(targetType: string): string {
  const s = String(targetType || '').toUpperCase()
  if (s === 'IP') return 'IP'
  if (s === 'EMAIL') return '邮箱'
  if (s === 'USER') return '用户'
  return targetType
}

async function openDetail(recordId: number): Promise<void> {
  detailLoading.value = true
  error.value = ''
  try {
    const recordRes = await request<ApiResponse<BanRecord>>({
      url: `/admin/ban/records/${recordId}`,
      method: 'GET',
    })
    if (recordRes.code !== 0) {
      error.value = recordRes.message || '查询失败'
      return
    }
    detailRecord.value = recordRes.data

    const logRes = await request<ApiResponse<PageResponse<BanOperationLog>>>({
      url: '/admin/ban/logs',
      method: 'GET',
      params: { recordId, page: 1, size: 50 },
    })
    if (logRes.code !== 0) {
      detailLogs.value = []
      return
    }
    detailLogs.value = logRes.data.items || []
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    detailLoading.value = false
  }
}

function closeDetail(): void {
  detailRecord.value = null
  detailLogs.value = []
}

function splitLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function toOptionalNumber(raw: string): number | undefined {
  const v = raw.trim()
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function toOptionalIsoLocalDateTime(raw: string): string | undefined {
  const v = raw.trim()
  if (!v) return undefined
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return `${v}:00`
  return v
}

function toRequiredPositiveInt(raw: string, label: string): number | null {
  const v = raw.trim()
  const n = Number(v)
  if (!v || !Number.isFinite(n) || n <= 0) {
    error.value = `${label}必须为正整数`
    return null
  }
  return Math.floor(n)
}

function resolveErrorMessage(err: unknown): string {
  const anyErr = err as any
  const msgFromApi = anyErr?.response?.data?.message
  if (typeof msgFromApi === 'string' && msgFromApi.trim()) return msgFromApi
  if (typeof anyErr?.message === 'string' && anyErr.message.trim()) return anyErr.message
  return '操作失败，请稍后重试'
}

async function searchUsers(): Promise<void> {
  const userId = userSearchForm.userId.trim()
  const account = userSearchForm.account.trim()
  const nickname = userSearchForm.nickname.trim()
  const email = userSearchForm.email.trim()
  const ip = userSearchForm.ip.trim()
  const hasAny = !!userId || !!account || !!nickname || !!email || !!ip
  if (!hasAny) {
    error.value = '请输入用户ID / 账号 / 昵称 / 邮箱 / IP 任一条件'
    return
  }

  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<UserSearchItem[]>>({
      url: '/admin/user/search',
      method: 'GET',
      params: {
        userId: userId ? Number(userId) : undefined,
        account: account || undefined,
        nickname: nickname || undefined,
        email: email || undefined,
        ip: ip || undefined,
        limit: userSearchForm.limit,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '查询失败'
      return
    }
    userSearchResults.value = res.data || []
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banAssociatedIps(userId: number): Promise<void> {
  const reportId = toRequiredPositiveInt(userOpForm.reportId, '举报单ID')
  if (!reportId) return
  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<BanRecord[]>>({
      url: '/admin/user/ban/ip-only',
      method: 'POST',
      data: {
        userId,
        reportId,
        reason: userOpForm.reason.trim() || null,
        durationSeconds: userOpForm.durationSeconds,
        confirm: false,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '封禁失败'
      return
    }
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banUserEmailOnly(userId: number): Promise<void> {
  const reportId = toRequiredPositiveInt(userOpForm.reportId, '举报单ID')
  if (!reportId) return
  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<BanRecord[]>>({
      url: '/admin/user/ban/email-only',
      method: 'POST',
      data: {
        userId,
        reportId,
        reason: userOpForm.reason.trim() || null,
        durationSeconds: userOpForm.durationSeconds,
        confirm: false,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '封禁失败'
      return
    }
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banUserFull(userId: number): Promise<void> {
  const reportId = toRequiredPositiveInt(userOpForm.reportId, '举报单ID')
  if (!reportId) return
  const ok = window.confirm('将执行全维度封禁（关联IP + 绑定邮箱 + 关联账号），并强制下线，是否确认？')
  if (!ok) return

  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<BanRecord[]>>({
      url: '/admin/user/ban/full',
      method: 'POST',
      data: {
        userId,
        reportId,
        reason: userOpForm.reason.trim() || null,
        durationSeconds: userOpForm.durationSeconds,
        confirm: true,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '封禁失败'
      return
    }
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function unbanUserRelated(userId: number): Promise<void> {
  const ok = window.confirm(`将解除用户 ${userId} 相关的所有“生效中”封禁记录，是否确认？`)
  if (!ok) return

  loading.value = true
  error.value = ''
  try {
    const listRes = await request<ApiResponse<PageResponse<BanRecord>>>({
      url: '/admin/ban/records',
      method: 'GET',
      params: {
        bannedUserId: userId,
        status: 'ACTIVE',
        page: 1,
        size: 200,
      },
    })
    if (listRes.code !== 0) {
      error.value = listRes.message || '查询失败'
      return
    }
    const items = listRes.data.items || []
    if (!items.length) {
      error.value = '该用户暂无生效中的封禁记录'
      return
    }

    for (const r of items) {
      const res = await request<ApiResponse<BanRecord>>({
        url: '/admin/ban/unban',
        method: 'POST',
        data: { recordId: r.id },
      })
      if (res.code !== 0) {
        error.value = res.message || `解封失败：#${r.id}`
        return
      }
    }

    await loadRecords()
    await searchUsers()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function loadRecords(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<PageResponse<BanRecord>>>({
      url: '/admin/ban/records',
      method: 'GET',
      params: {
        targetType: query.targetType || undefined,
        targetValue: query.targetValue || undefined,
        bannedUserId: toOptionalNumber(query.bannedUserId),
        reportId: toOptionalNumber(query.reportId),
        keyword: query.keyword.trim() || undefined,
        adminId: toOptionalNumber(query.adminId),
        effectiveFrom: toOptionalIsoLocalDateTime(query.effectiveFrom),
        effectiveTo: toOptionalIsoLocalDateTime(query.effectiveTo),
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

async function banIpSingle(): Promise<void> {
  const reportId = toRequiredPositiveInt(ipForm.reportId, '举报单ID')
  if (!reportId) return
  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<BanRecord>>({
      url: '/admin/ban/ip',
      method: 'POST',
      data: {
        value: ipForm.value.trim(),
        reportId,
        reason: ipForm.reason.trim() || null,
        durationSeconds: ipForm.durationSeconds,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '封禁失败'
      return
    }
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banIpBatch(): Promise<void> {
  const reportId = toRequiredPositiveInt(ipForm.reportId, '举报单ID')
  if (!reportId) return
  const values = splitLines(ipForm.batch)
  if (!values.length) {
    error.value = '请输入IP列表'
    return
  }
  const ok = window.confirm(`即将批量封禁 ${values.length} 个IP，是否确认？`)
  if (!ok) return

  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<BanRecord[]>>({
      url: '/admin/ban/ip/batch',
      method: 'POST',
      data: {
        values,
        reportId,
        reason: ipForm.reason.trim() || null,
        durationSeconds: ipForm.durationSeconds,
        confirm: true,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '批量封禁失败'
      return
    }
    ipForm.batch = ''
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banEmailSingle(): Promise<void> {
  const reportId = toRequiredPositiveInt(emailForm.reportId, '举报单ID')
  if (!reportId) return
  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<BanRecord>>({
      url: '/admin/ban/email',
      method: 'POST',
      data: {
        value: emailForm.value.trim(),
        reportId,
        reason: emailForm.reason.trim() || null,
        durationSeconds: emailForm.durationSeconds,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '封禁失败'
      return
    }
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banEmailBatch(): Promise<void> {
  const reportId = toRequiredPositiveInt(emailForm.reportId, '举报单ID')
  if (!reportId) return
  const values = splitLines(emailForm.batch)
  if (!values.length) {
    error.value = '请输入邮箱列表'
    return
  }
  const ok = window.confirm(`即将批量封禁 ${values.length} 个邮箱，是否确认？`)
  if (!ok) return

  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<BanRecord[]>>({
      url: '/admin/ban/email/batch',
      method: 'POST',
      data: {
        values,
        reportId,
        reason: emailForm.reason.trim() || null,
        durationSeconds: emailForm.durationSeconds,
        confirm: true,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '批量封禁失败'
      return
    }
    emailForm.batch = ''
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banUserSingle(): Promise<void> {
  const raw = userForm.userId.trim()
  const userId = Number(raw)
  if (!raw || !Number.isFinite(userId) || userId <= 0) {
    error.value = '用户ID必须为正整数'
    return
  }
  const reportId = toRequiredPositiveInt(userForm.reportId, '举报单ID')
  if (!reportId) return

  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<BanRecord>>({
      url: '/admin/ban/user',
      method: 'POST',
      data: {
        userId,
        reportId,
        reason: userForm.reason.trim() || null,
        durationSeconds: userForm.durationSeconds,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '封禁失败'
      return
    }
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banUserBatch(): Promise<void> {
  const reportId = toRequiredPositiveInt(userForm.reportId, '举报单ID')
  if (!reportId) return
  const lines = splitLines(userForm.batch)
  if (!lines.length) {
    error.value = '请输入用户ID列表'
    return
  }

  const userIds = lines.map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0)
  if (!userIds.length || userIds.length !== lines.length) {
    error.value = '用户ID必须为数字，每行一个'
    return
  }

  const ok = window.confirm(`即将批量封禁 ${userIds.length} 个用户ID，是否确认？`)
  if (!ok) return

  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<BanRecord[]>>({
      url: '/admin/ban/user/batch',
      method: 'POST',
      data: {
        userIds,
        reportId,
        reason: userForm.reason.trim() || null,
        durationSeconds: userForm.durationSeconds,
        confirm: true,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '批量封禁失败'
      return
    }
    userForm.batch = ''
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function unban(recordId: number): Promise<void> {
  const ok = window.confirm(`确认解封记录 #${recordId} 吗？`)
  if (!ok) return

  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<BanRecord>>({
      url: '/admin/ban/unban',
      method: 'POST',
      data: { recordId },
    })
    if (res.code !== 0) {
      error.value = res.message || '解封失败'
      return
    }
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function exportCsv(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await http.request({
      url: '/admin/ban/records/export',
      method: 'GET',
      responseType: 'blob',
      params: {
        targetType: query.targetType || undefined,
        targetValue: query.targetValue || undefined,
        bannedUserId: toOptionalNumber(query.bannedUserId),
        reportId: toOptionalNumber(query.reportId),
        keyword: query.keyword.trim() || undefined,
        adminId: toOptionalNumber(query.adminId),
        effectiveFrom: toOptionalIsoLocalDateTime(query.effectiveFrom),
        effectiveTo: toOptionalIsoLocalDateTime(query.effectiveTo),
        status: query.status || undefined,
      },
    })
    const blob = response.data as Blob
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ban-records.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function exportSelectedCsv(): Promise<void> {
  if (!selectedIds.value.length) {
    error.value = '请先勾选要导出的记录'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const response = await http.request({
      url: '/admin/ban/records/export',
      method: 'GET',
      responseType: 'blob',
      params: { ids: selectedIds.value.join(',') },
    })
    const blob = response.data as Blob
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ban-records-selected.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadRecords()
})
</script>

<template>
  <main class="page">
    <header style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap">
      <div>
        <h1 style="margin: 0 0 4px">封禁管理</h1>
        <div style="opacity: 0.75">/admin/ban</div>
      </div>
      <button @click="router.push('/admin/dashboard')" style="padding: 10px 12px">返回管理首页</button>
    </header>

    <section style="margin-top: 16px; display: grid; gap: 16px">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px">
        <div style="border: 1px solid #eee; border-radius: 8px; padding: 12px">
          <h2 style="margin: 0 0 12px; font-size: 16px">IP 封禁</h2>
          <div style="display: grid; gap: 8px">
            <label style="display: grid; gap: 6px">
              <span>单个 IP</span>
              <input v-model.trim="ipForm.value" placeholder="例如：203.0.113.1" />
            </label>
            <label style="display: grid; gap: 6px">
              <span>举报单ID（必填）</span>
              <input v-model.trim="ipForm.reportId" placeholder="例如：10001" />
            </label>
            <label style="display: grid; gap: 6px">
              <span>批量 IP（每行一个）</span>
              <textarea v-model="ipForm.batch" rows="4" placeholder="203.0.113.1&#10;198.51.100.2"></textarea>
            </label>
            <label style="display: grid; gap: 6px">
              <span>封禁时长</span>
              <select v-model="ipForm.durationSeconds">
                <option v-for="d in durations" :key="d.label" :value="d.value">{{ d.label }}</option>
              </select>
            </label>
            <label style="display: grid; gap: 6px">
              <span>原因（可选）</span>
              <input v-model.trim="ipForm.reason" />
            </label>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
              <button @click="banIpSingle" :disabled="loading" style="padding: 10px 12px">封禁单个IP</button>
              <button @click="banIpBatch" :disabled="loading" style="padding: 10px 12px">批量封禁IP</button>
            </div>
          </div>
        </div>

        <div style="border: 1px solid #eee; border-radius: 8px; padding: 12px">
          <h2 style="margin: 0 0 12px; font-size: 16px">邮箱封禁</h2>
          <div style="display: grid; gap: 8px">
            <label style="display: grid; gap: 6px">
              <span>单个邮箱</span>
              <input v-model.trim="emailForm.value" placeholder="例如：user@example.com" />
            </label>
            <label style="display: grid; gap: 6px">
              <span>举报单ID（必填）</span>
              <input v-model.trim="emailForm.reportId" placeholder="例如：10001" />
            </label>
            <label style="display: grid; gap: 6px">
              <span>批量邮箱（每行一个）</span>
              <textarea v-model="emailForm.batch" rows="4" placeholder="a@example.com&#10;b@example.com"></textarea>
            </label>
            <label style="display: grid; gap: 6px">
              <span>封禁时长</span>
              <select v-model="emailForm.durationSeconds">
                <option v-for="d in durations" :key="d.label" :value="d.value">{{ d.label }}</option>
              </select>
            </label>
            <label style="display: grid; gap: 6px">
              <span>原因（可选）</span>
              <input v-model.trim="emailForm.reason" />
            </label>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
              <button @click="banEmailSingle" :disabled="loading" style="padding: 10px 12px">封禁单个邮箱</button>
              <button @click="banEmailBatch" :disabled="loading" style="padding: 10px 12px">批量封禁邮箱</button>
            </div>
          </div>
        </div>

        <div style="border: 1px solid #eee; border-radius: 8px; padding: 12px">
          <h2 style="margin: 0 0 12px; font-size: 16px">用户封禁</h2>
          <div style="display: grid; gap: 8px">
            <label style="display: grid; gap: 6px">
              <span>单个用户ID</span>
              <input v-model.trim="userForm.userId" placeholder="例如：1" />
            </label>
            <label style="display: grid; gap: 6px">
              <span>举报单ID（必填）</span>
              <input v-model.trim="userForm.reportId" placeholder="例如：10001" />
            </label>
            <label style="display: grid; gap: 6px">
              <span>批量用户ID（每行一个）</span>
              <textarea v-model="userForm.batch" rows="4" placeholder="1&#10;2&#10;3"></textarea>
            </label>
            <label style="display: grid; gap: 6px">
              <span>封禁时长</span>
              <select v-model="userForm.durationSeconds">
                <option v-for="d in durations" :key="d.label" :value="d.value">{{ d.label }}</option>
              </select>
            </label>
            <label style="display: grid; gap: 6px">
              <span>原因（可选）</span>
              <input v-model.trim="userForm.reason" />
            </label>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
              <button @click="banUserSingle" :disabled="loading" style="padding: 10px 12px">封禁单个用户</button>
              <button @click="banUserBatch" :disabled="loading" style="padding: 10px 12px">批量封禁用户</button>
            </div>
          </div>
        </div>
      </div>

      <div style="border: 1px solid #eee; border-radius: 8px; padding: 12px">
        <h2 style="margin: 0 0 12px; font-size: 16px">用户查询与封禁</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: flex-end">
          <label style="display: grid; gap: 6px">
            <span>用户ID</span>
            <input v-model.trim="userSearchForm.userId" placeholder="例如：1" />
          </label>
          <label style="display: grid; gap: 6px">
            <span>账号</span>
            <input v-model.trim="userSearchForm.account" placeholder="例如：admin" />
          </label>
          <label style="display: grid; gap: 6px">
            <span>昵称</span>
            <input v-model.trim="userSearchForm.nickname" placeholder="例如：小明" />
          </label>
          <label style="display: grid; gap: 6px">
            <span>邮箱</span>
            <input v-model.trim="userSearchForm.email" placeholder="例如：user@example.com" />
          </label>
          <label style="display: grid; gap: 6px">
            <span>IP</span>
            <input v-model.trim="userSearchForm.ip" placeholder="例如：203.0.113.1" />
          </label>
          <button @click="searchUsers" :disabled="loading" style="padding: 10px 12px">查询用户</button>
        </div>

        <div style="margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: flex-end">
          <label style="display: grid; gap: 6px">
            <span>举报单ID（必填）</span>
            <input v-model.trim="userOpForm.reportId" placeholder="例如：10001" />
          </label>
          <label style="display: grid; gap: 6px">
            <span>封禁时长</span>
            <select v-model="userOpForm.durationSeconds">
              <option v-for="d in durations" :key="d.label" :value="d.value">{{ d.label }}</option>
            </select>
          </label>
          <label style="display: grid; gap: 6px; flex: 1; min-width: 240px">
            <span>封禁原因（可选）</span>
            <input v-model.trim="userOpForm.reason" placeholder="例如：违规行为" />
          </label>
        </div>

        <div style="margin-top: 12px; overflow-x: hidden">
          <table class="userTable" style="width: 100%; border-collapse: collapse">
            <thead>
              <tr>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">用户ID</th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">账号</th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">昵称</th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">邮箱</th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">状态</th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in userSearchResults" :key="u.userId">
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ u.userId }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ u.account }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ u.nickname || '-' }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ u.email }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ formatUserStatus(u.status) }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">
                  <div style="display: flex; gap: 8px; flex-wrap: wrap">
                    <button @click="banAssociatedIps(u.userId)" :disabled="loading" style="padding: 6px 8px">封禁关联IP</button>
                    <button @click="banUserEmailOnly(u.userId)" :disabled="loading" style="padding: 6px 8px">封禁邮箱</button>
                    <button @click="banUserFull(u.userId)" :disabled="loading" style="padding: 6px 8px">全封禁</button>
                    <button @click="unbanUserRelated(u.userId)" :disabled="loading" style="padding: 6px 8px">解除封禁</button>
                  </div>
                </td>
              </tr>
              <tr v-if="!userSearchResults.length">
                <td colspan="6" style="padding: 12px; opacity: 0.7">暂无用户结果</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style="border: 1px solid #eee; border-radius: 8px; padding: 12px">
        <h2 style="margin: 0 0 12px; font-size: 16px">封禁记录查询</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: flex-end">
          <label style="display: grid; gap: 6px">
            <span>目标类型</span>
            <select v-model="query.targetType">
              <option value="">全部</option>
              <option value="IP">IP</option>
              <option value="EMAIL">EMAIL</option>
              <option value="USER">USER</option>
            </select>
          </label>
          <label style="display: grid; gap: 6px">
            <span>目标值</span>
            <input v-model.trim="query.targetValue" placeholder="IP / 邮箱 / 用户ID" />
          </label>
          <label style="display: grid; gap: 6px">
            <span>封禁用户ID</span>
            <input v-model.trim="query.bannedUserId" placeholder="用于追溯（可空）" />
          </label>
          <label style="display: grid; gap: 6px">
            <span>举报单ID</span>
            <input v-model.trim="query.reportId" placeholder="reportId（可空）" />
          </label>
          <label style="display: grid; gap: 6px">
            <span>操作人ID</span>
            <input v-model.trim="query.adminId" placeholder="adminId（可空）" />
          </label>
          <label style="display: grid; gap: 6px">
            <span>状态</span>
            <select v-model="query.status">
              <option value="">全部</option>
              <option value="ACTIVE">生效中</option>
              <option value="EXPIRED">已解封（到期）</option>
              <option value="REVOKED">已解封（提前）</option>
            </select>
          </label>
          <label style="display: grid; gap: 6px">
            <span>关键词</span>
            <input v-model.trim="query.keyword" placeholder="全文搜索（目标/原因）" />
          </label>
          <label style="display: grid; gap: 6px">
            <span>生效起</span>
            <input v-model="query.effectiveFrom" type="datetime-local" />
          </label>
          <label style="display: grid; gap: 6px">
            <span>生效止</span>
            <input v-model="query.effectiveTo" type="datetime-local" />
          </label>
          <button
            @click="applyQuery"
            :disabled="loading"
            style="padding: 10px 12px"
          >
            查询
          </button>
          <button @click="exportCsv" :disabled="loading" style="padding: 10px 12px">导出CSV</button>
          <button @click="exportSelectedCsv" :disabled="loading" style="padding: 10px 12px">导出选中</button>
          <div style="opacity: 0.7; align-self: center">已选：{{ selectedIds.length }}</div>
          <button @click="clearSelection" :disabled="loading || !selectedIds.length" style="padding: 10px 12px">清空选择</button>
        </div>

        <div v-if="error" style="margin-top: 10px; color: #c00">{{ error }}</div>

        <div style="margin-top: 12px; overflow-x: hidden">
          <table class="recordsTable" style="width: 100%; border-collapse: collapse">
            <thead>
              <tr>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px; width: 40px">
                  <input type="checkbox" :checked="allSelectedInPage" @change="toggleSelectAllInPage" />
                </th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">ID</th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">类型</th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">目标</th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">封禁用户ID</th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">举报单ID</th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">状态</th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">生效</th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">到期</th>
                <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in pageData.items" :key="r.id">
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3; width: 40px">
                  <input type="checkbox" :checked="selectedIds.includes(r.id)" @change="toggleSelectOne(r.id)" />
                </td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ r.id }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ formatTargetType(r.targetType) }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ r.targetValue }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ r.bannedUserId ?? '-' }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ r.reportId }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ formatBanStatus(r.status) }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ r.effectiveAt }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ r.expiresAt || '永久' }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">
                  <div style="display: flex; gap: 8px; flex-wrap: wrap">
                    <button @click="openDetail(r.id)" :disabled="loading" style="padding: 6px 8px">详情</button>
                    <button v-if="r.status === 'ACTIVE'" @click="unban(r.id)" :disabled="loading" style="padding: 6px 8px">
                      解封
                    </button>
                    <span v-else style="opacity: 0.7">-</span>
                  </div>
                </td>
              </tr>
              <tr v-if="!pageData.items.length">
                <td colspan="10" style="padding: 12px; opacity: 0.7">暂无记录</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="margin-top: 12px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
          <div style="opacity: 0.75">总数：{{ pageData.total }}，第 {{ pageData.page }} / {{ totalPages }} 页</div>
          <div style="display: flex; gap: 8px">
            <button
              @click="prevPage"
              :disabled="loading || query.page <= 1"
              style="padding: 6px 10px"
            >
              上一页
            </button>
            <button
              @click="nextPage"
              :disabled="loading || query.page >= totalPages"
              style="padding: 6px 10px"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </section>

    <div
      v-if="detailRecord"
      style="
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        display: grid;
        place-items: center;
        padding: 16px;
        z-index: 50;
      "
      @click.self="closeDetail"
    >
      <div style="background: #fff; border-radius: 12px; width: min(980px, 100%); max-height: 90vh; overflow: auto">
        <div style="padding: 14px 16px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; gap: 10px">
          <div style="display: grid; gap: 4px">
            <div style="font-size: 16px; font-weight: 600">封禁记录详情</div>
            <div style="opacity: 0.7; font-size: 12px">#{{ detailRecord.id }}</div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center">
            <button @click="router.push('/user/appeal')" style="padding: 8px 10px">申诉入口</button>
            <button @click="closeDetail" style="padding: 8px 10px">关闭</button>
          </div>
        </div>

        <div style="padding: 16px">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px">
            <div><span style="opacity: 0.7">类型：</span>{{ formatTargetType(detailRecord.targetType) }}</div>
            <div><span style="opacity: 0.7">目标：</span>{{ detailRecord.targetValue }}</div>
            <div><span style="opacity: 0.7">封禁用户ID：</span>{{ detailRecord.bannedUserId ?? '-' }}</div>
            <div><span style="opacity: 0.7">举报单ID：</span>{{ detailRecord.reportId }}</div>
            <div><span style="opacity: 0.7">管理员ID：</span>{{ detailRecord.adminId }}</div>
            <div><span style="opacity: 0.7">状态：</span>{{ formatBanStatus(detailRecord.status) }}</div>
            <div style="grid-column: 1 / -1"><span style="opacity: 0.7">原因：</span>{{ detailRecord.reason || '-' }}</div>
            <div><span style="opacity: 0.7">时长：</span>{{ detailRecord.durationSeconds ?? '永久' }}</div>
            <div><span style="opacity: 0.7">生效：</span>{{ detailRecord.effectiveAt }}</div>
            <div><span style="opacity: 0.7">到期：</span>{{ detailRecord.expiresAt || '永久' }}</div>
            <div><span style="opacity: 0.7">解封时间：</span>{{ detailRecord.unbannedAt || '-' }}</div>
            <div><span style="opacity: 0.7">解封人：</span>{{ detailRecord.unbannedBy ?? '-' }}</div>
            <div><span style="opacity: 0.7">解封类型：</span>{{ formatUnbanType(detailRecord.unbanType) }}</div>
            <div><span style="opacity: 0.7">创建：</span>{{ detailRecord.createdAt }}</div>
            <div><span style="opacity: 0.7">更新：</span>{{ detailRecord.updatedAt }}</div>
          </div>

          <div style="margin-top: 14px; border-top: 1px solid #eee; padding-top: 14px">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px">
              <div style="font-weight: 600">操作日志</div>
              <div v-if="detailLoading" style="opacity: 0.7; font-size: 12px">加载中...</div>
            </div>
            <div style="margin-top: 10px; overflow: auto">
              <table style="width: 100%; border-collapse: collapse; min-width: 820px">
                <thead>
                  <tr>
                    <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">时间</th>
                    <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">类型</th>
                    <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">操作人</th>
                    <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">状态变化</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="l in detailLogs" :key="l.id">
                    <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ l.createdAt }}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ formatActionType(l.actionType) }}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ l.actorId ?? 'SYSTEM' }}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ (l.fromStatus || '-') + ' -> ' + l.toStatus }}</td>
                  </tr>
                  <tr v-if="!detailLogs.length">
                    <td colspan="4" style="padding: 12px; opacity: 0.7">暂无日志</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.page {
  padding: 16px;
  max-width: 1280px;
  margin: 0 auto;
}

.page :deep(input),
.page :deep(select),
.page :deep(textarea) {
  font: inherit;
  font-size: 14px;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  outline: none;
}

.page :deep(textarea) {
  resize: vertical;
}

.page :deep(input:focus),
.page :deep(select:focus),
.page :deep(textarea:focus) {
  border-color: #93c5fd;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.page :deep(button) {
  font: inherit;
  font-size: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  cursor: pointer;
}

.page :deep(button:hover) {
  background: #f9fafb;
}

.page :deep(button:disabled) {
  opacity: 0.6;
  cursor: not-allowed;
}

.recordsTable thead th {
  position: sticky;
  top: 0;
  background: #ffffff;
}

.recordsTable,
.userTable {
  table-layout: fixed;
}

.recordsTable th,
.recordsTable td,
.userTable th,
.userTable td {
  word-break: break-all;
}

.recordsTable th:nth-child(4),
.recordsTable td:nth-child(4) {
  width: 220px;
}

@media (max-width: 640px) {
  .page {
    padding: 12px;
  }
}
</style>
