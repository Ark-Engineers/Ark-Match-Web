<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { request } from '@/api'

type ApiResponse<T> = { code: number; message: string; data: T }
type PageResponse<T> = { total: number; page: number; size: number; items: T[] }

type UserItem = {
  userId: number
  account: string
  nickname: string
  email: string
  role: string
  status: string
  createdAt: string
}

type AdminRoleOperationLog = {
  id: number
  actorId: number | null
  actorRole: string
  targetUserId: number
  actionType: string
  fromRole: string
  toRole: string
  createdAt: string
}

const router = useRouter()

const loading = ref(false)
const error = ref('')

const userQuery = reactive({
  keyword: '',
  role: 'USER',
  page: 1,
  size: 20,
})

const logQuery = reactive({
  targetUserId: '',
  actorId: '',
  actionType: '',
  fromTime: '',
  toTime: '',
  page: 1,
  size: 20,
})

const userPage = ref<PageResponse<UserItem>>({ total: 0, page: 1, size: 20, items: [] })
const logPage = ref<PageResponse<AdminRoleOperationLog>>({ total: 0, page: 1, size: 20, items: [] })

const userTotalPages = computed(() => Math.max(1, Math.ceil(userPage.value.total / userPage.value.size)))
const logTotalPages = computed(() => Math.max(1, Math.ceil(logPage.value.total / logPage.value.size)))

