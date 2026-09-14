<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { request } from '@/api'

type ApiResponse<T> = { code: number; message: string; data: T }

type CurrentQuestionnaire = { id: number; title: string; subtitle: string | null } | null

type CurrentQuestion = {
  seq: number
  question: string
  type: string
  options: string | null
  parentSeq: number | null
  triggerOption: string | null
  weight: string | null
}

type CurrentState = {
  hasActiveAnswer: boolean
  activeAnswerQuestionnaireId: number | null
  needReSubmit: boolean
  activeSubmittedAt: string | null
}

type CurrentResponse = {
  questionnaire: CurrentQuestionnaire
  questions: CurrentQuestion[]
  state: CurrentState
}

type ReadyItem = {
  id: number
  title: string
  subtitle: string | null
  updatedAt: string | null
}

type RecommendationItem = {
  userId: number
  nickname: string
  avatarUrl: string | null
  region: string | null
  age: number | null
  tags: string[]
  score: number
  highlights: string[]
}

type SubmitAnswerItem = { parentSeq: number; seq: number; answerText: string }

const loading = ref(false)
const submitting = ref(false)
const current = ref<CurrentResponse | null>(null)
const recommendationsLoading = ref(false)
const recommendations = ref<RecommendationItem[]>([])

const readyLoading = ref(false)
const readyList = ref<ReadyItem[]>([])
const selectDialogOpen = ref(false)

const filling = ref(false)
const confirmRefillOpen = ref(false)

const router = useRouter()

const answerState = reactive<Record<string, string | string[]>>({})

const questions = computed(() => current.value?.questions ?? [])

const mainQuestions = computed(() => {
  return questions.value.filter((q) => Number(q.parentSeq ?? 0) === 0).sort((a, b) => a.seq - b.seq)
})

function childrenOf(parentSeq: number): CurrentQuestion[] {
  return questions.value
    .filter((q) => Number(q.parentSeq ?? 0) === parentSeq)
    .sort((a, b) => a.seq - b.seq)
}

function answerKey(parentSeq: number, seq: number): string {
  return `${parentSeq}:${seq}`
}

function parseOptions(raw: string | null | undefined): string[] {
  const s = String(raw ?? '').trim()
  if (!s) return []
  return s
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean)
}

function parseMultiMax(type: string): number {
  const t = String(type ?? '').trim()
  if (!t.startsWith('多选_')) return 999
  const parts = t.split('_')
  const n = Number(parts[1] ?? 0)
  return Number.isFinite(n) && n >= 2 ? n : 999
}

function getParentSelected(parentSeq: number): string[] {
  const v = answerState[answerKey(0, parentSeq)]
  if (Array.isArray(v)) return v
  const s = String(v ?? '').trim()
  if (!s) return []
  if (s.includes('|')) return s.split('|').map((x) => x.trim()).filter(Boolean)
  return [s]
}

function isChildVisible(q: CurrentQuestion): boolean {
  const parentSeq = Number(q.parentSeq ?? 0)
  if (!parentSeq) return false
  const trigger = String(q.triggerOption ?? '').trim()
  if (!trigger) return false
  return getParentSelected(parentSeq).includes(trigger)
}

function setDefaultAnswers(): void {
  for (const q of questions.value) {
    const parentSeq = Number(q.parentSeq ?? 0)
    const k = answerKey(parentSeq, q.seq)
    if (k in answerState) continue
    if (String(q.type ?? '').startsWith('多选_')) {
      answerState[k] = []
    } else {
      answerState[k] = ''
    }
  }
}

async function loadCurrent(): Promise<void> {
  loading.value = true
  try {
    const res = await request<ApiResponse<CurrentResponse>>({ url: '/user/questionnaire/current', method: 'GET' })
    if (res.code !== 0) {
      ElMessage.error(res.message || '加载失败')
      return
    }
    current.value = res.data
    setDefaultAnswers()
  } finally {
    loading.value = false
  }
}

async function loadReadyList(): Promise<void> {
  readyLoading.value = true
  try {
    const res = await request<ApiResponse<ReadyItem[]>>({
      url: '/user/questionnaire/ready-list',
      method: 'GET',
      params: { page: 1, size: 50 },
    })
    if (res.code !== 0) {
      readyList.value = []
      return
    }
    readyList.value = Array.isArray(res.data) ? res.data : []
  } finally {
    readyLoading.value = false
  }
}

