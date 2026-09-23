<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { unwrap } from '@/api/user-http'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const roleLabel = computed(() => {
  const r = String(authStore.session?.role ?? '').toUpperCase()
  if (r === 'SUPER_ADMIN') return '超级管理员'
  if (r === 'ADMIN') return '管理员'
  return r || '未知'
})

const userId = computed(() => authStore.session?.userId ?? null)

interface DashboardStats {
  totalUsers: number
  adminUsers: number
  superAdminUsers: number
  totalBans: number
  activeBans: number
  totalRooms: number
  onlineRooms: number
  totalNotices: number
  publishedNotices: number
  totalQuestionnaires: number
  readyQuestionnaires: number
  totalSpineAssets: number
  totalRaces: number
  activeRaces: number
}

const stats = ref<DashboardStats | null>(null)
const statsLoading = ref(false)

async function loadStats() {
  statsLoading.value = true
  try {
    stats.value = await unwrap<DashboardStats>({ url: '/admin/dashboard/stats', method: 'GET' })
  } catch {
    stats.value = null
  } finally {
    statsLoading.value = false
  }
}

type StatCard = {
  label: string
  value: () => string
  sub: () => string
  accent: string
}

const statCards = computed<StatCard[]>(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: '用户', value: () => String(s.totalUsers), sub: () => `管理员 ${s.adminUsers} · 超管 ${s.superAdminUsers}`, accent: '#8b5cf6' },
    { label: '封禁', value: () => String(s.totalBans), sub: () => `活跃 ${s.activeBans}`, accent: '#ef4444' },
    { label: '房间', value: () => String(s.totalRooms), sub: () => `在线 ${s.onlineRooms}`, accent: '#0ea5e9' },
    { label: '公告', value: () => String(s.totalNotices), sub: () => `已发布 ${s.publishedNotices}`, accent: '#10b981' },
    { label: '问卷', value: () => String(s.totalQuestionnaires), sub: () => `已就绪 ${s.readyQuestionnaires}`, accent: '#f59e0b' },
    { label: 'Spine', value: () => String(s.totalSpineAssets), sub: () => '资源', accent: '#6366f1' },
    { label: '赛马', value: () => String(s.totalRaces), sub: () => `活跃 ${s.activeRaces}`, accent: '#ec4899' },
  ]
})

type NavCard = {
  title: string
  desc: string
  path: string
  icon: string
  accent: string
}

const navCards: NavCard[] = [
  { title: '公告管理', desc: '发布、编辑和上下线系统公告', path: '/admin/notice', icon: 'notice', accent: '#0ea5e9' },
  { title: '用户管理', desc: '查询用户信息、调整账户数据', path: '/admin/m/1', icon: 'users', accent: '#8b5cf6' },
  { title: '封禁管理', desc: 'IP / 邮箱 / 用户封禁与解封', path: '/admin/ban', icon: 'ban', accent: '#ef4444' },
  { title: '龙门币管理', desc: '余额调整、流水查询、邮件发放', path: '/admin/lmd', icon: 'lmd', accent: '#f59e0b' },
  { title: '问卷管理', desc: '管理问卷题目、查看答卷数据', path: '/admin/m/2', icon: 'doc', accent: '#10b981' },
  { title: '赛马竞猜', desc: '创建赛马、管理竞猜与颁奖', path: '/admin/race', icon: 'race', accent: '#ec4899' },
  { title: '小人导入', desc: '导入和管理明日方舟 Spine 资源', path: '/admin/spine', icon: 'spine', accent: '#6366f1' },
  { title: '房间管理', desc: '创建和管理联机房间', path: '/admin/room', icon: 'room', accent: '#14b8a6' },
  { title: '系统设置', desc: '系统参数配置与维护', path: '/admin/settings', icon: 'settings', accent: '#64748b' },
]

const superAdminCards: NavCard[] = [
  { title: '权限管理', desc: '角色与权限分配', path: '/admin/permission', icon: 'key', accent: '#0891b2' },
]

const isSuperAdmin = computed(() => String(authStore.session?.role ?? '').toUpperCase() === 'SUPER_ADMIN')

const allCards = computed(() => {
  if (isSuperAdmin.value) return [...navCards, ...superAdminCards]
  return navCards
})

