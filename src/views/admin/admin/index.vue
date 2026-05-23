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

const activeMenu = computed(() => route.path)

const asideWidth = '220px'

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

function onMenuSelect(): void {
  if (isMobile.value) closeDrawer()
}

onMounted(() => {
  updateResponsiveState()
  window.addEventListener('resize', updateResponsiveState)
  void loadCurrentUserNickname()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateResponsiveState)
})
</script>

<template>
  <el-container class="admin-layout">
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
          background-color="#eaf4ff"
          text-color="#334155"
          active-text-color="#1d4ed8"
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
        background-color="#eaf4ff"
        text-color="#334155"
        active-text-color="#1d4ed8"
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

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  background: #ffffff;
  color: #111827;
  border-bottom: 1px solid #d6eaff;
}

.admin-header__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-brand {
  font-size: 16px;
  font-weight: 600;
  color: #1d4ed8;
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
  background: #ffffff;
  border: 1px solid #d6eaff;
}

.admin-user-trigger:hover {
  background: #f5faff;
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
  background: #eaf4ff;
  border-right: 1px solid #d6eaff;
}

.admin-menu {
  border-right: none;
  height: calc(100vh - 64px);
  padding: 8px 0;
}

.admin-main {
  background: #f5faff;
  padding: 16px 16px 22px;
  overflow-x: hidden;
}

:deep(.el-menu-item.is-active) {
  background: #d6eaff;
}

:deep(.el-sub-menu__title:hover),
:deep(.el-menu-item:hover) {
  background: #e6f2ff;
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
