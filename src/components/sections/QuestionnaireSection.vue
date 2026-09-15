<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useSurveyStore } from '@/stores/survey'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import SurveyEngine from '@/components/SurveyEngine.vue'
import UiButton from '@/components/UiButton.vue'
import UiSpinner from '@/components/UiSpinner.vue'
import type { AnswerSubmit } from '@/api/questionnaire'

type CompletePayload = { questionnaireId: number; answers: AnswerSubmit[] } | null

const emit = defineEmits<{
  complete: [payload: CompletePayload]
}>()

const store = useSurveyStore()
const auth = useAuthStore()
const ui = useUiStore()
const showEngine = ref(false)

// 未登录不请求（后端问卷接口需登录）；登录后再异步拉取当前问卷
async function load() {
  if (!auth.isLoggedIn) return
  if (store.questions.length === 0) {
    store.fetchCurrent().catch(() => { /* 错误态由模板展示 */ })
  }
}

onMounted(load)

// 登录状态变化：登录后拉取问卷；登出时回到入口态并清理
watch(() => auth.isLoggedIn, (v) => {
  if (v) {
    showEngine.value = false
    load()
  }
})

function start() {
  showEngine.value = true
}

function onSurveyComplete(payload: CompletePayload) {
  emit('complete', payload)
}

function backToIntro() {
  showEngine.value = false
}
</script>

<template>
  <section class="w-full h-screen flex flex-col items-center justify-center relative overflow-hidden px-4">
    <!-- Decorative top line -->
    <div class="absolute top-[90px] left-0 right-0 h-px bg-gray-700/50" />

    <!-- 未登录：前置提示登录 -->
    <div v-if="!auth.isLoggedIn" class="max-w-2xl w-full mx-auto text-center">
      <h2 class="text-3xl md:text-4xl font-light text-white mb-3 tracking-wider">问卷</h2>
      <p class="text-gray-500 text-sm mb-8">登录后即可填写问卷，完成后将加入匹配</p>
      <button
        class="px-8 py-3 bg-[#16B8E0] hover:bg-[#2ac6ea] text-white font-bold rounded-lg transition cursor-pointer"
        @click="ui.toggleLoginModal(true)"
      >登录 / 注册</button>
    </div>

    <!-- Loading -->
    <div v-else-if="store.loading && !store.questions.length" class="max-w-2xl w-full mx-auto text-center">
      <UiSpinner label="加载问卷中..." />
    </div>

    <!-- Error -->
    <div v-else-if="store.error && !store.questions.length" class="max-w-2xl w-full mx-auto text-center">
      <p class="text-gray-400 text-sm mb-6">{{ store.error }}</p>
      <UiButton @click="store.fetchCurrent()">重试</UiButton>
    </div>

    <!-- No available questionnaire -->
    <div v-else-if="!store.currentQuestionnaire" class="max-w-2xl w-full mx-auto text-center">
      <h2 class="text-3xl md:text-4xl font-light text-white mb-3 tracking-wider">问卷</h2>
      <p class="text-gray-500 text-sm">当前暂无可用问卷，请稍后再来。</p>
    </div>

    <!-- Intro card -->
    <div v-else-if="!showEngine" class="max-w-2xl w-full mx-auto text-center">
      <h2 class="text-3xl md:text-4xl font-light text-white mb-3 tracking-wider">
        {{ store.currentQuestionnaire.title }}
      </h2>
      <p v-if="store.currentQuestionnaire.subtitle" class="text-gray-500 text-sm mb-6">
        {{ store.currentQuestionnaire.subtitle }}
      </p>
      <p v-else class="text-gray-500 text-sm mb-6">{{ store.questions.length }} 个问题，完成后加入匹配池</p>

      <p v-if="store.currentState?.hasActiveAnswer" class="text-xs text-green-400 mb-6">
        ✔ 你已填写过本问卷<template v-if="store.currentState?.needReSubmit">，问卷已更新，重新填写可刷新匹配</template>
      </p>

      <UiButton @click="start">开始填写</UiButton>
    </div>

    <!-- Survey Engine -->
    <div v-else class="max-w-2xl w-full mx-auto">
      <button class="text-sm text-gray-500 hover:text-gray-300 mb-3 transition cursor-pointer" @click="backToIntro">
        &larr; 返回
      </button>
      <div class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 md:p-8 backdrop-blur-sm max-h-[70vh] overflow-y-auto">
        <SurveyEngine @complete="onSurveyComplete" @back="backToIntro" />
      </div>
    </div>
  </section>
</template>