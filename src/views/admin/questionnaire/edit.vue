<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import { request } from '@/api'

type ApiResponse<T> = { code: number; message: string; data: T }

type QuestionRow = {
  seq: number
  question: string
  type: string
  options: string
  parentSeq: number | null
  triggerOption: string
  weight: string
}

type DetailResponse = {
  id: number
  title: string
  subtitle: string | null
  status: string
  questions: Array<{
    seq: number
    question: string
    type: string
    options: string | null
    parentSeq: number | null
    triggerOption: string | null
    weight: string | null
  }>
}

const route = useRoute()
const router = useRouter()

const id = computed(() => Number(route.params.id || 0))

const loading = ref(false)
const saving = ref(false)

const form = reactive({
  title: '',
  subtitle: '',
})

const rows = ref<QuestionRow[]>([])

function parseType(raw: string): { base: '单选' | '多选' | '填空' | '判断' | '未知'; multiMax: number | null } {
  const t = String(raw || '').trim()
  if (t === '单选') return { base: '单选', multiMax: null }
  if (t === '填空') return { base: '填空', multiMax: null }
  if (t === '判断') return { base: '判断', multiMax: null }
  if (t.startsWith('多选_')) {
    const n = Number(t.slice(3))
    return { base: '多选', multiMax: Number.isFinite(n) ? n : null }
  }
  return { base: '未知', multiMax: null }
}

function splitOptions(raw: string): string[] {
  const s = String(raw || '').trim()
  if (!s) return []
  return s.split('|').map((x) => x.trim()).filter((x) => x)
}

function getParentRow(parentSeq: number | null): QuestionRow | null {
  if (!parentSeq) return null
  return rows.value.find((r) => r.parentSeq == null && r.seq === parentSeq) ?? null
}

function getTriggerOptions(row: QuestionRow): string[] {
  const parent = getParentRow(row.parentSeq)
  if (!parent) return []
  return splitOptions(parent.options)
}

const weightSum = computed(() => {
  let sum = 0
  for (const r of rows.value) {
    const n = Number(String(r.weight || '').trim())
    if (Number.isFinite(n)) sum += n
  }
  return Math.round(sum * 100) / 100
})

const weightOk = computed(() => Math.abs(weightSum.value - 100) <= 0.01)

async function load(): Promise<void> {
  if (!id.value) return
  loading.value = true
  try {
    const res = await request<ApiResponse<DetailResponse>>({
      url: `/admin/questionnaire/${id.value}`,
      method: 'GET',
    })
    if (res.code !== 0) {
      ElMessage.error(res.message || '加载失败')
      return
    }
    form.title = res.data.title || ''
    form.subtitle = res.data.subtitle || ''
    rows.value = (res.data.questions || []).map((q) => ({
      seq: q.seq,
      question: q.question || '',
      type: q.type || '',
      options: q.options || '',
      parentSeq: q.parentSeq ?? null,
      triggerOption: q.triggerOption || '',
      weight: q.weight || '',
    }))
  } finally {
    loading.value = false
  }
}

async function addRow(): Promise<void> {
  const next = rows.value.filter((r) => r.parentSeq == null).length + 1
  rows.value.push({
    seq: next,
    question: '',
    type: '单选',
    options: '',
    parentSeq: null,
    triggerOption: '',
    weight: '',
  })
}

async function onTypeChange(row: QuestionRow, nextBase: string): Promise<void> {
  if (nextBase === '单选') {
    row.type = '单选'
    return
  }
  if (nextBase === '填空') {
    row.type = '填空'
    row.options = ''
    return
  }
  if (nextBase === '判断') {
    row.type = '判断'
    row.options = ''
    return
  }
  if (nextBase === '多选') {
    const input = await ElMessageBox.prompt('请输入多选最大可选数量（>=2）', '多选设置', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      closeOnClickModal: false,
      inputPattern: /^[0-9]+$/,
      inputErrorMessage: '请输入正整数',
    }).catch(() => null)
    if (!input) return
    const n = Number(input.value)
    if (!Number.isFinite(n) || n < 2) {
      ElMessage.error('最大可选数量必须>=2')
      return
    }
    row.type = `多选_${n}`
    return
  }
}

