<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'

import { request } from '@/api'
import { useAuthStore } from '@/stores/auth'

type ApiResponse<T> = { code: number; message: string; data: T }
type UserSearchItem = {
  userId: number
  account: string
  nickname: string | null
  email: string
  role: string
  status: string
  lastLoginIp: string | null
  relatedIps: string[]
}

type MenuItem = {
  index: string
  label: string
  roles: Array<'ADMIN' | 'SUPER_ADMIN'>
}

type MenuGroup = {
  index: string
  label: string
  items: MenuItem[]
}

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const isMobile = ref(false)
const isDrawerOpen = ref(false)

const nickname = ref<string>('—')

function resolveRoleLabel(role: unknown): string {
  const picked = String(role ?? '').toUpperCase()
  if (picked === 'SUPER_ADMIN') return '超级管理员'
  if (picked === 'ADMIN') return '管理员'
  return picked || '未知'
}

const roleLabel = computed(() => resolveRoleLabel(authStore.session?.role))

const userId = computed(() => authStore.session?.userId ?? null)

const avatarText = computed(() => {
  const n = nickname.value?.trim()
  if (n) return n.slice(0, 1)
  const r = roleLabel.value?.trim()
  if (r) return r.slice(0, 1)
  return 'U'
})

const currentRole = computed<'ADMIN' | 'SUPER_ADMIN'>(() => {
  const r = String(authStore.session?.role ?? '').toUpperCase()
  return r === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN'
})

const menuGroups = computed<MenuGroup[]>(() => {
  const all: MenuGroup[] = [
    {
      index: 'ops',
      label: '运营管理',
      items: [
        { index: '/admin/dashboard', label: '后台首页', roles: ['ADMIN', 'SUPER_ADMIN'] },
        { index: '/admin/notice', label: '公告管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
        { index: '/admin/m/1', label: '用户管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
        { index: '/admin/m/2', label: '问卷管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
        { index: '/admin/ban', label: '封禁管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
      ],
    },
    {
      index: 'system',
      label: '系统管理',
      items: [
        { index: '/admin/permission', label: '权限管理', roles: ['SUPER_ADMIN'] },
        { index: '/admin/overview', label: '数据概览', roles: ['ADMIN', 'SUPER_ADMIN'] },
        { index: '/admin/settings', label: '系统设置', roles: ['ADMIN', 'SUPER_ADMIN'] },
      ],
    },
  ]

  const role = currentRole.value
  return all
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => i.roles.includes(role)),
    }))
    .filter((g) => g.items.length > 0)
})

const activeMenu = computed(() => {
  const p = route.path
  if (p.startsWith('/admin/m/1')) return '/admin/m/1'
  if (p.startsWith('/admin/m/2')) return '/admin/m/2'
  return p
})

const asideWidth = '220px'

const watermark = computed(() => {
  const p = route.path
  if (p.startsWith('/admin/dashboard')) return 'ADMIN CENTER'
  if (p.startsWith('/admin/notice')) return 'NOTICE'
  if (p.startsWith('/admin/ban')) return 'BAN'
  if (p.startsWith('/admin/m/1')) return 'USERS'
  if (p.startsWith('/admin/m/2')) return 'QUESTIONNAIRE'
  if (p.startsWith('/admin/permission')) return 'PERMISSION'
  if (p.startsWith('/admin/overview')) return 'OVERVIEW'
  if (p.startsWith('/admin/settings')) return 'SETTINGS'
  if (p.startsWith('/admin/profile')) return 'PROFILE'
  return 'ADMIN'
})

function updateResponsiveState(): void {
  const mobile = window.innerWidth < 1024
  isMobile.value = mobile
  if (!mobile) isDrawerOpen.value = false
}

function toggleMenu(): void {
  if (!isMobile.value) return
  isDrawerOpen.value = !isDrawerOpen.value
}

function closeDrawer(): void {
  isDrawerOpen.value = false
}

