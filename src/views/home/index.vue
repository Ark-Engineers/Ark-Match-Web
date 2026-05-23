<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { request } from '@/api'
import { useAuthStore } from '@/stores/auth'

type ApiResponse<T> = { code: number; message: string; data: T }
type NoticeItem = {
  id: number
  title: string
  content: string
  level: string
  pinned: boolean
  publishAt: string | null
  expireAt: string | null
  read: boolean
}
type PageResponse<T> = { total: number; page: number; size: number; items: T[] }

const router = useRouter()
const authStore = useAuthStore()

const normalizedRole = computed(() => String(authStore.role ?? '').toUpperCase())
const isAdmin = computed(() => normalizedRole.value === 'ADMIN' || normalizedRole.value === 'SUPER_ADMIN')
const roleLabel = computed(() => {
  if (normalizedRole.value === 'SUPER_ADMIN') return '超级管理员'
  if (normalizedRole.value === 'ADMIN') return '管理员'
  return '普通用户'
})

const loading = ref(false)
const error = ref('')

const noticeLoading = ref(false)
const notices = ref<NoticeItem[]>([])
const noticeError = ref('')

const importantVisible = ref(false)
const importantNotice = ref<NoticeItem | null>(null)

const detailVisible = ref(false)
const detailNotice = ref<NoticeItem | null>(null)

async function clearCaches(): Promise<void> {
  try {
    if (!('caches' in window)) return
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  } catch {}
}

async function logout(): Promise<void> {
  loading.value = true
  error.value = ''

  try {
    const refreshToken = authStore.session?.refreshToken
    if (refreshToken) {
      await request<ApiResponse<null>>({
        url: '/auth/logout',
        method: 'POST',
        data: { refreshToken },
      })
    }
  } catch (e) {
    error.value = '登出接口调用失败，已在前端强制清理登录态'
  } finally {
    authStore.clearAllClientAuthState()
    await clearCaches()
    await router.replace('/login')
    window.location.reload()
    loading.value = false
  }
}

async function goAdmin(): Promise<void> {
  await router.push('/admin/dashboard')
}

async function goMyBanRecords(): Promise<void> {
  await router.push('/user/ban-records')
}

async function goAppeal(): Promise<void> {
  await router.push('/user/appeal')
}

async function loadNotices(): Promise<void> {
  noticeLoading.value = true
  noticeError.value = ''
  try {
    const res = await request<ApiResponse<PageResponse<NoticeItem>>>({
      url: '/user/notices',
      method: 'GET',
      params: { page: 1, size: 5 },
    })
    if (res.code !== 0) {
      noticeError.value = res.message || '公告加载失败'
      return
    }
    notices.value = res.data.items || []
  } catch (e) {
    noticeError.value = (e as any)?.message || '公告加载失败'
  } finally {
    noticeLoading.value = false
  }
}

async function loadImportantPopup(): Promise<void> {
  try {
    const res = await request<ApiResponse<NoticeItem | null>>({
      url: '/user/notices/popup',
      method: 'GET',
    })
    if (res.code !== 0) return
    if (res.data && res.data.id) {
      importantNotice.value = res.data
      importantVisible.value = true
    }
  } catch {}
}

async function markNoticeRead(noticeId: number): Promise<void> {
  try {
    await request<ApiResponse<null>>({
      url: '/user/notices/read',
      method: 'POST',
      data: { noticeId },
    })
  } catch {}
}

async function confirmImportant(): Promise<void> {
  const n = importantNotice.value
  if (!n) return
  await markNoticeRead(n.id)
  importantVisible.value = false
  ElMessage.success('已确认')
  await loadNotices()
}

async function openNoticeDetail(n: NoticeItem): Promise<void> {
  detailNotice.value = n
  detailVisible.value = true
  await markNoticeRead(n.id)
  await loadNotices()
}

onMounted(() => {
  void loadNotices()
  void loadImportantPopup()
})
</script>

<template>
  <main style="padding: 16px; max-width: 900px; margin: 0 auto">
    <header
      style="
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      "
    >
      <div style="min-width: 240px">
        <div style="font-size: 20px; font-weight: 700">当前登录身份：{{ roleLabel }}</div>
        <div style="opacity: 0.75">用户ID：{{ authStore.session?.userId ?? '-' }}</div>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: flex-end">
        <button v-if="isAdmin" @click="goAdmin" style="padding: 10px 12px">系统管理入口</button>
        <button @click="goMyBanRecords" style="padding: 10px 12px">我的封禁记录</button>
        <button @click="goAppeal" style="padding: 10px 12px">申诉入口</button>
        <button @click="logout" :disabled="loading" style="padding: 10px 12px">
          {{ loading ? '登出中...' : '登出' }}
        </button>
      </div>
    </header>

    <section style="margin-top: 16px">
      <h1 style="margin: 0 0 8px">主界面</h1>
      <p style="margin: 0; opacity: 0.75">/home</p>
      <p v-if="error" style="margin-top: 12px; color: #c00">{{ error }}</p>
    </section>

    <section style="margin-top: 16px">
      <el-card shadow="never" body-style="padding: 16px">
        <template #header>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px">
            <div style="font-weight: 700">系统公告</div>
            <el-button size="small" :loading="noticeLoading" @click="loadNotices">刷新</el-button>
          </div>
        </template>

        <el-alert v-if="noticeError" type="error" :title="noticeError" show-icon :closable="false" style="margin-bottom: 12px" />

        <el-empty v-if="!noticeLoading && notices.length === 0" description="暂无公告" />
        <el-skeleton v-else-if="noticeLoading" :rows="4" animated />
        <el-space v-else direction="vertical" fill style="width: 100%">
          <el-button
            v-for="n in notices"
            :key="n.id"
            text
            style="justify-content: flex-start; width: 100%"
            @click="openNoticeDetail(n)"
          >
            <span style="margin-right: 8px; color: #1d4ed8">{{ n.pinned ? '置顶' : '公告' }}</span>
            <span style="flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
              {{ n.title }}
            </span>
            <span v-if="String(n.level).toUpperCase() === 'IMPORTANT'" style="margin-left: 8px; color: #c00">重要</span>
          </el-button>
        </el-space>
      </el-card>
    </section>
  </main>

  <el-dialog
    v-model="importantVisible"
    title="重要公告"
    width="900px"
    :close-on-click-modal="false"
    :show-close="false"
  >
    <div v-if="importantNotice">
      <div style="font-size: 18px; font-weight: 700; margin-bottom: 8px">{{ importantNotice.title }}</div>
      <pre style="white-space: pre-wrap; margin: 0; font-family: inherit">{{ importantNotice.content }}</pre>
    </div>
    <template #footer>
      <el-button type="primary" @click="confirmImportant">我已知晓</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="detailVisible" title="公告详情" width="900px">
    <div v-if="detailNotice">
      <div style="font-size: 18px; font-weight: 700; margin-bottom: 8px">{{ detailNotice.title }}</div>
      <div style="opacity: 0.75; margin-bottom: 12px">{{ detailNotice.publishAt ?? '' }}</div>
      <pre style="white-space: pre-wrap; margin: 0; font-family: inherit">{{ detailNotice.content }}</pre>
    </div>
    <template #footer>
      <el-button @click="detailVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>
