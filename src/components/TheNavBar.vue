<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useNotificationStore } from '@/stores/notification'
import { resolveArkAvatarUrl } from '@/api/user'

const props = defineProps<{
  activeSection: number
}>()

const emit = defineEmits<{
  navigate: [index: number]
}>()

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const notifStore = useNotificationStore()

/** navbar 头像：优先 charId 拼 CDN，回落 avatarUrl；失败回退昵称首字母，src 变化自动重试 */
const navbarAvatarError = ref(false)
const navbarAvatarUrl = computed(() =>
  resolveArkAvatarUrl(auth.profile?.avatarCharId, auth.profile?.avatarUrl),
)
watch(navbarAvatarUrl, () => {
  navbarAvatarError.value = false
})

// 设计稿顺序：问卷填写 → 个人中心 → 项目主页（滚到最后一页 AboutSection）
const navItems = [
  { label: '问卷填写', section: 1 },
  { label: '个人中心', section: 2 },
  { label: '项目主页', section: 3 },
]

const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)

function onNavClick(section: number) {
  emit('navigate', section)
}

function onLoginClick() {
  ui.toggleLoginModal(true)
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function closeMenu() {
  menuOpen.value = false
}

function onDocumentClick(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    closeMenu()
  }
}

function goProfile() {
  closeMenu()
  router.push('/profile')
}

function goNotifications() {
  closeMenu()
  router.push('/notifications')
}

function goNotices() {
  closeMenu()
  router.push('/notices')
}

function goAdmin() {
  closeMenu()
  router.push('/admin')
}

function goBanAppeal() {
  closeMenu()
  router.push('/ban-appeal')
}

async function onLogout() {
  closeMenu()
  await auth.logout()
  ui.showToast('已退出登录', 'success')
  router.push('/')
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  if (auth.isLoggedIn) notifStore.fetchUnreadCount()
})
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <nav class="fixed top-0 left-0 right-0 z-40 h-[90px] flex items-center justify-between px-8 md:px-12 bg-black/45 backdrop-blur-md">
    <!-- Logo -->
    <button class="flex items-center gap-3 cursor-pointer shrink-0" @click="onNavClick(0)">
      <img src="/logoD.png" alt="罗德之门" class="h-14 w-auto" />
    </button>

    <!-- Nav Links -->
    <div class="flex items-center gap-1 md:gap-4">
      <button
        v-for="item in navItems"
        :key="item.label"
        class="px-3 md:px-5 py-2 text-base md:text-lg font-semibold rounded-lg transition cursor-pointer"
        :class="activeSection === item.section
          ? 'text-[#F5F5F5] bg-white/10'
          : 'text-gray-300/80 hover:text-gray-100 hover:bg-white/5'"
        @click="onNavClick(item.section)"
      >
        {{ item.label }}
      </button>
    </div>

    <!-- Right: login button or user menu -->
    <div class="flex justify-end items-center min-w-[120px]">
      <!-- 管理员：管理后台入口 -->
      <button
        v-if="auth.isLoggedIn && auth.isAdmin"
        class="mr-3 px-4 py-2 text-sm font-semibold rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 transition cursor-pointer"
        @click="goAdmin"
      >管理后台</button>

      <!-- 未登录：登录/注册按钮 -->
      <button
        v-if="!auth.isLoggedIn"
        class="px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#16B8E0]/90 hover:bg-[#16B8E0] text-white transition cursor-pointer shadow-lg shadow-cyan-500/20"
        @click="onLoginClick"
      >登录 / 注册</button>

      <!-- 已登录：头像 + 欢迎语 + 下拉 -->
      <div v-else ref="menuRef" class="relative">
        <button
          class="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/5 transition cursor-pointer"
          @click="toggleMenu"
        >
          <div class="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-transparent">
              <img
                v-if="navbarAvatarUrl && !navbarAvatarError"
                :src="navbarAvatarUrl"
                :alt="auth.nickname || '头像'"
                referrerpolicy="no-referrer"
                class="w-full h-full object-cover"
                @error="navbarAvatarError = true"
              >
              <span v-else-if="auth.nickname">{{ auth.nickname.charAt(0).toUpperCase() }}</span>
              <span v-else class="text-xs">👤</span>
            </div>
          <div class="hidden md:block text-left leading-tight">
            <p class="text-white text-sm font-medium">{{ auth.nickname || '用户' }}</p>
            <p class="text-gray-400 text-xs">欢迎回来</p>
          </div>
          <svg
            class="w-3.5 h-3.5 text-gray-400 transition-transform"
            :class="menuOpen ? 'rotate-180' : ''"
            viewBox="0 0 12 12" fill="none"
          >
            <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <!-- 下拉菜单 -->
        <Transition name="menu">
          <div
            v-if="menuOpen"
            class="absolute right-0 top-full mt-2 w-48 bg-gray-900/95 backdrop-blur-md border border-gray-700/60 rounded-xl shadow-2xl overflow-hidden z-50"
          >
            <button class="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 transition cursor-pointer" @click="goProfile">
              <span class="w-4 text-center">👤</span>个人资料
            </button>
            <button class="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 transition cursor-pointer" @click="goNotifications">
              <span class="w-4 text-center relative">🔔
                <span v-if="notifStore.unreadCount > 0" class="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 flex items-center justify-center">{{ notifStore.unreadCount > 99 ? '99+' : notifStore.unreadCount }}</span>
              </span>我的通知
            </button>
            <button class="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 transition cursor-pointer" @click="goNotices">
              <span class="w-4 text-center">📢</span>系统公告
            </button>
            <button class="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 transition cursor-pointer" @click="goBanAppeal">
              <span class="w-4 text-center">⚖</span>封禁申诉
            </button>
            <div class="h-px bg-gray-700/60" />
            <button class="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition cursor-pointer" @click="onLogout">
              <span class="w-4 text-center">⏏</span>退出登录
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.menu-enter-active, .menu-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.menu-enter-from, .menu-leave-to { opacity: 0; transform: translateY(-6px); }
</style>