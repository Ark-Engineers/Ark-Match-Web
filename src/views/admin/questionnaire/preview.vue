<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { request } from '@/api'

type ApiResponse<T> = { code: number; message: string; data: T }

type PreviewQuestion = {
  seq: number
  question: string
  type: string
  multiMax: number | null
  options: string[]
  parentSeq: number | null
  triggerOption: string | null
  weight: string
}

type PreviewResponse = {
  id: number
  title: string
  subtitle: string | null
  questions: PreviewQuestion[]
}

const route = useRoute()
const router = useRouter()

const id = computed(() => Number(route.params.id || 0))

const loading = ref(false)
const data = ref<PreviewResponse | null>(null)

const answer = reactive<Record<string, any>>({})
const touched = reactive<Record<string, boolean>>({})

const previewRef = ref<HTMLElement | null>(null)

function qKey(q: Pick<PreviewQuestion, 'seq' | 'parentSeq'>): string {
  if (q.parentSeq != null) return `c-${q.parentSeq}-${q.seq}`
  return `m-${q.seq}`
}

function mainKey(seq: number): string {
  return `m-${seq}`
}

const mainQuestionMap = computed(() => {
  const m = new Map<number, PreviewQuestion>()
  for (const q of data.value?.questions || []) {
    if (q.parentSeq != null) continue
    m.set(q.seq, q)
  }
  return m
})

const mainQuestions = computed(() => (data.value?.questions || []).filter((q) => q.parentSeq == null).sort((a, b) => a.seq - b.seq))

const childrenByParent = computed(() => {
  const m = new Map<number, PreviewQuestion[]>()
  for (const q of data.value?.questions || []) {
    if (q.parentSeq == null) continue
    const pid = q.parentSeq
    if (!pid) continue
    if (!m.has(pid)) m.set(pid, [])
    m.get(pid)!.push(q)
  }
  for (const [k, v] of m) v.sort((a, b) => a.seq - b.seq)
  return m
})

function isOptionSelected(q: PreviewQuestion, opt: string): boolean {
  const key = qKey(q)
  if (q.type === '多选') {
    const set = answer[key] as Set<string> | undefined
    return Boolean(set?.has(opt))
  }
  return String(answer[key] ?? '') === opt
}

function isVisible(q: PreviewQuestion): boolean {
  if (!q.parentSeq) return true
  const parent = mainQuestionMap.value.get(q.parentSeq)
  if (!parent) return false
  const trigger = q.triggerOption || ''
  if (!trigger) return false
  return isOptionSelected(parent, trigger)
}

function clearAnswer(key: string): void {
  delete answer[key]
  delete touched[key]
}

function clearHiddenChildren(): void {
  const all = data.value?.questions || []
  for (const q of all) {
    if (q.parentSeq == null) continue
    if (!isVisible(q)) clearAnswer(qKey(q))
  }
}

function getError(q: PreviewQuestion): string | null {
  if (!isVisible(q)) return null
  const key = qKey(q)
  if (!touched[key]) return null
  if (q.type === '单选') {
    const v = String(answer[key] ?? '').trim()
    return v ? null : '请选择一个选项'
  }
  if (q.type === '判断') {
    const v = String(answer[key] ?? '').trim()
    return v ? null : '请选择是/否'
  }
  if (q.type === '多选') {
    const set = answer[key] as Set<string> | undefined
    const count = set ? set.size : 0
    if (!count) return '请至少选择一个选项'
    if (q.multiMax != null && count > q.multiMax) return `最多可选 ${q.multiMax} 项`
    return null
  }
  if (q.type === '填空') {
    const v = String(answer[key] ?? '').trim()
    return v ? null : '请填写内容'
  }
  return null
}

function markTouched(q: PreviewQuestion): void {
  touched[qKey(q)] = true
}

function setSingle(q: PreviewQuestion, v: string): void {
  answer[qKey(q)] = v
  markTouched(q)
  if (q.parentSeq == null) clearHiddenChildren()
}

