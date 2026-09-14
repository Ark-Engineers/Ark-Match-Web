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

type HeaderProfile = {
  userId: number
  account: string
  nickname: string
  avatarUrl: string | null
  avatarCharId: string | null
  avatarCharName: string | null
}

const normalizedRole = computed(() => String(authStore.role ?? '').toUpperCase())
const isAdmin = computed(() => normalizedRole.value === 'ADMIN' || normalizedRole.value === 'SUPER_ADMIN')
const roleLabel = computed(() => {
  if (normalizedRole.value === 'SUPER_ADMIN') return '超级管理员'
  if (normalizedRole.value === 'ADMIN') return '管理员'
  return '普通用户'
})

const loading = ref(false)
const error = ref('')

const headerProfile = ref<HeaderProfile | null>(null)
const displayName = computed(() => {
  const p = headerProfile.value
  const nickname = String(p?.nickname || '').trim()
  if (nickname) return nickname
  const account = String(p?.account || '').trim()
  if (account) return account
  const uid = authStore.session?.userId
  return uid ? `用户${uid}` : '用户'
})

function buildAvatarUrl(id: string): string {
  return `https://web.hycdn.cn/arknights/game/assets/char/avatar/${id}.png`
}

const displayAvatarUrl = computed(() => {
  const p = headerProfile.value
  if (p?.avatarUrl) return p.avatarUrl
  if (p?.avatarCharId) return buildAvatarUrl(p.avatarCharId)
  return null
})

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

async function goMyProfile(): Promise<void> {
  await router.push('/user/profile')
}

async function goMatch(): Promise<void> {
  await router.push('/match')
}

async function goAppeal(): Promise<void> {
  await router.push('/user/appeal')
}

async function loadHeaderProfile(): Promise<void> {
  try {
    const res = await request<ApiResponse<HeaderProfile>>({ url: '/user/profile', method: 'GET' })
    if (res.code !== 0) return
    headerProfile.value = res.data
  } catch {}
}

async function handleTopNav(action: 'intro' | 'match' | 'guide' | 'faq'): Promise<void> {
  if (action === 'match') {
    await goMatch()
    return
  }
  ElMessage.info('该页面待完善')
}

async function handleUserCommand(
  cmd: 'admin' | 'profile' | 'match' | 'banRecords' | 'appeal' | 'logout',
): Promise<void> {
  if (cmd === 'admin') {
    await goAdmin()
    return
  }
  if (cmd === 'profile') {
    await goMyProfile()
    return
  }
  if (cmd === 'match') {
    await goMatch()
    return
  }
  if (cmd === 'banRecords') {
    await goMyBanRecords()
    return
  }
  if (cmd === 'appeal') {
    await goAppeal()
    return
  }
  if (cmd === 'logout') {
    await logout()
  }
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
  void loadHeaderProfile()
  void loadNotices()
  void loadImportantPopup()
})
</script>

<template>
  <header class="home-topbar">
    <div class="home-topbar-inner">
      <div class="home-brand" @click="router.push('/home')">
        <img class="home-brand-logo" src="/mrfzLogo.png" alt="ArkMatch" />
        <div class="home-brand-text">
          <div class="home-brand-title">ArkMatch</div>
        </div>
      </div>

      <nav class="home-nav">
        <button class="home-nav-item" type="button" @click="handleTopNav('intro')">产品介绍</button>
        <button class="home-nav-item" type="button" @click="handleTopNav('match')">匹配说明</button>
        <button class="home-nav-item" type="button" @click="handleTopNav('guide')">使用指南</button>
        <button class="home-nav-item" type="button" @click="handleTopNav('faq')">FAQ</button>
      </nav>

      <el-dropdown trigger="click" popper-class="home-user-popper" @command="handleUserCommand">
        <div class="home-user-trigger">
          <span class="home-user-avatar">
            <img v-if="displayAvatarUrl" class="home-user-avatar-img" :src="displayAvatarUrl" alt="avatar" />
            <span v-else class="home-user-avatar-fallback">{{ displayName.slice(0, 1) }}</span>
          </span>
          <span class="home-user-name">{{ displayName }}, 欢迎您</span>
          <span class="home-user-caret">▾</span>
        </div>
        <template #dropdown>
          <el-dropdown-menu class="home-user-menu">
            <el-dropdown-item v-if="isAdmin" command="admin">
              <div class="home-menu-item">
                <span class="home-menu-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M12 2l8 4v6c0 5-3.2 9.4-8 10-4.8-.6-8-5-8-10V6l8-4Z"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M12 7v5l3 2"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
                <span class="home-menu-text">
                  <span class="home-menu-title">后台管理</span>
                  <span class="home-menu-desc">进入系统管理控制台</span>
                </span>
              </div>
            </el-dropdown-item>

            <el-dropdown-item command="profile">
              <div class="home-menu-item">
                <span class="home-menu-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M20 21a8 8 0 1 0-16 0"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                    />
                    <path
                      d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
                <span class="home-menu-text">
                  <span class="home-menu-title">个人中心</span>
                  <span class="home-menu-desc">查看与管理个人信息</span>
                </span>
              </div>
            </el-dropdown-item>

            <el-dropdown-item command="match">
              <div class="home-menu-item">
                <span class="home-menu-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <path d="M12 8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <path
                      d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
                <span class="home-menu-text">
                  <span class="home-menu-title">匹配状态</span>
                  <span class="home-menu-desc">查看本轮匹配进度与结果</span>
                </span>
              </div>
            </el-dropdown-item>

            <el-dropdown-item command="banRecords">
              <div class="home-menu-item">
                <span class="home-menu-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M6 11V8a6 6 0 0 1 12 0v3"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
                <span class="home-menu-text">
                  <span class="home-menu-title">封禁记录</span>
                  <span class="home-menu-desc">查看我的封禁状态与历史</span>
                </span>
              </div>
            </el-dropdown-item>

            <el-dropdown-item command="appeal">
              <div class="home-menu-item">
                <span class="home-menu-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 8h10M7 12h7M7 16h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <path
                      d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
                <span class="home-menu-text">
                  <span class="home-menu-title">申诉入口</span>
                  <span class="home-menu-desc">提交解封申诉与反馈</span>
                </span>
              </div>
            </el-dropdown-item>

            <el-dropdown-item command="logout" divided :disabled="loading">
              <div class="home-menu-item home-menu-item--danger">
                <span class="home-menu-icon home-menu-icon--danger">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M3 12h10m0 0-3-3m3 3-3 3"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
                <span class="home-menu-text">
                  <span class="home-menu-title">{{ loading ? '登出中...' : '退出登录' }}</span>
                  <span class="home-menu-desc">安全退出当前账号</span>
                </span>
              </div>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div class="home-topbar-meta">
      <div class="home-topbar-meta-inner">
        <div class="home-role">已登录：{{ roleLabel }}</div>
        <div class="home-userid">用户ID：{{ authStore.session?.userId ?? '-' }}</div>
      </div>
    </div>
  </header>

  <main class="home-main">

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

