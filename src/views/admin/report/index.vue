<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api'

type ApiResponse<T> = { code: number; message: string; data: T }
type PageResponse<T> = { total: number; page: number; size: number; items: T[] }

interface UserSummary {
  userId: number
  account: string
  nickname: string
  email: string
  status: string
}

interface ReportRecord {
  id: number
  reporterUserId: number
  reportedUserId: number
  reportType: string
  content: string
  roomId: string | null
  chatMessageId: number | null
  status: string
  handledBy: number | null
  handledAt: string | null
  actionTaken: string | null
  actionDetail: string | null
  createdAt: string
}

interface ReportItem {
  report: ReportRecord
  reporter: UserSummary
  reported: UserSummary
}

interface ReportDetail {
  report: ReportRecord
  reporter: UserSummary
  reported: UserSummary
  reportedProfile: {
    userId: number
    signature: string | null
    featuredRole: string | null
    gender: string | null
    regionIp: string | null
  } | null
}

const loading = ref(false)
const pageData = ref<PageResponse<ReportItem> | null>(null)
const query = reactive({
  page: 1,
  size: 20,
  status: '' as string,
  reportType: '' as string,
  keyword: '',
})

const detailVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref<ReportDetail | null>(null)

const handleDialogVisible = ref(false)
const handling = ref(false)
const handleForm = reactive({
  resetNickname: false,
  resetSignature: false,
  banUser: false,
  banIp: false,
  banDurationSeconds: null as number | null,
  banReason: '',
  dismiss: false,
})

const isMobile = ref(false)

function updateResponsiveState(): void {
  isMobile.value = window.innerWidth < 1024
}

function resolveErrorMessage(err: any): string {
  return String(err?.response?.data?.message || err?.message || '操作失败')
}

function formatType(t: string): string {
  switch (t) {
    case 'NICKNAME': return '昵称'
    case 'SIGNATURE': return '签名'
    case 'CHAT': return '聊天记录'
    default: return t
  }
}

function formatStatus(s: string): string {
  switch (s) {
    case 'PENDING': return '待处理'
    case 'HANDLED': return '已处理'
    case 'DISMISSED': return '已驳回'
    default: return s
  }
}

function statusTagType(s: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  switch (s) {
    case 'PENDING': return 'warning'
    case 'HANDLED': return 'success'
    case 'DISMISSED': return 'info'
    default: return ''
  }
}

function formatAction(action: string | null): string {
  if (!action) return '-'
  const map: Record<string, string> = {
    RESET_NICKNAME: '重置昵称',
    RESET_SIGNATURE: '重置签名',
    BAN_USER: '封禁账号',
    BAN_IP: '封禁IP',
    DISMISSED: '驳回',
  }
  return action.split(',').map(a => map[a] || a).join('、')
}