function resolveErrorMessage(err: unknown): string {
  const anyErr = err as any
  const msgFromApi = anyErr?.response?.data?.message
  if (typeof msgFromApi === 'string' && msgFromApi.trim()) return msgFromApi
  if (typeof anyErr?.message === 'string' && anyErr.message.trim()) return anyErr.message
  return '操作失败，请稍后重试'
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

function formatRole(role: string): string {
  const s = String(role || '').toUpperCase()
  if (s === 'USER') return '普通用户'
  if (s === 'ADMIN') return '管理员'
  if (s === 'SUPER_ADMIN') return '超级管理员'
  return role
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
  if (s === 'GRANT_ADMIN') return '授权管理员'
  if (s === 'REVOKE_ADMIN') return '撤销管理员'
  return actionType
}

async function loadUsers(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<PageResponse<UserItem>>>({
      url: '/admin/permission/users',
      method: 'GET',
      params: {
        keyword: userQuery.keyword.trim() || undefined,
        role: userQuery.role || undefined,
        page: userQuery.page,
        size: userQuery.size,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '查询失败'
      return
    }
    userPage.value = res.data
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function loadLogs(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<PageResponse<AdminRoleOperationLog>>>({
      url: '/admin/permission/logs',
      method: 'GET',
      params: {
        targetUserId: toOptionalNumber(logQuery.targetUserId),
        actorId: toOptionalNumber(logQuery.actorId),
        actionType: logQuery.actionType || undefined,
        fromTime: toOptionalIsoLocalDateTime(logQuery.fromTime),
        toTime: toOptionalIsoLocalDateTime(logQuery.toTime),
        page: logQuery.page,
        size: logQuery.size,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '查询失败'
      return
    }
    logPage.value = res.data
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function grantAdmin(userId: number): Promise<void> {
  const ok = window.confirm(`确认将用户 ${userId} 授权为管理员吗？`)
  if (!ok) return
  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<null>>({
      url: '/admin/permission/grant-admin',
      method: 'POST',
      data: { userId, confirm: true },
    })
    if (res.code !== 0) {
      error.value = res.message || '授权失败'
      return
    }
    await loadUsers()
    await loadLogs()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function revokeAdmin(userId: number): Promise<void> {
  const ok = window.confirm(`确认撤销用户 ${userId} 的管理员权限吗？`)
  if (!ok) return
  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<null>>({
      url: '/admin/permission/revoke-admin',
      method: 'POST',
      data: { userId, confirm: true },
    })
    if (res.code !== 0) {
      error.value = res.message || '撤销失败'
      return
    }
    await loadUsers()
    await loadLogs()
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function applyUserQuery(): Promise<void> {
  userQuery.page = 1
  await loadUsers()
}

async function userPrevPage(): Promise<void> {
  userQuery.page = Math.max(1, userQuery.page - 1)
  await loadUsers()
}

async function userNextPage(): Promise<void> {
  userQuery.page = Math.min(userTotalPages.value, userQuery.page + 1)
  await loadUsers()
}

async function applyLogQuery(): Promise<void> {
  logQuery.page = 1
  await loadLogs()
}

async function logPrevPage(): Promise<void> {
  logQuery.page = Math.max(1, logQuery.page - 1)
  await loadLogs()
}

async function logNextPage(): Promise<void> {
  logQuery.page = Math.min(logTotalPages.value, logQuery.page + 1)
  await loadLogs()
}

onMounted(async () => {
  await loadUsers()
  await loadLogs()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-header">
      <div>
        <div class="admin-title">权限管理</div>
      </div>
      <div class="admin-header-actions">
        <el-button type="primary" plain @click="router.push('/admin/dashboard')">返回</el-button>
      </div>
    </div>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" style="margin-bottom: 12px" />

    <el-tabs class="admin-tabs">
      <el-tab-pane label="用户列表">
        <el-card shadow="never" class="admin-card">
          <el-form label-width="80px" class="admin-query-form" @submit.prevent>
            <el-row :gutter="12">
              <el-col :xs="24" :sm="12" :md="8" :lg="6">
                <el-form-item label="关键词">
                  <el-input v-model.trim="userQuery.keyword" clearable placeholder="账号/昵称/邮箱/用户ID" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :md="8" :lg="6">
                <el-form-item label="角色">
                  <el-select v-model="userQuery.role" style="width: 100%">
                    <el-option label="普通用户" value="USER" />
                    <el-option label="管理员" value="ADMIN" />
                    <el-option label="超级管理员" value="SUPER_ADMIN" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :md="8" :lg="4">
                <el-form-item label="每页">
                  <el-select v-model.number="userQuery.size" style="width: 100%">
                    <el-option :value="10" label="10" />
                    <el-option :value="20" label="20" />
                    <el-option :value="50" label="50" />
                    <el-option :value="100" label="100" />
                    <el-option :value="200" label="200" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :md="8" :lg="4">
                <el-form-item label=" " label-width="0px">
                  <el-button type="primary" :loading="loading" @click="applyUserQuery" style="width: 100%">查询</el-button>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-card>

        <el-card shadow="never" class="admin-card" style="margin-top: 12px">
          <div class="admin-table-wrap">
            <el-table :data="userPage.items" border height="540" table-layout="fixed" v-loading="loading">
              <el-table-column prop="userId" label="用户ID" width="90" />
              <el-table-column prop="account" label="账号" min-width="140" show-overflow-tooltip />
              <el-table-column prop="nickname" label="昵称" min-width="140" show-overflow-tooltip />
              <el-table-column prop="email" label="邮箱" min-width="200" show-overflow-tooltip />
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
                    {{ formatUserStatus(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="190" fixed="right">
                <template #default="{ row }">
                  <div class="admin-row-actions">
                    <el-button
                      v-if="String(row.role || '').toUpperCase() === 'USER'"
                      size="small"
                      type="primary"
                      plain
                      :loading="loading"
                      @click="grantAdmin(row.userId)"
                    >
                      授权管理员
                    </el-button>
                    <el-button
                      v-else-if="String(row.role || '').toUpperCase() === 'ADMIN'"
                      size="small"
                      type="warning"
                      plain
                      :loading="loading"
                      @click="revokeAdmin(row.userId)"
                    >
                      撤销管理员
                    </el-button>
                    <span v-else style="opacity: 0.7">-</span>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="admin-pager">
            <div class="admin-pager-left">
              <span>共 {{ userPage.total }} 条</span>
            </div>
            <div class="admin-pager-right">
              <el-button size="small" @click="userPrevPage" :disabled="loading || userQuery.page <= 1">上一页</el-button>
              <span class="admin-page-no">{{ userQuery.page }} / {{ userTotalPages }}</span>
              <el-button size="small" @click="userNextPage" :disabled="loading || userQuery.page >= userTotalPages">下一页</el-button>
            </div>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="授权日志">
        <el-card shadow="never" class="admin-card">
          <el-form label-width="90px" class="admin-query-form" @submit.prevent>
            <el-row :gutter="12">
              <el-col :xs="24" :sm="12" :md="8" :lg="6">
                <el-form-item label="目标用户ID">
                  <el-input v-model.trim="logQuery.targetUserId" clearable placeholder="targetUserId（可空）" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :md="8" :lg="6">
                <el-form-item label="操作人ID">
                  <el-input v-model.trim="logQuery.actorId" clearable placeholder="actorId（可空）" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :md="8" :lg="6">
                <el-form-item label="动作">
                  <el-select v-model="logQuery.actionType" clearable placeholder="全部" style="width: 100%">
                    <el-option label="授权管理员" value="GRANT_ADMIN" />
                    <el-option label="撤销管理员" value="REVOKE_ADMIN" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :md="8" :lg="6">
                <el-form-item label="起始时间">
                  <el-input v-model.trim="logQuery.fromTime" clearable placeholder="2026-05-22T10:00" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :md="8" :lg="6">
                <el-form-item label="结束时间">
                  <el-input v-model.trim="logQuery.toTime" clearable placeholder="2026-05-22T23:59" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :md="8" :lg="4">
                <el-form-item label=" " label-width="0px">
                  <el-button type="primary" :loading="loading" @click="applyLogQuery" style="width: 100%">查询</el-button>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-card>

        <el-card shadow="never" class="admin-card" style="margin-top: 12px">
          <div class="admin-table-wrap">
            <el-table :data="logPage.items" border height="560" table-layout="fixed" v-loading="loading">
              <el-table-column prop="createdAt" label="时间" min-width="170" show-overflow-tooltip />
              <el-table-column prop="actionType" label="动作" width="140">
                <template #default="{ row }">{{ formatActionType(row.actionType) }}</template>
              </el-table-column>
              <el-table-column prop="actorId" label="操作人ID" width="110" />
              <el-table-column prop="actorRole" label="操作人角色" width="140">
                <template #default="{ row }">{{ formatRole(row.actorRole) }}</template>
              </el-table-column>
              <el-table-column prop="targetUserId" label="目标用户ID" width="120" />
              <el-table-column label="角色变化" min-width="200" show-overflow-tooltip>
                <template #default="{ row }">{{ formatRole(row.fromRole) }} -> {{ formatRole(row.toRole) }}</template>
              </el-table-column>
            </el-table>
          </div>

          <div class="admin-pager">
            <div class="admin-pager-left">
              <span>共 {{ logPage.total }} 条</span>
            </div>
            <div class="admin-pager-right">
              <el-button size="small" @click="logPrevPage" :disabled="loading || logQuery.page <= 1">上一页</el-button>
              <span class="admin-page-no">{{ logQuery.page }} / {{ logTotalPages }}</span>
              <el-button size="small" @click="logNextPage" :disabled="loading || logQuery.page >= logTotalPages">下一页</el-button>
            </div>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>