async function loadQuestionnaireById(id: number): Promise<void> {
  loading.value = true
  try {
    const res = await request<ApiResponse<CurrentResponse>>({ url: `/user/questionnaire/${id}`, method: 'GET' })
    if (res.code !== 0) {
      ElMessage.error(res.message || '加载失败')
      return
    }
    current.value = res.data
    for (const k of Object.keys(answerState)) delete answerState[k]
    setDefaultAnswers()
  } finally {
    loading.value = false
  }
}

function openSelectDialog(): void {
  selectDialogOpen.value = true
}

async function goBack(): Promise<void> {
  if (window.history.length > 1) {
    router.back()
    return
  }
  await router.push('/home')
}

async function pickQuestionnaire(id: number): Promise<void> {
  selectDialogOpen.value = false
  await loadQuestionnaireById(id)
  if (current.value?.state?.hasActiveAnswer && !current.value?.state?.needReSubmit) {
    filling.value = false
    await loadRecommendations()
  } else {
    filling.value = true
  }
}

async function loadRecommendations(): Promise<void> {
  recommendationsLoading.value = true
  try {
    const res = await request<ApiResponse<RecommendationItem[]>>({
      url: '/user/match/recommendations',
      method: 'GET',
      params: { limit: 20, offset: 0 },
    })
    if (res.code !== 0) {
      recommendations.value = []
      ElMessage.error(res.message || '加载匹配失败')
      return
    }
    recommendations.value = Array.isArray(res.data) ? res.data : []
  } finally {
    recommendationsLoading.value = false
  }
}

function resetFillState(): void {
  filling.value = true
  for (const k of Object.keys(answerState)) delete answerState[k]
  setDefaultAnswers()
}

function tryStartRefill(): void {
  confirmRefillOpen.value = true
}

function confirmStartRefill(): void {
  confirmRefillOpen.value = false
  resetFillState()
}

function cancelStartRefill(): void {
  confirmRefillOpen.value = false
}

function visibleQuestionsForSubmit(): CurrentQuestion[] {
  const list: CurrentQuestion[] = []
  for (const q of mainQuestions.value) {
    list.push(q)
    for (const c of childrenOf(q.seq)) {
      if (isChildVisible(c)) list.push(c)
    }
  }
  return list
}

function toAnswerText(q: CurrentQuestion, v: string | string[]): string {
  if (Array.isArray(v)) {
    const options = parseOptions(q.options)
    const picked = new Set(v.map((x) => String(x ?? '').trim()).filter(Boolean))
    const ordered = options.filter((x) => picked.has(x))
    return ordered.join('|')
  }
  const s = String(v ?? '').trim()
  if (q.type === '判断') {
    const low = s.toLowerCase()
    if (low === 'true' || low === 'false') return low
  }
  return s
}

function validateVisibleQuestions(): { ok: boolean; firstKey: string | null } {
  const list = visibleQuestionsForSubmit()
  for (const q of list) {
    const parentSeq = Number(q.parentSeq ?? 0)
    const k = answerKey(parentSeq, q.seq)
    const v = answerState[k]
    if (Array.isArray(v)) {
      if (v.length <= 0) return { ok: false, firstKey: k }
      const max = parseMultiMax(q.type)
      if (v.length > max) return { ok: false, firstKey: k }
    } else {
      const s = String(v ?? '').trim()
      if (!s) return { ok: false, firstKey: k }
    }
  }
  return { ok: true, firstKey: null }
}

async function submit(): Promise<void> {
  if (!current.value?.questionnaire?.id) return
  const { ok } = validateVisibleQuestions()
  if (!ok) {
    ElMessage.warning('请先完成所有显示的题目')
    return
  }

  const payloadAnswers: SubmitAnswerItem[] = []
  for (const q of visibleQuestionsForSubmit()) {
    const parentSeq = Number(q.parentSeq ?? 0)
    const k = answerKey(parentSeq, q.seq)
    payloadAnswers.push({
      parentSeq,
      seq: q.seq,
      answerText: toAnswerText(q, answerState[k] ?? ''),
    })
  }

  submitting.value = true
  try {
    const res = await request<ApiResponse<null>>({
      url: '/user/questionnaire/submit',
      method: 'POST',
      data: { questionnaireId: current.value.questionnaire.id, answers: payloadAnswers },
    })
    if (res.code !== 0) {
      ElMessage.error(res.message || '提交失败')
      return
    }
    filling.value = false
    ElMessage.success('提交成功')
    await loadCurrent()
    await loadRecommendations()
  } finally {
    submitting.value = false
  }
}

