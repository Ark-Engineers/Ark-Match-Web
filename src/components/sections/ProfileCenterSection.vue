<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useMatchStore } from '@/stores/match'
import { useNotificationStore } from '@/stores/notification'
import { useSurveyStore } from '@/stores/survey'
import { resolveArkAvatarUrl } from '@/api/user'
import UiCard from '@/components/UiCard.vue'
import UiSpinner from '@/components/UiSpinner.vue'
import UiErrorState from '@/components/UiErrorState.vue'

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const matchStore = useMatchStore()
const notifStore = useNotificationStore()
const surveyStore = useSurveyStore()

const loading = ref(false)
const error = ref('')
/** 是否已有可展示的数据（用于区分首屏 loading 与后台静默刷新） */
const hasData = ref(false)
/** 个人中心顶部头像：优先 charId 拼 CDN，回落 avatarUrl；加载失败回退昵称首字母，src 变化时自动重试 */
const avatarError = ref(false)
const homeAvatarUrl = computed(() =>
  resolveArkAvatarUrl(auth.profile?.avatarCharId, auth.profile?.avatarUrl),
)
watch(homeAvatarUrl, () => {
  avatarError.value = false
})

async function loadData() {
  if (!auth.isLoggedIn) return
  loading.value = true
  // 已有数据时不清空 error 全屏态，静默刷新
  try {
    await Promise.all([
      auth.fetchProfile(),
      matchStore.fetchStats(),
      notifStore.fetchUnreadCount(),
      surveyStore.fetchCurrent(),
    ])
    error.value = ''
    hasData.value = true
  } catch (e: any) {
    // 首次加载失败 → 展示错误态；已有数据 → 保留旧数据仅 toast 提示
    if (!hasData.value) {
      error.value = e.message || '加载失败'
    } else {
      ui.showToast('数据刷新失败，展示的可能不是最新数据', 'error')
    }
  } finally {
    loading.value = false
  }
}

watch(() => auth.isLoggedIn, (loggedIn) => {
  if (loggedIn) loadData()
  else hasData.value = false
})

onMounted(() => {
  if (auth.isLoggedIn) loadData()
})

// Expose loadData so parent can call it after login
defineExpose({ loadData })

function onLoginClick() {
  ui.toggleLoginModal(true)
}

// computed：数据刷新后角标/状态自动更新
const entryCards = computed(() => [
  {
    title: '匹配状态',
    icon: '🎯',
    desc: '查看你的匹配池状态与活跃问卷',
    route: '/match-status',
    badge: surveyStore.currentState?.hasActiveAnswer ? '已入池' : '未入池',
    badgeColor: surveyStore.currentState?.hasActiveAnswer ? 'text-green-400 bg-green-500/10' : 'text-gray-500 bg-gray-800',
  },
  {
    title: '待处理匹配',
    icon: '💞',
    desc: '查看待确认的匹配结果',
    route: '/pending-matches',
    badge: matchStore.stats.pendingCount > 0 ? String(matchStore.stats.pendingCount) : null,
    badgeColor: 'text-cyan-400 bg-cyan-500/10',
  },
  {
    title: '问卷刷新',
    icon: '📝',
    desc: '更新你的问卷答案以刷新匹配',
    route: '/survey-refresh',
    badge: null,
  },
  {
    title: '通知',
    icon: '🔔',
    desc: '查看系统通知与匹配消息',
    route: '/notifications',
    badge: notifStore.unreadCount > 0 ? String(notifStore.unreadCount) : null,
    badgeColor: 'text-amber-400 bg-amber-500/10',
  },
])
</script>

<template>
  <section class="w-full h-screen flex flex-col items-center justify-center relative overflow-hidden px-4">
    <div class="absolute top-[90px] left-0 right-0 h-px bg-gray-700/50" />

    <div class="max-w-4xl w-full mx-auto">
      <h2 class="text-3xl md:text-4xl font-light text-white text-center mb-2 tracking-wider">个人中心</h2>

      <!-- Unauthenticated -->
      <div v-if="!auth.isLoggedIn" class="mt-12 text-center">
        <p class="text-gray-500 text-sm mb-8">登录后查看个人中心</p>
        <button
          class="px-8 py-3 bg-[#16B8E0] hover:bg-[#2ac6ea] text-white font-bold rounded-lg transition cursor-pointer"
          @click="onLoginClick"
        >登录 / 注册</button>
      </div>

      <!-- Authenticated -->
      <div v-else class="mt-8">
        <!-- Avatar row -->
        <div class="flex justify-center mb-8">
          <button
            class="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-gray-800/50 transition cursor-pointer"
            @click="router.push('/user/profile')"
          >
            <div class="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-lg text-gray-300 bg-transparent">
              <img
                v-if="homeAvatarUrl && !avatarError"
                :src="homeAvatarUrl"
                :alt="auth.profile?.nickname || '头像'"
                referrerpolicy="no-referrer"
                class="w-full h-full object-cover"
                @error="avatarError = true"
              >
              <span v-else>{{ auth.profile?.nickname?.charAt(0)?.toUpperCase() || '👤' }}</span>
            </div>
            <div class="text-left">
              <p class="text-white text-sm font-medium">{{ auth.profile?.nickname || '用户' }}</p>
              <p class="text-gray-500 text-xs">编辑资料 &rarr;</p>
            </div>
          </button>
        </div>

        <!-- 首次加载（无可展示数据） -->
        <UiSpinner v-if="loading && !hasData" label="加载中..." />
        <UiErrorState v-else-if="error && !hasData" :message="error" @retry="loadData" />

        <!-- Entry cards（已有数据时后台刷新不打断展示） -->
        <div v-else class="relative grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UiCard
            v-for="card in entryCards" :key="card.title"
            clickable
            @click="router.push(card.route)"
          >
            <div class="flex items-start justify-between">
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xl">{{ card.icon }}</span>
                  <h3 class="text-white font-semibold text-sm">{{ card.title }}</h3>
                </div>
                <p class="text-gray-500 text-xs">{{ card.desc }}</p>
              </div>
              <span v-if="card.badge"
                    class="px-2 py-0.5 rounded text-xs font-medium"
                    :class="card.badgeColor">{{ card.badge }}</span>
            </div>
          </UiCard>
        </div>
      </div>
    </div>
  </section>
</template>
