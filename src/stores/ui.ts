import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', () => {
  const toastMessage = ref('')
  const toastType = ref<'success' | 'error' | 'info'>('info')
  const toastVisible = ref(false)
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  const isMobile = ref(window.innerWidth < 768)
  const showLoginModal = ref(false)
  const activeSection = ref(0)

  function updateMobile() {
    isMobile.value = window.innerWidth < 768
  }

  function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    toastMessage.value = message
    toastType.value = type
    toastVisible.value = true
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toastVisible.value = false }, 3000)
  }

  function toggleLoginModal(show?: boolean) {
    showLoginModal.value = show ?? !showLoginModal.value
  }

  return {
    toastMessage, toastType, toastVisible,
    isMobile, showLoginModal, activeSection,
    updateMobile, showToast, toggleLoginModal,
  }
})