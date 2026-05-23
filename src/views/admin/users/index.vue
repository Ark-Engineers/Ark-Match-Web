<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import { http, request } from '@/api'
import { useAuthStore } from '@/stores/auth'

type ApiResponse<T> = { code: number; message: string; data: T }
type PageResponse<T> = { total: number; page: number; size: number; items: T[] }

type UserItem = {
  id: number
  account: string
  email: string
  role: string
  nickname: string
  avatarUrl: string | null
  status: string
  emailVerifiedAt: string | null
  lastLoginAt: string | null
  lastLoginIp: string | null
  loginFailCount: number | null
  lockedUntil: string | null
  createdAt: string
  updatedAt: string
  deleted: number
  deletedAt: string | null
}

type UserManageLog = {
  id: number
  actorId: number | null
  actorRole: string | null
  targetUserId: number
  actionType: string
  ip: string | null
  detail: string | null
  diffJson: string | null
  createdAt: string
}

type BanRecord = {
  id: number
  targetType: string
  targetValue: string
  bannedUserId: number | null
  adminId: number
  reason: string | null
  durationSeconds: number | null
  effectiveAt: string
  expiresAt: string | null
  status: string
  unbannedAt: string | null
  unbannedBy: number | null
  unbanType: string | null
  createdAt: string
  updatedAt: string
}

const router = useRouter()
const authStore = useAuthStore()

const isSuperAdmin = computed(() => String(authStore.session?.role ?? '').toUpperCase() === 'SUPER_ADMIN')

const isMobile = ref(false)
const isNarrow = ref(false)
const showAdvanced = ref(false)

function updateResponsiveState(): void {
  isMobile.value = window.innerWidth < 768
  isNarrow.value = window.innerWidth < 1100
  if (!isNarrow.value) showAdvanced.value = false
}

const activeTab = ref<'users' | 'logs'>('users')

const usersLoading = ref(false)
const logsLoading = ref(false)
const bansLoading = ref(false)

const error = ref('')

const userQuery = reactive({
  keyword: '',
  account: '',
  nickname: '',
  role: '',
  status: '',
  createdRange: [] as string[],
  includeDeleted: 0,
  page: 1,
  size: 20,
})

const logQuery = reactive({
  targetUserId: '',
  actorId: '',
  actionType: '',
  keyword: '',
  timeRange: [] as string[],
  page: 1,
  size: 20,
})

const usersPage = ref<PageResponse<UserItem>>({ total: 0, page: 1, size: 20, items: [] })
const logsPage = ref<PageResponse<UserManageLog>>({ total: 0, page: 1, size: 20, items: [] })

const userTotalPages = computed(() => Math.max(1, Math.ceil(usersPage.value.total / usersPage.value.size)))
const logTotalPages = computed(() => Math.max(1, Math.ceil(logsPage.value.total / logsPage.value.size)))

const editDialogVisible = ref(false)
const resetPwdDialogVisible = ref(false)
const banDialogVisible = ref(false)
const bansDrawerVisible = ref(false)

const currentUser = ref<UserItem | null>(null)
const editForm = reactive({ account: '', nickname: '', reason: '' })
const resetForm = reactive({ reason: '' })
const banForm = reactive({ reason: '', durationSeconds: '' })
const unbanReason = ref('')
const deactivateReason = ref('')
const roleReason = ref('')

const bansPage = ref<PageResponse<BanRecord>>({ total: 0, page: 1, size: 20, items: [] })
const bansQuery = reactive({ status: '', page: 1, size: 20 })

function resolveErrorMessage(err: unknown): string {
  const anyErr = err as any
  const msgFromApi = anyErr?.response?.data?.message
  if (typeof msgFromApi === 'string' && msgFromApi.trim()) return msgFromApi
  if (typeof anyErr?.message === 'string' && anyErr.message.trim()) return anyErr.message
  return '操作失败，请稍后重试'
}

function normalizeEnum(v: string): string | undefined {
  const s = String(v || '').trim()
  return s ? s.toUpperCase() : undefined
}

