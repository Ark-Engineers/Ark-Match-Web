<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api'

type ApiResponse<T> = { code: number; message: string; data: T }
type PageResponse<T> = { total: number; page: number; size: number; items: T[] }

interface ProfanityWord {
  id: number
  word: string
  createdAt: string
}

const isMobile = ref(false)
const loading = ref(false)
const error = ref('')
const pageData = ref<PageResponse<ProfanityWord> | null>(null)
const query = ref({ page: 1, size: 20 })

const addDialogVisible = ref(false)
const adding = ref(false)
const newWord = ref('')

function updateResponsiveState(): void {
  isMobile.value = window.innerWidth < 1024
}

function resolveErrorMessage(err: any): string {
  return String(err?.response?.data?.message || err?.message || '操作失败')
}

function clearError(): void {
  error.value = ''
}

async function loadList(): Promise<void> {
  loading.value = true
  clearError()
  try {
    const res = await request<ApiResponse<PageResponse<ProfanityWord>>>({
      url: '/admin/profanity/list',
      method: 'GET',
      params: { page: query.value.page, size: query.value.size },
    })
    if (res.code !== 0) {
      error.value = res.message
      return
    }
    pageData.value = res.data
  } catch (e: any) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

function openAddDialog(): void {
  newWord.value = ''
  addDialogVisible.value = true
}

async function submitAdd(): Promise<void> {
  const word = newWord.value.trim()
  if (!word) {
    ElMessage.warning('请输入屏蔽词')
    return
  }
  if (word.length > 64) {
    ElMessage.warning('屏蔽词最长64个字符')
    return
  }
  adding.value = true
  try {
    const res = await request<ApiResponse<null>>({
      url: '/admin/profanity',
      method: 'POST',
      data: { word },
    })
    if (res.code !== 0) {
      ElMessage.error(res.message)
      return
    }
    ElMessage.success('已添加')
    addDialogVisible.value = false
    await loadList()
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    adding.value = false
  }
}

async function deleteWord(item: ProfanityWord): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认删除屏蔽词「${item.word}」？`, '二次确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      closeOnClickModal: false,
    })
  } catch {
    return
  }
  loading.value = true
  try {
    const res = await request<ApiResponse<null>>({
      url: `/admin/profanity/${item.id}`,
      method: 'DELETE',
    })
    if (res.code !== 0) {
      ElMessage.error(res.message)
      return
    }
    ElMessage.success('已删除')
    await loadList()
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    loading.value = false
  }
}

function formatTime(s: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const paginationLayout = computed(() => (isMobile.value ? 'total, prev, next' : 'total, sizes, prev, pager, next'))

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
        <div class="admin-title">屏蔽词管理</div>
        <div class="admin-subtitle">管理公屏聊天与个人资料的屏蔽词库</div>
      </div>
      <div class="admin-header-actions">
        <el-button type="primary" @click="openAddDialog">添加屏蔽词</el-button>
      </div>
    </div>

    <el-alert v-if="error" :title="error" type="error" show-icon closable class="admin-animate-in" style="--delay: 30ms; margin-bottom: 16px" @close="clearError" />

    <el-card
      v-loading="loading"
      shadow="never"
      class="admin-card admin-animate-in"
      body-style="padding: 0"
      style="--delay: 60ms"
    >
      <el-table :data="pageData?.items ?? []" stripe style="width: 100%" :header-cell-style="{ background: '#f8fafc', color: '#334155', fontWeight: 600 }">
        <el-table-column prop="id" label="ID" width="80" align="center" />
        <el-table-column prop="word" label="屏蔽词" min-width="200">
          <template #default="{ row }">
            <span style="font-family: monospace; font-weight: 600">{{ row.word }}</span>
          </template>
        </el-table-column>
        <el-table-column label="添加时间" min-width="160">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="danger" size="small" text @click="deleteWord(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!loading && (!pageData?.items?.length)" class="admin-empty">
        <div class="admin-empty-text">暂无屏蔽词</div>
      </div>

      <div v-if="pageData && pageData.total > 0" class="admin-pager">
        <div class="admin-pager-left">
          <span style="font-size: 13px; color: #64748b">共 {{ pageData.total }} 条</span>
        </div>
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :page-sizes="[20, 50, 100]"
          :total="pageData.total"
          :layout="paginationLayout"
          background
          small
          @current-change="loadList"
          @size-change="loadList"
        />
      </div>
    </el-card>

    <el-dialog v-model="addDialogVisible" title="添加屏蔽词" width="420px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="屏蔽词" required>
          <el-input v-model="newWord" placeholder="输入要屏蔽的词语" maxlength="64" show-word-limit @keydown.enter.prevent="submitAdd" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="adding" @click="submitAdd">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-page {
  max-width: 900px;
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

.admin-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
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

.admin-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid #f1f5f9;
}

.admin-pager-left {
  display: flex;
  align-items: center;
  gap: 8px;
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
