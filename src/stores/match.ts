import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getMatches, getMatch, confirmMatch, rejectMatch, getMatchStats } from '@/api/match'

export interface MatchRecord {
  matchId: number
  track: string
  score: number
  status: string
  myAction: string
  otherUser: { userId: number; nickname: string; avatarUrl: string } | null
  createdAt: string
  expiresAt: string
  contactsRevealed?: boolean
  contacts?: any
  partnerProfile?: any
}

export const useMatchStore = defineStore('match', () => {
  const matches = ref<MatchRecord[]>([])
  const currentMatch = ref<MatchRecord | null>(null)
  const stats = ref({ pendingCount: 0, confirmedCount: 0, totalCount: 0 })
  const loading = ref(false)
  const error = ref('')

  async function fetchMatches(page = 1, size = 20) {
    loading.value = true
    error.value = ''
    try {
      const data: any = await getMatches(page, size)
      matches.value = data || []
    } catch (e: any) {
      error.value = e.message || 'Failed to load matches'
    } finally {
      loading.value = false
    }
  }

  async function fetchMatchDetail(id: number) {
    loading.value = true
    error.value = ''
    try {
      const data: any = await getMatch(id)
      currentMatch.value = data
      return data
    } catch (e: any) {
      error.value = e.message || 'Failed to load match'
      return null
    } finally {
      loading.value = false
    }
  }

  async function confirm(id: number) {
    loading.value = true
    error.value = ''
    try {
      const data: any = await confirmMatch(id)
      if (currentMatch.value && currentMatch.value.matchId === id) {
        currentMatch.value.status = data.status
      }
      return data
    } catch (e: any) {
      error.value = e.message || 'Failed to confirm match'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function reject(id: number) {
    loading.value = true
    error.value = ''
    try {
      const data: any = await rejectMatch(id)
      if (currentMatch.value && currentMatch.value.matchId === id) {
        currentMatch.value.status = 'REJECTED'
      }
      return data
    } catch (e: any) {
      error.value = e.message || 'Failed to reject match'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchStats() {
    try {
      const data: any = await getMatchStats()
      if (data) stats.value = data
    } catch { /* non-critical */ }
  }

  return {
    matches, currentMatch, stats, loading, error,
    fetchMatches, fetchMatchDetail, confirm, reject, fetchStats,
  }
})