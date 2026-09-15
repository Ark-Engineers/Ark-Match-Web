<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { listMyBanRecords, submitBanAppeal } from '@/api/ban'
import type { UserBanRecord } from '@/api/ban'

const router = useRouter()
const ui = useUiStore()

const records = ref<UserBanRecord[]>([])
const total = ref(0)
const page = ref(1)
const size = 20
const loading = ref(false)
const submitting = ref(false)

// 申诉表单
const recordId = ref<number | null>(null)
const reason = ref('')
const contact = ref('')

async function load(pageNo = 1) {
  loading.value = true
  try {
    const res = await listMyBanRecords({ page: pageNo, size })
    records.value = res.items
    total.value = res.total
    page.value = res.page
  } catch (e: any) {
    ui.showToast(e.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

async function handleAppeal(r: UserBanRecord) {
  recordId.value = r.id
  reason.value = ''
  contact.value = ''
  openComposer()
}

function openComposer() {
  ;(document.getElementById('appeal-composer') as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth' })
}

async function submit() {
  if (recordId.value == null || !reason.value.trim()) {
    ui.showToast('请填写申诉理由', 'error')
    return
  }
  submitting.value = true
  try {
    await submitBanAppeal({
      banRecordId: recordId.value,
      reason: reason.value.trim(),
      contact: contact.value.trim() || undefined,
    })
    ui.showToast('申诉已提交，请等待管理员处理', 'success')
    reason.value = ''
    contact.value = ''
    recordId.value = null
    await load()
  } catch (e: any) {
    ui.showToast(e.message || '提交失败', 'error')
  } finally {
    submitting.value = false
  }
}

function fmt(t: string | null | undefined): string {
  if (!t) return '—'
  return new Date(t).toLocaleString()
}

onMounted(() => load())
</script>

<template>
  <div class="min-h-screen">
    <div class="max-w-2xl mx-auto px-4 py-8">
      <div class="flex items-center gap-4 mb-6">
        <button class="text-gray-400 hover:text-white transition cursor-pointer" @click="router.back()">&larr; 返回</button>
        <h1 class="text-xl font-bold text-white">封禁申诉</h1>
      </div>

      <p class="text-gray-500 text-sm mb-6 leading-relaxed">
        如果你认为自己的账号被误封或有异议，可在下方对应封禁记录上点击「申诉」，填写理由后提交，我们会尽快核实处理。
      </p>

      <!-- 封禁记录列表 -->
      <div class="space-y-3">
        <div v-if="loading" class="py-12 text-center text-gray-500 text-sm">加载中...</div>
        <div v-else-if="records.length === 0" class="py-12 text-center text-gray-500 text-sm">
          当前没有可申诉的封禁记录
        </div>
        <div
          v-for="r in records"
          :key="r.id"
          class="rounded-xl border border-gray-800 bg-gray-900/60 p-4"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm text-gray-800 bg-red-500/80 px-2 py-0.5 rounded text-white">已封禁</span>
                <span class="text-sm font-medium text-gray-200">#{{ r.id }}</span>
                <span class="text-xs text-gray-500">{{ fmt(r.effectiveAt) }}</span>
              </div>
              <p class="mt-2 text-sm text-gray-300">原因：<span class="text-gray-100">{{ r.reason }}</span></p>
              <p class="mt-1 text-xs text-gray-500">截止：<span class="text-gray-400">{{ fmt(r.expiresAt) }}</span></p>
              <p v-if="r.unbannedAt" class="mt-1 text-xs text-gray-500">已解除：<span class="text-cyan-400">{{ fmt(r.unbannedAt) }}</span></p>
            </div>
            <button
              class="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 transition cursor-pointer"
              @click="handleAppeal(r)"
            >申诉</button>
          </div>
        </div>
      </div>

      <!-- 申诉表单 -->
      <div id="appeal-composer" class="mt-6 rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-3">
        <h2 class="text-sm font-semibold text-white">
          提交申诉 {{ recordId != null ? `（封禁记录 #${recordId}）` : '— 请先在下方选择要申诉的记录' }}
        </h2>
        <textarea v-model="reason" rows="3" maxlength="500" placeholder="填写申诉理由（必填）"
                  class="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50 resize-none"
                  :disabled="recordId == null" />
        <input v-model="contact" type="text" placeholder="联系方式（选填，如微信/邮箱）"
               class="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
               :disabled="recordId == null" />
        <p v-if="recordId == null" class="text-xs text-gray-600">请先选择一条封禁记录再填写。</p>
        <button
          class="w-full py-2.5 rounded-lg bg-[#16B8E0] text-white text-sm font-semibold hover:bg-[#2ac6ea] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="recordId == null || submitting"
          @click="submit"
        >{{ submitting ? '提交中...' : '提交申诉' }}</button>
      </div>
    </div>
  </div>
</template>