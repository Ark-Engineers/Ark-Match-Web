import { ref, computed, type Ref } from 'vue'
import type { QuestionItem, AnswerSubmit } from '@/api/questionnaire'

/** 主问题统一用 parentSeq=0 表示（与后端 submit 约定一致） */
export const MAIN_PARENT = 0

export type StepType = 'single' | 'judge' | 'fill' | 'multi'

export interface EngineStep {
  key: string          // `${parentSeq}:${seq}` 作为答案存储 key
  parentSeq: number
  seq: number
  title: string
  type: StepType
  options: string[]    // 单选/判断/多选 的选项；填空为 []
  maxMulti: number | null // 多选_X 的最大可选数量
}

function isMain(q: QuestionItem): boolean {
  return q.parentSeq == null || q.parentSeq === 0
}

function normalizeType(raw: string): StepType {
  const t = (raw || '').trim()
  if (t === '填空') return 'fill'
  if (t === '判断') return 'judge'
  if (t.startsWith('多选_')) return 'multi'
  return 'single'
}

function parseMultiMax(raw: string): number | null {
  const t = (raw || '').trim()
  if (!t.startsWith('多选_')) return null
  const v = parseInt(t.split('_')[1] ?? '', 10)
  return Number.isFinite(v) && v > 1 ? v : null
}

function parseOptions(raw: string | null): string[] {
  return (raw || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function toStep(q: QuestionItem): EngineStep {
  const main = isMain(q)
  return {
    key: `${main ? MAIN_PARENT : (q.parentSeq ?? MAIN_PARENT)}:${q.seq}`,
    parentSeq: main ? MAIN_PARENT : (q.parentSeq ?? MAIN_PARENT),
    seq: q.seq,
    title: q.question,
    type: normalizeType(q.type),
    options: parseOptions(q.options),
    maxMulti: parseMultiMax(q.type),
  }
}

/** 由某题的已选答案推导其「选中选项集合」，用于判断子题是否触发 */
export function selectedOf(type: StepType, value: any): string[] {
  if (value == null) return []
  if (type === 'multi') return Array.isArray(value) ? value.slice() : []
  return typeof value === 'string' ? [value] : []
}

/**
 * 把后端下发的题目扁平化为「向导步骤」：
 * 依次排列所有主题；每个主题之后按需追加被触发的子题（父选中 triggerOption 时）。
 */
export function flattenQuestions(questions: QuestionItem[], answers: Record<string, any>): EngineStep[] {
  const mains = questions.filter(isMain).sort((a, b) => a.seq - b.seq)
  const kidsMap = new Map<number, QuestionItem[]>()
  for (const q of questions) {
    if (isMain(q)) continue
    const p = q.parentSeq ?? MAIN_PARENT
    if (!kidsMap.has(p)) kidsMap.set(p, [])
    const arr = kidsMap.get(p)!
    // 同父下子题按 seq 排一次
    let inserted = false
    for (let i = 0; i < arr.length; i++) {
      if (arr[i]!.seq > q.seq) { arr.splice(i, 0, q); inserted = true; break }
    }
    if (!inserted) arr.push(q)
  }

  const steps: EngineStep[] = []
  for (const m of mains) {
    const mStep = toStep(m)
    steps.push(mStep)
    const kids = kidsMap.get(m.seq) || []
    const parentSel = selectedOf(mStep.type, answers[mStep.key])
    for (const kid of kids) {
      if (kid.triggerOption != null && parentSel.includes(kid.triggerOption)) {
        steps.push(toStep(kid))
      }
    }
  }
  return steps
}

function normalizeAnswer(step: EngineStep, value: any): string {
  if (step.type === 'multi') {
    const picked: string[] = Array.isArray(value) ? value : []
    // 按源选项顺序拼接，用 | 分隔，与后端一致
    return step.options.filter((o) => picked.includes(o)).join('|')
  }
  if (step.type === 'judge') {
    return value === true ? 'true' : 'false'
  }
  if (step.type === 'fill') {
    return typeof value === 'string' ? value.trim() : ''
  }
  // single
  return typeof value === 'string' ? value : ''
}

/** 把前端答案重组为后端 submit 所需的 { parentSeq, seq, answerText } 列表 */
export function buildAnswers(questions: QuestionItem[], answers: Record<string, any>): AnswerSubmit[] {
  const items: AnswerSubmit[] = []
  const mains = questions.filter(isMain).sort((a, b) => a.seq - b.seq)
  for (const m of mains) {
    const mStep = toStep(m)
    const raw = answers[mStep.key]
    items.push({ parentSeq: MAIN_PARENT, seq: m.seq, answerText: normalizeAnswer(mStep, raw) })

    const parentSel = selectedOf(mStep.type, raw)
    const kids = questions
      .filter((k) => !isMain(k) && (k.parentSeq ?? MAIN_PARENT) === m.seq)
      .sort((a, b) => a.seq - b.seq)
    for (const kid of kids) {
      if (kid.triggerOption != null && parentSel.includes(kid.triggerOption)) {
        const kStep = toStep(kid)
        items.push({ parentSeq: m.seq, seq: kid.seq, answerText: normalizeAnswer(kStep, answers[kStep.key]) })
      }
    }
  }
  return items
}

/**
 * 问卷向导引擎：基于后端下发的题目生成步骤，按需展开子题。
 * questions 传入一个响应式引用（store 中的题目数组）。
 */
export function useSurveyEngine(questions: Ref<QuestionItem[]>) {
  /** key = `${parentSeq}:${seq}` → 答案。single/judge/fill 存字符串，multi 存 string[] */
  const answers = ref<Record<string, any>>({})
  const currentIndex = ref(0)

  const allSteps = computed(() => flattenQuestions(questions.value, answers.value))
  const currentStep = computed(() => allSteps.value[currentIndex.value] ?? null)
  const isFirst = computed(() => currentIndex.value === 0)
  const isLast = computed(() => currentIndex.value === allSteps.value.length - 1)
  const progress = computed(() =>
    allSteps.value.length ? (currentIndex.value + 1) / allSteps.value.length : 0
  )

  function clamp() {
    const len = allSteps.value.length
    if (len === 0) currentIndex.value = 0
    else if (currentIndex.value > len - 1) currentIndex.value = len - 1
  }

  function setAnswer(key: string, value: any) {
    answers.value = { ...answers.value, [key]: value }
    clamp()
    if (currentIndex.value < allSteps.value.length - 1) {
      currentIndex.value++
    }
  }

  function prev() {
    if (!isFirst.value) currentIndex.value--
  }

  function reset() {
    answers.value = {}
    currentIndex.value = 0
  }

  return { answers, currentIndex, allSteps, currentStep, isFirst, isLast, progress, setAnswer, prev, reset }
}