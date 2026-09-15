<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSurveyStore } from '@/stores/survey'
import { useUiStore } from '@/stores/ui'
import type { SurveyTrack } from '@/api/survey'
import UiCard from '@/components/UiCard.vue'
import UiButton from '@/components/UiButton.vue'
import UiSpinner from '@/components/UiSpinner.vue'
import UiEmptyState from '@/components/UiEmptyState.vue'
import UiErrorState from '@/components/UiErrorState.vue'
import SurveyEngine from '@/components/SurveyEngine.vue'

const router = useRouter()
const surveyStore = useSurveyStore()
const ui = useUiStore()
const loading = ref(true)
const error = ref('')
const selectedTrack = ref<SurveyTrack | null>(null)
const prefill = ref<Record<string, any> | null>(null)
const editing = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    await surveyStore.fetchSurveyStatus()
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
})

async function selectTrack(track: SurveyTrack) {
  selectedTrack.value = track
  editing.value = false
  loading.value = true
  try {
    const data = await surveyStore.fetchSurvey(track)
    prefill.value = data?.answers && Object.keys(data.answers).length ? data.answers : {}
  } finally {
    loading.value = false
  }
  // 拉取到预填后进入编辑态，否则点击卡片无响应
  editing.value = true
}

function startEdit() {
  editing.value = true
}

function onComplete() {
  ui.showToast('问卷已更新', 'success')
  router.back()
}

const trackLabels: Record<string, string> = {
  FRIEND: '交友问卷',
  LOVE: '恋爱问卷',
}

const activeStatus = computed(() => surveyStore.surveyStatus)
</script>

<template>
  <div class="min-h-screen">
    <div class="max-w-lg mx-auto px-4 py-8">
      <div class="flex items-center gap-4 mb-8">
        <button class="text-gray-400 hover:text-white transition cursor-pointer" @click="router.back()">&larr; 返回</button>
        <h1 class="text-xl font-bold text-white">问卷刷新</h1>
      </div>

      <UiSpinner v-if="loading" label="加载中..." />
      <UiErrorState v-else-if="error" :message="error" @retry="surveyStore.fetchSurveyStatus()" />

      <!-- Editing mode -->
      <div v-else-if="editing && selectedTrack && prefill">
        <div class="flex items-center gap-3 mb-4">
          <button class="text-gray-400 hover:text-white text-sm cursor-pointer" @click="editing = false">&larr; 返回选择</button>
          <span class="text-xs px-2 py-0.5 rounded border"
                :class="selectedTrack === 'LOVE' ? 'bg-pink-500/10 text-pink-400 border-pink-500/30' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'">
            {{ trackLabels[selectedTrack] }}
          </span>
        </div>
        <UiCard>
          <SurveyEngine :track="selectedTrack" :prefill="prefill" @complete="onComplete" />
        </UiCard>
      </div>

      <!-- Track selection -->
      <div v-else class="space-y-3">
        <UiCard
          v-for="s in activeStatus" :key="s.track"
          clickable
          @click="selectTrack(s.track as SurveyTrack)"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-white text-sm font-medium">{{ trackLabels[s.track] || s.track }}</p>
              <p class="text-gray-500 text-xs mt-1">
                版本 {{ s.version }}
                <span v-if="s.isActive" class="text-green-400 ml-2">● 活跃</span>
                <span v-else class="text-gray-500 ml-2">已过期</span>
              </p>
            </div>
            <span class="text-gray-500 text-sm">&rarr;</span>
          </div>
        </UiCard>

        <UiEmptyState
          v-if="!activeStatus.length"
          title="暂无问卷记录"
          description="你还没有提交过问卷，请先在主页的问卷区域提交一份问卷"
        />

        <UiButton variant="secondary" @click="router.back()" block class="mt-4">返回</UiButton>
      </div>
    </div>
  </div>
</template>