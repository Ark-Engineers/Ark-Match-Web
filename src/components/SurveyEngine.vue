<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useSurveyEngine } from '@/composables/useSurveyEngine'
import { useSurveyStore } from '@/stores/survey'
import { useAuthStore } from '@/stores/auth'
import type { SurveyTrack } from '@/api/survey'
import UiButton from './UiButton.vue'
import UiSpinner from './UiSpinner.vue'

const props = defineProps<{
  track: SurveyTrack
  prefill?: Record<string, any>
}>()

const emit = defineEmits<{
  complete: []
  back: []
}>()

const store = useSurveyStore()
const auth = useAuthStore()
const engine = useSurveyEngine(props.track)
const submitting = ref(false)
const draftRecovered = ref(false)
const submitError = ref('')

// Draft recovery on mount
onMounted(() => {
  if (props.prefill && Object.keys(props.prefill).length > 0) {
    engine.answers.value = { ...props.prefill }
    draftRecovered.value = true
  } else {
    const draft = store.loadDraft(props.track)
    if (draft?.answers) {
      engine.answers.value = { ...draft.answers }
      draftRecovered.value = true
    }
  }
})

// Auto-save draft on answer changes
watch(() => engine.answers.value, (newVal) => {
  if (Object.keys(newVal).length > 0) {
    store.saveDraft(props.track, newVal)
  }
}, { deep: true })

const step = computed(() => engine.currentStep.value)
const isSelect = computed(() => step.value?.type === 'select')
const isMultiSelect = computed(() => step.value?.type === 'multi-select')
const isText = computed(() => step.value?.type === 'text')
const isBirth = computed(() => step.value?.type === 'birth')
const isContacts = computed(() => step.value?.type === 'contacts')
const isRank = computed(() => step.value?.type === 'rank')

const trackColor = computed(() => props.track === 'LOVE' ? 'pink-400' : 'cyan-400')
const trackBg = computed(() => props.track === 'LOVE' ? 'pink-500/10' : 'cyan-500/10')
const trackBorder = computed(() => props.track === 'LOVE' ? 'pink-500/30' : 'cyan-500/30')

const multiSelected = ref(new Set<string>())
const birthYear = ref<number | null>(null)
const birthMonth = ref<number | null>(null)
const contacts = ref<Array<{ type: string; value: string }>>([{ type: '', value: '' }])
const rankOrder = ref<string[]>([])
const textInputRef = ref<HTMLInputElement | null>(null)

// 进入某一步时，从已保存答案恢复该步骤的本地编辑状态（修复“上一步回去内容丢失”）
watch(step, (s) => {
  if (!s) return
  const saved = engine.answers.value[s.key]
  if (s.type === 'multi-select') {
    multiSelected.value = new Set(Array.isArray(saved) ? saved : [])
  } else if (s.type === 'birth') {
    birthYear.value = saved?.birthYear ?? null
    birthMonth.value = saved?.birthMonth ?? null
  } else if (s.type === 'contacts') {
    contacts.value = Array.isArray(saved) && saved.length
      ? saved.map((c: any) => ({ type: c.type || '', value: c.value || '' }))
      : [{ type: '', value: '' }]
  } else if (s.type === 'rank') {
    rankOrder.value = Array.isArray(saved) ? [...saved] : []
  } else if (s.type === 'text') {
    nextTick(() => {
      if (textInputRef.value) {
        textInputRef.value.value = typeof saved === 'string' ? saved : ''
      }
    })
  }
}, { immediate: true })

function handleSelect(key: string) {
  engine.setAnswer(step.value!.key, key)
}

function handleMultiToggle(key: string) {
  const s = new Set(multiSelected.value)
  if (s.has(key)) { s.delete(key) } else { s.add(key) }
  multiSelected.value = s
}

function handleMultiConfirm() {
  if (multiSelected.value.size === 0) return
  engine.setAnswer(step.value!.key, Array.from(multiSelected.value))
}

function handleTextSubmit(value: string) {
  if (!value.trim() && !step.value?.optional) return
  engine.setAnswer(step.value!.key, value.trim())
}

function handleBirthSubmit() {
  engine.answers.value = {
    ...engine.answers.value,
    birthYear: birthYear.value,
    birthMonth: birthMonth.value,
  }
  engine.setAnswer('birth', { birthYear: birthYear.value, birthMonth: birthMonth.value })
}

function handleContactsSubmit() {
  const valid = contacts.value.filter(c => c.type && c.value)
  if (valid.length === 0) return
  engine.setAnswer('contacts', valid)
}

function handleRankConfirm() {
  if (rankOrder.value.length === 0) return
  engine.setAnswer(step.value!.key, [...rankOrder.value])
}

async function handleSubmit() {
  // 未登录：不静默调 API（会 401）；草稿已自动保存，交给上层引导登录后再提交
  if (!auth.isLoggedIn) {
    emit('complete')
    return
  }
  submitting.value = true
  submitError.value = ''
  try {
    await store.submit(props.track, { ...engine.answers.value })
    emit('complete')
  } catch (e: any) {
    submitError.value = e?.message || '提交失败，请重试'
  } finally {
    submitting.value = false
  }
}