function toOptionalNumber(raw: string): number | undefined {
  const v = raw.trim()
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function canOperateUser(row: UserItem): boolean {
  const targetRole = String(row.role || '').toUpperCase()
  if (targetRole === 'SUPER_ADMIN') return false
  if (isSuperAdmin.value) return true
  return targetRole === 'USER'
}

function formatRole(role: string): string {
  const s = String(role || '').toUpperCase()
  if (s === 'USER') return '普通用户'
  if (s === 'ADMIN') return '管理员'
  if (s === 'SUPER_ADMIN') return '超级管理员'
  return role
}

function formatStatus(status: string): string {
  const s = String(status || '').toUpperCase()
  if (s === 'NORMAL') return '正常'
  if (s === 'SUSPENDED') return '限制'
  if (s === 'BANNED') return '封禁'
  return status
}

function formatAction(actionType: string): string {
  const s = String(actionType || '').toUpperCase()
  if (s === 'UPDATE_PROFILE') return '修改信息'
  if (s === 'RESET_PASSWORD') return '重置密码'
  if (s === 'DEACTIVATE') return '注销账号'
  if (s === 'BAN') return '封禁'
  if (s === 'UNBAN') return '解禁'
  if (s === 'GRANT_ADMIN') return '授权管理员'
  if (s === 'REVOKE_ADMIN') return '撤销管理员'
  if (s === 'DISABLE_ADMIN') return '禁用管理员'
  if (s === 'ENABLE_ADMIN') return '启用管理员'
  return actionType
}

async function loadUsers(): Promise<void> {
  usersLoading.value = true
  error.value = ''
  try {
    const [from, to] = userQuery.createdRange || []
    const res = await request<ApiResponse<PageResponse<UserItem>>>({
      url: '/admin/user-manage/users',
      method: 'GET',
      params: {
        keyword: userQuery.keyword.trim() || undefined,
        account: userQuery.account.trim() || undefined,
        nickname: userQuery.nickname.trim() || undefined,
        role: normalizeEnum(userQuery.role),
        status: normalizeEnum(userQuery.status),
        createdFrom: from || undefined,
        createdTo: to || undefined,
        includeDeleted: userQuery.includeDeleted,
        page: userQuery.page,
        size: userQuery.size,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '查询失败'
      return
    }
    usersPage.value = res.data
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    usersLoading.value = false
  }
}

async function loadLogs(): Promise<void> {
  if (!isSuperAdmin.value) return
  logsLoading.value = true
  error.value = ''
  try {
    const [from, to] = logQuery.timeRange || []
    const res = await request<ApiResponse<PageResponse<UserManageLog>>>({
      url: '/admin/user-manage/logs',
      method: 'GET',
      params: {
        targetUserId: toOptionalNumber(logQuery.targetUserId),
        actorId: toOptionalNumber(logQuery.actorId),
        actionType: normalizeEnum(logQuery.actionType),
        keyword: logQuery.keyword.trim() || undefined,
        fromTime: from || undefined,
        toTime: to || undefined,
        page: logQuery.page,
        size: logQuery.size,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '查询失败'
      return
    }
    logsPage.value = res.data
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    logsLoading.value = false
  }
}

async function applyUserQuery(): Promise<void> {
  userQuery.page = 1
  await loadUsers()
}

async function resetUserQuery(): Promise<void> {
  userQuery.keyword = ''
  userQuery.account = ''
  userQuery.nickname = ''
  userQuery.role = ''
  userQuery.status = ''
  userQuery.createdRange = []
  userQuery.includeDeleted = 0
  userQuery.page = 1
  userQuery.size = 20
  showAdvanced.value = false
  await loadUsers()
}

async function applyLogQuery(): Promise<void> {
  logQuery.page = 1
  await loadLogs()
}

function openEdit(user: UserItem): void {
  currentUser.value = user
  editForm.account = user.account
  editForm.nickname = user.nickname
  editForm.reason = ''
  editDialogVisible.value = true
}

async function submitEdit(): Promise<void> {
  const u = currentUser.value
  if (!u) return
  try {
    await ElMessageBox.confirm('确认修改该用户信息？', '二次确认', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
      closeOnClickModal: false,
    })
  } catch {
    return
  }
  usersLoading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<null>>({
      url: '/admin/user-manage/update-profile',
      method: 'POST',
      data: {
        userId: u.id,
        account: editForm.account.trim() || null,
        nickname: editForm.nickname.trim() || null,
        reason: editForm.reason.trim() || null,
        confirm: true,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '修改失败'
      return
    }
    ElMessage.success('已修改')
    editDialogVisible.value = false
    await loadUsers()
    await loadLogs()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    usersLoading.value = false
  }
}

function openResetPwd(user: UserItem): void {
  currentUser.value = user
  resetForm.reason = ''
  resetPwdDialogVisible.value = true
}

async function submitResetPwd(): Promise<void> {
  const u = currentUser.value
  if (!u) return
  try {
    await ElMessageBox.confirm('确认重置该用户密码？将生成临时密码并强制下线。', '二次确认', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
      closeOnClickModal: false,
    })
  } catch {
    return
  }
  usersLoading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<{ tempPassword: string }>>({
      url: '/admin/user-manage/reset-password',
      method: 'POST',
      data: { userId: u.id, reason: resetForm.reason.trim() || null, confirm: true },
    })
    if (res.code !== 0) {
      error.value = res.message || '重置失败'
      return
    }
    resetPwdDialogVisible.value = false
    await loadUsers()
    await loadLogs()
    await ElMessageBox.alert(`临时密码：${res.data.tempPassword}\n请复制并转交用户，建议用户登录后立即修改。`, '重置成功', {
      confirmButtonText: '知道了',
    })
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    usersLoading.value = false
  }
}

function openBan(user: UserItem): void {
  currentUser.value = user
  banForm.reason = ''
  banForm.durationSeconds = ''
  banDialogVisible.value = true
}

async function submitBan(): Promise<void> {
  const u = currentUser.value
  if (!u) return
  const duration = banForm.durationSeconds.trim()
  const durationSeconds = duration ? Number(duration) : null
  if (duration && !Number.isFinite(durationSeconds)) {
    ElMessage.warning('封禁时长必须为数字（秒）')
    return
  }
  usersLoading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<null>>({
      url: '/admin/user-manage/ban',
      method: 'POST',
      data: {
        userId: u.id,
        reason: banForm.reason.trim() || null,
        durationSeconds: durationSeconds ?? null,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '封禁失败'
      return
    }
    ElMessage.success('已封禁')
    banDialogVisible.value = false
    await loadUsers()
    await loadLogs()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    usersLoading.value = false
  }
}

async function unbanUser(user: UserItem): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入解禁原因（可选）', '解禁二次确认', {
      confirmButtonText: '确认解禁',
      cancelButtonText: '取消',
      inputValue: '',
      inputPlaceholder: '原因（可选）',
      closeOnClickModal: false,
    })
    unbanReason.value = String(value || '')
  } catch {
    return
  }

  usersLoading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<null>>({
      url: '/admin/user-manage/unban',
      method: 'POST',
      data: { userId: user.id, reason: unbanReason.value.trim() || null, confirm: true },
    })
    if (res.code !== 0) {
      error.value = res.message || '解禁失败'
      return
    }
    ElMessage.success('已解禁')
    await loadUsers()
    await loadLogs()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    usersLoading.value = false
  }
}

