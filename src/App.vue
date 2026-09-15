<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ErrorBoundary from './components/ErrorBoundary.vue'
import UiToast from '@/components/UiToast.vue'
import UiModal from '@/components/UiModal.vue'
import LoginModal from '@/components/LoginModal.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { getNoticePopup, type UserNotice } from '@/api/notice'

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

// 未读重要公告弹窗
const noticeVisible = ref(false)
const popupNotice = ref<UserNotice | null>(null)

async function checkNoticePopup() {
  if (!auth.isLoggedIn) return
  try {
    const n = await getNoticePopup()
    if (n) {
      popupNotice.value = n
      noticeVisible.value = true
    }
  } catch { /* 公告弹窗失败不阻断页面 */ }
}

function goNotices() {
  noticeVisible.value = false
  router.push('/notices')
}

// 会话过期 / 未登录引导
function onForceLogout() {
  if (!auth.isLoggedIn) return
  auth.clear()
  ui.showToast('登录已过期，请重新登录', 'info')
  if (router.currentRoute.value.path !== '/' && router.currentRoute.value.path !== '/home') {
    router.replace('/')
  }
  ui.toggleLoginModal(true)
}

onMounted(() => {
  window.addEventListener('auth:force-logout', onForceLogout)
  if (auth.isLoggedIn) auth.startSessionWatcher()
  checkNoticePopup()
  watch(() => auth.isLoggedIn, (v) => {
    if (v) checkNoticePopup()
  })
})

onUnmounted(() => {
  window.removeEventListener('auth:force-logout', onForceLogout)
  auth.stopSessionWatcher()
})
</script>

<template>
  <!-- 全局背景：氛围照片底图 + 深色遮罩（沿用 v1 落地页设计） -->
  <div class="fixed inset-0 -z-10 bg-[#0a0f14]" aria-hidden="true">
    <img src="/photo-bg.jpg" alt="" class="w-full h-full object-cover" />
    <div class="absolute inset-0 bg-black/30" />
  </div>

  <ErrorBoundary>
    <RouterView />
  </ErrorBoundary>

  <!-- 全局登录弹窗：任意页面可用，不随路由卸载 -->
  <LoginModal />

  <!-- 未读重要公告弹窗 -->
  <UiModal :show="noticeVisible" @close="noticeVisible = false">
    <div class="p-6 space-y-4">
      <div>
        <p class="text-xs text-gray-500 mb-1">重要公告</p>
        <h2 class="text-xl font-semibold text-white">{{ popupNotice?.title }}</h2>
      </div>
      <div class="max-h-[45vh] overflow-y-auto whitespace-pre-wrap text-sm text-gray-200 leading-relaxed">{{ popupNotice?.content }}</div>
      <div class="grid grid-cols-2 gap-3 pt-1">
        <button
          class="py-2.5 rounded-xl bg-white/5 border border-gray-700 text-gray-300 text-sm font-medium hover:bg-white/10 transition cursor-pointer"
          @click="noticeVisible = false"
        >我知道了</button>
        <button
          class="py-2.5 rounded-xl bg-cyan-500/90 text-white text-sm font-medium hover:bg-cyan-500 transition cursor-pointer"
          @click="goNotices"
        >查看全部公告</button>
      </div>
    </div>
  </UiModal>

  <UiToast />
</template>