function dismissDraftBanner() {
  draftRecovered.value = false
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Draft recovery banner -->
    <div v-if="draftRecovered"
         class="mb-3 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between text-sm">
      <span class="text-amber-300">已恢复上次填写内容</span>
      <button class="text-amber-400 hover:text-amber-200 text-xs cursor-pointer" @click="dismissDraftBanner">✕</button>
    </div>

    <!-- Progress -->
    <div class="mb-4">
      <div class="flex justify-between text-xs text-gray-500 mb-1">
        <span>步骤 {{ engine.currentIndex.value + 1 }} / {{ engine.allSteps.value.length }}</span>
        <span>{{ Math.round(engine.progress.value * 100) }}%</span>
      </div>
      <div class="h-1 bg-gray-800 rounded-full overflow-hidden">
        <div class="h-full transition-all duration-300 rounded-full"
             :class="track === 'LOVE' ? 'bg-pink-500' : 'bg-cyan-500'"
             :style="{ width: `${engine.progress.value * 100}%` }" />
      </div>
    </div>

    <!-- Question card -->
    <div v-if="step" class="flex-1 flex flex-col">
      <h3 class="text-lg font-semibold text-white mb-1">{{ step.title }}</h3>
      <p v-if="step.subtitle" class="text-sm text-gray-500 mb-4">{{ step.subtitle }}</p>

      <!-- Select type -->
      <div v-if="isSelect" class="space-y-2">
        <button
          v-for="opt in step.options"
          :key="opt.key"
          class="w-full text-left px-4 py-3 rounded-lg border text-sm transition cursor-pointer"
          :class="engine.answers.value[step.key] === opt.key
            ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
            : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600'"
          @click="handleSelect(opt.key)"
        >
          <span class="font-medium">{{ opt.label }}</span>
          <span v-if="opt.desc" class="block text-xs text-gray-500 mt-0.5">{{ opt.desc }}</span>
        </button>
      </div>

      <!-- Multi-select type -->
      <div v-if="isMultiSelect" class="space-y-2 flex-1">
        <button
          v-for="opt in step.options"
          :key="opt.key"
          class="w-full text-left px-4 py-3 rounded-lg border text-sm transition cursor-pointer"
          :class="multiSelected.has(opt.key)
            ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
            : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600'"
          @click="handleMultiToggle(opt.key)"
        >
          {{ opt.label }}
        </button>
        <div class="pt-2">
          <UiButton :disabled="multiSelected.size === 0" @click="handleMultiConfirm">确认选择</UiButton>
        </div>
      </div>

      <!-- Text type -->
      <div v-if="isText" class="flex-1 flex flex-col gap-2">
        <input
          ref="textInputRef"
          class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50 placeholder-gray-600"
          :placeholder="step.placeholder || '请输入...'"
          :maxlength="step.maxLength || 500"
          @keyup.enter="handleTextSubmit(($event.target as HTMLInputElement).value)"
        />
        <div class="flex gap-2">
          <UiButton @click="handleTextSubmit(textInputRef?.value || '')">确认</UiButton>
          <UiButton v-if="step.optional" variant="ghost" @click="handleTextSubmit('')">跳过</UiButton>
        </div>
      </div>

      <!-- Birth type -->
      <div v-if="isBirth" class="flex-1 flex flex-col gap-3">
        <div class="flex gap-3">
          <input v-model.number="birthYear" type="number" placeholder="出生年份"
                 class="flex-1 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
                 min="1970" :max="new Date().getFullYear()" />
          <input v-model.number="birthMonth" type="number" placeholder="月份（可选）"
                 class="flex-1 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
                 min="1" max="12" />
        </div>
        <UiButton :disabled="!birthYear" @click="handleBirthSubmit">确认</UiButton>
      </div>

      <!-- Contacts type -->
      <div v-if="isContacts" class="flex-1 flex flex-col gap-3">
        <div v-for="(c, i) in contacts" :key="i" class="flex gap-2">
          <select v-model="c.type"
                  class="w-28 px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none">
            <option value="" disabled>类型</option>
            <option value="QQ">QQ</option>
            <option value="WeChat">微信</option>
            <option value="Discord">Discord</option>
            <option value="Telegram">Telegram</option>
            <option value="Other">其他</option>
          </select>
          <input v-model="c.value" placeholder="联系方式"
                 class="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50" />
          <button v-if="contacts.length > 1"
                  class="px-2 text-gray-500 hover:text-red-400 transition cursor-pointer"
                  @click="contacts.splice(i, 1)">✕</button>
        </div>
        <button class="text-sm text-cyan-400 hover:text-cyan-300 cursor-pointer self-start"
                @click="contacts.push({ type: '', value: '' })">+ 添加联系方式</button>
        <UiButton @click="handleContactsSubmit">确认</UiButton>
      </div>

      <!-- Rank type -->
      <div v-if="isRank" class="flex-1 flex flex-col gap-3">
        <div class="flex gap-4">
          <div class="flex-1">
            <p class="text-xs text-gray-500 mb-2">已排序</p>
            <div class="space-y-1">
              <div v-for="(item, i) in rankOrder" :key="item"
                   class="px-3 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded text-sm text-cyan-300 flex items-center gap-2">
                <span class="text-xs text-cyan-500 font-bold w-5">{{ i + 1 }}</span>{{ item }}
              </div>
            </div>
          </div>
          <div class="flex-1">
            <p class="text-xs text-gray-500 mb-2">可选</p>
            <div class="space-y-1">
              <button v-for="opt in (step.options?.filter(o => !rankOrder.includes(o.label)) || [])" :key="opt.key"
                      class="w-full text-left px-3 py-2 bg-gray-800/50 border border-gray-700 rounded text-sm text-gray-300 hover:border-gray-600 transition cursor-pointer"
                      @click="rankOrder.push(opt.label)">
                {{ opt.label }}
              </button>
            </div>
          </div>
        </div>
        <UiButton :disabled="rankOrder.length !== (step.options?.length || 0)" @click="handleRankConfirm">
          确认排序 ({{ rankOrder.length }}/{{ step.options?.length || 0 }})
        </UiButton>
      </div>

      <!-- Back / Submit nav -->
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

    <UiSpinner v-if="store.loading" label="加载中..." />
  </div>
</template>