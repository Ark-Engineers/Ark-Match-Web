import { ref } from 'vue'
import { defineStore } from 'pinia'
import { submitSurvey as apiSubmitSurvey, getSurvey as apiGetSurvey, getSurveyStatus as apiGetSurveyStatus, leavePool as apiLeavePool } from '@/api/survey'

const DRAFT_PREFIX = 'ark-match-survey-draft-'

export const useSurveyStore = defineStore('survey', () => {
  const currentTrack = ref<'FRIEND' | 'LOVE' | null>(null)
  const currentAnswers = ref<Record<string, any>>({})
  const surveyStatus = ref<Array<{ track: string; version: number; isActive: boolean; updatedAt: string }>>([])
  const loading = ref(false)
  const error = ref('')
  const inPool = ref(false)

  function loadDraft(track: string) {
    try {
      const raw = localStorage.getItem(DRAFT_PREFIX + track)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.answers && parsed.timestamp) {
          return parsed
        }
      }
    } catch { /* ignore corrupt drafts */ }
    return null
  }

  function saveDraft(track: string, answers: Record<string, any>) {
    try {
      localStorage.setItem(DRAFT_PREFIX + track, JSON.stringify({
        answers,
        timestamp: Date.now(),
      }))
    } catch { /* storage full */ }
  }

  function clearDraft(track: string) {
    localStorage.removeItem(DRAFT_PREFIX + track)
  }

  async function fetchSurveyStatus() {
    loading.value = true
    error.value = ''
    try {
      const status: any = await apiGetSurveyStatus()
      surveyStatus.value = status || []
    } catch (e: any) {
      error.value = e.message || 'Failed to load survey status'
    } finally {
      loading.value = false
    }
  }

  async function fetchSurvey(track: string) {
    loading.value = true
    error.value = ''
    try {
      const data: any = await apiGetSurvey(track)
      if (data?.answers) {
        currentAnswers.value = data.answers
        currentTrack.value = track as 'FRIEND' | 'LOVE'
      }
      return data
    } catch (e: any) {
      error.value = e.message || 'Failed to load survey'
      return null
    } finally {
      loading.value = false
    }
  }

  async function submit(track: string, answers: Record<string, any>) {
    loading.value = true
    error.value = ''
    try {
      const result: any = await apiSubmitSurvey(track, answers)
      clearDraft(track)
      currentAnswers.value = answers
      currentTrack.value = track as 'FRIEND' | 'LOVE'
      inPool.value = result?.inPool === true
      return result
    } catch (e: any) {
      error.value = e.message || 'Failed to submit survey'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function leavePool() {
    loading.value = true
    error.value = ''
    try {
      await apiLeavePool()
      inPool.value = false
    } catch (e: any) {
      error.value = e.message || 'Failed to leave pool'
    } finally {
      loading.value = false
    }
  }

  return {
    currentTrack, currentAnswers, surveyStatus, loading, error, inPool,
    loadDraft, saveDraft, clearDraft,
    fetchSurveyStatus, fetchSurvey, submit, leavePool,
  }
})