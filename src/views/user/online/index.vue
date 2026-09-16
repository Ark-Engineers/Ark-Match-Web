<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

import { request } from '@/api'
import { API_BASE_URL } from '@/config'
import SpinePixiPlayer from '@/components/SpinePixiPlayer.vue'

type ApiResponse<T> = { code: number; message: string; data: T }

type SpineOption = {
  assetKey: string
  name: string
  skelUrl: string
}

const router = useRouter()
const route = useRoute()

const loading = ref(false)
const list = ref<SpineOption[]>([])
const selected = ref<SpineOption | null>(null)
const roomId = ref(String(route.query.room || 'lobby'))

function apiUrl(u: string): string {
  const base = String(API_BASE_URL || '').trim()
  if (!u) return base || ''
  if (!base) return u
  if (u.startsWith('/')) return `${base}${u}`
  return `${base}/${u}`
}

const grid = computed(() => list.value)

async function loadList(): Promise<void> {
  loading.value = true
  try {
    const res = await request<ApiResponse<SpineOption[]>>({
      url: '/user/spine/list',
      method: 'GET',
    })
    if (res.code !== 0) {
      ElMessage.error(res.message || '加载失败')
      list.value = []
      return
    }
    list.value = res.data || []
    if (!selected.value && list.value.length > 0) selected.value = list.value[0]!
  } catch {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

function pick(item: SpineOption): void {
  selected.value = item
  const r = String(roomId.value || 'lobby').trim() || 'lobby'
  router.push({ path: '/online/room', query: { room: r, assetKey: item.assetKey } })
}

onMounted(() => void loadList())
</script>

<template>
  <div class="min-h-screen bg-[#0b1220] relative">
    <button
      class="fixed right-6 top-6 z-20 px-4 h-10 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100 cursor-pointer"
      @click="router.push('/home')"
    >
      返回主页
    </button>
    <div class="mx-auto max-w-6xl px-6 py-10">
      <div class="flex items-end justify-between gap-6">
        <div>
          <h1 class="text-white text-2xl font-semibold">联机功能</h1>
          <p class="mt-2 text-gray-400">选择一个小人进入房间</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="text-gray-300 text-sm">房间</div>
          <input
            v-model="roomId"
            class="h-10 w-44 px-3 rounded-lg bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-cyan-400/60"
            placeholder="lobby"
          />
        </div>
      </div>

      <div v-if="loading" class="mt-8 text-gray-400">加载中…</div>

      <div v-else class="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <button
          v-for="item in grid"
          :key="item.assetKey"
          class="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 transition cursor-pointer overflow-hidden"
          @click="pick(item)"
        >
          <div class="h-40 w-full bg-black/20">
            <SpinePixiPlayer :skel-url="apiUrl(item.skelUrl)" fit="contain" />
          </div>
          <div class="px-4 py-3">
            <div class="text-gray-100 font-semibold truncate">{{ item.name || item.assetKey }}</div>
            <div class="text-gray-500 text-xs truncate">{{ item.assetKey }}</div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