function rowLabel(row: QuestionRow): string {
  if (row.parentSeq != null) return `主${row.parentSeq}-子${row.seq}`
  return `主${row.seq}`
}

function validateRow(row: QuestionRow): string | null {
  const label = rowLabel(row)
  if (row.seq <= 0) return `序号不合法（${label}）`
  const q = row.question.trim()
  if (q.length < 2) return `问题至少2个字符（${label}）`
  const t = parseType(row.type)
  if (t.base === '未知') return `题型不合法（${label}）`
  if (t.base === '多选' && (!t.multiMax || t.multiMax < 2)) return `多选最大可选数量必须>=2（${label}）`
  const w = row.weight.trim()
  if (!w) return `权重必填（${label}）`
  if (!/^\d+(\.\d{1,2})?$/.test(w)) return `权重格式不正确（${label}）`

  const isChoice = t.base === '单选' || t.base === '多选'
  if (isChoice) {
    const opt = row.options.trim()
    if (!opt) return `选项答案必填（${label}）`
    if (opt.includes('||')) return `选项答案禁止连续分隔符（${label}）`
    const parts = opt.split('|')
    if (parts.some((p) => !p.trim())) return `选项答案禁止空选项（${label}）`
  } else {
    if (row.options.trim()) return `填空/判断题型选项答案必须为空（${label}）`
  }

  if (row.parentSeq != null) {
    const parent = getParentRow(row.parentSeq)
    if (!parent) return `主问题序号不存在（${label}）`
    const parentType = parseType(parent.type)
    if (!(parentType.base === '单选' || parentType.base === '多选')) return `主问题必须为单选或多选（${label}）`
    const trigger = row.triggerOption.trim()
    if (!trigger) return `触发子问题选项必填（${label}）`
    const parentOpts = splitOptions(parent.options)
    if (!parentOpts.includes(trigger)) return `触发子问题选项必须来自主问题选项（${label}）`
  } else {
    if (row.triggerOption.trim()) return `未绑定子问题时触发选项必须为空（${label}）`
  }

  return null
}

function normalizeRowsForSave(src: QuestionRow[]): QuestionRow[] {
  const mains = src
    .filter((r) => r.parentSeq == null)
    .slice()
    .sort((a, b) => a.seq - b.seq)

  const mapOldToNewMainSeq = new Map<number, number>()
  mains.forEach((r, idx) => {
    mapOldToNewMainSeq.set(r.seq, idx + 1)
  })

  const normalizedMains: QuestionRow[] = mains.map((r) => ({
    ...r,
    seq: mapOldToNewMainSeq.get(r.seq) || r.seq,
    parentSeq: null,
  }))

  const children = src.filter((r) => r.parentSeq != null).slice()
  const byParent = new Map<number, QuestionRow[]>()
  for (const c of children) {
    const oldParent = c.parentSeq as number
    const newParent = mapOldToNewMainSeq.get(oldParent) || oldParent
    if (!byParent.has(newParent)) byParent.set(newParent, [])
    byParent.get(newParent)!.push({ ...c, parentSeq: newParent })
  }

  const normalizedChildren: QuestionRow[] = []
  for (const [p, list] of byParent) {
    list.sort((a, b) => a.seq - b.seq)
    list.forEach((r, idx) => {
      normalizedChildren.push({ ...r, seq: idx + 1 })
    })
  }
  normalizedChildren.sort((a, b) => (a.parentSeq as number) - (b.parentSeq as number) || a.seq - b.seq)

  return [...normalizedMains, ...normalizedChildren]
}

