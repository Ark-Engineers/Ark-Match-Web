<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMatchStore } from '@/stores/match'
import { useUiStore } from '@/stores/ui'
import UiCard from '@/components/UiCard.vue'
import UiButton from '@/components/UiButton.vue'
import UiSpinner from '@/components/UiSpinner.vue'
import UiErrorState from '@/components/UiErrorState.vue'

const route = useRoute()
const router = useRouter()
const matchStore = useMatchStore()
const ui = useUiStore()

const matchId = Number(route.params.id)
const loading = ref(true)
const error = ref('')
const confirming = ref(false)
const rejecting = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    await matchStore.fetchMatchDetail(matchId)
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
})

async function handleConfirm() {
  confirming.value = true
  try {
    const result = await matchStore.confirm(matchId)
    if (result.status === 'CONFIRMED') {
      ui.showToast('双方已确认！现在可以查看联系方式了', 'success')
    } else {
      ui.showToast('已确认，等待对方确认', 'success')
    }
    await matchStore.fetchMatchDetail(matchId)
  } catch (e: any) {
    ui.showToast(e.message || '操作失败', 'error')
  } finally {
    confirming.value = false
  }
}

async function handleReject() {
  rejecting.value = true
  try {
    await matchStore.reject(matchId)
    ui.showToast('已拒绝此匹配', 'info')
    await matchStore.fetchMatchDetail(matchId)
  } catch (e: any) {
    ui.showToast(e.message || '操作失败', 'error')
  } finally {
    rejecting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen">
    <div class="max-w-lg mx-auto px-4 py-8">
      <div class="flex items-center gap-4 mb-8">
        <button class="text-gray-400 hover:text-white transition cursor-pointer" @click="router.back()">&larr; 返回</button>
        <h1 class="text-xl font-bold text-white">匹配详情</h1>
      </div>

      <UiSpinner v-if="loading" label="加载中..." />
      <UiErrorState v-else-if="error" :message="error" @retry="onMounted(() => matchStore.fetchMatchDetail(matchId))" />

      <div v-else-if="matchStore.currentMatch" class="space-y-4">
        <!-- Partner info -->
        <UiCard>
          <div class="flex items-center gap-4 mb-4">
            <div class="w-16 h-16 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xl text-gray-300">
              {{ matchStore.currentMatch.otherUser?.nickname?.charAt(0)?.toUpperCase() || '?' }}
            </div>
            <div>
              <p class="text-lg font-bold text-white">{{ matchStore.currentMatch.otherUser?.nickname || '未知用户' }}</p>
              <p class="text-gray-500 text-sm">
                {{ matchStore.currentMatch.track === 'LOVE' ? '💕 恋爱匹配' : '🤝 交友匹配' }}
                &middot; 匹配度 {{ Math.round(matchStore.currentMatch.score) }}%
              </p>
            </div>
          </div>

          <!-- Partner profile (if CONFIRMED) -->
          <div v-if="matchStore.currentMatch.partnerProfile" class="border-t border-gray-800 pt-4 mt-4">
            <p class="text-gray-400 text-xs mb-2">对方简介</p>
            <p class="text-gray-300 text-sm">{{ matchStore.currentMatch.partnerProfile.bio || '暂无简介' }}</p>
          </div>
        </UiCard>

        <!-- Contact info -->
        <UiCard v-if="matchStore.currentMatch.contactsRevealed">
          <h3 class="text-white font-semibold text-sm mb-3">联系方式</h3>
          <div class="space-y-2">
            <div v-if="Array.isArray(matchStore.currentMatch.contacts)" class="space-y-2">
              <div v-for="(c, i) in matchStore.currentMatch.contacts" :key="i"
                   class="flex items-center gap-2 text-sm text-gray-300 bg-gray-800/50 rounded-lg px-3 py-2">
                <span class="text-gray-500">{{ c.type }}:</span>
                <span class="text-cyan-400">{{ c.value }}</span>
              </div>
            </div>
          </div>
        </UiCard>

        <!-- Actions -->
        <div v-if="matchStore.currentMatch.status === 'PENDING'" class="flex gap-3">
          <UiButton :loading="confirming" @click="handleConfirm" block>确认匹配</UiButton>
          <UiButton variant="secondary" :loading="rejecting" @click="handleReject" block>拒绝</UiButton>
        </div>

        <p v-else class="text-center text-gray-500 text-sm">
          状态：{{ { CONFIRMED: '已确认', REJECTED: '已拒绝', EXPIRED: '已过期' }[matchStore.currentMatch.status] || matchStore.currentMatch.status }}
        </p>
      </div>
    </div>
  </div>
</template>