function toggleMulti(q: PreviewQuestion, opt: string): void {
  const key = qKey(q)
  const max = q.multiMax
  let set = answer[key] as Set<string> | undefined
  if (!set) {
    set = new Set<string>()
    answer[key] = set
  }
  if (set.has(opt)) set.delete(opt)
  else {
    if (max != null && set.size >= max) return
    set.add(opt)
  }
  markTouched(q)
  if (q.parentSeq == null) clearHiddenChildren()
}

function canChooseMore(q: PreviewQuestion, opt: string): boolean {
  const max = q.multiMax
  if (max == null) return true
  const set = answer[qKey(q)] as Set<string> | undefined
  if (!set) return true
  if (set.has(opt)) return true
  return set.size < max
}

function setFill(q: PreviewQuestion, v: string): void {
  answer[qKey(q)] = v
  markTouched(q)
}

async function load(): Promise<void> {
  if (!id.value) return
  loading.value = true
  try {
    const res = await request<ApiResponse<PreviewResponse>>({ url: `/admin/questionnaire/${id.value}/preview`, method: 'GET' })
    if (res.code !== 0) {
      ElMessage.error(res.message || '加载失败')
      return
    }
    data.value = res.data
    for (const q of res.data.questions || []) {
      const key = qKey(q)
      if (q.type === '多选') answer[key] = new Set<string>()
      else answer[key] = ''
      touched[key] = false
    }
    clearHiddenChildren()
  } finally {
    loading.value = false
  }
}

async function goBack(): Promise<void> {
  await router.push('/admin/m/2')
}

async function goEdit(): Promise<void> {
  await router.push(`/admin/m/2/${id.value}`)
}

async function doPrint(): Promise<void> {
  for (const q of data.value?.questions || []) touched[qKey(q)] = true
  await nextTick()
  window.print()
}

