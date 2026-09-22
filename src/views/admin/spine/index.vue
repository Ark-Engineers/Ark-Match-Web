<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'

import { http, request } from '@/api'
import { API_BASE_URL } from '@/config'
import SpinePixiPlayer from '@/components/SpinePixiPlayer.vue'

type ApiResponse<T> = { code: number; message: string; data: T }
type PageResponse<T> = { total: number; page: number; size: number; items: T[] }

type SpineAssetItem = {
  id: number
  assetKey: string
  name: string | null
  type: number
  idleAnimation: string | null
  moveAnimation: string | null
  displayScale: number | null
  raceCount: number
  firstPlaceCount: number
  secondPlaceCount: number
  thirdPlaceCount: number
  unplacedCount: number
  createdBy: number
  updatedBy: number
  createdAt: string
  updatedAt: string
}

const TYPE_OPTIONS = [
  { value: 1, label: '人物', tagType: 'primary' },
  { value: 2, label: '敌人', tagType: 'warning' },
  { value: 3, label: 'BOSS', tagType: 'danger' },
] as const

function typeLabel(t: number): string {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? String(t)
}

function typeTagType(t: number): 'primary' | 'warning' | 'danger' {
  const o = TYPE_OPTIONS.find((o) => o.value === t)
  return o ? o.tagType : 'primary'
}

type SpineFileItem = {
  id: number
  fileType: 'ATLAS' | 'SKEL' | 'PNG' | 'OTHER' | string
  originalName: string
  storedName: string
  relativePath: string
  sizeBytes: number
  mimeType: string | null
  url: string
  createdAt: string
}

type SpineDetail = { asset: SpineAssetItem; files: SpineFileItem[] }

const loading = ref(false)
const error = ref('')

const query = reactive({
  keyword: '',
  page: 1,
  size: 20,
})

const pageData = ref<PageResponse<SpineAssetItem>>({ total: 0, page: 1, size: 20, items: [] })
const router = useRouter()

function apiUrl(u: string): string {
  const base = String(API_BASE_URL || '').trim()
  if (!u) return base || ''
  if (!base) return u
  if (u.startsWith('/')) return `${base}${u}`
  return `${base}/${u}`
}

