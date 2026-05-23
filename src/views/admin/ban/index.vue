<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { http, request } from '@/api'

type ApiResponse<T> = { code: number; message: string; data: T }

type BanRecord = {
  id: number
  targetType: 'IP' | 'EMAIL' | 'USER' | string
  targetValue: string
  bannedUserId: number | null
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

const durations = [
  { label: '1小时', value: 3600 },
  { label: '1天', value: 86400 },
  { label: '7天', value: 604800 },
  { label: '30天', value: 2592000 },
  { label: '永久', value: null },
] as const

const activeTab = ref<'records' | 'ops' | 'users'>('records')

const loading = ref(false)
const error = ref('')

const isMobile = ref(false)
const isNarrow = ref(false)

function updateResponsiveState(): void {
  const w = window.innerWidth
  isMobile.value = w < 1024
  isNarrow.value = w < 1360
}

const bannedUserNicknames = reactive<Record<number, string>>({})

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

function resolveErrorMessage(err: unknown): string {
  const anyErr = err as any
  const msgFromApi = anyErr?.response?.data?.message
  if (typeof msgFromApi === 'string' && msgFromApi.trim()) return msgFromApi
  if (typeof anyErr?.message === 'string' && anyErr.message.trim()) return anyErr.message
  return '操作失败，请稍后重试'
}

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

function formatUserStatus(status: string): string {
  const s = String(status || '').toUpperCase()
  if (s === 'NORMAL') return '正常'
  if (s === 'SUSPENDED') return '限制'
  if (s === 'BANNED') return '封禁'
  return status
}

function formatActionType(actionType: string): string {
  const s = String(actionType || '').toUpperCase()
  if (s === 'BAN') return '封禁'
  if (s === 'UNBAN_MANUAL') return '提前解封'
  if (s === 'UNBAN_AUTO') return '到期解封'
  return actionType
}

function formatUnbanType(unbanType: string | null): string {
  const s = String(unbanType || '').toUpperCase()
  if (!s) return '-'
  if (s === 'AUTO') return '自动'
  if (s === 'MANUAL') return '手动'
  return unbanType || '-'
}

function getBannedUserNickname(userId: number | null | undefined): string {
  if (!userId) return '-'
  return bannedUserNicknames[userId] || '-'
}

async function ensureBannedUserNicknames(ids: Array<number | null | undefined>): Promise<void> {
  const unique = Array.from(
    new Set(
      ids
        .filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0)
        .filter((x) => !bannedUserNicknames[x]),
    ),
  )
  if (!unique.length) return

  await Promise.all(
    unique.map(async (userId) => {
      try {
        const res = await request<ApiResponse<UserSearchItem[]>>({
          url: '/admin/user/search',
          method: 'GET',
          params: { userId, limit: 1 },
        })
        if (res.code !== 0) return
        const item = (res.data || [])[0]
        if (!item) return
        bannedUserNicknames[userId] = item.nickname?.trim() || item.account || `用户${userId}`
      } catch {}
    }),
  )
}

const ipForm = reactive({
  value: '',
  batch: '',
  reason: '',
  durationSeconds: durations[1].value as number | null,
})

const emailForm = reactive({
  value: '',
  batch: '',
  reason: '',
  durationSeconds: durations[1].value as number | null,
})

const userForm = reactive({
  userId: '',
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
  reason: '',
  durationSeconds: durations[1].value as number | null,
})

const userSearchResults = ref<UserSearchItem[]>([])

const query = reactive({
  targetType: '',
  targetValue: '',
  bannedUserId: '',
  keyword: '',
  adminId: '',
  effectiveFrom: '' as string | '',
  effectiveTo: '' as string | '',
  status: '',
  page: 1,
  size: 20,
})

const pageData = ref<PageResponse<BanRecord>>({ total: 0, page: 1, size: 20, items: [] })
const selectedIds = ref<number[]>([])

const detailVisible = ref(false)
const detailRecord = ref<BanRecord | null>(null)
const detailLogs = ref<BanOperationLog[]>([])
const detailLoading = ref(false)

function clearError(): void {
  error.value = ''
}

function onSelectionChange(rows: BanRecord[]): void {
  selectedIds.value = rows.map((r) => r.id)
}