onMounted(() => {
  void loadStats()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-header admin-animate-in" style="--delay: 0ms">
      <div>
        <div class="admin-title">后台首页</div>
        <div class="admin-subtitle">
          {{ roleLabel }} · ID {{ userId ?? '—' }}
        </div>
      </div>
    </div>

    <div class="stats-grid admin-animate-in" style="--delay: 40ms">
      <div v-if="statsLoading && !stats" class="stats-skeleton">
        <div v-for="i in 7" :key="i" class="stat-card stat-card--skeleton" />
      </div>
      <template v-else-if="stats">
        <div v-for="card in statCards" :key="card.label" class="stat-card">
          <div class="stat-card__label">{{ card.label }}</div>
          <div class="stat-card__value" :style="{ color: card.accent }">{{ card.value() }}</div>
          <div class="stat-card__sub">{{ card.sub() }}</div>
        </div>
      </template>
      <div v-else class="stats-empty">统计数据加载失败</div>
    </div>

    <div class="nav-section admin-animate-in" style="--delay: 80ms">
      <div class="nav-section__title">功能导航</div>
      <div class="dash-grid">
        <div
          v-for="card in allCards"
          :key="card.path"
          class="dash-card"
          @click="router.push(card.path)"
        >
          <div class="dash-card__icon" :style="{ color: card.accent }">
            <svg v-if="card.icon === 'notice'" viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l2-2h2l5-3v14l-5-3H5l-2-2V8z" /><path d="M14 8a3 3 0 010 4" /></svg>
            <svg v-else-if="card.icon === 'users'" viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="3" /><path d="M2 17a5 5 0 0110 0" /><circle cx="14" cy="8" r="2" /><path d="M14 12a4 4 0 014 4" /></svg>
            <svg v-else-if="card.icon === 'ban'" viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5l7-3z" /><path d="M7 10h6" /></svg>
            <svg v-else-if="card.icon === 'lmd'" viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7" /><path d="M10 6v8M7.5 8.5h5M7.5 11.5h5" /></svg>
            <svg v-else-if="card.icon === 'doc'" viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="12" height="16" rx="1.5" /><path d="M7 7h6M7 10h6M7 13h3" /></svg>
            <svg v-else-if="card.icon === 'race'" viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8v7a4 4 0 01-8 0V3z" /><path d="M6 5H4a1 1 0 00-1 1v1a3 3 0 003 3" /><path d="M14 5h2a1 1 0 011 1v1a3 3 0 01-3 3" /><path d="M8 14h4M8 17h4M10 14v3" /></svg>
            <svg v-else-if="card.icon === 'spine'" viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v10M6 9l4 4 4-4" /><path d="M4 15v2h12v-2" /></svg>
            <svg v-else-if="card.icon === 'room'" viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3 9h14" /><circle cx="7" cy="6" r="1" fill="currentColor" /><circle cx="10" cy="6" r="1" fill="currentColor" /></svg>
            <svg v-else-if="card.icon === 'settings'" viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.5" /><path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.6 5.6l1.4 1.4M13 13l1.4 1.4M14.4 5.6l-1.4 1.4M7 13l-1.4 1.4" /></svg>
            <svg v-else-if="card.icon === 'key'" viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3" /><path d="M10.5 10.5l6 6" /></svg>
          </div>
          <div class="dash-card__body">
            <div class="dash-card__title">{{ card.title }}</div>
            <div class="dash-card__desc">{{ card.desc }}</div>
          </div>
          <div class="dash-card__arrow" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4" /></svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-subtitle {
  font-size: 13px;
  color: #64748b;
  margin-top: 2px;
}

.stats-grid {
  margin-bottom: 16px;
}

.stats-grid,
.stats-skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}

.stat-card {
  padding: 14px 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.stat-card__label {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.stat-card__value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.stat-card__sub {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

.stat-card--skeleton {
  height: 76px;
  background: #f1f5f9;
  animation: skeleton-pulse 1.2s ease-in-out infinite;
}

.stats-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 20px;
  color: #94a3b8;
  font-size: 13px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.nav-section {
  margin-top: 4px;
}

.nav-section__title {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 10px;
}

.dash-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.dash-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: box-shadow 160ms ease, border-color 160ms ease;
}

.dash-card:hover {
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
  border-color: #cbd5e1;
}

.dash-card__icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #f8fafc;
}

.dash-card__body {
  flex: 1;
  min-width: 0;
}

.dash-card__title {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 2px;
}

.dash-card__desc {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
}

.dash-card__arrow {
  flex-shrink: 0;
  color: #cbd5e1;
  transition: color 160ms ease, transform 160ms ease;
}

.dash-card:hover .dash-card__arrow {
  color: #64748b;
  transform: translateX(2px);
}

@media (prefers-reduced-motion: reduce) {
  .dash-card {
    transition: none;
  }

  .dash-card:hover {
    box-shadow: none;
  }

  .dash-card__arrow {
    transition: none;
  }

  .dash-card:hover .dash-card__arrow {
    transform: none;
  }

  .stat-card--skeleton {
    animation: none;
  }
}

@media (max-width: 640px) {
  .stats-grid,
  .stats-skeleton {
    grid-template-columns: repeat(2, 1fr);
  }

  .dash-grid {
    grid-template-columns: 1fr;
  }
}
</style>
