import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  getCurrent,
  getReadyList,
  getQuestionnaireById,
  getMyActive,
  submitQuestionnaire,
} from '@/api/questionnaire'
import type {
  QuestionItem,
  QuestionnaireMeta,
  QuestionnaireState,
  ReadyItem,
  MyActiveResponse,
  AnswerSubmit,
  CurrentResponse,
} from '@/api/questionnaire'

/**
 * 问卷 store：后端驱动。以 /user/questionnaire/* 下发的问卷定义为准，
 * 负责拉取「当前问卷」、指定问卷、已发布(READY)列表、我的已提交答案，并提交答案。
 */
export const useSurveyStore = defineStore('survey', () => {
  /** 当前（最新 READY）问卷元信息，null 表示后端无可用问卷 */
  const currentQuestionnaire = ref<QuestionnaireMeta | null>(null)
  /** 当前问卷题目列表（含主/子题，parentSeq=0 为主题） */
  const questions = ref<QuestionItem[]>([])
  /** 当前用户的作答状态（是否已提交 / 是否需重填） */
  const currentState = ref<QuestionnaireState | null>(null)
  /** 已发布(READY)问卷列表 */
  const readyList = ref<ReadyItem[]>([])
  /** 我的已提交答案（问卷刷新回显用） */
  const myActive = ref<MyActiveResponse | null>(null)

  const loading = ref(false)
  const error = ref('')

  function applyCurrent(res: CurrentResponse) {
    currentQuestionnaire.value = res.questionnaire
    questions.value = res.questions || []
    currentState.value = res.state
  }

  async function fetchCurrent() {
    loading.value = true
    error.value = ''
    try {
      applyCurrent(await getCurrent())
    } catch (e: any) {
      error.value = e.message || '加载失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchById(id: number) {
    loading.value = true
    error.value = ''
    try {
      applyCurrent(await getQuestionnaireById(id))
    } catch (e: any) {
      error.value = e.message || '加载失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchReadyList(page = 1, size = 50) {
    loading.value = true
    error.value = ''
    try {
      readyList.value = await getReadyList(page, size)
    } catch (e: any) {
      error.value = e.message || '加载失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchMyActive() {
    loading.value = true
    error.value = ''
    try {
      myActive.value = await getMyActive()
    } catch (e: any) {
      // 未提交过问卷时后端会报错，视为无历史回显
      error.value = e.message || '加载失败'
      myActive.value = null
    } finally {
      loading.value = false
    }
  }

  async function submit(questionnaireId: number, answers: AnswerSubmit[]) {
    loading.value = true
    error.value = ''
    try {
      await submitQuestionnaire(questionnaireId, answers)
      // 提交成功后刷新当前状态，反映最新作答
      try {
        applyCurrent(await getCurrent())
      } catch { /* 不阻塞主流程 */ }
    } catch (e: any) {
      error.value = e.message || '提交失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    currentQuestionnaire,
    questions,
    currentState,
    readyList,
    myActive,
    loading,
    error,
    fetchCurrent,
    fetchById,
    fetchReadyList,
    fetchMyActive,
    submit,
  }
})