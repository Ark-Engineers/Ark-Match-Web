<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import { http, request } from '@/api'

type ApiResponse<T> = { code: number; message: string; data: T }

type NoticeItem = {
  id: number
  title: string
  content: string
  level: 'NORMAL' | 'IMPORTANT' | string
  status: 'DRAFT' | 'PUBLISHED' | 'OFFLINE' | string
  pinned: boolean
  publishAt: string | null
  expireAt: string | null
  createdBy: number
  updatedBy: number
  createdAt: string
  updatedAt: string
}

type PageResponse<T> = { total: number; page: number; size: number; items: T[] }

type NoticeLog = {
  id: number
  noticeId: number
  actorId: number | null
  actorRole: string | null
  actionType: string
  ip: string | null
  detail: string | null
  createdAt: string
}

const isMobile = ref(false)
const router = useRouter()

function updateResponsiveState(): void {
  isMobile.value = window.innerWidth < 1024
}

const loading = ref(false)
const error = ref('')

const query = reactive({
  keyword: '',
  status: '',
  level: '',
  pinned: '' as '' | '1' | '0',
  publishRange: [] as string[],
  page: 1,
  size: 20,
})

const pageData = ref<PageResponse<NoticeItem>>({ total: 0, page: 1, size: 20, items: [] })

const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const form = reactive({
  id: 0,
  title: '',
  content: '',
  level: 'NORMAL' as 'NORMAL' | 'IMPORTANT',
  pinned: false,
  expireAt: '' as string | '',
})

const previewVisible = ref(false)
const previewItem = ref<NoticeItem | null>(null)

const logVisible = ref(false)
const logLoading = ref(false)
const logQuery = reactive({
  noticeId: 0,
  page: 1,
  size: 20,
})
const logData = ref<PageResponse<NoticeLog>>({ total: 0, page: 1, size: 20, items: [] })

const paginationLayout = computed(() => {
  if (isMobile.value) return 'prev, pager, next'
  return 'total, sizes, prev, pager, next, jumper'
})

function clearError(): void {
  error.value = ''
}

function normalizeRange(v: string[] | undefined): { from?: string; to?: string } {
  if (!v || v.length < 2) return {}
  const [from, to] = v
  return { from, to }
}

