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
  <main style="padding: 16px; max-width: 1100px; margin: 0 auto">
    <header style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap">
      <div>
        <div style="font-size: 20px; font-weight: 700">权限管理（仅超级管理员）</div>
        <div style="opacity: 0.75">/admin/permission</div>
      </div>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: flex-end">
        <button @click="router.push('/admin/dashboard')" style="padding: 10px 12px">返回</button>
      </div>
    </header>

    <p v-if="error" style="margin-top: 12px; color: #c00">{{ error }}</p>

    <section style="margin-top: 16px; border: 1px solid #eee; border-radius: 8px; padding: 12px">
      <h2 style="margin: 0 0 12px; font-size: 16px">用户列表</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: flex-end">
        <label style="display: grid; gap: 6px">
          <span>关键词</span>
          <input v-model.trim="userQuery.keyword" placeholder="账号/手机号/昵称/邮箱/用户ID" />
        </label>
        <label style="display: grid; gap: 6px">
          <span>角色</span>
          <select v-model="userQuery.role">
            <option value="USER">普通用户</option>
            <option value="ADMIN">管理员</option>
            <option value="SUPER_ADMIN">超级管理员</option>
          </select>
        </label>
        <label style="display: grid; gap: 6px">
          <span>每页数量</span>
          <select v-model.number="userQuery.size">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
        </label>
        <div style="display: flex; gap: 10px; flex-wrap: wrap">
          <button @click="applyUserQuery" :disabled="loading" style="padding: 10px 12px">
            {{ loading ? '加载中...' : '查询' }}
          </button>
        </div>
      </div>

      <div style="margin-top: 12px; overflow-x: hidden">
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed">
          <thead>
            <tr>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px; width: 90px">用户ID</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px; width: 140px">账号/手机号</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px; width: 140px">昵称</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">邮箱</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px; width: 110px">角色</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px; width: 90px">状态</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px; width: 170px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in userPage.items" :key="u.userId">
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ u.userId }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3; word-break: break-all">{{ u.account }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3; word-break: break-all">{{ u.nickname }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3; word-break: break-all">{{ u.email }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ formatRole(u.role) }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ formatUserStatus(u.status) }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">
                <div style="display: flex; gap: 8px; flex-wrap: wrap">
                  <button v-if="String(u.role || '').toUpperCase() === 'USER'" @click="grantAdmin(u.userId)" :disabled="loading" style="padding: 6px 8px">
                    授权为管理员
                  </button>
                  <button v-else-if="String(u.role || '').toUpperCase() === 'ADMIN'" @click="revokeAdmin(u.userId)" :disabled="loading" style="padding: 6px 8px">
                    撤销管理员
                  </button>
                  <span v-else style="opacity: 0.7">-</span>
                </div>
              </td>
            </tr>
            <tr v-if="!userPage.items.length">
              <td colspan="7" style="padding: 12px; opacity: 0.7">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap">
        <div style="opacity: 0.75">共 {{ userPage.total }} 条</div>
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap">
          <button @click="userPrevPage" :disabled="loading || userQuery.page <= 1" style="padding: 8px 10px">上一页</button>
          <div>第 {{ userQuery.page }} / {{ userTotalPages }} 页</div>
          <button @click="userNextPage" :disabled="loading || userQuery.page >= userTotalPages" style="padding: 8px 10px">下一页</button>
        </div>
      </div>
    </section>

    <section style="margin-top: 16px; border: 1px solid #eee; border-radius: 8px; padding: 12px">
      <h2 style="margin: 0 0 12px; font-size: 16px">授权操作日志</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: flex-end">
        <label style="display: grid; gap: 6px">
          <span>被操作用户ID</span>
          <input v-model.trim="logQuery.targetUserId" placeholder="targetUserId（可空）" />
        </label>
        <label style="display: grid; gap: 6px">
          <span>操作人ID</span>
          <input v-model.trim="logQuery.actorId" placeholder="actorId（可空）" />
        </label>
        <label style="display: grid; gap: 6px">
          <span>动作</span>
          <select v-model="logQuery.actionType">
            <option value="">全部</option>
            <option value="GRANT_ADMIN">授权管理员</option>
            <option value="REVOKE_ADMIN">撤销管理员</option>
          </select>
        </label>
        <label style="display: grid; gap: 6px">
          <span>起始时间</span>
          <input v-model.trim="logQuery.fromTime" placeholder="2026-05-22T10:00" />
        </label>
        <label style="display: grid; gap: 6px">
          <span>结束时间</span>
          <input v-model.trim="logQuery.toTime" placeholder="2026-05-22T23:59" />
        </label>
        <div style="display: flex; gap: 10px; flex-wrap: wrap">
          <button @click="applyLogQuery" :disabled="loading" style="padding: 10px 12px">
            {{ loading ? '加载中...' : '查询' }}
          </button>
        </div>
      </div>

      <div style="margin-top: 12px; overflow-x: hidden">
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed">
          <thead>
            <tr>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px; width: 160px">时间</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px; width: 120px">动作</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px; width: 100px">操作人ID</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px; width: 120px">操作人角色</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px; width: 120px">被操作用户ID</th>
              <th style="text-align: left; border-bottom: 1px solid #eee; padding: 8px">角色变化</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in logPage.items" :key="l.id">
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ l.createdAt }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ formatActionType(l.actionType) }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ l.actorId ?? 'SYSTEM' }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ formatRole(l.actorRole) }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">{{ l.targetUserId }}</td>
              <td style="padding: 8px; border-bottom: 1px solid #f3f3f3">
                {{ formatRole(l.fromRole) }} -> {{ formatRole(l.toRole) }}
              </td>
            </tr>
            <tr v-if="!logPage.items.length">
              <td colspan="6" style="padding: 12px; opacity: 0.7">暂无日志</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap">
        <div style="opacity: 0.75">共 {{ logPage.total }} 条</div>
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap">
          <button @click="logPrevPage" :disabled="loading || logQuery.page <= 1" style="padding: 8px 10px">上一页</button>
          <div>第 {{ logQuery.page }} / {{ logTotalPages }} 页</div>
          <button @click="logNextPage" :disabled="loading || logQuery.page >= logTotalPages" style="padding: 8px 10px">下一页</button>
        </div>
      </div>
    </section>
  </main>
</template>

