<script setup lang="ts">
import { ref } from 'vue'
import type { SurveyTrack } from '@/api/survey'
import SurveyEngine from '@/components/SurveyEngine.vue'
import UiButton from '@/components/UiButton.vue'

const emit = defineEmits<{
  complete: [track: SurveyTrack]
}>()

const selectedTrack = ref<SurveyTrack | null>(null)
const showEngine = ref(false)

function selectTrack(track: SurveyTrack) {
  selectedTrack.value = track
  showEngine.value = true
}

function onSurveyComplete() {
  emit('complete', selectedTrack.value!)
}

function backToTrack() {
  showEngine.value = false
}
</script>

<template>
  <section class="w-full h-screen flex flex-col items-center justify-center relative overflow-hidden px-4">
    <!-- Decorative top line -->
    <div class="absolute top-[90px] left-0 right-0 h-px bg-gray-700/50" />

    <!-- Track selection -->
    <div v-if="!showEngine" class="max-w-2xl w-full mx-auto text-center">
      <h2 class="text-3xl md:text-4xl font-light text-white mb-3 tracking-wider">选择你的匹配方向</h2>
      <p class="text-gray-500 text-sm mb-10">每种方向对应不同的问卷内容与匹配算法</p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- FRIEND -->
        <div
          class="relative bg-gray-900/60 border border-gray-800 rounded-2xl p-8 cursor-pointer hover:border-cyan-500/40 hover:bg-gray-900/80 transition-all group"
          @click="selectTrack('FRIEND')"
        >
          <div class="text-5xl mb-4">🤝</div>
          <h3 class="text-xl font-bold text-white mb-2">交友模式</h3>
          <p class="text-gray-400 text-sm mb-4">寻找一起聊方舟、打活动的同频朋友</p>
          <div class="flex flex-wrap gap-2">
            <span class="px-2 py-1 text-xs rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">8 个匹配维度</span>
            <span class="px-2 py-1 text-xs rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">双向确认</span>
          </div>
          <div class="absolute inset-0 rounded-2xl border-2 border-cyan-500/0 group-hover:border-cyan-500/30 transition-colors pointer-events-none" />
        </div>

        <!-- LOVE -->
        <div
          class="relative bg-gray-900/60 border border-gray-800 rounded-2xl p-8 cursor-pointer hover:border-pink-500/40 hover:bg-gray-900/80 transition-all group"
          @click="selectTrack('LOVE')"
        >
          <div class="text-5xl mb-4">💕</div>
          <h3 class="text-xl font-bold text-white mb-2">恋爱模式</h3>
          <p class="text-gray-400 text-sm mb-4">寻找与你有更深层连接的特别玩家</p>
          <div class="flex flex-wrap gap-2">
            <span class="px-2 py-1 text-xs rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">15 个匹配维度</span>
            <span class="px-2 py-1 text-xs rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">长期规划评估</span>
          </div>
          <div class="absolute inset-0 rounded-2xl border-2 border-pink-500/0 group-hover:border-pink-500/30 transition-colors pointer-events-none" />
        </div>
      </div>
    </div>

    <!-- Survey Engine (within "矩形1" card) -->
    <div v-else class="max-w-2xl w-full mx-auto">
      <button class="text-sm text-gray-500 hover:text-gray-300 mb-3 transition cursor-pointer" @click="backToTrack">
        &larr; 重新选择模式
      </button>
      <div class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 md:p-8 backdrop-blur-sm max-h-[70vh] overflow-y-auto">
        <SurveyEngine
          v-if="selectedTrack"
          :track="selectedTrack"
          @complete="onSurveyComplete"
          @back="backToTrack"
        />
      </div>
    </div>
  </section>
</template>