function formatTime(t: string | null): string {
  if (!t) return '-'
  const d = new Date(t)
  if (isNaN(d.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function loadList(): Promise<void> {
  loading.value = true
  try {
    const params: Record<string, any> = { page: query.page, size: query.size }
    if (query.status) params.status = query.status
    if (query.reportType) params.reportType = query.reportType
    if (query.keyword) params.keyword = query.keyword
    const res = await request<ApiResponse<PageResponse<ReportItem>>>({
      url: '/admin/report/list',
      method: 'GET',
      params,
    })
    if (res.code !== 0) {
      ElMessage.error(res.message)
      return
    }
    pageData.value = res.data
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    loading.value = false
  }
}

async function viewDetail(id: number): Promise<void> {
  detailVisible.value = true
  detailLoading.value = true
  detailData.value = null
  try {
    const res = await request<ApiResponse<ReportDetail>>({
      url: `/admin/report/${id}`,
      method: 'GET',
    })
    if (res.code !== 0) {
      ElMessage.error(res.message)
      return
    }
    detailData.value = res.data
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    detailLoading.value = false
  }
}

function openHandleDialog(): void {
  handleForm.resetNickname = false
  handleForm.resetSignature = false
  handleForm.banUser = false
  handleForm.banIp = false
  handleForm.banDurationSeconds = null
  handleForm.banReason = ''
  handleForm.dismiss = false
  handleDialogVisible.value = true
}

async function submitHandle(): Promise<void> {
  if (!detailData.value) return
  const hasAction = handleForm.resetNickname || handleForm.resetSignature || handleForm.banUser || handleForm.banIp || handleForm.dismiss
  if (!hasAction) {
    ElMessage.warning('请至少选择一项处理操作')
    return
  }

  try {
    await ElMessageBox.confirm('确认执行此处理操作？', '二次确认', {
      confirmButtonText: '确认执行',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  handling.value = true
  try {
    const res = await request<ApiResponse<void>>({
      url: `/admin/report/${detailData.value.report.id}/handle`,
      method: 'POST',
      data: {
        resetNickname: handleForm.resetNickname,
        resetSignature: handleForm.resetSignature,
        banUser: handleForm.banUser,
        banIp: handleForm.banIp,
        banDurationSeconds: handleForm.banDurationSeconds,
        banReason: handleForm.banReason || undefined,
        dismiss: handleForm.dismiss,
      },
    })
    if (res.code !== 0) {
      ElMessage.error(res.message)
      return
    }
    ElMessage.success('处理成功')
    handleDialogVisible.value = false
    detailVisible.value = false
    await loadList()
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    handling.value = false
  }
}

function handlePageChange(p: number): void {
  query.page = p
  void loadList()
}

const totalPages = computed(() => {
  if (!pageData.value) return 0
  return Math.ceil(pageData.value.total / pageData.value.size)
})

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
        <div class="admin-title">举报管理</div>
        <div class="admin-subtitle">查看和处理用户举报</div>
      </div>
    </div>

    <el-card shadow="never" class="admin-card admin-animate-in" body-style="padding: 16px" style="--delay: 60ms">
      <div class="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label class="block text-xs text-gray-500 mb-1">状态</label>
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 120px" @change="() => { query.page = 1; loadList() }">
            <el-option label="待处理" value="PENDING" />
            <el-option label="已处理" value="HANDLED" />
            <el-option label="已驳回" value="DISMISSED" />
          </el-select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">类型</label>
          <el-select v-model="query.reportType" clearable placeholder="全部" style="width: 120px" @change="() => { query.page = 1; loadList() }">
            <el-option label="昵称" value="NICKNAME" />
            <el-option label="签名" value="SIGNATURE" />
            <el-option label="聊天记录" value="CHAT" />
          </el-select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">关键词</label>
          <el-input v-model="query.keyword" clearable placeholder="搜索举报内容" style="width: 200px" @clear="() => { query.page = 1; loadList() }" @keydown.enter="() => { query.page = 1; loadList() }" />
        </div>
        <el-button type="primary" @click="() => { query.page = 1; loadList() }">搜索</el-button>
      </div>

      <el-table v-loading="loading" :data="pageData?.items || []" stripe style="width: 100%" :header-cell-style="{ background: '#f8fafc', color: '#334155', fontWeight: 600 }">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ formatType(row.report.reportType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="举报内容" min-width="200">
          <template #default="{ row }">
            <span class="text-sm truncate block max-w-[300px]">{{ row.report.content }}</span>
          </template>
        </el-table-column>
        <el-table-column label="举报人" width="100" align="center">
          <template #default="{ row }">
            <span class="text-sm">{{ row.reporter?.nickname || row.reporter?.account || row.report.reporterUserId }}</span>
          </template>
        </el-table-column>
        <el-table-column label="被举报人" width="100" align="center">
          <template #default="{ row }">
            <span class="text-sm">{{ row.reported?.nickname || row.reported?.account || row.report.reportedUserId }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.report.status)" size="small" effect="light">{{ formatStatus(row.report.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="处理动作" width="120" align="center">
          <template #default="{ row }">
            <span class="text-xs text-gray-500">{{ formatAction(row.report.actionTaken) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="举报时间" width="150">
          <template #default="{ row }">
            <span class="text-xs text-gray-500">{{ formatTime(row.report.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" text @click="viewDetail(row.report.id)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="pageData && pageData.total > pageData.size" class="flex justify-center mt-4">
        <el-pagination
          :current-page="query.page"
          :page-size="query.size"
          :total="pageData.total"
          layout="prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>

      <div v-if="!loading && (!pageData || pageData.items.length === 0)" class="admin-empty">
        <div class="admin-empty-text">暂无举报记录</div>
      </div>
    </el-card>

    <el-drawer v-model="detailVisible" title="举报详情" size="480px" :close-on-click-modal="true">
      <div v-if="detailLoading" class="flex justify-center py-8">
        <el-icon class="is-loading text-2xl"><svg viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="400" fill="none" stroke="currentColor" stroke-width="80" stroke-dasharray="600 200" /></svg></el-icon>
      </div>
      <div v-else-if="detailData" class="space-y-4">
        <div class="rounded-lg border border-gray-200 p-3">
          <div class="text-xs text-gray-500 mb-2">举报信息</div>
          <div class="space-y-1.5 text-sm">
            <div><span class="text-gray-500">类型：</span>{{ formatType(detailData.report.reportType) }}</div>
            <div><span class="text-gray-500">内容：</span><span class="break-all">{{ detailData.report.content }}</span></div>
            <div v-if="detailData.report.roomId"><span class="text-gray-500">房间：</span>{{ detailData.report.roomId }}</div>
            <div><span class="text-gray-500">状态：</span><el-tag :type="statusTagType(detailData.report.status)" size="small">{{ formatStatus(detailData.report.status) }}</el-tag></div>
            <div><span class="text-gray-500">时间：</span>{{ formatTime(detailData.report.createdAt) }}</div>
            <div v-if="detailData.report.actionTaken"><span class="text-gray-500">处理动作：</span>{{ formatAction(detailData.report.actionTaken) }}</div>
          </div>
        </div>

        <div class="rounded-lg border border-gray-200 p-3">
          <div class="text-xs text-gray-500 mb-2">举报人</div>
          <div class="space-y-1.5 text-sm">
            <div><span class="text-gray-500">ID：</span>{{ detailData.reporter?.userId }}</div>
            <div><span class="text-gray-500">账号：</span>{{ detailData.reporter?.account || '-' }}</div>
            <div><span class="text-gray-500">昵称：</span>{{ detailData.reporter?.nickname || '-' }}</div>
          </div>
        </div>

        <div class="rounded-lg border border-gray-200 p-3">
          <div class="text-xs text-gray-500 mb-2">被举报人</div>
          <div class="space-y-1.5 text-sm">
            <div><span class="text-gray-500">ID：</span>{{ detailData.reported?.userId }}</div>
            <div><span class="text-gray-500">账号：</span>{{ detailData.reported?.account || '-' }}</div>
            <div><span class="text-gray-500">昵称：</span>{{ detailData.reported?.nickname || '-' }}</div>
            <div><span class="text-gray-500">邮箱：</span>{{ detailData.reported?.email || '-' }}</div>
            <div><span class="text-gray-500">状态：</span>{{ detailData.reported?.status || '-' }}</div>
            <div v-if="detailData.reportedProfile?.signature"><span class="text-gray-500">签名：</span>{{ detailData.reportedProfile.signature }}</div>
          </div>
        </div>

        <div v-if="detailData.report.status === 'PENDING'" class="pt-2">
          <el-button type="primary" @click="openHandleDialog">处理举报</el-button>
        </div>
      </div>
    </el-drawer>

    <el-dialog v-model="handleDialogVisible" title="处理举报" width="480px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item>
          <el-checkbox v-model="handleForm.resetNickname">重置昵称为「违规昵称」</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="handleForm.resetSignature">重置签名为「违规签名」</el-checkbox>
        </el-form-item>
        <el-divider />
        <el-form-item>
          <el-checkbox v-model="handleForm.banUser">封禁账号</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="handleForm.banIp">封禁IP</el-checkbox>
        </el-form-item>
        <el-form-item v-if="handleForm.banUser || handleForm.banIp" label="封禁时长">
          <el-select v-model="handleForm.banDurationSeconds" clearable placeholder="永久" style="width: 100%">
            <el-option label="1 天" :value="86400" />
            <el-option label="7 天" :value="604800" />
            <el-option label="30 天" :value="2592000" />
            <el-option label="永久" :value="null" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="handleForm.banUser || handleForm.banIp" label="封禁原因">
          <el-input v-model="handleForm.banReason" placeholder="可选，留空使用默认原因" />
        </el-form-item>
        <el-divider />
        <el-form-item>
          <el-checkbox v-model="handleForm.dismiss">驳回举报（不做任何处理）</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="handleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="handling" @click="submitHandle">确认处理</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-page {
  max-width: 1100px;
  margin: 0 auto;
}

.admin-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}

.admin-title {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}

.admin-subtitle {
  font-size: 13px;
  color: #64748b;
  margin-top: 4px;
}

.admin-card {
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  overflow: hidden;
}

.admin-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
}

.admin-empty-text {
  font-size: 14px;
  color: #94a3b8;
}

.admin-animate-in {
  animation: adminFadeSlideIn 380ms ease both;
  animation-delay: var(--delay, 0ms);
}

@keyframes adminFadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .admin-animate-in {
    animation: none;
  }
}

@media (max-width: 1023px) {
  .admin-page-header {
    flex-direction: column;
  }
}
</style>