async function loadList(): Promise<void> {
  loading.value = true
  clearError()
  try {
    const { from, to } = normalizeRange(query.publishRange)
    const res = await request<ApiResponse<PageResponse<NoticeItem>>>({
      url: '/admin/notice/list',
      method: 'GET',
      params: {
        keyword: query.keyword.trim() || undefined,
        status: query.status || undefined,
        level: query.level || undefined,
        pinned: query.pinned ? Number(query.pinned) : undefined,
        publishFrom: from || undefined,
        publishTo: to || undefined,
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
    error.value = (e as any)?.message || '查询失败'
  } finally {
    loading.value = false
  }
}

async function applyQuery(): Promise<void> {
  query.page = 1
  await loadList()
}

async function resetQuery(): Promise<void> {
  query.keyword = ''
  query.status = ''
  query.level = ''
  query.pinned = ''
  query.publishRange = []
  query.page = 1
  query.size = 20
  await loadList()
}

function openCreate(): void {
  formMode.value = 'create'
  formVisible.value = true
  form.id = 0
  form.title = ''
  form.content = ''
  form.level = 'NORMAL'
  form.pinned = false
  form.expireAt = ''
}

function openEdit(item: NoticeItem): void {
  formMode.value = 'edit'
  formVisible.value = true
  form.id = item.id
  form.title = item.title
  form.content = item.content
  form.level = (String(item.level).toUpperCase() === 'IMPORTANT' ? 'IMPORTANT' : 'NORMAL') as any
  form.pinned = !!item.pinned
  form.expireAt = item.expireAt ? String(item.expireAt).slice(0, 16) : ''
}

function openPreview(item: NoticeItem): void {
  previewItem.value = item
  previewVisible.value = true
}

async function submitForm(): Promise<void> {
  const title = form.title.trim()
  const content = form.content.trim()
  if (!title) {
    ElMessage.warning('请输入标题')
    return
  }
  if (!content) {
    ElMessage.warning('请输入内容')
    return
  }

  loading.value = true
  clearError()
  try {
    if (formMode.value === 'create') {
      const res = await request<ApiResponse<NoticeItem>>({
        url: '/admin/notice/create',
        method: 'POST',
        data: {
          title,
          content,
          level: form.level,
          pinned: form.pinned,
          expireAt: form.expireAt || null,
        },
      })
      if (res.code !== 0) {
        error.value = res.message || '创建失败'
        return
      }
      ElMessage.success('已创建（草稿）')
    } else {
      const res = await request<ApiResponse<NoticeItem>>({
        url: '/admin/notice/update',
        method: 'POST',
        data: {
          id: form.id,
          title,
          content,
          level: form.level,
          pinned: form.pinned,
          expireAt: form.expireAt || null,
        },
      })
      if (res.code !== 0) {
        error.value = res.message || '更新失败'
        return
      }
      ElMessage.success('已更新')
    }

    formVisible.value = false
    await loadList()
  } catch (e) {
    error.value = (e as any)?.message || '提交失败'
  } finally {
    loading.value = false
  }
}

async function publish(item: NoticeItem): Promise<void> {
  try {
    await ElMessageBox.confirm('确认发布该公告？发布后用户端可见。', '二次确认', {
      confirmButtonText: '发布',
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
    const res = await request<ApiResponse<NoticeItem>>({
      url: '/admin/notice/publish',
      method: 'POST',
      data: { id: item.id },
    })
    if (res.code !== 0) {
      error.value = res.message || '发布失败'
      return
    }
    ElMessage.success('已发布')
    await loadList()
  } catch (e) {
    error.value = (e as any)?.message || '发布失败'
  } finally {
    loading.value = false
  }
}

async function offline(item: NoticeItem): Promise<void> {
  try {
    await ElMessageBox.confirm('确认下线该公告？下线后用户端不可见。', '二次确认', {
      confirmButtonText: '下线',
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
    const res = await request<ApiResponse<NoticeItem>>({
      url: '/admin/notice/offline',
      method: 'POST',
      data: { id: item.id },
    })
    if (res.code !== 0) {
      error.value = res.message || '下线失败'
      return
    }
    ElMessage.success('已下线')
    await loadList()
  } catch (e) {
    error.value = (e as any)?.message || '下线失败'
  } finally {
    loading.value = false
  }
}

async function remove(item: NoticeItem): Promise<void> {
  try {
    await ElMessageBox.confirm('确认删除该公告？删除后不可恢复。', '二次确认', {
      confirmButtonText: '删除',
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
    const res = await request<ApiResponse<null>>({
      url: '/admin/notice/delete',
      method: 'POST',
      data: { id: item.id },
    })
    if (res.code !== 0) {
      error.value = res.message || '删除失败'
      return
    }
    ElMessage.success('已删除')
    await loadList()
  } catch (e) {
    error.value = (e as any)?.message || '删除失败'
  } finally {
    loading.value = false
  }
}

async function openLogs(item: NoticeItem): Promise<void> {
  logVisible.value = true
  logQuery.noticeId = item.id
  logQuery.page = 1
  logQuery.size = 20
  await loadLogs()
}

async function loadLogs(): Promise<void> {
  logLoading.value = true
  try {
    const res = await request<ApiResponse<PageResponse<NoticeLog>>>({
      url: '/admin/notice/logs',
      method: 'GET',
      params: {
        noticeId: logQuery.noticeId,
        page: logQuery.page,
        size: logQuery.size,
      },
    })
    if (res.code !== 0) {
      ElMessage.error(res.message || '查询日志失败')
      return
    }
    logData.value = res.data
  } finally {
    logLoading.value = false
  }
}

async function exportLogs(): Promise<void> {
  const response = await http.request({
    url: '/admin/notice/logs/export',
    method: 'GET',
    responseType: 'blob',
    params: { noticeId: logQuery.noticeId },
  })
  const blob = response.data as Blob
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `notice-${logQuery.noticeId}-logs.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function formatLevel(level: string): string {
  const v = String(level || '').toUpperCase()
  if (v === 'IMPORTANT') return '重要'
  if (v === 'NORMAL') return '普通'
  return level
}

function formatStatus(status: string): string {
  const v = String(status || '').toUpperCase()
  if (v === 'DRAFT') return '草稿'
  if (v === 'PUBLISHED') return '已发布'
  if (v === 'OFFLINE') return '已下线'
  return status
}

onMounted(() => {
  updateResponsiveState()
  window.addEventListener('resize', updateResponsiveState)
  void loadList()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateResponsiveState)
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-header admin-animate-in" style="--delay: 0ms">
      <div>
        <div class="admin-title">公告管理</div>
      </div>
      <div class="admin-header-actions">
        <el-button type="primary" plain @click="router.push('/admin/dashboard')">返回</el-button>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon :closable="true" @close="error = ''" style="margin-bottom: 12px" />

    <el-card shadow="never" class="admin-card admin-animate-in" body-style="padding: 16px" style="--delay: 60ms">
        <el-row :gutter="12" align="middle">
          <el-col :xs="24" :md="10">
            <el-input v-model="query.keyword" placeholder="标题/内容关键词（模糊/全文）" clearable />
          </el-col>
          <el-col :xs="24" :md="14">
            <el-space wrap>
              <el-select v-model="query.status" placeholder="状态" clearable style="width: 120px">
                <el-option label="草稿" value="DRAFT" />
                <el-option label="已发布" value="PUBLISHED" />
                <el-option label="已下线" value="OFFLINE" />
              </el-select>
              <el-select v-model="query.level" placeholder="等级" clearable style="width: 120px">
                <el-option label="普通" value="NORMAL" />
                <el-option label="重要" value="IMPORTANT" />
              </el-select>
              <el-select v-model="query.pinned" placeholder="置顶" clearable style="width: 120px">
                <el-option label="置顶" value="1" />
                <el-option label="不置顶" value="0" />
              </el-select>
              <el-date-picker
                v-model="query.publishRange"
                type="datetimerange"
                value-format="YYYY-MM-DDTHH:mm:ss"
                format="YYYY-MM-DD HH:mm"
                range-separator="至"
                start-placeholder="发布时间从"
                end-placeholder="发布时间到"
                style="width: 320px"
              />
              <el-button type="primary" :loading="loading" @click="applyQuery">查询</el-button>
              <el-button :disabled="loading" @click="resetQuery">重置</el-button>
              <el-button type="primary" plain @click="openCreate">新建公告</el-button>
            </el-space>
          </el-col>
        </el-row>
    </el-card>

    <el-card
      shadow="never"
      class="admin-card admin-animate-in"
      body-style="padding: 0; overflow: hidden"
      style="margin-top: 12px; --delay: 100ms"
    >
      <div class="admin-table-wrap">
        <el-table :data="pageData.items" border table-layout="fixed" :height="isMobile ? undefined : 560" v-loading="loading">
          <el-table-column prop="id" label="ID" width="90" />
          <el-table-column prop="title" label="标题" min-width="260" show-overflow-tooltip />
          <el-table-column label="等级" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="String(row.level).toUpperCase() === 'IMPORTANT' ? 'danger' : 'info'">
                {{ formatLevel(row.level) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="String(row.status).toUpperCase() === 'PUBLISHED' ? 'success' : 'info'"
              >
                {{ formatStatus(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="置顶" width="80">
            <template #default="{ row }">{{ row.pinned ? '是' : '否' }}</template>
          </el-table-column>
          <el-table-column v-if="!isMobile" prop="publishAt" label="发布时间" width="170" show-overflow-tooltip />
          <el-table-column v-if="!isMobile" prop="expireAt" label="过期时间" width="170" show-overflow-tooltip />
          <el-table-column v-if="!isMobile" prop="updatedAt" label="更新时间" width="170" show-overflow-tooltip />
          <el-table-column label="操作" width="340">
            <template #default="{ row }">
              <el-space wrap>
                <el-button size="small" @click="openPreview(row)">查看</el-button>
                <el-button size="small" @click="openEdit(row)">编辑</el-button>
                <el-button
                  v-if="String(row.status).toUpperCase() !== 'PUBLISHED'"
                  size="small"
                  type="success"
                  @click="publish(row)"
                >
                  发布
                </el-button>
                <el-button
                  v-else
                  size="small"
                  type="warning"
                  @click="offline(row)"
                >
                  下线
                </el-button>
                <el-button size="small" @click="openLogs(row)">日志</el-button>
                <el-button size="small" type="danger" plain @click="remove(row)">删除</el-button>
              </el-space>
            </template>
          </el-table-column>
        </el-table>
      </div>

        <div class="admin-pager">
          <div class="admin-pager-left">共 {{ pageData.total }} 条</div>
          <el-pagination
            v-model:current-page="query.page"
            v-model:page-size="query.size"
            :total="pageData.total"
            :page-sizes="[10, 20, 50, 100]"
            :layout="paginationLayout"
            @change="loadList"
          />
        </div>
    </el-card>

    <el-dialog v-model="formVisible" :title="formMode === 'create' ? '新建公告' : '编辑公告'" width="900px">
      <el-form label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="form.title" maxlength="128" show-word-limit />
        </el-form-item>
        <el-form-item label="等级">
          <el-radio-group v-model="form.level">
            <el-radio label="NORMAL">普通</el-radio>
            <el-radio label="IMPORTANT">重要</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="置顶">
          <el-switch v-model="form.pinned" />
        </el-form-item>
        <el-form-item label="过期时间">
          <el-date-picker
            v-model="form.expireAt"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            format="YYYY-MM-DD HH:mm"
            placeholder="不填表示不过期"
            style="width: 100%"
            clearable
          />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="form.content" type="textarea" :rows="12" placeholder="支持纯文本/markdown（按原样展示）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-space>
          <el-button @click="formVisible = false">取消</el-button>
          <el-button type="primary" :loading="loading" @click="submitForm">保存</el-button>
        </el-space>
      </template>
    </el-dialog>

    <el-dialog v-model="previewVisible" title="公告预览" width="900px">
      <el-card v-if="previewItem" shadow="never" body-style="padding: 16px">
        <div style="font-size: 18px; font-weight: 700; margin-bottom: 6px">{{ previewItem.title }}</div>
        <div style="opacity: 0.75; margin-bottom: 12px">
          {{ formatLevel(previewItem.level) }} · {{ formatStatus(previewItem.status) }} ·
          {{ previewItem.publishAt ?? '未发布' }}
        </div>
        <pre style="white-space: pre-wrap; margin: 0; font-family: inherit">{{ previewItem.content }}</pre>
      </el-card>
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="logVisible" title="公告操作日志" width="980px">
      <el-space direction="vertical" :size="10" fill style="width: 100%">
        <el-space wrap>
          <el-button :disabled="logLoading" @click="exportLogs">导出CSV</el-button>
        </el-space>
        <el-table :data="logData.items" border table-layout="fixed" :height="isMobile ? undefined : 420" v-loading="logLoading">
          <el-table-column prop="createdAt" label="时间" width="170" show-overflow-tooltip />
          <el-table-column prop="actionType" label="类型" width="120" />
          <el-table-column prop="actorId" label="操作人ID" width="120">
            <template #default="{ row }">{{ row.actorId ?? '-' }}</template>
          </el-table-column>
          <el-table-column prop="actorRole" label="角色" width="140">
            <template #default="{ row }">{{ row.actorRole ?? '-' }}</template>
          </el-table-column>
          <el-table-column prop="ip" label="IP" width="150" show-overflow-tooltip />
          <el-table-column prop="detail" label="说明" min-width="220" show-overflow-tooltip />
        </el-table>
        <el-pagination
          v-model:current-page="logQuery.page"
          v-model:page-size="logQuery.size"
          :total="logData.total"
          :page-sizes="[10, 20, 50, 100]"
          :layout="paginationLayout"
          @change="loadLogs"
        />
      </el-space>
      <template #footer>
        <el-button @click="logVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>
