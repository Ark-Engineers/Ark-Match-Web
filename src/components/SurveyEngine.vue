<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useSurveyEngine, buildAnswers } from '@/composables/useSurveyEngine'
import type { QuestionItem } from '@/api/questionnaire'
import { useSurveyStore } from '@/stores/survey'
import { useAuthStore } from '@/stores/auth'
import type { AnswerSubmit } from '@/api/questionnaire'
import UiButton from './UiButton.vue'

const props = defineProps<{
  /** 刷新回显用的预填答案（key=`${parentSeq}:${seq}`，值与引擎 answers 一致） */
  prefill?: Record<string, any>
}>()

/** 未登录完成时携带答案交给上层提交；已登录时组件已提交，payload 为 null */
const emit = defineEmits<{
  complete: [payload: { questionnaireId: number; answers: AnswerSubmit[] } | null]
  back: []
}>()

const store = useSurveyStore()
const auth = useAuthStore()
// store 的 state 在 setup store 上会被自动解包，需用 computed 提供响应式题目引用
const engine = useSurveyEngine(computed(() => store.questions as QuestionItem[]))
const submitting = ref(false)
const submitError = ref('')

const textInput = ref('')
const textInputRef = ref<HTMLInputElement | null>(null)

const step = computed(() => engine.currentStep.value)
const stype = computed(() => step.value?.type ?? null)

const currentMulti = computed<string[]>(() => {
  const v = step.value ? engine.answers.value[step.value.key] : undefined
  return Array.isArray(v) ? v : []
})
const multiFull = computed(() =>
  step.value && step.value.type === 'multi' && step.value.maxMulti != null
    ? currentMulti.value.length >= step.value.maxMulti
    : false
)

// 回到某一步时，从已保存答案恢复本步控件状态（fix 上一步返回丢失内容）
watch(step, (s) => {
  if (!s) return
  const saved = engine.answers.value[s.key]
  textInput.value = s.type === 'fill' && typeof saved === 'string' ? saved : ''
  if (s.type === 'fill') {
    nextTick(() => {
      if (textInputRef.value) textInputRef.value.value = textInput.value
    })
  }
}, { immediate: true })

// 预填（刷新回显）时注入答案
onMounted(() => {
  if (props.prefill && Object.keys(props.prefill).length > 0) {
    engine.answers.value = { ...props.prefill }
  }
})

function handleSingle(opt: string) {
  engine.setAnswer(step.value!.key, opt)
}

function handleJudge(val: boolean) {
  engine.setAnswer(step.value!.key, val)
}

function handleFill(value: string) {
  if (!value.trim()) return
  engine.setAnswer(step.value!.key, value.trim())
}

function toggleMulti(opt: string) {
  const s = new Set(currentMulti.value)
  if (s.has(opt)) {
    s.delete(opt)
  } else {
    if (multiFull.value) return
    s.add(opt)
  }
  engine.answers.value = { ...engine.answers.value, [step.value!.key]: Array.from(s) }
}

function confirmMulti() {
  if (currentMulti.value.length === 0) return
  engine.setAnswer(step.value!.key, [...currentMulti.value])
}

async function handleSubmit() {
  const questionnaireId = store.currentQuestionnaire?.id
  if (!questionnaireId) {
    submitError.value = '问卷信息缺失，请稍后重试'
    return
  }
  const answers = buildAnswers(store.questions, engine.answers.value)

  // 未登录：不调 API（会 401），把答案交给上层引导登录后提交
  if (!auth.isLoggedIn) {
    emit('complete', { questionnaireId, answers })
    return
  }

  submitting.value = true
  submitError.value = ''
  try {
    await store.submit(questionnaireId, answers)
    emit('complete', null)
  } catch (e: any) {
    submitError.value = e?.message || '提交失败，请重试'
  } finally {
    submitting.value = false
  }
}

function isSelected(opt: string) {
  if (!step.value) return false
  return engine.answers.value[step.value.key] === opt
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Progress -->
    <div class="mb-4">
      <div class="flex justify-between text-xs text-gray-500 mb-1">
        <span>步骤 {{ engine.currentIndex.value + 1 }} / {{ engine.allSteps.value.length }}</span>
        <span>{{ Math.round(engine.progress.value * 100) }}%</span>
      </div>
      <div class="h-1 bg-gray-800 rounded-full overflow-hidden">
        <div class="h-full transition-all duration-300 rounded-full bg-cyan-500"
             :style="{ width: `${engine.progress.value * 100}%` }" />
      </div>
    </div>

    <!-- Question card -->
    <div v-if="step" class="flex-1 flex flex-col">
      <h3 class="text-lg font-semibold text-white mb-4">{{ step.title }}</h3>

      <!-- 单选 -->
      <div v-if="stype === 'single'" class="space-y-2">
        <button
          v-for="opt in step.options" :key="opt"
          class="w-full text-left px-4 py-3 rounded-lg border text-sm transition cursor-pointer"
          :class="isSelected(opt)
            ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
            : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600'"
          @click="handleSingle(opt)"
        >
          <span class="font-medium">{{ opt }}</span>
        </button>
      </div>

      <!-- 判断 -->
      <div v-else-if="stype === 'judge'" class="space-y-2">
        <button
          v-for="(optVal, label) in { '是': true, '否': false }" :key="label"
          class="w-full text-left px-4 py-3 rounded-lg border text-sm transition cursor-pointer"
          :class="engine.answers.value[step.key] === optVal
            ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
            : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600'"
          @click="handleJudge(optVal)"
        >
          {{ label }}
        </button>
      </div>

      <!-- 多选_X -->
      <div v-else-if="stype === 'multi'" class="space-y-2 flex-1">
        <p v-if="step.maxMulti" class="text-xs text-gray-500 mb-2">
          已选 {{ currentMulti.length }} / {{ step.maxMulti }} 项
        </p>
        <button
          v-for="opt in step.options" :key="opt"
          class="w-full text-left px-4 py-3 rounded-lg border text-sm transition cursor-pointer"
          :class="currentMulti.includes(opt)
            ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
            : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600'"
          @click="toggleMulti(opt)"
        >
          {{ opt }}
        </button>
        <div class="pt-2">
          <UiButton :disabled="currentMulti.length === 0" @click="confirmMulti">确认选择</UiButton>
        </div>
      </div>

      <!-- 填空 -->
      <div v-else-if="stype === 'fill'" class="flex-1 flex flex-col gap-2">
        <input
          ref="textInputRef"
          v-model="textInput"
          class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50 placeholder-gray-600"
          placeholder="请输入..."
          maxlength="500"
          @keyup.enter="handleFill(textInput)"
        />
        <div class="flex gap-2">
          <UiButton :disabled="!textInput.trim()" @click="handleFill(textInput)">确认</UiButton>
        </div>
      </div>

      <!-- Back nav -->
      <div class="flex justify-between items-center pt-4 mt-auto border-t border-gray-800/50">
        <button v-if="!engine.isFirst.value"
                class="text-sm text-gray-500 hover:text-gray-300 transition cursor-pointer"
                @click="engine.prev()">
          &larr; 上一步
        </button>
        <div v-else />
        <UiButton
          v-if="engine.isLast.value"
          :loading="submitting"
          @click="handleSubmit"
        >
          提交问卷
        </UiButton>
      </div>
      <p v-if="submitError" class="text-red-400 text-xs mt-2">{{ submitError }}</p>
    </div>
  </div>
</template>