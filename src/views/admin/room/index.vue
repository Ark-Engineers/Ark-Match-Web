<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  createOnlineRoom,
  listAdminRooms,
  setOnlineRoomOffline,
  setOnlineRoomOnline,
  type AdminRoomInfo,
  type OnlineRoomPermission,
} from '@/api/online'

const isMobile = ref(false)
const loading = ref(false)
const rooms = ref<AdminRoomInfo[]>([])

const createDialogVisible = ref(false)
const creating = ref(false)
const createForm = reactive({
  roomId: '',
  name: '',
  permission: 'PUBLIC' as OnlineRoomPermission,
  capacity: 0,
  password: '',
  online: true,
})

function updateResponsiveState(): void {
  isMobile.value = window.innerWidth < 1024
}

function resolveErrorMessage(err: any): string {
  const msg = err?.response?.data?.message || err?.message
  return String(msg || '操作失败')
}

function formatPermission(p: string): string {
  switch (String(p || '').toUpperCase()) {
    case 'PUBLIC':
      return '公开'
    case 'ADMIN_ONLY':
      return '仅管理员'
    case 'PASSWORD':
      return '密码'
    case 'WHITELIST':
      return '白名单'
    default:
      return p
  }
}

function permissionTagType(p: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  switch (String(p || '').toUpperCase()) {
    case 'PUBLIC':
      return 'success'
    case 'ADMIN_ONLY':
      return 'danger'
    case 'PASSWORD':
      return 'warning'
    case 'WHITELIST':
      return 'info'
    default:
      return ''
  }
}

function formatTimestamp(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function loadRooms(): Promise<void> {
  loading.value = true
  try {
    rooms.value = await listAdminRooms()
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    loading.value = false
  }
}

function openCreateDialog(): void {
  createForm.roomId = ''
  createForm.name = ''
  createForm.permission = 'PUBLIC'
  createForm.capacity = 0
  createForm.password = ''
  createForm.online = true
  createDialogVisible.value = true
}

async function submitCreate(): Promise<void> {
  const rid = createForm.roomId.trim()
  if (!rid) {
    ElMessage.warning('请输入房间ID')
    return
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(rid)) {
    ElMessage.warning('房间ID仅允许字母、数字、下划线和连字符')
    return
  }
  if (rid.length > 32) {
    ElMessage.warning('房间ID最长32个字符')
    return
  }
  if (createForm.permission === 'PASSWORD' && !createForm.password.trim()) {
    ElMessage.warning('密码权限房间必须设置密码')
    return
  }

  creating.value = true
  try {
    await createOnlineRoom({
      roomId: rid,
      name: createForm.name.trim() || undefined,
      permission: createForm.permission,
      capacity: Math.max(0, createForm.capacity),
      password: createForm.permission === 'PASSWORD' ? createForm.password.trim() : undefined,
      online: createForm.online,
    })
    ElMessage.success('房间已创建')
    createDialogVisible.value = false
    await loadRooms()
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    creating.value = false
  }
}

async function toggleOnline(room: AdminRoomInfo): Promise<void> {
  const nextOnline = !room.online
  const action = nextOnline ? '上线' : '下线'
  try {
    await ElMessageBox.confirm(`确认${action}房间「${room.name}」？`, '二次确认', {
      confirmButtonText: action,
      cancelButtonText: '取消',
      type: 'warning',
      closeOnClickModal: false,
    })
  } catch {
    return
  }

  loading.value = true
  try {
    if (nextOnline) {
      await setOnlineRoomOnline(room.roomId)
    } else {
      await setOnlineRoomOffline(room.roomId)
    }
    ElMessage.success(`已${action}`)
    await loadRooms()
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    loading.value = false
  }
}

const sortedRooms = computed(() => {
  return [...rooms.value].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1
    return a.roomId.localeCompare(b.roomId)
  })
})

onMounted(() => {
  updateResponsiveState()
  window.addEventListener('resize', updateResponsiveState)
  void loadRooms()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateResponsiveState)
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-header admin-animate-in" style="--delay: 0ms">
      <div>
        <div class="admin-title">房间管理</div>
        <div class="admin-subtitle">管理联机房间的创建、上下线状态</div>
      </div>
      <div class="admin-header-actions">
        <el-button type="primary" @click="openCreateDialog">创建房间</el-button>
      </div>
    </div>

    <el-card
      v-loading="loading"
      shadow="never"
      class="admin-card admin-animate-in"
      body-style="padding: 0"
      style="--delay: 60ms"
    >
      <el-table :data="sortedRooms" stripe style="width: 100%" :header-cell-style="{ background: '#f8fafc', color: '#334155', fontWeight: 600 }">
        <el-table-column prop="roomId" label="房间ID" min-width="120">
          <template #default="{ row }">
            <span style="font-family: monospace; font-weight: 600">{{ row.roomId }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="120" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.online ? 'success' : 'info'" size="small" effect="light">
              {{ row.online ? '在线' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="权限" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="permissionTagType(row.permission)" size="small" effect="plain">
              {{ formatPermission(row.permission) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="容量" width="80" align="center">
          <template #default="{ row }">
            {{ row.capacity > 0 ? row.capacity : '不限' }}
          </template>
        </el-table-column>
        <el-table-column label="创建者" width="100" align="center">
          <template #default="{ row }">
            {{ row.creatorUserId || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">
            {{ formatTimestamp(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              :type="row.online ? 'danger' : 'success'"
              size="small"
              text
              @click="toggleOnline(row)"
            >
              {{ row.online ? '下线' : '上线' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!loading && sortedRooms.length === 0" class="admin-empty">
        <div class="admin-empty-text">暂无房间</div>
      </div>
    </el-card>

    <el-dialog v-model="createDialogVisible" title="创建房间" width="480px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="房间ID" required>
          <el-input v-model="createForm.roomId" placeholder="字母/数字/下划线/连字符，最长32位" maxlength="32" show-word-limit />
        </el-form-item>
        <el-form-item label="显示名称">
          <el-input v-model="createForm.name" placeholder="留空则与房间ID相同" maxlength="32" show-word-limit />
        </el-form-item>
        <el-form-item label="权限">
          <el-select v-model="createForm.permission" style="width: 100%">
            <el-option label="公开" value="PUBLIC" />
            <el-option label="仅管理员" value="ADMIN_ONLY" />
            <el-option label="密码" value="PASSWORD" />
            <el-option label="白名单" value="WHITELIST" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="createForm.permission === 'PASSWORD'" label="密码" required>
          <el-input v-model="createForm.password" placeholder="设置房间密码" show-password />
        </el-form-item>
        <el-form-item label="容量（0=不限）">
          <el-input-number v-model="createForm.capacity" :min="0" :max="9999" style="width: 100%" />
        </el-form-item>
        <el-form-item label="创建后上线">
          <el-switch v-model="createForm.online" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建</el-button>
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
