<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { listUserNotices, getUserNotice, type UserNotice } from '@/api/notice'
import UiCard from '@/components/UiCard.vue'
import UiButton from '@/components/UiButton.vue'
import UiModal from '@/components/UiModal.vue'

const router = useRouter()
const ui = useUiStore()

// 返回：有历史则后退，否则回首页
function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

const list = ref<UserNotice[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const size = 15
const pages = computed(() => Math.max(1, Math.ceil(total.value / size)))

const detailOpen = ref(false)
const detail = ref<UserNotice | null>(null)
const detailLoading = ref(false)

async function load(p = page.value) {
  loading.value = true
  page.value = p
  try {
    const res = await listUserNotices({ page: p, size })
    list.value = res.items
    total.value = res.total
  } catch (e: any) { ui.showToast(e.message || '加载失败', 'error') }
  finally { loading.value = false }
}

async function openDetail(n: UserNotice) {
  detailOpen.value = true
  detailLoading.value = true
  detail.value = n // 先展示标题，内容待加载
  try {
    const full = await getUserNotice(n.id) // 详情接口会标记已读
    detail.value = full
    if (!n.read) {
      n.read = true
      if (total.value > 0) load(page.value).catch(() => {})
    }
  } catch (e: any) { ui.showToast(e.message || '加载详情失败', 'error') }
  finally { detailLoading.value = false }
}

function levelCls(level: string | undefined) {
  return (level === 'IMPORTANT') ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : (level === 'NOTICE') ? 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20'
    : 'text-gray-400 bg-gray-500/10 border-gray-500/20'
}

function fmt(t: string | null | undefined) { return t ? new Date(t).toLocaleString() : '—' }

onMounted(() => load(1))
</script>

<template>
  <div class="min-h-screen">
    <div class="max-w-3xl mx-auto px-4 py-8">
      <div class="flex items-center gap-4 mb-6">
        <button class="text-gray-400 hover:text-white transition cursor-pointer" @click="goBack">&larr; 返回</button>
        <h1 class="text-xl font-bold text-white">系统公告</h1>
      </div>

    <UiCard :class="['overflow-hidden', loading && 'opacity-60']">
      <ul>
        <li v-for="(n, idx) in list" :key="n.id">
          <button
            class="w-full flex items-center gap-3 px-5 py-4 text-left border-b border-gray-800/60 hover:bg-white/5 transition cursor-pointer"
            :class="idx === list.length - 1 && 'border-b-0'"
            @click="openDetail(n)"
          >
            <span class="shrink-0 w-2 h-2 rounded-full" :class="n.read ? 'bg-transparent' : 'bg-cyan-400'" :title="n.read ? '已读' : '未读'" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-xs px-2 py-0.5 rounded-full border" :class="levelCls(n.level)">{{ n.level || 'NORMAL' }}</span>
                <span v-if="n.pinned" class="text-xs px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-400 bg-amber-500/10">置顶</span>
              </div>
              <p class="text-sm text-gray-200 font-medium truncate">{{ n.title }}</p>
              <p class="text-xs text-gray-500 mt-0.5">{{ fmt(n.publishAt) }}</p>
            </div>
            <span class="text-xs text-gray-500 shrink-0">查看</span>
          </button>
        </li>
        <li v-if="list.length === 0" class="py-14 text-center text-gray-500">暂无公告</li>
      </ul>
    </UiCard>

    <div class="flex items-center justify-end gap-3 mt-4" v-if="pages > 1">
      <button class="text-sm text-gray-400 hover:text-white transition cursor-pointer" :class="{ 'opacity-40 pointer-events-none': page <= 1 }" @click="load(page - 1)">上一页</button>
      <span class="text-sm text-gray-400">{{ page }} / {{ pages }}</span>
      <button class="text-sm text-gray-400 hover:text-white transition cursor-pointer" :class="{ 'opacity-40 pointer-events-none': page >= pages }" @click="load(page + 1)">下一页</button>
    </div>

    <!-- 公告详情 -->
    <UiModal :show="detailOpen" @close="detailOpen = false">
      <div class="p-6 space-y-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs px-2 py-0.5 rounded-full border" :class="levelCls(detail?.level)">{{ detail?.level || '' }}</span>
            <span v-if="detail?.pinned" class="text-xs px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-400 bg-amber-500/10">置顶</span>
          </div>
          <h2 class="text-lg font-semibold text-white">{{ detail?.title }}</h2>
          <p class="text-xs text-gray-500 mt-1">{{ detail ? fmt(detail.publishAt) : '' }}</p>
        </div>
        <div class="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm text-gray-200 leading-relaxed">
          <p v-if="detailLoading" class="text-gray-500">加载中…</p>
          <p v-else>{{ detail?.content || '（无内容）' }}</p>
        </div>
        <div class="flex justify-end pt-1">
          <UiButton variant="secondary" @click="detailOpen = false">关闭</UiButton>
        </div>
      </div>
    </UiModal>
    </div>
  </div>
</template>