async function deactivateUser(user: UserItem): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入注销原因（可选）', '注销二次确认', {
      confirmButtonText: '确认注销',
      cancelButtonText: '取消',
      inputValue: '',
      inputPlaceholder: '原因（可选）',
      closeOnClickModal: false,
    })
    deactivateReason.value = String(value || '')
  } catch {
    return
  }

  usersLoading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<null>>({
      url: '/admin/user-manage/deactivate',
      method: 'POST',
      data: { userId: user.id, reason: deactivateReason.value.trim() || null, confirm: true },
    })
    if (res.code !== 0) {
      error.value = res.message || '注销失败'
      return
    }
    ElMessage.success('已注销')
    await loadUsers()
    await loadLogs()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    usersLoading.value = false
  }
}

async function grantAdmin(user: UserItem): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入授权原因（可选）', '授权二次确认', {
      confirmButtonText: '确认授权',
      cancelButtonText: '取消',
      inputValue: '',
      inputPlaceholder: '原因（可选）',
      closeOnClickModal: false,
    })
    roleReason.value = String(value || '')
  } catch {
    return
  }
  usersLoading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<null>>({
      url: '/admin/user-manage/grant-admin',
      method: 'POST',
      data: { userId: user.id, reason: roleReason.value.trim() || null, confirm: true },
    })
    if (res.code !== 0) {
      error.value = res.message || '授权失败'
      return
    }
    ElMessage.success('已授权为管理员')
    await loadUsers()
    await loadLogs()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    usersLoading.value = false
  }
}