async function exportPdf(): Promise<void> {
  for (const q of data.value?.questions || []) touched[qKey(q)] = true
  await nextTick()
  const el = previewRef.value
  if (!el) return
  const mod = await import('html2pdf.js')
  const html2pdf = (mod as any).default ?? (mod as any)
  await html2pdf()
    .set({
      margin: 10,
      filename: `questionnaire-${id.value}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(el)
    .save()
}

watch(
  () => data.value?.questions,
  () => clearHiddenChildren(),
)

onMounted(async () => {
  await load()
})
</script>

<template>
  <div class="admin-page">
    <el-card shadow="never" class="admin-card admin-animate-in" style="--delay: 40ms" v-loading="loading">
      <template #header>
        <div
          class="admin-animate-in"
          style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; --delay: 0ms"
        >
          <div>
            <div style="font-weight: 700">问卷预览</div>
            <div style="font-size: 12px; opacity: 0.7">问卷ID：{{ id }}</div>
          </div>
          <el-space wrap>
            <el-button @click="goBack">返回列表</el-button>
            <el-button @click="goEdit">编辑</el-button>
            <el-button @click="doPrint">打印问卷</el-button>
            <el-button type="primary" @click="exportPdf">导出为PDF</el-button>
          </el-space>
        </div>
      </template>

      <div ref="previewRef" class="admin-animate-in" style="max-width: 860px; margin: 0 auto; --delay: 80ms">
        <div style="text-align: center; margin: 10px 0 18px">
          <div style="font-size: 22px; font-weight: 800">{{ data?.title || '' }}</div>
          <div v-if="data?.subtitle" style="opacity: 0.8; margin-top: 6px">{{ data.subtitle }}</div>
        </div>

        <div v-for="q in mainQuestions" :key="q.seq" style="margin-bottom: 18px">
          <div style="display: flex; gap: 8px; align-items: baseline">
            <div style="font-weight: 800">{{ q.seq }}.</div>
            <div style="font-weight: 700">{{ q.question }}</div>
          </div>

          <div style="margin-top: 10px; padding-left: 20px">
            <template v-if="q.type === '单选'">
              <el-radio-group :model-value="String(answer[mainKey(q.seq)] ?? '')" @change="(v: any) => setSingle(q, String(v))">
                <el-radio v-for="opt in q.options" :key="opt" :label="opt">{{ opt }}</el-radio>
              </el-radio-group>
            </template>
            <template v-else-if="q.type === '判断'">
              <el-radio-group :model-value="String(answer[mainKey(q.seq)] ?? '')" @change="(v: any) => setSingle(q, String(v))">
                <el-radio label="是">是</el-radio>
                <el-radio label="否">否</el-radio>
              </el-radio-group>
            </template>
            <template v-else-if="q.type === '多选'">
              <div style="display: flex; flex-direction: column; gap: 6px">
                <el-checkbox
                  v-for="opt in q.options"
                  :key="opt"
                  :model-value="isOptionSelected(q, opt)"
                  :disabled="!canChooseMore(q, opt)"
                  @change="() => toggleMulti(q, opt)"
                >
                  {{ opt }}
                </el-checkbox>
                <div v-if="q.multiMax != null" style="font-size: 12px; opacity: 0.75">最多可选 {{ q.multiMax }} 项</div>
              </div>
            </template>
            <template v-else-if="q.type === '填空'">
              <el-input
                :model-value="String(answer[mainKey(q.seq)] ?? '')"
                type="textarea"
                :rows="4"
                @update:model-value="(v: any) => setFill(q, String(v))"
                @blur="() => markTouched(q)"
              />
            </template>

            <div v-if="getError(q)" style="color: var(--el-color-danger); font-size: 12px; margin-top: 6px">
              {{ getError(q) }}
            </div>
          </div>

          <transition name="el-fade-in-linear">
            <div v-if="(childrenByParent.get(q.seq) || []).some((c) => isVisible(c))" style="margin-top: 12px; padding-left: 22px">
              <div v-for="c in childrenByParent.get(q.seq) || []" :key="c.seq">
                <transition name="el-collapse-transition">
                  <div v-show="isVisible(c)" style="margin-top: 12px; padding: 12px; border: 1px solid var(--el-border-color); border-radius: 10px">
                    <div style="display: flex; gap: 8px; align-items: baseline">
                      <div style="font-weight: 800">{{ c.seq }}.</div>
                      <div style="font-weight: 700">{{ c.question }}</div>
                    </div>

                    <div style="margin-top: 10px; padding-left: 20px">
                      <template v-if="c.type === '单选'">
                        <el-radio-group :model-value="String(answer[qKey(c)] ?? '')" @change="(v: any) => setSingle(c, String(v))">
                          <el-radio v-for="opt in c.options" :key="opt" :label="opt">{{ opt }}</el-radio>
                        </el-radio-group>
                      </template>
                      <template v-else-if="c.type === '判断'">
                        <el-radio-group :model-value="String(answer[qKey(c)] ?? '')" @change="(v: any) => setSingle(c, String(v))">
                          <el-radio label="是">是</el-radio>
                          <el-radio label="否">否</el-radio>
                        </el-radio-group>
                      </template>
                      <template v-else-if="c.type === '多选'">
                        <div style="display: flex; flex-direction: column; gap: 6px">
                          <el-checkbox
                            v-for="opt in c.options"
                            :key="opt"
                            :model-value="isOptionSelected(c, opt)"
                            :disabled="!canChooseMore(c, opt)"
                            @change="() => toggleMulti(c, opt)"
                          >
                            {{ opt }}
                          </el-checkbox>
                          <div v-if="c.multiMax != null" style="font-size: 12px; opacity: 0.75">最多可选 {{ c.multiMax }} 项</div>
                        </div>
                      </template>
                      <template v-else-if="c.type === '填空'">
                        <el-input
                          :model-value="String(answer[qKey(c)] ?? '')"
                          type="textarea"
                          :rows="4"
                          @update:model-value="(v: any) => setFill(c, String(v))"
                          @blur="() => markTouched(c)"
                        />
                      </template>

                      <div v-if="getError(c)" style="color: var(--el-color-danger); font-size: 12px; margin-top: 6px">
                        {{ getError(c) }}
                      </div>
                    </div>
                  </div>
                </transition>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </el-card>
  </div>
</template>
