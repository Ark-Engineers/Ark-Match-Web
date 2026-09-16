<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMatchStore } from '@/stores/match'
import { useSurveyStore } from '@/stores/survey'
import { useAuthStore } from '@/stores/auth'
import UiCard from '@/components/UiCard.vue'
import UiSpinner from '@/components/UiSpinner.vue'
import UiEmptyState from '@/components/UiEmptyState.vue'
import UiButton from '@/components/UiButton.vue'

const router = useRouter()
const matchStore = useMatchStore()
const surveyStore = useSurveyStore()
const auth = useAuthStore()

const loading = ref(true)

onMounted(async () => {
  await Promise.all([
    matchStore.fetchStats(),
    auth.fetchProfile(),
    surveyStore.fetchCurrent(),
  ])
  loading.value = false
})
</script>

<template>
  <div class="min-h-screen">
    <div class="max-w-lg mx-auto px-4 py-8">
      <div class="flex items-center gap-4 mb-8">
        <button class="text-gray-400 hover:text-white transition cursor-pointer" @click="router.push('/')">&larr; 返回</button>
        <h1 class="text-xl font-bold text-white">匹配状态</h1>
      </div>

      <UiSpinner v-if="loading" label="加载中..." />

      <div v-else class="space-y-4">
        <!-- Pool status -->
        <UiCard>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-white font-semibold text-sm">匹配池状态</h3>
              <p class="text-gray-500 text-xs mt-1">
                {{ surveyStore.currentState?.hasActiveAnswer ? '你已加入匹配池，系统将自动为你匹配' : '你尚未加入匹配池，请先完成问卷' }}
              </p>
            </div>
            <span class="px-3 py-1 rounded-full text-xs font-medium"
                  :class="surveyStore.currentState?.hasActiveAnswer ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-gray-800 text-gray-500 border border-gray-700'">
              {{ surveyStore.currentState?.hasActiveAnswer ? '已入池' : '未入池' }}
            </span>
          </div>
        </UiCard>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-3">
          <UiCard>
            <div class="text-center">
              <p class="text-2xl font-bold text-white">{{ matchStore.stats.totalCount }}</p>
              <p class="text-xs text-gray-500 mt-1">总匹配</p>
            </div>
          </UiCard>
          <UiCard>
            <div class="text-center">
              <p class="text-2xl font-bold text-cyan-400">{{ matchStore.stats.pendingCount }}</p>
              <p class="text-xs text-gray-500 mt-1">待处理</p>
            </div>
          </UiCard>
          <UiCard>
            <div class="text-center">
              <p class="text-2xl font-bold text-green-400">{{ matchStore.stats.confirmedCount }}</p>
              <p class="text-xs text-gray-500 mt-1">已确认</p>
            </div>
          </UiCard>
        </div>

        <!-- Survey status -->
        <UiCard>
          <h3 class="text-white font-semibold text-sm mb-3">问卷状态</h3>
          <UiEmptyState
            v-if="!surveyStore.currentQuestionnaire"
            title="暂无可用问卷"
            description="当前没有可填写的问卷"
          />
          <div v-else class="space-y-2">
            <div class="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <div>
                <span class="text-sm text-gray-300">{{ surveyStore.currentQuestionnaire.title }}</span>
                <span v-if="surveyStore.currentQuestionnaire.subtitle" class="block text-xs text-gray-500 mt-0.5">
                  {{ surveyStore.currentQuestionnaire.subtitle }}
                </span>
              </div>
              <span class="text-xs px-2 py-0.5 rounded"
                    :class="surveyStore.currentState?.hasActiveAnswer ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-500'">
                {{ surveyStore.currentState?.hasActiveAnswer ? '已填写' : '未填写' }}
              </span>
            </div>
          </div>
        </UiCard>

        <!-- Actions -->
        <div class="flex gap-3">
          <UiButton @click="router.push('/pending-matches')" block>查看匹配</UiButton>
          <UiButton variant="secondary" @click="router.push('/survey-refresh')" block>更新问卷</UiButton>
        </div>
      </div>
    </div>
  </div>
</template>