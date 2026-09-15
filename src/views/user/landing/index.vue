<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import TheNavBar from '@/components/TheNavBar.vue'
import UiModal from '@/components/UiModal.vue'
import UiButton from '@/components/UiButton.vue'
import LandingSection from '@/components/sections/LandingSection.vue'
import QuestionnaireSection from '@/components/sections/QuestionnaireSection.vue'
import ProfileCenterSection from '@/components/sections/ProfileCenterSection.vue'
import AboutSection from '@/components/sections/AboutSection.vue'
import { useFullpageScroll } from '@/composables/useFullpageScroll'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useSurveyStore } from '@/stores/survey'
import type { AnswerSubmit } from '@/api/questionnaire'

const SECTION_COUNT = 4
const { activeIndex, isTransitioning, scrollTo, containerRef } = useFullpageScroll(SECTION_COUNT)
const ui = useUiStore()
const auth = useAuthStore()
const surveyStore = useSurveyStore()

const profileSection = ref<InstanceType<typeof ProfileCenterSection> | null>(null)
const showLoginPrompt = ref(false)
const loginPromptPending = ref(false)
/** 未登录完成问卷后暂存的提交载荷，登录成功后自动提交 */
const pendingPayload = ref<{ questionnaireId: number; answers: AnswerSubmit[] } | null>(null)
const lastNonSurveyIndex = ref(0)

// Sync active section to UI store
watch(activeIndex, (idx) => {
  ui.activeSection = idx
  if (idx !== 1) lastNonSurveyIndex.value = idx
})

// When scrolling to profile center (section 2), refresh data if logged in
watch(activeIndex, (idx) => {
  if (idx === 2 && auth.isLoggedIn) {
    setTimeout(() => {
      profileSection.value?.loadData()
    }, 900)
  }
})

// After login modal closes, refresh profile data if logged in
watch(() => ui.showLoginModal, (show) => {
  if (!show) {
    setTimeout(() => {
      if (auth.isLoggedIn) {
        profileSection.value?.loadData()
      }
      // If login was prompted after questionnaire, submit pending answers then scroll to profile center
      if (loginPromptPending.value && auth.isLoggedIn) {
        loginPromptPending.value = false
        const payload = pendingPayload.value
        pendingPayload.value = null
        if (payload) {
          surveyStore.submit(payload.questionnaireId, payload.answers)
            .then(() => ui.showToast('问卷已提交', 'success'))
            .catch(() => ui.showToast('问卷提交失败，可稍后在个人中心重试', 'error'))
        }
        const target = lastNonSurveyIndex.value
        setTimeout(() => {
          scrollTo(target)
          if (target === 2) setTimeout(() => profileSection.value?.loadData(), 900)
        }, 400)
      }
    }, 300)
  }
})

function onNavNavigate(index: number) {
  scrollTo(index)
}

function onQuickStart() {
  // 未登录：直接唤起登录弹窗，登录后才能进入问卷填写
  if (!auth.isLoggedIn) {
    ui.toggleLoginModal(true)
    return
  }
  scrollTo(1)
}

// 记录离开时的区块：从个人中心(下标2)点进子路由再返回时，恢复到原区块而非回顶部
const HOME_ACTIVE_KEY = 'ark-match-home-active'
onBeforeUnmount(() => {
  try { sessionStorage.setItem(HOME_ACTIVE_KEY, String(activeIndex.value)) } catch { /* ignore */ }
})
onMounted(() => {
  try {
    const saved = Number(sessionStorage.getItem(HOME_ACTIVE_KEY) ?? '0')
    if (Number.isInteger(saved) && saved > 0 && saved < SECTION_COUNT) {
      nextTick(() => scrollTo(saved))
    }
  } catch { /* ignore */ }
})

function onQuestionnaireComplete(payload: { questionnaireId: number; answers: AnswerSubmit[] } | null) {
  if (auth.isLoggedIn) {
    // Already logged in — engine already submitted; go back to previous section
    setTimeout(() => {
      const target = lastNonSurveyIndex.value
      scrollTo(target)
      if (target === 2) setTimeout(() => profileSection.value?.loadData(), 900)
    }, 1500)
  } else {
    // Not logged in — hold the answers and show login prompt dialog
    pendingPayload.value = payload
    showLoginPrompt.value = true
  }
}

function onLoginPromptAccept() {
  showLoginPrompt.value = false
  loginPromptPending.value = true
  ui.toggleLoginModal(true)
}

function onLoginPromptDecline() {
  showLoginPrompt.value = false
  setTimeout(() => scrollTo(lastNonSurveyIndex.value), 300)
}
</script>

<template>
  <div class="h-screen w-screen overflow-hidden">
    <TheNavBar :active-section="activeIndex" @navigate="onNavNavigate" />

    <!-- 设计稿装饰线框：横线 y=20%/81%，竖线 right 21.4%（#9E9E9E） -->
    <div class="pointer-events-none absolute inset-0 z-[5]" aria-hidden="true">
      <div class="absolute top-[20%] left-0 right-0 h-[2px] bg-[#9E9E9E]/60" />
      <div class="absolute top-[81%] left-0 right-0 h-[2px] bg-[#9E9E9E]/60" />
      <div class="absolute top-0 bottom-0 right-[21.4%] w-[2px] bg-[#9E9E9E]/60" />
    </div>

    <!-- Fullpage scroll container -->
    <div ref="containerRef" class="h-full w-full" style="will-change: transform;">
      <LandingSection @quick-start="onQuickStart" />
      <QuestionnaireSection @complete="onQuestionnaireComplete" />
      <ProfileCenterSection ref="profileSection" />
      <AboutSection />
    </div>

    <!-- Login prompt dialog (shown after questionnaire if not logged in) -->
    <UiModal :show="showLoginPrompt" @close="onLoginPromptDecline">
      <div class="p-6 md:p-8 text-center">
        <div class="text-5xl mb-4">📝</div>
        <h3 class="text-xl font-bold text-white mb-2">问卷已完成！</h3>
        <p class="text-gray-400 text-sm mb-6">登录后可保存记录并参与匹配。<br/>是否立即登录？</p>
        <div class="flex gap-3 justify-center">
          <button
            class="px-5 py-2.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition cursor-pointer"
            @click="onLoginPromptDecline"
          >稍后再说</button>
          <UiButton @click="onLoginPromptAccept">立即登录</UiButton>
        </div>
      </div>
    </UiModal>

    <!-- Section indicator dots -->
    <div class="fixed right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3">
      <button
        v-for="i in SECTION_COUNT" :key="i"
        class="w-2 h-2 rounded-full transition-all cursor-pointer"
        :class="activeIndex === i - 1 ? 'bg-cyan-400 scale-125' : 'bg-gray-600 hover:bg-gray-400'"
        @click="scrollTo(i - 1)"
      />
    </div>
  </div>
</template>