async function revokeAdmin(user: UserItem): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入撤销原因（可选）', '撤销二次确认', {
      confirmButtonText: '确认撤销',
      cancelButtonText: '取消',
      inputValue: '',
      inputPlaceholder: '原因（可选）',
      closeOnClickModal: false,
    })
    roleReason.value = String(value || '')
  } catch {
    return
  }
  usersLoading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<null>>({
      url: '/admin/user-manage/revoke-admin',
      method: 'POST',
      data: { userId: user.id, reason: roleReason.value.trim() || null, confirm: true },
    })
    if (res.code !== 0) {
      error.value = res.message || '撤销失败'
      return
    }
    ElMessage.success('已撤销管理员权限')
    await loadUsers()
    await loadLogs()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    usersLoading.value = false
  }
}

async function disableAdminAccount(user: UserItem): Promise<void> {
  if (!isSuperAdmin.value) return
  if (String(user.role || '').toUpperCase() !== 'ADMIN') return
  try {
    const { value } = await ElMessageBox.prompt('请输入禁用原因（可选）', '禁用管理员二次确认', {
      confirmButtonText: '确认禁用',
      cancelButtonText: '取消',
      inputValue: '',
      inputPlaceholder: '原因（可选）',
      closeOnClickModal: false,
    })
    roleReason.value = String(value || '')
  } catch {
    return
  }

  usersLoading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<null>>({
      url: '/admin/user-manage/admin/disable',
      method: 'POST',
      data: { userId: user.id, reason: roleReason.value.trim() || null, confirm: true },
    })
    if (res.code !== 0) {
      error.value = res.message || '禁用失败'
      return
    }
    ElMessage.success('已禁用')
    await loadUsers()
    await loadLogs()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    usersLoading.value = false
  }
}

async function enableAdminAccount(user: UserItem): Promise<void> {
  if (!isSuperAdmin.value) return
  if (String(user.role || '').toUpperCase() !== 'ADMIN') return
  try {
    const { value } = await ElMessageBox.prompt('请输入启用原因（可选）', '启用管理员二次确认', {
      confirmButtonText: '确认启用',
      cancelButtonText: '取消',
      inputValue: '',
      inputPlaceholder: '原因（可选）',
      closeOnClickModal: false,
    })
    roleReason.value = String(value || '')
  } catch {
    return
  }

  usersLoading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<null>>({
      url: '/admin/user-manage/admin/enable',
      method: 'POST',
      data: { userId: user.id, reason: roleReason.value.trim() || null, confirm: true },
    })
    if (res.code !== 0) {
      error.value = res.message || '启用失败'
      return
    }
    ElMessage.success('已启用')
    await loadUsers()
    await loadLogs()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    usersLoading.value = false
  }
}

async function openBans(user: UserItem): Promise<void> {
  currentUser.value = user
  bansQuery.page = 1
  bansQuery.status = ''
  bansDrawerVisible.value = true
  await loadBans()
}

