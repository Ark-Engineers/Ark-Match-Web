<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ close: [] }>()

// 点击遮罩关闭：仅当「按下与松开」都在遮罩上且几乎未拖动（真正点击）时才关闭；
// 避免鼠标左键按住横向拖动误触关闭。
const overlay = ref<HTMLDivElement | null>(null)
let startX = 0
let startY = 0
let pressOnOverlay = false

function onPointerDown(e: PointerEvent) {
  pressOnOverlay = e.target === overlay.value
  if (pressOnOverlay) {
    startX = e.clientX
    startY = e.clientY
  }
}

function onPointerUp(e: PointerEvent) {
  if (!pressOnOverlay) return
  pressOnOverlay = false
  if (e.target !== overlay.value) return
  const moved = Math.hypot(e.clientX - startX, e.clientY - startY)
  if (moved < 8) emit('close')
}
</script>
<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        ref="overlay"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
      >
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div class="relative bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <button
            class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition cursor-pointer z-10"
            @click="$emit('close')"
          >&times;</button>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.25s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>