<style scoped>
.home-topbar {
  padding: 10px 16px 0;
  background: radial-gradient(1200px 400px at 50% 0%, rgba(56, 189, 248, 0.12), transparent 55%),
    linear-gradient(180deg, #070b10, #05070c);
}

.home-topbar-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px 14px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.55), rgba(2, 6, 23, 0.55));
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.home-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 190px;
  cursor: pointer;
  user-select: none;
}

.home-brand-logo {
  width: 56px;
  height: 56px;
  border-radius: 0;
  object-fit: contain;
}

.home-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.home-brand-title {
  font-size: 18px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.92);
}

.home-nav {
  flex: 1;
  display: flex;
  justify-content: center;
  gap: 26px;
}

.home-nav-item {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 650;
  color: rgba(226, 232, 240, 0.78);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.home-nav-item:hover {
  color: rgba(255, 255, 255, 0.92);
  background: rgba(148, 163, 184, 0.12);
}

.home-user-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  padding: 6px 10px;
  border-radius: 12px;
  transition: background 0.15s ease;
}

.home-user-trigger:hover {
  background: rgba(148, 163, 184, 0.12);
}

.home-user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.16);
  border: 1px solid rgba(148, 163, 184, 0.22);
  flex: 0 0 auto;
}

.home-user-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.home-user-avatar-fallback {
  font-weight: 750;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.86);
}

.home-user-name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 650;
  color: rgba(226, 232, 240, 0.86);
}

.home-user-caret {
  color: rgba(226, 232, 240, 0.7);
}

.home-topbar-meta {
  padding: 8px 16px 10px;
}

.home-topbar-meta-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  color: rgba(226, 232, 240, 0.68);
  font-size: 12px;
}

.home-main {
  padding: 16px;
  max-width: 900px;
  margin: 0 auto;
}

:global(.home-user-popper) {
  --el-bg-color-overlay: #05070c;
  --el-border-color-light: rgba(148, 163, 184, 0.18);
  min-width: 280px;
  padding: 8px;
  border-radius: 16px;
  background: #05070c;
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 20px 46px rgba(0, 0, 0, 0.55);
}

:global(.home-user-popper .el-popper__arrow::before) {
  background: #05070c !important;
  border: 1px solid rgba(148, 163, 184, 0.18) !important;
}

:global(.home-user-popper .home-user-menu),
:global(.home-user-popper .el-dropdown-menu) {
  border: 0;
  background: transparent !important;
  padding: 0;
}

:global(.home-user-popper .el-dropdown-menu__item) {
  height: auto;
  line-height: normal;
  padding: 10px 10px;
  border-radius: 12px;
  color: rgba(226, 232, 240, 0.9);
}

:global(.home-user-popper .el-dropdown-menu__item:hover) {
  background: rgba(148, 163, 184, 0.12);
}

:global(.home-user-popper .el-dropdown-menu__item--divided) {
  margin-top: 8px;
}

:global(.home-user-popper .el-dropdown-menu__item--divided:before) {
  left: 10px;
  right: 10px;
  background-color: rgba(148, 163, 184, 0.18);
}

.home-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.home-menu-icon {
  width: 32px;
  height: 32px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.12);
  border: 1px solid rgba(148, 163, 184, 0.16);
  color: rgba(226, 232, 240, 0.92);
  flex: 0 0 auto;
}

.home-menu-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.home-menu-title {
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
}

.home-menu-desc {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.68);
}

.home-menu-item--danger .home-menu-title {
  color: rgba(248, 113, 113, 0.95);
}

.home-menu-icon--danger {
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.18);
  color: rgba(248, 113, 113, 0.95);
}
</style>