async function loadBans(): Promise<void> {
  const u = currentUser.value
  if (!u) return
  bansLoading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<PageResponse<BanRecord>>>({
      url: `/admin/user-manage/users/${u.id}/bans`,
      method: 'GET',
      params: {
        status: normalizeEnum(bansQuery.status),
        page: bansQuery.page,
        size: bansQuery.size,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '查询失败'
      return
    }
    bansPage.value = res.data
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    bansLoading.value = false
  }
}

async function exportLogs(): Promise<void> {
  if (!isSuperAdmin.value) return
  try {
    const [from, to] = logQuery.timeRange || []
    const resp = await http.request({
      url: '/admin/user-manage/logs/export',
      method: 'GET',
      params: {
        targetUserId: toOptionalNumber(logQuery.targetUserId),
        actorId: toOptionalNumber(logQuery.actorId),
        actionType: normalizeEnum(logQuery.actionType),
        keyword: logQuery.keyword.trim() || undefined,
        fromTime: from || undefined,
        toTime: to || undefined,
      },
      responseType: 'blob',
    })
    const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'user-manage-logs.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error(resolveErrorMessage(e))
  }
}

async function userPrevPage(): Promise<void> {
  userQuery.page = Math.max(1, userQuery.page - 1)
  await loadUsers()
}

async function userNextPage(): Promise<void> {
  userQuery.page = Math.min(userTotalPages.value, userQuery.page + 1)
  await loadUsers()
}

async function logPrevPage(): Promise<void> {
  logQuery.page = Math.max(1, logQuery.page - 1)
  await loadLogs()
}

async function logNextPage(): Promise<void> {
  logQuery.page = Math.min(logTotalPages.value, logQuery.page + 1)
  await loadLogs()
}

async function bansPrevPage(): Promise<void> {
  bansQuery.page = Math.max(1, bansQuery.page - 1)
  await loadBans()
}

async function bansNextPage(): Promise<void> {
  const totalPages = Math.max(1, Math.ceil(bansPage.value.total / bansPage.value.size))
  bansQuery.page = Math.min(totalPages, bansQuery.page + 1)
  await loadBans()
}

onMounted(async () => {
  updateResponsiveState()
  window.addEventListener('resize', updateResponsiveState)
  await loadUsers()
  if (isSuperAdmin.value) {
    await loadLogs()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateResponsiveState)
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-header">
      <div>
        <div class="admin-title">用户管理</div>
      </div>
      <div class="admin-header-actions">
        <el-button type="primary" plain @click="router.push('/admin/dashboard')">返回</el-button>
      </div>
    </div>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" style="margin-bottom: 12px" />

    <el-tabs v-model="activeTab" class="admin-tabs">
      <el-tab-pane label="用户列表" name="users">
        <el-card shadow="never" class="admin-card">
          <el-form label-width="90px" class="admin-query-form" @submit.prevent>
            <el-row :gutter="12">
              <el-col :xs="24" :sm="12" :md="8" :lg="6">
                <el-form-item label="关键词">
                  <el-input v-model="userQuery.keyword" clearable placeholder="账号/邮箱/昵称/ID" @keyup.enter="applyUserQuery" />
                </el-form-item>
              </el-col>
              <template v-if="!isNarrow || showAdvanced">
                <el-col :xs="24" :sm="12" :md="8" :lg="6">
                  <el-form-item label="账号">
                    <el-input v-model="userQuery.account" clearable placeholder="模糊匹配" @keyup.enter="applyUserQuery" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="8" :lg="6">
                  <el-form-item label="昵称">
                    <el-input v-model="userQuery.nickname" clearable placeholder="模糊匹配" @keyup.enter="applyUserQuery" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="8" :lg="6">
                  <el-form-item label="角色">
                    <el-select v-model="userQuery.role" clearable placeholder="全部" style="width: 100%">
                      <el-option label="普通用户" value="USER" />
                      <el-option label="管理员" value="ADMIN" />
                      <el-option label="超级管理员" value="SUPER_ADMIN" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="8" :lg="6">
                  <el-form-item label="状态">
                    <el-select v-model="userQuery.status" clearable placeholder="全部" style="width: 100%">
                      <el-option label="正常" value="NORMAL" />
                      <el-option label="限制" value="SUSPENDED" />
                      <el-option label="封禁" value="BANNED" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="12" :lg="10">
                  <el-form-item label="注册时间">
                    <el-date-picker
                      v-model="userQuery.createdRange"
                      type="datetimerange"
                      value-format="YYYY-MM-DDTHH:mm:ss"
                      start-placeholder="开始"
                      end-placeholder="结束"
                      range-separator="~"
                      style="width: 100%"
                    />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12" :md="6" :lg="4">
                  <el-form-item label="已注销">
                    <el-switch v-model="userQuery.includeDeleted" :active-value="1" :inactive-value="0" />
                  </el-form-item>
                </el-col>
              </template>
              <el-col :xs="24" :sm="24" :md="24" :lg="4">
                <el-form-item label=" " label-width="0px">
                  <el-space wrap style="width: 100%">
                    <el-button type="primary" :loading="usersLoading" @click="applyUserQuery" style="flex: 1">查询</el-button>
                    <el-button :disabled="usersLoading" @click="resetUserQuery" style="flex: 1">重置</el-button>
                    <el-button v-if="isNarrow" :disabled="usersLoading" @click="showAdvanced = !showAdvanced" style="flex: 1">
                      {{ showAdvanced ? '收起条件' : '更多条件' }}
                    </el-button>
                  </el-space>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-card>

        <el-card shadow="never" class="admin-card" style="margin-top: 12px">
          <div class="admin-table-wrap">
            <el-table :data="usersPage.items" border height="540" table-layout="fixed" v-loading="usersLoading">
              <el-table-column prop="id" label="ID" width="90" />
              <el-table-column prop="nickname" label="昵称" min-width="140" show-overflow-tooltip />
              <el-table-column prop="account" label="账号" min-width="140" show-overflow-tooltip />
              <el-table-column v-if="!isMobile" prop="email" label="邮箱" min-width="200" show-overflow-tooltip />
              <el-table-column prop="role" label="角色" width="120">
                <template #default="{ row }">
                  <el-tag :type="String(row.role).toUpperCase() === 'SUPER_ADMIN' ? 'danger' : String(row.role).toUpperCase() === 'ADMIN' ? 'warning' : 'info'">
                    {{ formatRole(row.role) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="110">
                <template #default="{ row }">
                  <el-tag :type="String(row.status).toUpperCase() === 'BANNED' ? 'danger' : String(row.status).toUpperCase() === 'SUSPENDED' ? 'warning' : 'success'">
                    {{ formatStatus(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column v-if="!isMobile" prop="createdAt" label="注册时间" min-width="170" show-overflow-tooltip />
              <el-table-column v-if="!isMobile" prop="lastLoginAt" label="最近登录" min-width="170" show-overflow-tooltip />
              <el-table-column label="操作" :width="isNarrow ? 200 : 420" fixed="right">
                <template #default="{ row }">
                  <div class="admin-row-actions">
                    <el-button size="small" @click="openEdit(row)" :disabled="!canOperateUser(row)">修改信息</el-button>
                    <el-button
                      v-if="!isNarrow"
                      size="small"
                      type="warning"
                      plain
                      @click="openResetPwd(row)"
                      :disabled="!canOperateUser(row)"
                    >
                      重置密码
                    </el-button>
                    <el-button
                      v-if="!isNarrow"
                      size="small"
                      type="danger"
                      plain
                      @click="openBan(row)"
                      :disabled="!canOperateUser(row) || String(row.status).toUpperCase() === 'BANNED'"
                    >
                      封禁
                    </el-button>
                    <el-button
                      v-if="!isNarrow"
                      size="small"
                      type="success"
                      plain
                      @click="unbanUser(row)"
                      :disabled="!canOperateUser(row) || String(row.status).toUpperCase() !== 'BANNED'"
                    >
                      解禁
                    </el-button>
                    <el-button v-if="!isNarrow" size="small" type="info" plain @click="openBans(row)">封禁记录</el-button>
                    <el-dropdown>
                      <el-button size="small" type="primary" plain>更多</el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item v-if="isNarrow" @click="openResetPwd(row)" :disabled="!canOperateUser(row)">
                            重置密码
                          </el-dropdown-item>
                          <el-dropdown-item
                            v-if="isNarrow"
                            @click="openBan(row)"
                            :disabled="!canOperateUser(row) || String(row.status).toUpperCase() === 'BANNED'"
                          >
                            封禁
                          </el-dropdown-item>
                          <el-dropdown-item
                            v-if="isNarrow"
                            @click="unbanUser(row)"
                            :disabled="!canOperateUser(row) || String(row.status).toUpperCase() !== 'BANNED'"
                          >
                            解禁
                          </el-dropdown-item>
                          <el-dropdown-item v-if="isNarrow" @click="openBans(row)">
                            封禁记录
                          </el-dropdown-item>
                          <el-dropdown-item
                            v-if="isSuperAdmin"
                            @click="grantAdmin(row)"
                            :disabled="String(row.role).toUpperCase() !== 'USER'"
                          >
                            授权管理员
                          </el-dropdown-item>
                          <el-dropdown-item
                            v-if="isSuperAdmin"
                            @click="revokeAdmin(row)"
                            :disabled="String(row.role).toUpperCase() !== 'ADMIN'"
                          >
                            撤销管理员
                          </el-dropdown-item>
                          <el-dropdown-item
                            v-if="isSuperAdmin && String(row.role).toUpperCase() === 'ADMIN' && String(row.status).toUpperCase() !== 'SUSPENDED'"
                            @click="disableAdminAccount(row)"
                          >
                            禁用管理员账号
                          </el-dropdown-item>
                          <el-dropdown-item
                            v-if="isSuperAdmin && String(row.role).toUpperCase() === 'ADMIN' && String(row.status).toUpperCase() === 'SUSPENDED'"
                            @click="enableAdminAccount(row)"
                          >
                            启用管理员账号
                          </el-dropdown-item>
                          <el-dropdown-item
                            divided
                            @click="deactivateUser(row)"
                            :disabled="row.deleted === 1 || !canOperateUser(row) || String(row.role).toUpperCase() !== 'USER'"
                          >
                            注销账号
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="admin-pager">
            <div class="admin-pager-left">
              <span>共 {{ usersPage.total }} 条</span>
              <el-select v-model="userQuery.size" size="small" style="width: 120px" @change="applyUserQuery">
                <el-option :value="20" label="20/页" />
                <el-option :value="50" label="50/页" />
                <el-option :value="100" label="100/页" />
                <el-option :value="200" label="200/页" />
              </el-select>
            </div>
            <div class="admin-pager-right">
              <el-button size="small" @click="userPrevPage" :disabled="userQuery.page <= 1">上一页</el-button>
              <span class="admin-page-no">{{ userQuery.page }} / {{ userTotalPages }}</span>
              <el-button size="small" @click="userNextPage" :disabled="userQuery.page >= userTotalPages">下一页</el-button>
            </div>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane v-if="isSuperAdmin" label="审计日志" name="logs">
        <el-card shadow="never" class="admin-card">
          <el-form label-width="90px" class="admin-query-form" @submit.prevent>
            <el-row :gutter="12">
              <el-col :xs="24" :sm="12" :md="8" :lg="6">
                <el-form-item label="目标用户ID">
                  <el-input v-model="logQuery.targetUserId" clearable placeholder="数字" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :md="8" :lg="6">
                <el-form-item label="操作人ID">
                  <el-input v-model="logQuery.actorId" clearable placeholder="数字" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :md="8" :lg="6">
                <el-form-item label="类型">
                  <el-select v-model="logQuery.actionType" clearable placeholder="全部">
                    <el-option label="修改信息" value="UPDATE_PROFILE" />
                    <el-option label="重置密码" value="RESET_PASSWORD" />
                    <el-option label="注销账号" value="DEACTIVATE" />
                    <el-option label="封禁" value="BAN" />
                    <el-option label="解禁" value="UNBAN" />
                    <el-option label="授权管理员" value="GRANT_ADMIN" />
                    <el-option label="撤销管理员" value="REVOKE_ADMIN" />
                    <el-option label="禁用管理员" value="DISABLE_ADMIN" />
                    <el-option label="启用管理员" value="ENABLE_ADMIN" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :md="8" :lg="6">
                <el-form-item label="关键词">
                  <el-input v-model="logQuery.keyword" clearable placeholder="detail 模糊匹配" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="24" :lg="10">
                <el-form-item label="时间范围">
                  <el-date-picker
                    v-model="logQuery.timeRange"
                    type="datetimerange"
                    value-format="YYYY-MM-DDTHH:mm:ss"
                    start-placeholder="开始"
                    end-placeholder="结束"
                    range-separator="~"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :md="8" :lg="4">
                <el-form-item label=" " label-width="0px">
                  <el-button type="primary" :loading="logsLoading" @click="applyLogQuery" style="width: 100%">查询</el-button>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :md="8" :lg="4">
                <el-form-item label=" " label-width="0px">
                  <el-button :loading="logsLoading" @click="exportLogs" style="width: 100%">导出CSV</el-button>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-card>

        <el-card shadow="never" class="admin-card" style="margin-top: 12px">
          <div class="admin-table-wrap">
            <el-table :data="logsPage.items" border height="560" table-layout="fixed" v-loading="logsLoading">
              <el-table-column prop="id" label="ID" width="90" />
              <el-table-column prop="createdAt" label="时间" min-width="170" show-overflow-tooltip />
              <el-table-column prop="actorId" label="操作人" width="110" />
              <el-table-column prop="targetUserId" label="目标用户" width="110" />
              <el-table-column prop="actionType" label="类型" width="130">
                <template #default="{ row }">{{ formatAction(row.actionType) }}</template>
              </el-table-column>
              <el-table-column prop="ip" label="IP" width="140" show-overflow-tooltip />
              <el-table-column prop="detail" label="内容" min-width="220" show-overflow-tooltip />
              <el-table-column prop="diffJson" label="Diff" min-width="240" show-overflow-tooltip />
            </el-table>
          </div>

          <div class="admin-pager">
            <div class="admin-pager-left">
              <span>共 {{ logsPage.total }} 条</span>
              <el-select v-model="logQuery.size" size="small" style="width: 120px" @change="applyLogQuery">
                <el-option :value="20" label="20/页" />
                <el-option :value="50" label="50/页" />
                <el-option :value="100" label="100/页" />
                <el-option :value="200" label="200/页" />
              </el-select>
            </div>
            <div class="admin-pager-right">
              <el-button size="small" @click="logPrevPage" :disabled="logQuery.page <= 1">上一页</el-button>
              <span class="admin-page-no">{{ logQuery.page }} / {{ logTotalPages }}</span>
              <el-button size="small" @click="logNextPage" :disabled="logQuery.page >= logTotalPages">下一页</el-button>
            </div>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="editDialogVisible" title="修改用户信息" :width="isMobile ? '94%' : '520px'" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="账号">
          <el-input v-model="editForm.account" placeholder="登录账号" />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="editForm.nickname" placeholder="昵称" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="editForm.reason" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="usersLoading" @click="submitEdit">确认修改</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resetPwdDialogVisible" title="重置密码（生成临时密码）" :width="isMobile ? '94%' : '520px'" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="原因">
          <el-input v-model="resetForm.reason" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetPwdDialogVisible = false">取消</el-button>
        <el-button type="warning" :loading="usersLoading" @click="submitResetPwd">确认重置</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="banDialogVisible" title="封禁用户" :width="isMobile ? '94%' : '520px'" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="封禁原因">
          <el-input v-model="banForm.reason" placeholder="可选" />
        </el-form-item>
        <el-form-item label="时长(秒)">
          <el-input v-model="banForm.durationSeconds" placeholder="留空=永久" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="banDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="usersLoading" @click="submitBan">确认封禁</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="bansDrawerVisible" title="封禁记录" :size="isMobile ? '96%' : '70%'" :with-header="true">
      <el-card shadow="never" class="admin-card" style="margin-bottom: 12px">
        <el-form label-width="80px" @submit.prevent>
          <el-row :gutter="12">
            <el-col :xs="24" :sm="12" :md="8" :lg="6">
              <el-form-item label="状态">
                <el-select v-model="bansQuery.status" clearable placeholder="全部">
                  <el-option label="生效中" value="ACTIVE" />
                  <el-option label="已到期" value="EXPIRED" />
                  <el-option label="已撤销" value="REVOKED" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8" :lg="4">
              <el-form-item label=" " label-width="0px">
                <el-button type="primary" :loading="bansLoading" @click="loadBans" style="width: 100%">查询</el-button>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </el-card>

      <div class="admin-table-wrap">
        <el-table :data="bansPage.items" border height="520" table-layout="fixed" v-loading="bansLoading">
          <el-table-column prop="id" label="记录ID" width="100" />
          <el-table-column prop="targetType" label="类型" width="90" />
          <el-table-column prop="targetValue" label="目标值" min-width="180" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="110" />
          <el-table-column prop="effectiveAt" label="生效时间" min-width="170" show-overflow-tooltip />
          <el-table-column prop="expiresAt" label="到期时间" min-width="170" show-overflow-tooltip />
          <el-table-column prop="reason" label="原因" min-width="220" show-overflow-tooltip />
        </el-table>
      </div>

      <div class="admin-pager" style="margin-top: 12px">
        <div class="admin-pager-left">
          <span>共 {{ bansPage.total }} 条</span>
        </div>
        <div class="admin-pager-right">
          <el-button size="small" @click="bansPrevPage" :disabled="bansQuery.page <= 1">上一页</el-button>
          <span class="admin-page-no">
            {{ bansQuery.page }} / {{ Math.max(1, Math.ceil(bansPage.total / bansPage.size)) }}
          </span>
          <el-button
            size="small"
            @click="bansNextPage"
            :disabled="bansQuery.page >= Math.max(1, Math.ceil(bansPage.total / bansPage.size))"
          >
            下一页
          </el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>