async function loadCurrentUserNickname(): Promise<void> {
  const id = userId.value
  if (!id) {
    nickname.value = '—'
    return
  }

  try {
    const res = await request<ApiResponse<UserSearchItem[]>>({
      url: '/admin/user/search',
      method: 'GET',
      params: { userId: id, limit: 1 },
    })
    if (res.code !== 0) return
    const item = (res.data || [])[0]
    if (!item) return
    nickname.value = item.nickname?.trim() || item.account || `用户${id}`
  } catch {}
}

async function logout(): Promise<void> {
  try {
    await ElMessageBox.confirm('确认退出登录？', '提示', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
      closeOnClickModal: false,
    })
  } catch {
    return
  }

  try {
    await request<ApiResponse<unknown>>({
      url: '/auth/logout',
      method: 'POST',
      data: { refreshToken: authStore.session?.refreshToken ?? null },
    })
  } catch {}

  authStore.clearAllClientAuthState()
  try {
    if (typeof caches !== 'undefined' && caches?.keys) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {}

  ElMessage.success('已退出登录')
  await router.replace('/login')
  window.location.reload()
}

async function goUserHome(): Promise<void> {
  await router.push('/home')
}

async function goProfile(): Promise<void> {
  await router.push('/admin/profile')
}

function onMenuSelect(): void {
  if (isMobile.value) closeDrawer()
}

onMounted(() => {
  updateResponsiveState()
  window.addEventListener('resize', updateResponsiveState)
  void loadCurrentUserNickname()
  document.body.classList.add('ark-admin')
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateResponsiveState)
  document.body.classList.remove('ark-admin')
})
</script>

<template>
  <div class="ark-admin-bg" aria-hidden="true" />
  <div class="ark-admin-watermark" aria-hidden="true">{{ watermark }}</div>

  <el-container class="admin-layout ark-admin-layout">
    <el-header class="admin-header">
      <div class="admin-header__left">
        <div class="admin-brand">后台管理</div>
      </div>
      <div class="admin-header__right">
        <el-button v-if="isMobile" size="small" @click="toggleMenu">导航</el-button>
        <el-button size="small" plain type="primary" @click="goUserHome">返回用户界面</el-button>
        <el-dropdown trigger="click">
          <span class="admin-user-trigger">
            <el-avatar :size="28">{{ avatarText }}</el-avatar>
            <span class="admin-user-trigger__text">
              <span class="admin-user-trigger__name">{{ nickname }}</span>
              <span class="admin-user-trigger__meta">{{ roleLabel }} · ID {{ userId ?? '—' }}</span>
            </span>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>昵称：{{ nickname }}</el-dropdown-item>
              <el-dropdown-item disabled>身份：{{ roleLabel }}</el-dropdown-item>
              <el-dropdown-item disabled>用户ID：{{ userId ?? '—' }}</el-dropdown-item>
              <el-dropdown-item divided @click="goProfile">个人信息</el-dropdown-item>
              <el-dropdown-item divided @click="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-header>

    <el-container>
      <el-aside class="admin-aside" :width="asideWidth">
        <el-menu
          class="admin-menu"
          :default-active="activeMenu"
          router
          background-color="#ffffff"
          text-color="#0f172a"
          active-text-color="#0ea5e9"
          :unique-opened="true"
          @select="onMenuSelect"
        >
          <el-sub-menu v-for="g in menuGroups" :key="g.index" :index="g.index">
            <template #title>
              <span>{{ g.label }}</span>
            </template>
            <el-menu-item v-for="i in g.items" :key="i.index" :index="i.index">
              {{ i.label }}
            </el-menu-item>
          </el-sub-menu>
        </el-menu>
      </el-aside>

      <el-main class="admin-main">
        <RouterView />
      </el-main>
    </el-container>

    <el-drawer v-model="isDrawerOpen" direction="ltr" size="220px" :with-header="false" @close="closeDrawer">
      <el-menu
        class="admin-menu"
        :default-active="activeMenu"
        router
        background-color="#ffffff"
        text-color="#0f172a"
        active-text-color="#0ea5e9"
        :unique-opened="true"
        @select="onMenuSelect"
      >
        <el-sub-menu v-for="g in menuGroups" :key="g.index" :index="g.index">
          <template #title>
            <span>{{ g.label }}</span>
          </template>
          <el-menu-item v-for="i in g.items" :key="i.index" :index="i.index">
            {{ i.label }}
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-drawer>
  </el-container>