const showEmpty = computed(() => !loading.value && !current.value?.questionnaire)
const needReSubmit = computed(() => Boolean(current.value?.state?.needReSubmit))
const hasActive = computed(() => Boolean(current.value?.state?.hasActiveAnswer))
const showFill = computed(() => filling.value || !hasActive.value || needReSubmit.value)
const showResult = computed(() => !showFill.value && hasActive.value && !needReSubmit.value)

onMounted(async () => {
  await loadReadyList()
  await loadCurrent()
  if (readyList.value.length > 1 && current.value?.questionnaire?.id) {
    selectDialogOpen.value = false
  }
  if (current.value?.state?.hasActiveAnswer && !current.value?.state?.needReSubmit) {
    await loadRecommendations()
  } else {
    filling.value = true
  }
})
</script>

<template>
  <main style="max-width: 980px; margin: 0 auto; padding: 20px">
    <section style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px">
      <div>
        <h1 style="margin: 0; font-size: 22px">匹配问卷</h1>
        <p style="margin: 8px 0 0; opacity: 0.7">
          {{ current?.questionnaire?.title || '暂无可填写问卷' }}
        </p>
        <p v-if="current?.questionnaire?.subtitle" style="margin: 6px 0 0; opacity: 0.6">
          {{ current?.questionnaire?.subtitle }}
        </p>
      </div>

      <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end">
        <el-button plain @click="goBack">返回</el-button>
        <el-button v-if="readyList.length > 1" :loading="readyLoading" plain @click="openSelectDialog">选择问卷</el-button>
        <el-button v-if="showResult" type="primary" plain @click="tryStartRefill">重新填写问卷</el-button>
        <el-button v-if="showFill && hasActive && !needReSubmit" plain @click="filling = false; loadRecommendations()"
          >返回匹配结果</el-button
        >
      </div>
    </section>

    <el-divider style="margin: 18px 0" />

    <section v-if="showEmpty">
      <el-empty description="暂无可填写问卷（请管理员发布 READY 问卷）" />
    </section>

    <section v-else-if="showFill">
      <el-alert
        v-if="needReSubmit"
        type="warning"
        :closable="false"
        title="问卷已更新，需要重新填写后才能匹配"
        style="margin-bottom: 14px"
      />

      <el-form label-position="top" style="width: 100%">
        <div v-for="q in mainQuestions" :key="q.seq" style="padding: 14px 16px; border-radius: 12px; background: #fff">
          <div style="font-weight: 600; line-height: 1.6">
            {{ q.seq }}. {{ q.question }}
          </div>

          <div style="margin-top: 10px">
            <template v-if="q.type === '单选'">
              <el-radio-group v-model="answerState[answerKey(0, q.seq)]">
                <el-radio v-for="opt in parseOptions(q.options)" :key="opt" :value="opt">{{ opt }}</el-radio>
              </el-radio-group>
            </template>

            <template v-else-if="q.type.startsWith('多选_')">
              <el-checkbox-group v-model="answerState[answerKey(0, q.seq)]" :max="parseMultiMax(q.type)">
                <el-checkbox v-for="opt in parseOptions(q.options)" :key="opt" :value="opt">{{ opt }}</el-checkbox>
              </el-checkbox-group>
            </template>

            <template v-else-if="q.type === '判断'">
              <el-radio-group v-model="answerState[answerKey(0, q.seq)]">
                <el-radio :value="'true'">true</el-radio>
                <el-radio :value="'false'">false</el-radio>
              </el-radio-group>
            </template>

            <template v-else-if="q.type === '填空'">
              <el-input v-model="answerState[answerKey(0, q.seq)]" placeholder="请输入" maxlength="1024" show-word-limit />
            </template>

            <template v-else>
              <el-alert type="error" :closable="false" title="题型不支持" />
            </template>
          </div>

          <div v-for="c in childrenOf(q.seq)" :key="`${q.seq}-${c.seq}`" style="margin-top: 14px" v-show="isChildVisible(c)">
            <div style="font-weight: 600; line-height: 1.6; opacity: 0.92">
              {{ q.seq }}-{{ c.seq }}. {{ c.question }}
            </div>

            <div style="margin-top: 10px">
              <template v-if="c.type === '单选'">
                <el-radio-group v-model="answerState[answerKey(q.seq, c.seq)]">
                  <el-radio v-for="opt in parseOptions(c.options)" :key="opt" :value="opt">{{ opt }}</el-radio>
                </el-radio-group>
              </template>

              <template v-else-if="c.type.startsWith('多选_')">
                <el-checkbox-group v-model="answerState[answerKey(q.seq, c.seq)]" :max="parseMultiMax(c.type)">
                  <el-checkbox v-for="opt in parseOptions(c.options)" :key="opt" :value="opt">{{ opt }}</el-checkbox>
                </el-checkbox-group>
              </template>

              <template v-else-if="c.type === '判断'">
                <el-radio-group v-model="answerState[answerKey(q.seq, c.seq)]">
                  <el-radio :value="'true'">true</el-radio>
                  <el-radio :value="'false'">false</el-radio>
                </el-radio-group>
              </template>

              <template v-else-if="c.type === '填空'">
                <el-input
                  v-model="answerState[answerKey(q.seq, c.seq)]"
                  placeholder="请输入"
                  maxlength="1024"
                  show-word-limit
                />
              </template>

              <template v-else>
                <el-alert type="error" :closable="false" title="题型不支持" />
              </template>
            </div>
          </div>
        </div>

        <div style="margin-top: 16px; display: flex; justify-content: flex-end; gap: 10px">
          <el-button :loading="submitting" type="primary" @click="submit">提交并匹配</el-button>
        </div>
      </el-form>
    </section>

    <section v-else-if="showResult">
      <el-alert
        v-if="current?.state?.activeSubmittedAt"
        type="success"
        :closable="false"
        :title="`已提交：${current.state.activeSubmittedAt}`"
        style="margin-bottom: 14px"
      />

      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px">
        <div style="font-weight: 600">推荐列表</div>
        <el-button :loading="recommendationsLoading" plain @click="loadRecommendations">刷新</el-button>
      </div>

      <el-skeleton v-if="recommendationsLoading" :rows="6" animated />

      <el-empty v-else-if="recommendations.length <= 0" description="暂无匹配结果（需要更多用户填写问卷）" />

      <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px">
        <div
          v-for="u in recommendations"
          :key="u.userId"
          style="border-radius: 14px; background: #fff; padding: 14px 14px 12px"
        >
          <div style="display: flex; align-items: center; gap: 12px">
            <el-avatar :src="u.avatarUrl || undefined" :size="44">{{ u.nickname?.slice(0, 1) || 'U' }}</el-avatar>
            <div style="min-width: 0">
              <div style="font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">
                {{ u.nickname || `用户${u.userId}` }}
              </div>
              <div style="opacity: 0.7; font-size: 12px; margin-top: 4px">
                <span v-if="u.region">{{ u.region }}</span>
                <span v-if="u.region && u.age != null" style="margin: 0 6px">·</span>
                <span v-if="u.age != null">{{ u.age }}岁</span>
              </div>
            </div>
          </div>

          <div style="margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px">
            <div style="opacity: 0.75">匹配分</div>
            <div style="font-weight: 700">{{ u.score }}</div>
          </div>

          <div v-if="u.tags?.length" style="margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap">
            <el-tag v-for="t in u.tags" :key="t" size="small" effect="plain">{{ t }}</el-tag>
          </div>
        </div>
      </div>
    </section>

    <el-dialog v-model="confirmRefillOpen" width="360px" title="重新填写问卷">
      <div style="line-height: 1.7">重新填写会覆盖旧答卷，并按新答卷重新计算匹配结果。</div>
      <template #footer>
        <el-button @click="cancelStartRefill">取消</el-button>
        <el-button type="primary" @click="confirmStartRefill">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="selectDialogOpen" width="520px" title="选择问卷">
      <el-skeleton v-if="readyLoading" :rows="6" animated />
      <el-empty v-else-if="readyList.length <= 0" description="暂无可选问卷" />
      <div v-else style="display: flex; flex-direction: column; gap: 10px">
        <el-button
          v-for="q in readyList"
          :key="q.id"
          text
          style="justify-content: flex-start; width: 100%"
          @click="pickQuestionnaire(q.id)"
        >
          <span style="font-weight: 650; margin-right: 8px">{{ q.title }}</span>
          <span style="opacity: 0.7">{{ q.subtitle || '' }}</span>
        </el-button>
      </div>
      <template #footer>
        <el-button @click="selectDialogOpen = false">关闭</el-button>
      </template>
    </el-dialog>
  </main>
</template>
