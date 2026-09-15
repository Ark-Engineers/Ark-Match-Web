<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSurveyStore } from '@/stores/survey'
import { useUiStore } from '@/stores/ui'
import UiCard from '@/components/UiCard.vue'
import UiSpinner from '@/components/UiSpinner.vue'
import UiEmptyState from '@/components/UiEmptyState.vue'
import UiErrorState from '@/components/UiErrorState.vue'
import SurveyEngine from '@/components/SurveyEngine.vue'

const router = useRouter()
const store = useSurveyStore()
const ui = useUiStore()

const loading = ref(true)
const error = ref('')
const selectedId = ref<number | null>(null)
const prefill = ref<Record<string, any>>({})
const editing = ref(false)

onMounted(refresh)

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    await store.fetchReadyList(1, 50)
    await store.fetchMyActive()
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function selectItem(id: number) {
  selectedId.value = id
  editing.value = false
  loading.value = true
  try {
    await store.fetchById(id)
    prefill.value = buildPrefill()
  } finally {
    loading.value = false
  }
  editing.value = true
}

/** 把「我的已提交答案」转成引擎预填 map（key=`${parentSeq}:${seq}`），仅当回显属于所选问卷时生效 */
function buildPrefill(): Record<string, any> {
  const map: Record<string, any> = {}
  const active = store.myActive
  if (!active || active.questionnaireId !== selectedId.value) return map
  for (const a of active.answers) {
    const key = `${a.parentSeq}:${a.seq}`
    const q = store.questions.find((x) => (x.parentSeq ?? 0) === a.parentSeq && x.seq === a.seq)
    const t = q?.type || ''
    if (t.startsWith('多选')) {
      map[key] = a.answerText.split('|').map((s) => s.trim()).filter(Boolean)
    } else if (t === '判断') {
      map[key] = a.answerText === 'true'
    } else {
      map[key] = a.answerText
    }
  }
  return map
}

function onComplete() {
  ui.showToast('问卷已更新', 'success')
  router.back()
}

function backToList() {
  editing.value = false
}
</script>

<template>
  <div class="min-h-screen">
    <div class="max-w-lg mx-auto px-4 py-8">
      <div class="flex items-center gap-4 mb-8">
        <button class="text-gray-400 hover:text-white transition cursor-pointer" @click="router.back()">&larr; 返回</button>
        <h1 class="text-xl font-bold text-white">问卷刷新</h1>
      </div>

      <UiSpinner v-if="loading" label="加载中..." />
      <UiErrorState v-else-if="error" :message="error" @retry="refresh" />

      <!-- Editing mode -->
      <div v-else-if="editing && selectedId">
        <div class="flex items-center gap-3 mb-4">
          <button class="text-gray-400 hover:text-white text-sm cursor-pointer" @click="backToList">&larr; 返回选择</button>
          <span class="text-xs px-2 py-0.5 rounded border bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
            {{ store.currentQuestionnaire?.title }}
          </span>
        </div>
        <UiCard>
          <SurveyEngine :prefill="prefill" @complete="onComplete" />
        </UiCard>
      </div>

      <!-- Ready questionnaires list -->
      <div v-else class="space-y-3">
        <UiEmptyState v-if="!store.readyList.length" title="暂无已发布问卷" description="当前没有可更新的问卷" />
        <UiCard v-for="item in store.readyList" :key="item.id" clickable @click="selectItem(item.id)">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-white text-sm font-medium">{{ item.title }}</p>
              <p v-if="item.subtitle" class="text-gray-500 text-xs mt-1">{{ item.subtitle }}</p>
            </div>
            <span class="text-gray-500 text-sm">&rarr;</span>
          </div>
        </UiCard>
      </div>
    </div>
  </div>
</template>