</template>

<style scoped>
.admin-layout {
  min-height: 100vh;
}

.ark-admin-layout {
  position: relative;
  z-index: 1;
}

.ark-admin-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(900px 520px at 12% 18%, rgba(14, 165, 233, 0.14), transparent 60%),
    radial-gradient(760px 440px at 88% 12%, rgba(34, 211, 238, 0.12), transparent 60%),
    radial-gradient(1200px 700px at 60% 85%, rgba(59, 130, 246, 0.1), transparent 65%),
    linear-gradient(180deg, #ffffff 0%, #f6fbff 55%, #ffffff 100%);
}

.ark-admin-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(14, 165, 233, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(14, 165, 233, 0.12) 1px, transparent 1px);
  background-size: 72px 72px;
  opacity: 0.22;
  mask-image: radial-gradient(circle at 40% 30%, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.6) 45%, transparent 72%);
}

.ark-admin-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(1px 1px at 12% 22%, rgba(15, 23, 42, 0.22) 0, transparent 55%),
    radial-gradient(1px 1px at 28% 38%, rgba(15, 23, 42, 0.14) 0, transparent 55%),
    radial-gradient(1px 1px at 44% 18%, rgba(15, 23, 42, 0.12) 0, transparent 55%),
    radial-gradient(1px 1px at 66% 28%, rgba(15, 23, 42, 0.14) 0, transparent 55%),
    radial-gradient(1px 1px at 78% 46%, rgba(15, 23, 42, 0.1) 0, transparent 55%),
    radial-gradient(1px 1px at 92% 18%, rgba(15, 23, 42, 0.12) 0, transparent 55%);
  opacity: 0.38;
}

.ark-admin-watermark {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(56px, 7vw, 120px);
  font-weight: 800;
  letter-spacing: 10px;
  color: rgba(15, 23, 42, 0.06);
  text-transform: uppercase;
  user-select: none;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  background: rgba(255, 255, 255, 0.78);
  color: #0f172a;
  border-bottom: 1px solid rgba(14, 165, 233, 0.22);
  backdrop-filter: blur(10px);
}

.admin-header__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-brand {
  font-size: 16px;
  font-weight: 600;
  color: rgba(2, 132, 199, 0.92);
  letter-spacing: 1px;
}

.admin-header__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-user-trigger {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 10px;
  cursor: pointer;
  user-select: none;
  color: #0f172a;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(14, 165, 233, 0.22);
}

.admin-user-trigger:hover {
  background: rgba(255, 255, 255, 0.96);
}

.admin-user-trigger__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
}

.admin-user-trigger__name {
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-user-trigger__meta {
  font-size: 12px;
  line-height: 16px;
  opacity: 0.85;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-aside {
  background: rgba(255, 255, 255, 0.78);
  border-right: 1px solid rgba(14, 165, 233, 0.18);
  backdrop-filter: blur(10px);
}

.admin-menu {
  border-right: none;
  height: calc(100vh - 64px);
  padding: 8px 0;
}

.admin-main {
  background: transparent;
  padding: 16px 16px 22px;
  overflow-x: hidden;
}

:deep(.el-menu-item.is-active) {
  background: rgba(14, 165, 233, 0.12);
}

:deep(.el-sub-menu__title:hover),
:deep(.el-menu-item:hover) {
  background: rgba(14, 165, 233, 0.08);
}

@media (max-width: 1023px) {
  .admin-user-trigger__text {
    display: none;
  }

  .admin-aside {
    display: none;
  }
}
</style>