async function save(): Promise<void> {
  if (saving.value) return
  const title = form.title.trim()
  if (title.length < 2) {
    ElMessage.error('问卷标题至少2个字符')
    return
  }

  for (const r of rows.value) {
    const err = validateRow(r)
    if (err) {
      ElMessage.error(err)
      return
    }
  }
  if (!weightOk.value) {
    ElMessage.error(`权重总和必须等于100（当前=${weightSum.value}）`)
    return
  }

  saving.value = true
  try {
    const normalized = normalizeRowsForSave(rows.value)
    const payload = {
      id: id.value,
      title,
      subtitle: form.subtitle.trim(),
      questions: normalized.map((r) => ({
        seq: r.seq,
        question: r.question.trim(),
        type: r.type.trim(),
        options: r.options.trim(),
        parentSeq: r.parentSeq,
        triggerOption: r.triggerOption.trim(),
        weight: r.weight.trim(),
      })),
    }
    const res = await request<ApiResponse<DetailResponse>>({
      url: '/admin/questionnaire/update',
      method: 'POST',
      data: payload,
    })
    if (res.code !== 0) {
      ElMessage.error(res.message || '保存失败')
      return
    }
    ElMessage.success('已保存')
    await load()
  } finally {
    saving.value = false
  }
}

async function goBack(): Promise<void> {
  await router.push('/admin/m/2')
}

async function goPreview(): Promise<void> {
  await router.push(`/admin/m/2/${id.value}/preview`)
}

onMounted(async () => {
  await load()
})
</script>

<template>
  <div style="padding: 16px">
    <el-card shadow="never" v-loading="loading">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap">
          <div>
            <div style="font-weight: 700">编辑问卷</div>
            <div style="font-size: 12px; opacity: 0.7">问卷ID：{{ id }}</div>
          </div>
          <el-space wrap>
            <el-button @click="goBack">返回列表</el-button>
            <el-button @click="goPreview">预览</el-button>
            <el-button type="primary" :loading="saving" @click="save">保存</el-button>
          </el-space>
        </div>
      </template>

      <el-form label-position="top">
        <el-form-item label="问卷标题*">
          <el-input v-model="form.title" maxlength="128" show-word-limit />
        </el-form-item>
        <el-form-item label="问卷副标题">
          <el-input v-model="form.subtitle" maxlength="255" show-word-limit />
        </el-form-item>
      </el-form>

      <div style="display: flex; justify-content: space-between; align-items: center; margin: 10px 0">
        <div style="font-weight: 700">题目配置</div>
        <el-space>
          <el-tag :type="weightOk ? 'success' : 'danger'">权重总和：{{ weightSum }}</el-tag>
          <el-button type="primary" plain @click="addRow">新增题目</el-button>
        </el-space>
      </div>

      <el-table :data="rows" border table-layout="fixed">
        <el-table-column prop="seq" label="序号" width="70" />
        <el-table-column label="问题" min-width="220">
          <template #default="{ row }">
            <el-input v-model="row.question" maxlength="255" />
          </template>
        </el-table-column>
        <el-table-column label="题型" width="160">
          <template #default="{ row }">
            <el-select
              :model-value="parseType(row.type).base"
              style="width: 100%"
              @change="(v: string) => onTypeChange(row, v)"
            >
              <el-option label="单选" value="单选" />
              <el-option label="多选" value="多选" />
              <el-option label="填空" value="填空" />
              <el-option label="判断" value="判断" />
            </el-select>
            <div v-if="parseType(row.type).base === '多选'" style="font-size: 12px; opacity: 0.75; margin-top: 4px">
              最大可选：{{ parseType(row.type).multiMax }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="选项答案" min-width="260">
          <template #default="{ row }">
            <el-input
              v-model="row.options"
              :disabled="!(parseType(row.type).base === '单选' || parseType(row.type).base === '多选')"
              placeholder="用 | 分隔，如 A|B|C"
            />
          </template>
        </el-table-column>
        <el-table-column label="主问题序号" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.parentSeq" :min="1" :disabled="row.seq === 1" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="触发子问题选项" min-width="180">
          <template #default="{ row }">
            <el-select v-model="row.triggerOption" :disabled="!row.parentSeq" filterable clearable style="width: 100%">
              <el-option v-for="opt in getTriggerOptions(row)" :key="opt" :label="opt" :value="opt" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="权重" width="120">
          <template #default="{ row }">
            <el-input v-model="row.weight" placeholder="如 10.5" />
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>
