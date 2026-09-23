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
        { index: '/admin/lmd', label: '龙门币管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
        { index: '/admin/spine', label: '明日方舟小人导入', roles: ['ADMIN', 'SUPER_ADMIN'] },
        { index: '/admin/race', label: '赛马竞猜管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
        { index: '/admin/room', label: '房间管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
        { index: '/admin/m/1', label: '用户管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
        { index: '/admin/m/2', label: '问卷管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
        { index: '/admin/ban', label: '封禁管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
        { index: '/admin/profanity', label: '屏蔽词管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
        { index: '/admin/report', label: '举报管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
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
  if (p.startsWith('/admin/spine')) return 'SPINE'
  if (p.startsWith('/admin/race')) return 'RACE'
  if (p.startsWith('/admin/room')) return 'ROOM'
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

  <el-container class="admin-layout ark-admin-layout">
    <el-header class="admin-header">
      <div class="admin-header__accent" aria-hidden="true" />
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
          class="admin-dark-menu"
          :default-active="activeMenu"
          router
          background-color="transparent"
          text-color="rgba(203,213,225,0.8)"
          active-text-color="#60a5fa"
          :unique-opened="true"
          @select="onMenuSelect"
        >
          <el-sub-menu v-for="g in menuGroups" :key="g.index" :index="g.index">
            <template #title>
              <span class="admin-menu-group-title">{{ g.label }}</span>
            </template>
            <el-menu-item v-for="i in g.items" :key="i.index" :index="i.index">
              <span class="admin-menu-icon" aria-hidden="true">
                <svg v-if="i.index === '/admin/dashboard'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L10 4l7 6.5" /><path d="M5 9v7a1 1 0 001 1h3v-4h2v4h3a1 1 0 001-1V9" /></svg>
                <svg v-else-if="i.index === '/admin/notice'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l2-2h2l5-3v14l-5-3H5l-2-2V8z" /><path d="M14 8a3 3 0 010 4" /></svg>
                <svg v-else-if="i.index === '/admin/lmd'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7" /><path d="M10 6v8M7.5 8.5h5M7.5 11.5h5" /></svg>
                <svg v-else-if="i.index === '/admin/spine'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v10M6 9l4 4 4-4" /><path d="M4 15v2h12v-2" /></svg>
                <svg v-else-if="i.index === '/admin/race'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8v7a4 4 0 01-8 0V3z" /><path d="M6 5H4a1 1 0 00-1 1v1a3 3 0 003 3" /><path d="M14 5h2a1 1 0 011 1v1a3 3 0 01-3 3" /><path d="M8 14h4M8 17h4M10 14v3" /></svg>
                <svg v-else-if="i.index === '/admin/room'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3 9h14" /><circle cx="7" cy="6" r="1" fill="currentColor" /><circle cx="10" cy="6" r="1" fill="currentColor" /></svg>
                <svg v-else-if="i.index === '/admin/m/1'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="3" /><path d="M2 17a5 5 0 0110 0" /><circle cx="14" cy="8" r="2" /><path d="M14 12a4 4 0 014 4" /></svg>
                <svg v-else-if="i.index === '/admin/m/2'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="12" height="16" rx="1.5" /><path d="M7 7h6M7 10h6M7 13h3" /></svg>
                <svg v-else-if="i.index === '/admin/ban'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5l7-3z" /><path d="M7 10h6" /></svg>
                <svg v-else-if="i.index === '/admin/profanity'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h14M5 5v10a1 1 0 001 1h8a1 1 0 001-1V5" /><circle cx="10" cy="10.5" r="2" /><path d="M8.5 10.5h3" /></svg>
                <svg v-else-if="i.index === '/admin/report'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3v14M4 3h10l3 3v11H4" /><path d="M8 8h5M8 11h5M8 14h3" /></svg>
                <svg v-else-if="i.index === '/admin/permission'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3" /><path d="M10.5 10.5l6 6" /></svg>
                <svg v-else-if="i.index === '/admin/overview'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="3" height="6" rx="0.5" /><rect x="8.5" y="7" width="3" height="10" rx="0.5" /><rect x="14" y="3" width="3" height="14" rx="0.5" /></svg>
                <svg v-else-if="i.index === '/admin/settings'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.5" /><path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.6 5.6l1.4 1.4M13 13l1.4 1.4M14.4 5.6l-1.4 1.4M7 13l-1.4 1.4" /></svg>
              </span>
              <span class="admin-menu-label">{{ i.label }}</span>
            </el-menu-item>
          </el-sub-menu>
        </el-menu>
      </el-aside>

      <el-main class="admin-main">
        <RouterView v-slot="{ Component, route: viewRoute }">
          <Transition name="admin-page" mode="out-in">
            <div class="admin-page-shell" :key="viewRoute.fullPath">
              <component :is="Component" />
            </div>
          </Transition>
        </RouterView>
      </el-main>
    </el-container>

    <el-drawer v-model="isDrawerOpen" direction="ltr" size="260px" :with-header="false" @close="closeDrawer" class="admin-drawer-dark">
      <div class="admin-drawer-header">
        <span class="admin-drawer-brand">后台管理</span>
      </div>
      <el-menu
        class="admin-dark-menu"
        :default-active="activeMenu"
        router
        background-color="transparent"
        text-color="rgba(203,213,225,0.8)"
        active-text-color="#60a5fa"
        :unique-opened="true"
        @select="onMenuSelect"
      >
        <el-sub-menu v-for="g in menuGroups" :key="g.index" :index="g.index">
          <template #title>
            <span class="admin-menu-group-title">{{ g.label }}</span>
          </template>
          <el-menu-item v-for="i in g.items" :key="i.index" :index="i.index">
            <span class="admin-menu-icon" aria-hidden="true">
              <svg v-if="i.index === '/admin/dashboard'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L10 4l7 6.5" /><path d="M5 9v7a1 1 0 001 1h3v-4h2v4h3a1 1 0 001-1V9" /></svg>
              <svg v-else-if="i.index === '/admin/notice'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l2-2h2l5-3v14l-5-3H5l-2-2V8z" /><path d="M14 8a3 3 0 010 4" /></svg>
              <svg v-else-if="i.index === '/admin/lmd'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7" /><path d="M10 6v8M7.5 8.5h5M7.5 11.5h5" /></svg>
              <svg v-else-if="i.index === '/admin/spine'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v10M6 9l4 4 4-4" /><path d="M4 15v2h12v-2" /></svg>
              <svg v-else-if="i.index === '/admin/race'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8v7a4 4 0 01-8 0V3z" /><path d="M6 5H4a1 1 0 00-1 1v1a3 3 0 003 3" /><path d="M14 5h2a1 1 0 011 1v1a3 3 0 01-3 3" /><path d="M8 14h4M8 17h4M10 14v3" /></svg>
              <svg v-else-if="i.index === '/admin/room'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3 9h14" /><circle cx="7" cy="6" r="1" fill="currentColor" /><circle cx="10" cy="6" r="1" fill="currentColor" /></svg>
              <svg v-else-if="i.index === '/admin/m/1'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="3" /><path d="M2 17a5 5 0 0110 0" /><circle cx="14" cy="8" r="2" /><path d="M14 12a4 4 0 014 4" /></svg>
              <svg v-else-if="i.index === '/admin/m/2'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="12" height="16" rx="1.5" /><path d="M7 7h6M7 10h6M7 13h3" /></svg>
              <svg v-else-if="i.index === '/admin/ban'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5l7-3z" /><path d="M7 10h6" /></svg>
              <svg v-else-if="i.index === '/admin/profanity'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h14M5 5v10a1 1 0 001 1h8a1 1 0 001-1V5" /><circle cx="10" cy="10.5" r="2" /><path d="M8.5 10.5h3" /></svg>
              <svg v-else-if="i.index === '/admin/report'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3v14M4 3h10l3 3v11H4" /><path d="M8 8h5M8 11h5M8 14h3" /></svg>
              <svg v-else-if="i.index === '/admin/permission'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3" /><path d="M10.5 10.5l6 6" /></svg>
              <svg v-else-if="i.index === '/admin/overview'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="3" height="6" rx="0.5" /><rect x="8.5" y="7" width="3" height="10" rx="0.5" /><rect x="14" y="3" width="3" height="14" rx="0.5" /></svg>
              <svg v-else-if="i.index === '/admin/settings'" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.5" /><path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.6 5.6l1.4 1.4M13 13l1.4 1.4M14.4 5.6l-1.4 1.4M7 13l-1.4 1.4" /></svg>
            </span>
            <span class="admin-menu-label">{{ i.label }}</span>
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
    radial-gradient(900px 520px at 12% 18%, rgba(14, 165, 233, 0.05), transparent 60%),
    radial-gradient(760px 440px at 88% 12%, rgba(34, 211, 238, 0.04), transparent 60%),
    linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
}

/* ── Header ── */

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  background: #ffffff;
  color: #0f172a;
  border-bottom: 1px solid #e2e8f0;
  position: relative;
}

.admin-header__accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, #0ea5e9, #22d3ee);
}

.admin-header__left {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 4px;
}

.admin-brand {
  font-size: 15px;
  font-weight: 700;
  color: #0c4a6e;
  letter-spacing: 0.5px;
}

.admin-header__right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.admin-user-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  color: #334155;
  border: 1px solid #e2e8f0;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.admin-user-trigger:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.admin-user-trigger__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.admin-user-trigger__name {
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-user-trigger__meta {
  font-size: 11px;
  line-height: 14px;
  color: #64748b;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Dark Sidebar ── */

.admin-aside {
  background: #0f172a;
  border-right: none;
  overflow-y: auto;
  overflow-x: hidden;
}

.admin-aside::-webkit-scrollbar {
  width: 4px;
}

.admin-aside::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.2);
  border-radius: 2px;
}

.admin-dark-menu {
  border-right: none;
  padding: 8px 0;
}

.admin-menu-group-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.admin-menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.admin-menu-icon svg {
  display: block;
}

.admin-menu-label {
  font-size: 13px;
}

:deep(.admin-dark-menu .el-sub-menu__title) {
  height: 44px;
  line-height: 44px;
  color: rgba(148, 163, 184, 0.85) !important;
  background-color: transparent !important;
  margin: 2px 8px;
  border-radius: 6px;
  transition: background-color 150ms ease, color 150ms ease;
}

:deep(.admin-dark-menu .el-sub-menu__title:hover) {
  background-color: rgba(30, 41, 59, 0.8) !important;
  color: rgba(226, 232, 240, 0.95) !important;
}

:deep(.admin-dark-menu .el-sub-menu__title .el-sub-menu__icon-arrow) {
  color: rgba(100, 116, 139, 0.6);
}

:deep(.admin-dark-menu .el-menu-item) {
  height: 40px;
  line-height: 40px;
  color: rgba(203, 213, 225, 0.7) !important;
  background-color: transparent !important;
  margin: 1px 8px;
  border-radius: 6px;
  transition: background-color 150ms ease, color 150ms ease;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 20px !important;
}

:deep(.admin-dark-menu .el-menu-item:hover) {
  background-color: rgba(30, 41, 59, 0.6) !important;
  color: rgba(226, 232, 240, 0.95) !important;
}

:deep(.admin-dark-menu .el-menu-item.is-active) {
  background-color: rgba(14, 165, 233, 0.15) !important;
  color: #60a5fa !important;
  position: relative;
}

:deep(.admin-dark-menu .el-menu-item.is-active::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: #3b82f6;
}

:deep(.admin-dark-menu.el-menu--collapse .el-sub-menu__title span),
:deep(.admin-dark-menu.el-menu--collapse .el-sub-menu__icon-arrow) {
  display: none;
}

/* ── Dark Drawer (mobile) ── */

:deep(.admin-drawer-dark .el-drawer__body) {
  background: #0f172a;
  padding: 0;
  overflow-y: auto;
}

.admin-drawer-header {
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(51, 65, 85, 0.5);
}

.admin-drawer-brand {
  font-size: 15px;
  font-weight: 700;
  color: #e2e8f0;
  letter-spacing: 0.5px;
}

/* ── Main Content ── */

.admin-main {
  background: transparent;
  padding: 16px 20px 24px;
  overflow-x: hidden;
}

.admin-page-shell {
  min-height: calc(100vh - 56px - 16px - 24px);
}

/* ── Page Transition ── */

.admin-page-enter-active,
.admin-page-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.admin-page-enter-from,
.admin-page-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.admin-page-leave-from,
.admin-page-enter-to {
  opacity: 1;
  transform: translateY(0);
}

/* ── Reduced Motion ── */

@media (prefers-reduced-motion: reduce) {
  .admin-user-trigger {
    transition: none;
  }

  .admin-user-trigger:hover {
    transform: none;
    box-shadow: none;
  }

  :deep(.admin-dark-menu .el-sub-menu__title),
  :deep(.admin-dark-menu .el-menu-item) {
    transition: none;
  }

  .admin-page-enter-active,
  .admin-page-leave-active {
    transition: none;
  }

  .admin-page-enter-from,
  .admin-page-leave-to {
    opacity: 1;
    transform: none;
  }
}

/* ── Mobile ── */

@media (max-width: 1023px) {
  .admin-user-trigger__text {
    display: none;
  }

  .admin-aside {
    display: none;
  }
}
</style>