async function loadRecords(): Promise<void> {
  loading.value = true
  clearError()
  try {
    const res = await request<ApiResponse<PageResponse<BanRecord>>>({
      url: '/admin/ban/records',
      method: 'GET',
      params: {
        targetType: query.targetType || undefined,
        targetValue: query.targetValue.trim() || undefined,
        bannedUserId: toOptionalNumber(query.bannedUserId),
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
    void ensureBannedUserNicknames(pageData.value.items.map((x) => x.bannedUserId))
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

async function resetQuery(): Promise<void> {
  query.targetType = ''
  query.targetValue = ''
  query.bannedUserId = ''
  query.keyword = ''
  query.adminId = ''
  query.effectiveFrom = ''
  query.effectiveTo = ''
  query.status = ''
  query.page = 1
  query.size = 20
  await loadRecords()
}

async function openDetail(recordId: number): Promise<void> {
  detailVisible.value = true
  detailLoading.value = true
  clearError()
  detailRecord.value = null
  detailLogs.value = []
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
    void ensureBannedUserNicknames([detailRecord.value?.bannedUserId])

    const logRes = await request<ApiResponse<PageResponse<BanOperationLog>>>({
      url: '/admin/ban/logs',
      method: 'GET',
      params: { recordId, page: 1, size: 50 },
    })
    if (logRes.code !== 0) return
    detailLogs.value = logRes.data.items || []
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    detailLoading.value = false
  }
}

async function unban(recordId: number): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认解封记录 #${recordId} 吗？`, '确认操作', {
      confirmButtonText: '确认解封',
      cancelButtonText: '取消',
      type: 'warning',
      closeOnClickModal: false,
    })
  } catch {
    return
  }

  loading.value = true
  clearError()
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
    ElMessage.success('已解封')
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function exportCsv(params: Record<string, unknown>, filename: string): Promise<void> {
  loading.value = true
  clearError()
  try {
    const response = await http.request({
      url: '/admin/ban/records/export',
      method: 'GET',
      responseType: 'blob',
      params,
    })
    const blob = response.data as Blob
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
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

async function exportAll(): Promise<void> {
  await exportCsv(
    {
      targetType: query.targetType || undefined,
      targetValue: query.targetValue.trim() || undefined,
      bannedUserId: toOptionalNumber(query.bannedUserId),
      keyword: query.keyword.trim() || undefined,
      adminId: toOptionalNumber(query.adminId),
      effectiveFrom: toOptionalIsoLocalDateTime(query.effectiveFrom),
      effectiveTo: toOptionalIsoLocalDateTime(query.effectiveTo),
      status: query.status || undefined,
    },
    'ban-records.csv',
  )
}

async function exportSelected(): Promise<void> {
  if (!selectedIds.value.length) {
    ElMessage.warning('请先勾选要导出的记录')
    return
  }
  await exportCsv({ ids: selectedIds.value.join(',') }, 'ban-records-selected.csv')
}

async function banIpSingle(): Promise<void> {
  loading.value = true
  clearError()
  try {
    const res = await request<ApiResponse<BanRecord>>({
      url: '/admin/ban/ip',
      method: 'POST',
      data: {
        value: ipForm.value.trim(),
        reason: ipForm.reason.trim() || null,
        durationSeconds: ipForm.durationSeconds,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '封禁失败'
      return
    }
    ElMessage.success('封禁成功')
    ipForm.value = ''
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banIpBatch(): Promise<void> {
  const values = splitLines(ipForm.batch)
  if (!values.length) {
    ElMessage.warning('请输入IP列表')
    return
  }

  try {
    await ElMessageBox.confirm(`即将批量封禁 ${values.length} 个IP，是否确认？`, '二次确认', {
      confirmButtonText: '确认封禁',
      cancelButtonText: '取消',
      type: 'warning',
      closeOnClickModal: false,
    })
  } catch {
    return
  }

  loading.value = true
  clearError()
  try {
    const res = await request<ApiResponse<BanRecord[]>>({
      url: '/admin/ban/ip/batch',
      method: 'POST',
      data: {
        values,
        reason: ipForm.reason.trim() || null,
        durationSeconds: ipForm.durationSeconds,
        confirm: true,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '批量封禁失败'
      return
    }
    ElMessage.success('批量封禁成功')
    ipForm.batch = ''
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banEmailSingle(): Promise<void> {
  loading.value = true
  clearError()
  try {
    const res = await request<ApiResponse<BanRecord>>({
      url: '/admin/ban/email',
      method: 'POST',
      data: {
        value: emailForm.value.trim(),
        reason: emailForm.reason.trim() || null,
        durationSeconds: emailForm.durationSeconds,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '封禁失败'
      return
    }
    ElMessage.success('封禁成功')
    emailForm.value = ''
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banEmailBatch(): Promise<void> {
  const values = splitLines(emailForm.batch)
  if (!values.length) {
    ElMessage.warning('请输入邮箱列表')
    return
  }

  try {
    await ElMessageBox.confirm(`即将批量封禁 ${values.length} 个邮箱，是否确认？`, '二次确认', {
      confirmButtonText: '确认封禁',
      cancelButtonText: '取消',
      type: 'warning',
      closeOnClickModal: false,
    })
  } catch {
    return
  }

  loading.value = true
  clearError()
  try {
    const res = await request<ApiResponse<BanRecord[]>>({
      url: '/admin/ban/email/batch',
      method: 'POST',
      data: {
        values,
        reason: emailForm.reason.trim() || null,
        durationSeconds: emailForm.durationSeconds,
        confirm: true,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '批量封禁失败'
      return
    }
    ElMessage.success('批量封禁成功')
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
    ElMessage.warning('用户ID必须为正整数')
    return
  }

  loading.value = true
  clearError()
  try {
    const res = await request<ApiResponse<BanRecord>>({
      url: '/admin/ban/user',
      method: 'POST',
      data: {
        userId,
        reason: userForm.reason.trim() || null,
        durationSeconds: userForm.durationSeconds,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '封禁失败'
      return
    }
    ElMessage.success('封禁成功')
    userForm.userId = ''
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banUserBatch(): Promise<void> {
  const lines = splitLines(userForm.batch)
  if (!lines.length) {
    ElMessage.warning('请输入用户ID列表')
    return
  }

  const userIds = lines.map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0)
  if (!userIds.length || userIds.length !== lines.length) {
    ElMessage.warning('用户ID必须为数字，每行一个')
    return
  }

  try {
    await ElMessageBox.confirm(`即将批量封禁 ${userIds.length} 个用户ID，是否确认？`, '二次确认', {
      confirmButtonText: '确认封禁',
      cancelButtonText: '取消',
      type: 'warning',
      closeOnClickModal: false,
    })
  } catch {
    return
  }

  loading.value = true
  clearError()
  try {
    const res = await request<ApiResponse<BanRecord[]>>({
      url: '/admin/ban/user/batch',
      method: 'POST',
      data: {
        userIds,
        reason: userForm.reason.trim() || null,
        durationSeconds: userForm.durationSeconds,
        confirm: true,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '批量封禁失败'
      return
    }
    ElMessage.success('批量封禁成功')
    userForm.batch = ''
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function searchUsers(): Promise<void> {
  const userId = userSearchForm.userId.trim()
  const account = userSearchForm.account.trim()
  const nickname = userSearchForm.nickname.trim()
  const email = userSearchForm.email.trim()
  const ip = userSearchForm.ip.trim()
  const hasAny = !!userId || !!account || !!nickname || !!email || !!ip
  if (!hasAny) {
    ElMessage.warning('请输入用户ID / 账号 / 昵称 / 邮箱 / IP 任一条件')
    return
  }

  loading.value = true
  clearError()
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
  loading.value = true
  clearError()
  try {
    const res = await request<ApiResponse<BanRecord[]>>({
      url: '/admin/user/ban/ip-only',
      method: 'POST',
      data: {
        userId,
        reason: userOpForm.reason.trim() || null,
        durationSeconds: userOpForm.durationSeconds,
        confirm: false,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '封禁失败'
      return
    }
    ElMessage.success('已封禁关联IP')
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banUserEmailOnly(userId: number): Promise<void> {
  loading.value = true
  clearError()
  try {
    const res = await request<ApiResponse<BanRecord[]>>({
      url: '/admin/user/ban/email-only',
      method: 'POST',
      data: {
        userId,
        reason: userOpForm.reason.trim() || null,
        durationSeconds: userOpForm.durationSeconds,
        confirm: false,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '封禁失败'
      return
    }
    ElMessage.success('已封禁邮箱')
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function banUserFull(userId: number): Promise<void> {
  try {
    await ElMessageBox.confirm('将执行全维度封禁（关联IP + 绑定邮箱 + 关联账号），并强制下线，是否确认？', '二次确认', {
      confirmButtonText: '确认封禁',
      cancelButtonText: '取消',
      type: 'warning',
      closeOnClickModal: false,
    })
  } catch {
    return
  }

  loading.value = true
  clearError()
  try {
    const res = await request<ApiResponse<BanRecord[]>>({
      url: '/admin/user/ban/full',
      method: 'POST',
      data: {
        userId,
        reason: userOpForm.reason.trim() || null,
        durationSeconds: userOpForm.durationSeconds,
        confirm: true,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '封禁失败'
      return
    }
    ElMessage.success('已执行全封禁')
    await loadRecords()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function unbanUserRelated(userId: number): Promise<void> {
  try {
    await ElMessageBox.confirm(`将解除用户 ${userId} 相关的所有“生效中”封禁记录，是否确认？`, '二次确认', {
      confirmButtonText: '确认解封',
      cancelButtonText: '取消',
      type: 'warning',
      closeOnClickModal: false,
    })
  } catch {
    return
  }

  loading.value = true
  clearError()
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
      ElMessage.info('该用户暂无生效中的封禁记录')
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

    ElMessage.success('已解除该用户相关封禁')
    await loadRecords()
    await searchUsers()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

const paginationLayout = computed(() => {
  if (isMobile.value) return 'prev, pager, next'
  return 'total, sizes, prev, pager, next, jumper'
})

onMounted(() => {
  updateResponsiveState()
  window.addEventListener('resize', updateResponsiveState)
  void loadRecords()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateResponsiveState)
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-header">
      <div>
        <div class="admin-title">封禁管理</div>
      </div>
      <div class="admin-header-actions">
        <el-button type="primary" plain @click="router.push('/admin/dashboard')">返回</el-button>
      </div>
    </div>

    <el-alert
      v-if="error"
      type="error"
      :title="error"
      show-icon
      :closable="true"
      @close="error = ''"
      style="margin-bottom: 12px"
    />

      <el-tabs v-model="activeTab" class="admin-tabs">
        <el-tab-pane label="封禁记录" name="records">
          <el-card shadow="never" class="admin-card" body-style="padding: 16px">
            <el-form label-width="88px" class="admin-query-form">
              <el-row :gutter="12">
                <el-col :xs="24" :sm="12" :md="8">
                  <el-form-item label="目标类型">
                    <el-select v-model="query.targetType" placeholder="全部" clearable>
                      <el-option label="全部" value="" />
                      <el-option label="IP" value="IP" />
                      <el-option label="邮箱" value="EMAIL" />
                      <el-option label="用户" value="USER" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="8">
                  <el-form-item label="目标值">
                    <el-input v-model="query.targetValue" placeholder="IP/邮箱/用户ID（模糊）" clearable />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="8">
                  <el-form-item label="封禁用户ID">
                    <el-input v-model="query.bannedUserId" placeholder="bannedUserId" clearable />
                  </el-form-item>
                </el-col>

                <el-col :xs="24" :sm="12" :md="8">
                  <el-form-item label="关键词">
                    <el-input v-model="query.keyword" placeholder="原因/目标等" clearable />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="8">
                  <el-form-item label="管理员ID">
                    <el-input v-model="query.adminId" placeholder="操作人ID" clearable />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="8">
                  <el-form-item label="状态">
                    <el-select v-model="query.status" placeholder="全部" clearable>
                      <el-option label="全部" value="" />
                      <el-option label="生效中" value="ACTIVE" />
                      <el-option label="已解封（到期）" value="EXPIRED" />
                      <el-option label="已解封（提前）" value="REVOKED" />
                    </el-select>
                  </el-form-item>
                </el-col>

                <el-col :xs="24" :sm="12" :md="8">
                  <el-form-item label="生效时间从">
                    <el-date-picker
                      v-model="query.effectiveFrom"
                      type="datetime"
                      value-format="YYYY-MM-DDTHH:mm"
                      format="YYYY-MM-DD HH:mm"
                      placeholder="开始时间"
                      style="width: 100%"
                      clearable
                    />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="8">
                  <el-form-item label="生效时间到">
                    <el-date-picker
                      v-model="query.effectiveTo"
                      type="datetime"
                      value-format="YYYY-MM-DDTHH:mm"
                      format="YYYY-MM-DD HH:mm"
                      placeholder="结束时间"
                      style="width: 100%"
                      clearable
                    />
                  </el-form-item>
                </el-col>

                <el-col :xs="24" :md="8">
                  <el-form-item label=" ">
                    <el-space wrap>
                      <el-button type="primary" :loading="loading" @click="applyQuery">查询</el-button>
                      <el-button :disabled="loading" @click="resetQuery">重置</el-button>
                      <el-button :disabled="loading" @click="exportAll">导出CSV</el-button>
                      <el-button :disabled="loading" @click="exportSelected">导出已选</el-button>
                    </el-space>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
          </el-card>

          <el-card shadow="never" class="admin-card" body-style="padding: 0; overflow: hidden" style="margin-top: 12px">
            <div class="admin-table-wrap">
              <el-table
                :data="pageData.items"
                row-key="id"
                border
                table-layout="fixed"
                :height="isMobile ? undefined : 520"
                @selection-change="onSelectionChange"
              >
              <el-table-column type="selection" width="46" />
              <el-table-column prop="id" label="ID" width="80" />
              <el-table-column label="类型" width="90">
                <template #default="{ row }">
                  <el-tag size="small">{{ formatTargetType(row.targetType) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="targetValue" label="目标值" min-width="180" show-overflow-tooltip />
              <el-table-column prop="bannedUserId" label="封禁用户ID" width="120">
                <template #default="{ row }">{{ row.bannedUserId ?? '-' }}</template>
              </el-table-column>
              <el-table-column label="昵称" width="140" show-overflow-tooltip>
                <template #default="{ row }">{{ getBannedUserNickname(row.bannedUserId) }}</template>
              </el-table-column>
              <el-table-column label="状态" width="140">
                <template #default="{ row }">
                  <el-tag size="small" :type="String(row.status).toUpperCase() === 'ACTIVE' ? 'danger' : 'info'">
                    {{ formatBanStatus(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column v-if="!isNarrow" prop="effectiveAt" label="生效时间" width="170" show-overflow-tooltip />
              <el-table-column v-if="!isNarrow" prop="expiresAt" label="到期时间" width="170" show-overflow-tooltip>
                <template #default="{ row }">{{ row.expiresAt ?? '永久' }}</template>
              </el-table-column>
              <el-table-column label="操作" width="160">
                <template #default="{ row }">
                  <el-space>
                    <el-button size="small" @click="openDetail(row.id)">详情</el-button>
                    <el-button
                      size="small"
                      type="warning"
                      :disabled="String(row.status).toUpperCase() !== 'ACTIVE' || loading"
                      @click="unban(row.id)"
                    >
                      解封
                    </el-button>
                  </el-space>
                </template>
              </el-table-column>
              </el-table>
            </div>

            <div class="admin-pager">
              <div class="admin-pager-left">已选 {{ selectedIds.length }} 条</div>
              <el-pagination
                v-model:current-page="query.page"
                v-model:page-size="query.size"
                :total="pageData.total"
                :page-sizes="[10, 20, 50, 100]"
                :layout="paginationLayout"
                @change="loadRecords"
              />
            </div>
          </el-card>
        </el-tab-pane>

        <el-tab-pane label="封禁操作" name="ops">
          <el-row :gutter="12">
            <el-col :xs="24" :md="8">
              <el-card shadow="never" class="admin-card" body-style="padding: 16px">
                <template #header>IP 封禁</template>
                <el-form label-width="88px" class="admin-query-form">
                  <el-form-item label="单个IP">
                    <el-input v-model="ipForm.value" placeholder="203.0.113.1" clearable />
                  </el-form-item>
                  <el-form-item label="批量IP">
                    <el-input v-model="ipForm.batch" type="textarea" :rows="4" placeholder="每行一个IP" />
                  </el-form-item>
                  <el-form-item label="时长">
                    <el-select v-model="ipForm.durationSeconds" style="width: 100%">
                      <el-option v-for="d in durations" :key="d.label" :label="d.label" :value="d.value" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="原因">
                    <el-input v-model="ipForm.reason" placeholder="可选" clearable />
                  </el-form-item>
                  <el-form-item label=" ">
                    <el-space wrap>
                      <el-button type="primary" :loading="loading" @click="banIpSingle">封禁单个</el-button>
                      <el-button type="warning" :loading="loading" @click="banIpBatch">批量封禁</el-button>
                    </el-space>
                  </el-form-item>
                </el-form>
              </el-card>
            </el-col>

            <el-col :xs="24" :md="8">
              <el-card shadow="never" class="admin-card" body-style="padding: 16px">
                <template #header>邮箱封禁</template>
                <el-form label-width="88px" class="admin-query-form">
                  <el-form-item label="单个邮箱">
                    <el-input v-model="emailForm.value" placeholder="user@example.com" clearable />
                  </el-form-item>
                  <el-form-item label="批量邮箱">
                    <el-input v-model="emailForm.batch" type="textarea" :rows="4" placeholder="每行一个邮箱" />
                  </el-form-item>
                  <el-form-item label="时长">
                    <el-select v-model="emailForm.durationSeconds" style="width: 100%">
                      <el-option v-for="d in durations" :key="d.label" :label="d.label" :value="d.value" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="原因">
                    <el-input v-model="emailForm.reason" placeholder="可选" clearable />
                  </el-form-item>
                  <el-form-item label=" ">
                    <el-space wrap>
                      <el-button type="primary" :loading="loading" @click="banEmailSingle">封禁单个</el-button>
                      <el-button type="warning" :loading="loading" @click="banEmailBatch">批量封禁</el-button>
                    </el-space>
                  </el-form-item>
                </el-form>
              </el-card>
            </el-col>

            <el-col :xs="24" :md="8">
              <el-card shadow="never" class="admin-card" body-style="padding: 16px">
                <template #header>用户封禁</template>
                <el-form label-width="88px" class="admin-query-form">
                  <el-form-item label="单个用户ID">
                    <el-input v-model="userForm.userId" placeholder="1" clearable />
                  </el-form-item>
                  <el-form-item label="批量用户ID">
                    <el-input v-model="userForm.batch" type="textarea" :rows="4" placeholder="每行一个用户ID" />
                  </el-form-item>
                  <el-form-item label="时长">
                    <el-select v-model="userForm.durationSeconds" style="width: 100%">
                      <el-option v-for="d in durations" :key="d.label" :label="d.label" :value="d.value" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="原因">
                    <el-input v-model="userForm.reason" placeholder="可选" clearable />
                  </el-form-item>
                  <el-form-item label=" ">
                    <el-space wrap>
                      <el-button type="primary" :loading="loading" @click="banUserSingle">封禁单个</el-button>
                      <el-button type="warning" :loading="loading" @click="banUserBatch">批量封禁</el-button>
                    </el-space>
                  </el-form-item>
                </el-form>
              </el-card>
            </el-col>
          </el-row>
        </el-tab-pane>

        <el-tab-pane label="用户查询与封禁" name="users">
          <el-card shadow="never" class="admin-card" body-style="padding: 16px">
            <el-form label-width="72px" class="admin-query-form">
              <el-row :gutter="12">
                <el-col :xs="24" :sm="12" :md="6">
                  <el-form-item label="用户ID">
                    <el-input v-model="userSearchForm.userId" placeholder="1" clearable />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="6">
                  <el-form-item label="账号">
                    <el-input v-model="userSearchForm.account" placeholder="admin" clearable />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="6">
                  <el-form-item label="昵称">
                    <el-input v-model="userSearchForm.nickname" placeholder="小明" clearable />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="6">
                  <el-form-item label="邮箱">
                    <el-input v-model="userSearchForm.email" placeholder="user@example.com" clearable />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="6">
                  <el-form-item label="IP">
                    <el-input v-model="userSearchForm.ip" placeholder="203.0.113.1" clearable />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="6">
                  <el-form-item label="limit">
                    <el-input-number v-model="userSearchForm.limit" :min="1" :max="200" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :md="12">
                  <el-form-item label="封禁原因">
                    <el-input v-model="userOpForm.reason" placeholder="可选" clearable />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="6">
                  <el-form-item label="封禁时长">
                    <el-select v-model="userOpForm.durationSeconds" style="width: 100%">
                      <el-option v-for="d in durations" :key="d.label" :label="d.label" :value="d.value" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :md="6">
                  <el-form-item label=" ">
                    <el-button type="primary" :loading="loading" @click="searchUsers">查询用户</el-button>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
          </el-card>

          <el-card shadow="never" body-style="padding: 0; overflow: hidden" style="margin-top: 12px">
            <el-table :data="userSearchResults" row-key="userId" border table-layout="fixed">
              <el-table-column prop="userId" label="用户ID" width="90" />
              <el-table-column prop="account" label="账号" min-width="140" show-overflow-tooltip />
              <el-table-column prop="nickname" label="昵称" min-width="120" show-overflow-tooltip>
                <template #default="{ row }">{{ row.nickname ?? '-' }}</template>
              </el-table-column>
              <el-table-column prop="email" label="邮箱" min-width="200" show-overflow-tooltip />
              <el-table-column label="状态" width="120">
                <template #default="{ row }">
                  <el-tag size="small">{{ formatUserStatus(row.status) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column v-if="!isNarrow" prop="lastLoginIp" label="最近IP" width="160" show-overflow-tooltip>
                <template #default="{ row }">{{ row.lastLoginIp ?? '-' }}</template>
              </el-table-column>
              <el-table-column label="操作" width="360">
                <template #default="{ row }">
                  <el-space wrap>
                    <el-button size="small" type="warning" :loading="loading" @click="banAssociatedIps(row.userId)">仅封关联IP</el-button>
                    <el-button size="small" type="warning" :loading="loading" @click="banUserEmailOnly(row.userId)">仅封邮箱</el-button>
                    <el-button size="small" type="danger" :loading="loading" @click="banUserFull(row.userId)">全封禁</el-button>
                    <el-button size="small" :loading="loading" @click="unbanUserRelated(row.userId)">解除封禁</el-button>
                  </el-space>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-tab-pane>
      </el-tabs>

    <el-dialog v-model="detailVisible" title="封禁详情" width="900px">
      <el-skeleton v-if="detailLoading" :rows="6" animated />
      <div v-else>
        <el-descriptions v-if="detailRecord" :column="isMobile ? 1 : 2" border>
          <el-descriptions-item label="记录ID">{{ detailRecord.id }}</el-descriptions-item>
          <el-descriptions-item label="目标类型">{{ formatTargetType(detailRecord.targetType) }}</el-descriptions-item>
          <el-descriptions-item label="目标值">{{ detailRecord.targetValue }}</el-descriptions-item>
          <el-descriptions-item label="封禁用户ID">{{ detailRecord.bannedUserId ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="昵称">{{ getBannedUserNickname(detailRecord.bannedUserId) }}</el-descriptions-item>
          <el-descriptions-item label="管理员ID">{{ detailRecord.adminId }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ formatBanStatus(detailRecord.status) }}</el-descriptions-item>
          <el-descriptions-item label="原因">{{ detailRecord.reason ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="时长(秒)">{{ detailRecord.durationSeconds ?? '永久' }}</el-descriptions-item>
          <el-descriptions-item label="生效时间">{{ detailRecord.effectiveAt }}</el-descriptions-item>
          <el-descriptions-item label="到期时间">{{ detailRecord.expiresAt ?? '永久' }}</el-descriptions-item>
          <el-descriptions-item label="解封时间">{{ detailRecord.unbannedAt ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="解封类型">{{ formatUnbanType(detailRecord.unbanType) }}</el-descriptions-item>
        </el-descriptions>

        <el-divider />
        <div style="font-weight: 600; margin-bottom: 8px">操作日志</div>
        <el-table :data="detailLogs" border table-layout="fixed">
          <el-table-column prop="createdAt" label="时间" width="170" show-overflow-tooltip />
          <el-table-column prop="actionType" label="类型" width="120">
            <template #default="{ row }">{{ formatActionType(row.actionType) }}</template>
          </el-table-column>
          <el-table-column prop="actorId" label="操作人ID" width="120">
            <template #default="{ row }">{{ row.actorId ?? '-' }}</template>
          </el-table-column>
          <el-table-column prop="actorRole" label="角色" width="140">
            <template #default="{ row }">{{ row.actorRole ?? '-' }}</template>
          </el-table-column>
          <el-table-column prop="fromStatus" label="原状态" width="120">
            <template #default="{ row }">{{ row.fromStatus ?? '-' }}</template>
          </el-table-column>
          <el-table-column prop="toStatus" label="新状态" width="120" />
        </el-table>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>