async function loadList(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<PageResponse<SpineAssetItem>>>({
      url: '/admin/spine/list',
      method: 'GET',
      params: {
        keyword: query.keyword.trim() || undefined,
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

const importVisible = ref(false)
const importing = ref(false)
const importMode = ref<'files' | 'zip'>('files')

const importForm = reactive({
  name: '',
  type: 1,
  idleAnimation: '',
  moveAnimation: '',
  displayScale: 1.0,
  zip: null as File | null,
  atlas: null as File | null,
  skel: null as File | null,
  pngs: [] as File[],
  extras: [] as File[],
})

// 导入预览相关
const importPreviewSkelUrl = ref('')
const importPreviewAnimations = ref<string[]>([])
const importSelectedAnimation = ref('')
const importPreviewSkin = ref('')
const importPreviewSkins = ref<string[]>([])
const importPreviewSlot = ref('')
const importPreviewSlots = ref<string[]>([])

function resetImportForm(): void {
  importForm.name = ''
  importForm.type = 1
  importForm.idleAnimation = ''
  importForm.moveAnimation = ''
  importForm.displayScale = 1.0
  importForm.zip = null
  importForm.atlas = null
  importForm.skel = null
  importForm.pngs = []
  importForm.extras = []
  importMode.value = 'files'
  importPreviewSkelUrl.value = ''
  importPreviewAnimations.value = []
  importSelectedAnimation.value = ''
  importPreviewSkin.value = ''
  importPreviewSkins.value = []
  importPreviewSlot.value = ''
  importPreviewSlots.value = []
}

async function openImport(): Promise<void> {
  resetImportForm()
  importVisible.value = true
  await nextTick()
}

// 当用户选择了所有必要文件后，生成预览 URL
watch(
  () => [importForm.atlas, importForm.skel, importForm.pngs.length],
  ([atlas, skel, pngCount]) => {
    if (!atlas || !skel || pngCount === 0) {
      importPreviewSkelUrl.value = ''
      return
    }
    // 使用 atlas 文件作为加载入口（PIXI.Assets.load 会通过 atlas 引用找到 skel 和 png）
    const url = URL.createObjectURL(atlas as File)
    importPreviewSkelUrl.value = url
  },
)

function onImportPreviewLoaded(payload: { animations: string[]; skins: string[] }): void {
  importPreviewAnimations.value = payload.animations || []
  importPreviewSkins.value = payload.skins || []
  if (!importSelectedAnimation.value && importPreviewAnimations.value.length > 0) {
    importSelectedAnimation.value = importPreviewAnimations.value[0] || ''
  }
}

function onImportPreviewError(msg: string): void {
  console.warn('导入预览加载失败:', msg)
}

function setIdleAnimFromPreview(): void {
  if (!importSelectedAnimation.value) return
  importForm.idleAnimation = importSelectedAnimation.value
  ElMessage.success(`已设置待机动画: ${importSelectedAnimation.value}`)
}

function setMoveAnimFromPreview(): void {
  if (!importSelectedAnimation.value) return
  importForm.moveAnimation = importSelectedAnimation.value
  ElMessage.success(`已设置移动动画: ${importSelectedAnimation.value}`)
}

function pickSingleFile(files: FileList | null): File | null {
  if (!files || files.length <= 0) return null
  return files.item(0)
}

function pickFiles(files: FileList | null): File[] {
  if (!files || files.length <= 0) return []
  return Array.from(files)
}

async function doImport(): Promise<void> {
  if (importing.value) return
  importing.value = true
  try {
    const form = new FormData()
    if (importForm.name.trim()) form.append('name', importForm.name.trim())
    form.append('type', String(importForm.type))
    if (importForm.idleAnimation.trim()) form.append('idleAnimation', importForm.idleAnimation.trim())
    if (importForm.moveAnimation.trim()) form.append('moveAnimation', importForm.moveAnimation.trim())
    if (importForm.displayScale && importForm.displayScale !== 1.0) form.append('displayScale', String(importForm.displayScale))
    let url = '/admin/spine/import'
    if (importMode.value === 'zip') {
      if (!importForm.zip) {
        ElMessage.warning('请上传 zip 文件')
        return
      }
      form.append('zip', importForm.zip)
      url = '/admin/spine/import-zip'
    } else {
      if (!importForm.atlas || !importForm.skel || importForm.pngs.length <= 0) {
        ElMessage.warning('请上传 atlas、skel、png 文件')
        return
      }
      form.append('atlas', importForm.atlas)
      form.append('skel', importForm.skel)
      for (const f of importForm.pngs) form.append('png', f)
      for (const f of importForm.extras) form.append('extra', f)
    }

    const res = await http.post<ApiResponse<SpineDetail>>(url, form)
    if (res.data.code !== 0) {
      ElMessage.error(res.data.message || '导入失败')
      return
    }
    ElMessage.success('导入成功')
    importVisible.value = false
    await loadList()
  } finally {
    importing.value = false
  }
}

const detailVisible = ref(false)
const detailLoading = ref(false)
const currentDetail = ref<SpineDetail | null>(null)

async function openDetail(id: number): Promise<void> {
  detailVisible.value = true
  detailLoading.value = true
  currentDetail.value = null
  try {
    const res = await request<ApiResponse<SpineDetail>>({ url: `/admin/spine/${id}`, method: 'GET' })
    if (res.code !== 0) {
      ElMessage.error(res.message || '加载失败')
      detailVisible.value = false
      return
    }
    currentDetail.value = res.data
  } finally {
    detailLoading.value = false
  }
}

const previewVisible = ref(false)
const previewDetail = ref<SpineDetail | null>(null)

const selectedAnimation = ref('')
const previewAnimations = ref<string[]>([])
const detailPreviewSkins = ref<string[]>([])
const detailPreviewSkin = ref('')
const detailPreviewScale = ref(1.0)
let scaleSaveTimer: ReturnType<typeof setTimeout> | null = null

const previewSkelUrl = computed(() => {
  const d = currentDetail.value || previewDetail.value
  if (!d) return ''
  const key = d.asset.assetKey
  return apiUrl(`/assets/spine/${key}/${key}.skel`)
})

async function openPreviewFromDetail(): Promise<void> {
  if (!currentDetail.value) return
  previewDetail.value = currentDetail.value
  selectedAnimation.value = ''
  previewAnimations.value = []
  detailPreviewSkins.value = []
  detailPreviewSkin.value = ''
  detailPreviewScale.value = currentDetail.value.asset.displayScale ?? 1.0
  previewVisible.value = true
  await nextTick()
}

function onDetailPreviewLoaded(payload: { animations: string[]; skins: string[] }): void {
  previewAnimations.value = payload.animations || []
  detailPreviewSkins.value = payload.skins || []
  if (!selectedAnimation.value && previewAnimations.value.length > 0) {
    selectedAnimation.value = previewAnimations.value[0] || ''
  }
}

function onDetailPreviewError(msg: string): void {
  console.warn('管理页预览加载失败:', msg)
}

function setIdleFromPreview(): void {
  if (!selectedAnimation.value) return
  editForm.idleAnimation = selectedAnimation.value
  ElMessage.success(`已设置待机动画: ${selectedAnimation.value}`)
}

function setMoveFromPreview(): void {
  if (!selectedAnimation.value) return
  editForm.moveAnimation = selectedAnimation.value
  ElMessage.success(`已设置移动动画: ${selectedAnimation.value}`)
}

// 监听缩放值变化，防抖后自动保存到数据库
watch(
  () => detailPreviewScale.value,
  (newScale) => {
    const detail = currentDetail.value
    if (!detail) return
    if (scaleSaveTimer) clearTimeout(scaleSaveTimer)
    scaleSaveTimer = setTimeout(async () => {
      try {
        const form = new FormData()
        form.append('displayScale', String(newScale))
        // 同时更新 editForm 中的值，确保保存时一致
        editForm.displayScale = newScale
        const res = await http.post<ApiResponse<SpineDetail>>(`/admin/spine/${detail.asset.id}/update`, form)
        if (res.data.code === 0) {
          // 更新 currentDetail 中的值
          detail.asset.displayScale = newScale
          ElMessage.success(`显示缩放已更新: ${newScale.toFixed(2)}`)
        } else {
          ElMessage.error(res.data.message || '更新失败')
        }
      } catch (e) {
        console.error('保存缩放失败:', e)
      }
    }, 500)
  },
)

function onPreviewLoaded(payload: { animations: string[]; skins: string[] }): void {
  previewAnimations.value = payload.animations || []
  if (!selectedAnimation.value && previewAnimations.value.length > 0) {
    selectedAnimation.value = previewAnimations.value[0] || ''
  }
}

function goPlay(id: number): void {
  router.push(`/admin/spine/${id}/play`)
}

const editVisible = ref(false)
const editing = ref(false)
const editForm = reactive({
  id: 0,
  name: '',
  type: 1,
  idleAnimation: '',
  moveAnimation: '',
  displayScale: 1.0,
  updateFiles: false,
  atlas: null as File | null,
  skel: null as File | null,
  pngs: [] as File[],
  extras: [] as File[],
})

function resetEditForm(): void {
  editForm.id = 0
  editForm.name = ''
  editForm.type = 1
  editForm.updateFiles = false
  editForm.atlas = null
  editForm.skel = null
  editForm.pngs = []
  editForm.extras = []
}

async function openEdit(): Promise<void> {
  const d = currentDetail.value
  if (!d) return
  resetEditForm()
  editForm.id = d.asset.id
  editForm.name = d.asset.name || ''
  editForm.type = d.asset.type || 1
  editForm.idleAnimation = d.asset.idleAnimation || ''
  editForm.moveAnimation = d.asset.moveAnimation || ''
  editForm.displayScale = d.asset.displayScale ?? 1.0
  editVisible.value = true
  await nextTick()
}

async function doUpdate(): Promise<void> {
  if (editing.value) return
  editing.value = true
  try {
    const form = new FormData()
    // 后端 update 为部分更新语义：name 始终携带，空串表示清除名称
    form.append('name', editForm.name.trim())
    form.append('type', String(editForm.type))
    if (editForm.idleAnimation.trim()) form.append('idleAnimation', editForm.idleAnimation.trim())
    if (editForm.moveAnimation.trim()) form.append('moveAnimation', editForm.moveAnimation.trim())
    if (editForm.displayScale && editForm.displayScale !== 1.0) form.append('displayScale', String(editForm.displayScale))
    if (editForm.updateFiles) {
      if (!editForm.atlas || !editForm.skel || editForm.pngs.length <= 0) {
        ElMessage.warning('更新文件需要同时提供 atlas、skel、png')
        return
      }
      form.append('atlas', editForm.atlas)
      form.append('skel', editForm.skel)
      for (const f of editForm.pngs) form.append('png', f)
      for (const f of editForm.extras) form.append('extra', f)
    }
    const res = await http.post<ApiResponse<SpineDetail>>(`/admin/spine/${editForm.id}/update`, form)
    if (res.data.code !== 0) {
      ElMessage.error(res.data.message || '更新失败')
      return
    }
    ElMessage.success('更新成功')
    editVisible.value = false
    await openDetail(editForm.id)
    await loadList()
  } finally {
    editing.value = false
  }
}

async function doDelete(id: number): Promise<void> {
  await ElMessageBox.confirm('确认删除该 Spine 资源？删除会同时清理文件与数据库记录', '删除确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning',
  })
  const res = await request<ApiResponse<null>>({ url: `/admin/spine/${id}`, method: 'DELETE' })
  if (res.code !== 0) {
    ElMessage.error(res.message || '删除失败')
    return
  }
  ElMessage.success('已删除')
  if (currentDetail.value?.asset.id === id) {
    currentDetail.value = null
    detailVisible.value = false
  }
  await loadList()
}

type DragItem = {
  id: number
  assetKey: string
  name: string | null
  x: number
  y: number
}

const dragMode = ref(false)
const dragItems = ref<DragItem[]>([])
const dragLayerRef = ref<HTMLElement | null>(null)

async function enterDragMode(): Promise<void> {
  dragMode.value = true
  await nextTick()
  const baseX = 16
  const baseY = 16
  const gap = 16
  const width = 240
  const items = pageData.value.items.map((a, idx) => ({
    id: a.id,
    assetKey: a.assetKey,
    name: a.name,
    x: baseX + (idx % 3) * (width + gap),
    y: baseY + Math.floor(idx / 3) * (width + gap),
  }))
  dragItems.value = items
}

function exitDragMode(): void {
  dragMode.value = false
  dragItems.value = []
}

type DragState = { id: number; startX: number; startY: number; originX: number; originY: number } | null
const dragging = ref<DragState>(null)

function onPointerDown(e: PointerEvent, item: DragItem): void {
  if (!dragMode.value) return
  const el = dragLayerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  dragging.value = { id: item.id, startX: x, startY: y, originX: item.x, originY: item.y }
  ;(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  const st = dragging.value
  if (!st) return
  const el = dragLayerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const dx = x - st.startX
  const dy = y - st.startY
  const next = dragItems.value.map((it) => (it.id === st.id ? { ...it, x: st.originX + dx, y: st.originY + dy } : it))
  dragItems.value = next
}

function onPointerUp(): void {
  dragging.value = null
}

function buildSkelUrlByKey(key: string): string {
  return apiUrl(`/assets/spine/${key}/${key}.skel`)
}

function openLink(url: string): void {
  const u = apiUrl(url)
  window.open(u, '_blank')
}

onMounted(() => {
  void loadList()
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
})

onBeforeUnmount(() => {
  if (scaleSaveTimer) clearTimeout(scaleSaveTimer)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <div class="spine-admin">
    <div class="spine-header">
      <div class="spine-title">明日方舟小人导入</div>
      <div class="spine-actions">
        <el-input v-model="query.keyword" placeholder="按 key/名称搜索" clearable style="width: 240px" @keyup.enter="loadList" />
        <el-button :loading="loading" @click="loadList">查询</el-button>
        <el-button type="primary" @click="openImport">导入资源</el-button>
        <el-button v-if="!dragMode" @click="enterDragMode">拖拽展示</el-button>
        <el-button v-else @click="exitDragMode">退出拖拽</el-button>
      </div>
    </div>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" style="margin-bottom: 12px" />

    <el-card shadow="never" body-style="padding: 0">
      <el-table :data="pageData.items" style="width: 100%">
        <el-table-column prop="assetKey" label="Key" min-width="180" />
        <el-table-column prop="name" label="名称" min-width="200" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="typeTagType(row.type)" size="small">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="参赛" width="70" align="right">
          <template #default="{ row }">{{ row.raceCount ?? 0 }}</template>
        </el-table-column>
        <el-table-column label="第1名" width="70" align="right">
          <template #default="{ row }">
            <span style="color: var(--el-color-warning)">{{ row.firstPlaceCount ?? 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="第2名" width="70" align="right">
          <template #default="{ row }">
            <span style="color: var(--el-color-primary)">{{ row.secondPlaceCount ?? 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="第3名" width="70" align="right">
          <template #default="{ row }">
            <span style="color: var(--el-color-success)">{{ row.thirdPlaceCount ?? 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="未上榜" width="70" align="right">
          <template #default="{ row }">{{ row.unplacedCount ?? 0 }}</template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" min-width="180" />
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row.id)">管理</el-button>
            <el-button size="small" @click="goPlay(row.id)">进入</el-button>
            <el-button size="small" @click="doDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="spine-pagination">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="pageData.total"
          layout="total, sizes, prev, pager, next, jumper"
          :page-sizes="[10, 20, 50, 100]"
          @size-change="loadList"
          @current-change="loadList"
        />
      </div>
    </el-card>

    <el-dialog v-model="importVisible" title="导入 Spine 资源" width="720px" :close-on-click-modal="false">
      <div class="form-grid">
        <div class="form-row">
          <div class="form-label">导入方式</div>
          <el-radio-group v-model="importMode">
            <el-radio-button label="files">文件</el-radio-button>
            <el-radio-button label="zip">ZIP</el-radio-button>
          </el-radio-group>
        </div>
        <div class="form-row">
          <div class="form-label">名称</div>
          <el-input v-model="importForm.name" placeholder="可选" maxlength="128" show-word-limit />
        </div>
        <div class="form-row">
          <div class="form-label">类型</div>
          <el-radio-group v-model="importForm.type">
            <el-radio-button v-for="o in TYPE_OPTIONS" :key="o.value" :label="o.value">{{ o.label }}</el-radio-button>
          </el-radio-group>
        </div>
        <div class="form-row">
          <div class="form-label">待机动画</div>
          <el-input v-model="importForm.idleAnimation" placeholder="如 Idle、Standby（可选）" maxlength="64" />
        </div>
        <div class="form-row">
          <div class="form-label">移动动画</div>
          <el-input v-model="importForm.moveAnimation" placeholder="如 Move、Walk、Run（可选）" maxlength="64" />
        </div>
        <div class="form-row">
          <div class="form-label">显示缩放</div>
          <el-input-number v-model="importForm.displayScale" :min="0.1" :max="10.0" :step="0.1" :precision="2" placeholder="默认 1.00" />
          <span class="form-hint ml-2">范围 0.1 ~ 10.0，默认 1.00</span>
        </div>
        <template v-if="importMode === 'zip'">
          <div class="form-row">
            <div class="form-label">.zip</div>
            <input type="file" accept=".zip" @change="(e) => (importForm.zip = pickSingleFile((e.target as HTMLInputElement).files))" />
          </div>
          <div class="form-hint">
            zip 内必须包含 1 个 atlas、1 个 skel、至少 1 张 png；atlas 与 skel 文件名（不含后缀）必须一致，并且仅允许字母/数字/_/-（长度≤64）；zip 不支持目录结构。
          </div>
        </template>
        <template v-else>
          <div class="form-row">
            <div class="form-label">.atlas</div>
            <input type="file" accept=".atlas" @change="(e) => (importForm.atlas = pickSingleFile((e.target as HTMLInputElement).files))" />
          </div>
          <div class="form-row">
            <div class="form-label">.skel</div>
            <input type="file" accept=".skel" @change="(e) => (importForm.skel = pickSingleFile((e.target as HTMLInputElement).files))" />
          </div>
          <div class="form-row">
            <div class="form-label">.png</div>
            <input type="file" accept=".png" multiple @change="(e) => (importForm.pngs = pickFiles((e.target as HTMLInputElement).files))" />
          </div>
          <div class="form-row">
            <div class="form-label">其它文件</div>
            <input type="file" multiple @change="(e) => (importForm.extras = pickFiles((e.target as HTMLInputElement).files))" />
          </div>
          <div class="form-hint">
            文件命名规则：atlas 与 skel 的文件名（不含后缀）必须一致，且仅允许字母/数字/_/-（长度≤64）。后端将自动据此生成资源 Key。
          </div>
        </template>

        <!-- 实时预览区域 -->
        <div v-if="importPreviewSkelUrl" class="preview-panel">
          <div class="preview-header">角色状态预览</div>
          <div class="preview-body">
            <div class="preview-controls">
              <div class="control-group">
                <label class="control-label">时装组</label>
                <el-select v-model="importPreviewSkin" placeholder="默认" size="small" style="width: 100%" clearable>
                  <el-option v-for="s in importPreviewSkins" :key="s" :label="s" :value="s" />
                </el-select>
              </div>
              <div class="control-group">
                <label class="control-label">动画</label>
                <el-select v-model="importSelectedAnimation" placeholder="选择动画" size="small" style="width: 100%">
                  <el-option v-for="a in importPreviewAnimations" :key="a" :label="a" :value="a" />
                </el-select>
              </div>
              <div class="control-group">
                <label class="control-label">设为待机动画</label>
                <el-button size="small" style="width: 100%" :disabled="!importSelectedAnimation" @click="setIdleAnimFromPreview">
                  使用当前动画
                </el-button>
              </div>
              <div class="control-group">
                <label class="control-label">设为移动动画</label>
                <el-button size="small" style="width: 100%" :disabled="!importSelectedAnimation" @click="setMoveAnimFromPreview">
                  使用当前动画
                </el-button>
              </div>
            </div>
            <div class="preview-canvas">
              <SpinePixiPlayer
                :skel-url="importPreviewSkelUrl"
                :animation-name="importSelectedAnimation || undefined"
                :scale="importForm.displayScale || 1.0"
                :skin-name="importPreviewSkin || undefined"
                fit="contain"
                @loaded="onImportPreviewLoaded"
                @error="onImportPreviewError"
              />
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="doImport">开始导入</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="资源管理" size="720px" :with-header="true">
      <el-skeleton v-if="detailLoading" :rows="8" animated />
      <template v-else>
        <div v-if="currentDetail" class="detail-shell">
          <div class="detail-meta">
            <div class="meta-item"><span class="meta-k">Key</span><span class="meta-v">{{ currentDetail.asset.assetKey }}</span></div>
            <div class="meta-item"><span class="meta-k">名称</span><span class="meta-v">{{ currentDetail.asset.name || '—' }}</span></div>
            <div class="meta-item">
              <span class="meta-k">类型</span>
              <el-tag :type="typeTagType(currentDetail.asset.type)" size="small">{{ typeLabel(currentDetail.asset.type) }}</el-tag>
            </div>
            <div class="meta-item"><span class="meta-k">更新时间</span><span class="meta-v">{{ currentDetail.asset.updatedAt }}</span></div>
          </div>

          <!-- 管理页内嵌预览 -->
          <div v-if="previewSkelUrl" class="detail-preview-panel">
            <div class="detail-preview-header">角色状态预览</div>
            <div class="detail-preview-body">
              <div class="detail-preview-controls">
                <div class="control-group">
                  <label class="control-label">时装组</label>
                  <el-select v-model="detailPreviewSkin" placeholder="默认" size="small" style="width: 100%" clearable>
                    <el-option v-for="s in detailPreviewSkins" :key="s" :label="s" :value="s" />
                  </el-select>
                </div>
                <div class="control-group">
                  <label class="control-label">动画</label>
                  <el-select v-model="selectedAnimation" placeholder="选择动画" size="small" style="width: 100%">
                    <el-option v-for="a in previewAnimations" :key="a" :label="a" :value="a" />
                  </el-select>
                </div>
                <div class="control-group">
                  <label class="control-label">设为待机动画</label>
                  <el-button size="small" style="width: 100%" :disabled="!selectedAnimation" @click="setIdleFromPreview">使用当前动画</el-button>
                </div>
                <div class="control-group">
                  <label class="control-label">设为移动动画</label>
                  <el-button size="small" style="width: 100%" :disabled="!selectedAnimation" @click="setMoveFromPreview">使用当前动画</el-button>
                </div>
              </div>
              <div class="detail-preview-canvas">
                <SpinePixiPlayer
                  :skel-url="previewSkelUrl"
                  :animation-name="selectedAnimation || undefined"
                  :scale="detailPreviewScale"
                  :skin-name="detailPreviewSkin || undefined"
                  fit="contain"
                  @loaded="onDetailPreviewLoaded"
                  @error="onDetailPreviewError"
                />
              </div>
            </div>
            <div class="detail-preview-scale-row">
              <label class="control-label" style="width: 80px">显示缩放</label>
              <el-input-number v-model="detailPreviewScale" :min="0.1" :max="10.0" :step="0.1" :precision="2" size="small" style="width: 140px" />
              <span class="form-hint ml-2">修改后预览实时缩放</span>
            </div>
          </div>

          <div class="detail-actions">
            <el-button @click="openEdit">修改</el-button>
            <el-button @click="doDelete(currentDetail.asset.id)">删除</el-button>
          </div>

          <el-table :data="currentDetail.files" style="width: 100%" size="small">
            <el-table-column prop="fileType" label="类型" width="90" />
            <el-table-column prop="storedName" label="文件名" min-width="180" />
            <el-table-column prop="sizeBytes" label="大小" width="110">
              <template #default="{ row }">{{ (Number(row.sizeBytes || 0) / 1024).toFixed(1) }} KB</template>
            </el-table-column>
            <el-table-column label="链接" min-width="220">
              <template #default="{ row }">
                <el-button text type="primary" @click="openLink(row.url)">打开</el-button>
                <span class="mono">{{ apiUrl(row.url) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="previewVisible" title="在线预览" width="980px" :close-on-click-modal="false">
      <div v-if="previewSkelUrl" class="preview-shell">
        <div class="preview-toolbar">
          <el-select v-model="selectedAnimation" placeholder="选择动画" style="width: 220px" clearable>
            <el-option v-for="a in previewAnimations" :key="a" :label="a" :value="a" />
          </el-select>
        </div>
        <div class="preview-player">
          <SpinePixiPlayer :skel-url="previewSkelUrl" :animation-name="selectedAnimation || undefined" fit="contain" @loaded="onPreviewLoaded" />
        </div>
        <div class="preview-hint">如果出现不显示，通常是 Spine 版本不匹配或 atlas 引用的 png 文件名与上传不一致。</div>
      </div>
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="修改资源" width="720px" :close-on-click-modal="false">
      <div class="form-grid">
        <div class="form-row">
          <div class="form-label">名称</div>
          <el-input v-model="editForm.name" placeholder="可选" maxlength="128" show-word-limit />
        </div>
        <div class="form-row">
          <div class="form-label">类型</div>
          <el-radio-group v-model="editForm.type">
            <el-radio-button v-for="o in TYPE_OPTIONS" :key="o.value" :label="o.value">{{ o.label }}</el-radio-button>
          </el-radio-group>
        </div>
        <div class="form-hint" style="padding: 8px 0; color: #6b7280;">
          💡 待机动画、移动动画、显示缩放请在上方预览面板中通过按钮设置，修改后点击保存即可。
        </div>
        <div class="form-row">
          <div class="form-label">更新文件</div>
          <el-switch v-model="editForm.updateFiles" />
        </div>
        <template v-if="editForm.updateFiles">
          <div class="form-row">
            <div class="form-label">.atlas</div>
            <input type="file" accept=".atlas" @change="(e) => (editForm.atlas = pickSingleFile((e.target as HTMLInputElement).files))" />
          </div>
          <div class="form-row">
            <div class="form-label">.skel</div>
            <input type="file" accept=".skel" @change="(e) => (editForm.skel = pickSingleFile((e.target as HTMLInputElement).files))" />
          </div>
          <div class="form-row">
            <div class="form-label">.png</div>
            <input type="file" accept=".png" multiple @change="(e) => (editForm.pngs = pickFiles((e.target as HTMLInputElement).files))" />
          </div>
          <div class="form-row">
            <div class="form-label">其它文件</div>
            <input type="file" multiple @change="(e) => (editForm.extras = pickFiles((e.target as HTMLInputElement).files))" />
          </div>
          <div class="form-hint">更新文件时会整体覆盖旧文件（旧文件会被清理）。</div>
        </template>
      </div>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editing" @click="doUpdate">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="dragMode" title="拖拽展示（可拖动）" size="100%" :with-header="true" :close-on-click-modal="false">
      <div class="drag-stage" ref="dragLayerRef">
        <div
          v-for="it in dragItems"
          :key="it.id"
          class="drag-item"
          :style="{ transform: `translate(${it.x}px, ${it.y}px)` }"
          @pointerdown="(e) => onPointerDown(e as PointerEvent, it)"
        >
          <div class="drag-title">{{ it.name || it.assetKey }}</div>
          <div class="drag-player">
            <SpinePixiPlayer :skel-url="buildSkelUrlByKey(it.assetKey)" fit="contain" />
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.spine-admin {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.spine-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.spine-title {
  font-size: 16px;
  font-weight: 800;
  color: #0f172a;
}

.spine-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.spine-pagination {
  padding: 12px 14px;
  display: flex;
  justify-content: flex-end;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: 10px;
  align-items: center;
}

.form-label {
  font-size: 13px;
  font-weight: 700;
  color: rgba(15, 23, 42, 0.78);
}

.form-hint {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.62);
  line-height: 1.5;
}

.detail-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-meta {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}

.meta-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.meta-k {
  width: 80px;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.62);
}

.meta-v {
  font-size: 13px;
  font-weight: 700;
  color: rgba(15, 23, 42, 0.84);
}

/* 管理页内嵌预览面板 */
.detail-preview-panel {
  margin-top: 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: linear-gradient(180deg, #f8fafc, #f1f5f9);
  overflow: hidden;
}

.detail-preview-header {
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  background: rgba(241, 245, 249, 0.8);
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.detail-preview-body {
  display: flex;
  gap: 12px;
  padding: 12px;
}

.detail-preview-controls {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-preview-canvas {
  flex: 1;
  min-height: 240px;
  max-height: 360px;
  border-radius: 8px;
  background: repeating-conic-gradient(#e2e8f0 0% 25%, transparent 0% 50%) 0 0 / 20px 20px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  overflow: hidden;
}

.detail-preview-scale-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
}

.ml-2 {
  margin-left: 8px;
}

.detail-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.55);
}

.preview-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
}

.preview-player {
  height: 520px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  overflow: hidden;
}

.preview-hint {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.62);
}

.drag-stage {
  position: relative;
  width: 100%;
  height: calc(100vh - 80px);
  border-radius: 14px;
  background: radial-gradient(900px 500px at 30% 10%, rgba(56, 189, 248, 0.16), transparent 60%),
    linear-gradient(180deg, #0b1220, #070b10);
  overflow: hidden;
}

.drag-item {
  position: absolute;
  width: 240px;
  height: 240px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  cursor: grab;
}

.drag-title {
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 800;
  color: rgba(226, 232, 240, 0.92);
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(2, 6, 23, 0.25);
}

.drag-player {
  flex: 1;
}

/* 导入预览面板 */
.preview-panel {
  margin-top: 16px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: linear-gradient(180deg, #f8fafc, #f1f5f9);
  overflow: hidden;
}

.preview-header {
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  background: rgba(241, 245, 249, 0.8);
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.preview-body {
  display: flex;
  gap: 12px;
  padding: 12px;
}

.preview-controls {
  width: 180px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(15, 23, 42, 0.7);
}

.preview-canvas {
  flex: 1;
  min-height: 280px;
  max-height: 400px;
  border-radius: 8px;
  background: repeating-conic-gradient(#e2e8f0 0% 25%, transparent 0% 50%) 0 0 / 20px 20px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  overflow: hidden;
}
</style>
