<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMatchStore } from '@/stores/match'
import UiCard from '@/components/UiCard.vue'
import UiSpinner from '@/components/UiSpinner.vue'
import UiEmptyState from '@/components/UiEmptyState.vue'
import UiErrorState from '@/components/UiErrorState.vue'

const router = useRouter()
const matchStore = useMatchStore()
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    await matchStore.fetchMatches()
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const statusLabels: Record<string, string> = {
  PENDING: '待确认',
  CONFIRMED: '已确认',
  REJECTED: '已拒绝',
  EXPIRED: '已过期',
}
const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  CONFIRMED: 'bg-green-500/10 text-green-400 border-green-500/20',
  REJECTED: 'bg-red-500/10 text-red-400 border-red-500/20',
  EXPIRED: 'bg-gray-800 text-gray-500 border-gray-700',
}
</script>

<template>
  <div class="min-h-screen">
    <div class="max-w-lg mx-auto px-4 py-8">
      <div class="flex items-center gap-4 mb-8">
        <button class="text-gray-400 hover:text-white transition cursor-pointer" @click="router.push('/')">&larr; 返回</button>
        <h1 class="text-xl font-bold text-white">我的匹配</h1>
      </div>

      <UiSpinner v-if="loading" label="加载中..." />
      <UiErrorState v-else-if="error" :message="error" @retry="load" />
      <UiEmptyState
        v-else-if="!matchStore.matches.length"
        title="暂无匹配记录"
        description="加入匹配池后，系统将自动为你生成匹配"
      />

      <div v-else class="space-y-3">
        <UiCard
          v-for="m in matchStore.matches" :key="m.matchId"
          clickable
          @click="router.push(`/match/${m.matchId}`)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-sm text-gray-300">
                {{ m.otherUser?.nickname?.charAt(0)?.toUpperCase() || '?' }}
              </div>
              <div>
                <p class="text-white text-sm font-medium">{{ m.otherUser?.nickname || '未知用户' }}</p>
                <p class="text-gray-500 text-xs">{{ m.track === 'LOVE' ? '💕 恋爱' : '🤝 交友' }} &middot; 匹配度 {{ Math.round(m.score) }}%</p>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded text-xs border font-medium"
                  :class="statusColors[m.status] || statusColors.PENDING">
              {{ statusLabels[m.status] || m.status }}
            </span>
          </div>
        </UiCard>
      </div>
    </div>
  </div>
</template>