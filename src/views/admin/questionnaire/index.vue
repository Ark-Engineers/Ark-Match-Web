<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import { request } from '@/api'

type ApiResponse<T> = { code: number; message: string; data: T }

type PageResponse<T> = { total: number; page: number; size: number; items: T[] }

type QuestionnaireItem = {
  id: number
  title: string
  subtitle: string | null
  status: string
  createdBy: number
  updatedBy: number
  createdAt: string
  updatedAt: string
}

const router = useRouter()

const loading = ref(false)
const list = ref<QuestionnaireItem[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  size: 20,
})

const paginationLayout = computed(() => 'sizes, prev, pager, next')

const importVisible = ref(false)
const importing = ref(false)
const importForm = reactive({
  title: '',
  subtitle: '',
  file: null as File | null,
})

function resetImportForm(): void {
  importForm.title = ''
  importForm.subtitle = ''
  importForm.file = null
}

async function loadList(): Promise<void> {
  loading.value = true
  try {
    const res = await request<ApiResponse<PageResponse<QuestionnaireItem>>>({
      url: '/admin/questionnaire/list',
      method: 'GET',
      params: { page: query.page, size: query.size },
    })
    if (res.code !== 0) {
      ElMessage.error(res.message || '加载失败')
      return
    }
    list.value = res.data.items || []
    total.value = res.data.total || 0
  } finally {
    loading.value = false
  }
}

async function downloadTemplate(): Promise<void> {
  try {
    const blob = await request<Blob>({
      url: '/admin/questionnaire/template',
      method: 'GET',
      responseType: 'blob' as any,
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'questionnaire-template.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('下载失败')
  }
}

function openImport(): void {
  resetImportForm()
  importVisible.value = true
}

function onPickFile(file: File): void {
  importForm.file = file
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function submitImport(): Promise<void> {
  if (importing.value) return
  const title = importForm.title.trim()
  if (title.length < 2) {
    ElMessage.error('问卷标题至少2个字符')
    return
  }
  if (!importForm.file) {
    ElMessage.error('请先选择Excel文件')
    return
  }

  importing.value = true
  try {
    const fd = new FormData()
    fd.append('title', title)
    fd.append('subtitle', importForm.subtitle.trim())
    fd.append('file', importForm.file)

    const res = await request<ApiResponse<{ id: number }>>({
      url: '/admin/questionnaire/import',
      method: 'POST',
      data: fd,
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    if (res.code !== 0) {
      const msg = String(res.message || '导入失败')
      await ElMessageBox.alert(`<pre style="white-space: pre-wrap; margin: 0">${escapeHtml(msg)}</pre>`, '导入失败', {
        type: 'error',
        confirmButtonText: '知道了',
        dangerouslyUseHTMLString: true,
        closeOnClickModal: false,
      })
      return
    }
    importVisible.value = false
    ElMessage.success('导入成功')
    await router.push(`/admin/m/2/${res.data.id}/preview`)
  } catch (e: any) {
    ElMessage.error(e?.message || '导入失败')
  } finally {
    importing.value = false
  }
}

async function goEdit(id: number): Promise<void> {
  await router.push(`/admin/m/2/${id}`)
}

async function goPreview(id: number): Promise<void> {
  await router.push(`/admin/m/2/${id}/preview`)
}

async function removeItem(item: QuestionnaireItem): Promise<void> {
  try {
    await ElMessageBox.confirm('确认删除该问卷？删除后不可恢复。', '二次确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      closeOnClickModal: false,
    })
  } catch {
    return
  }

  try {
    const res = await request<ApiResponse<unknown>>({
      url: '/admin/questionnaire/delete',
      method: 'POST',
      data: { id: item.id },
    })
    if (res.code !== 0) {
      ElMessage.error(res.message || '删除失败')
      return
    }
    ElMessage.success('已删除')
    await loadList()
  } catch {
    ElMessage.error('删除失败')
  }
}

onMounted(async () => {
  await loadList()
})
</script>

<template>
  <div class="admin-page">
    <el-card shadow="never" class="admin-card admin-animate-in" style="--delay: 40ms">
      <template #header>
        <div
          class="admin-animate-in"
          style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; --delay: 0ms"
        >
          <div>
            <div style="font-weight: 700">问卷管理</div>
            <div style="font-size: 12px; opacity: 0.7">导入Excel生成问卷，支持预览交互与打印/PDF导出</div>
          </div>
          <el-space wrap>
            <el-button @click="downloadTemplate">导出模板</el-button>
            <el-button type="primary" @click="openImport">导入问卷</el-button>
          </el-space>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border table-layout="fixed">
        <el-table-column prop="id" label="ID" width="90" />
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column prop="subtitle" label="副标题" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.subtitle || '-' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120" />
        <el-table-column prop="updatedAt" label="更新时间" width="170" />
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-space>
              <el-button size="small" @click="goPreview(row.id)">预览</el-button>
              <el-button size="small" @click="goEdit(row.id)">编辑</el-button>
              <el-button size="small" type="danger" plain @click="removeItem(row)">删除</el-button>
            </el-space>
          </template>
        </el-table-column>
      </el-table>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px">
        <div style="font-size: 12px; opacity: 0.75">共 {{ total }} 条</div>
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          :layout="paginationLayout"
          @change="loadList"
        />
      </div>
    </el-card>

    <el-dialog v-model="importVisible" title="导入问卷" width="720px" @closed="resetImportForm">
      <el-form label-position="top">
        <el-form-item label="问卷标题*">
          <el-input v-model="importForm.title" maxlength="128" show-word-limit />
        </el-form-item>
        <el-form-item label="问卷副标题">
          <el-input v-model="importForm.subtitle" maxlength="255" show-word-limit />
        </el-form-item>
        <el-form-item label="Excel文件*（xls/xlsx）">
          <input type="file" accept=".xlsx,.xls" @change="(e: any) => onPickFile(e.target.files?.[0])" />
          <div style="font-size: 12px; opacity: 0.7; margin-top: 6px">
            已选择：{{ importForm.file ? importForm.file.name : '未选择' }}
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-space>
          <el-button @click="importVisible = false">取消</el-button>
          <el-button type="primary" :loading="importing" @click="submitImport">开始导入</el-button>
        </el-space>
      </template>
    </el-dialog>
  </div>
</template>
