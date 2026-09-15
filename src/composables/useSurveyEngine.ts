import { ref, computed } from 'vue'
import { getSteps, flattenSteps } from '@/survey-config'

export function useSurveyEngine(track: 'FRIEND' | 'LOVE') {
  const answers = ref<Record<string, any>>({})
  const currentIndex = ref(0)
  const trackLower = track.toLowerCase() as 'friend' | 'love'

  const allSteps = computed(() => {
    const steps = getSteps(trackLower)
    return flattenSteps(steps, answers.value)
  })

  const currentStep = computed(() => allSteps.value[currentIndex.value])
  const isFirst = computed(() => currentIndex.value === 0)
  const isLast = computed(() => currentIndex.value === allSteps.value.length - 1)
  const progress = computed(() =>
    allSteps.value.length ? (currentIndex.value + 1) / allSteps.value.length : 0
  )

  function setAnswer(key: string, value: any) {
    answers.value = { ...answers.value, [key]: value }
    if (!isLast.value) {
      currentIndex.value++
    }
  }

  function prev() {
    if (!isFirst.value) currentIndex.value--
  }

  return {
    answers, currentIndex, allSteps, currentStep,
    isFirst, isLast, progress, setAnswer, prev,
  }
}