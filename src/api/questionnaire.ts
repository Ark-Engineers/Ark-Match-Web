import { unwrap } from './user-http'

export interface QuestionnaireMeta {
  id: number
  title: string
  subtitle: string | null
}

export interface QuestionItem {
  seq: number
  question: string
  type: string
  options: string | null
  parentSeq: number | null
  triggerOption: string | null
  weight: string | null
  isSuitable: number
  isExcluded: number
}

export interface QuestionnaireState {
  hasActiveAnswer: boolean
  activeAnswerQuestionnaireId: number | null
  needReSubmit: boolean
  activeSubmittedAt: string | null
}

export interface CurrentResponse {
  questionnaire: QuestionnaireMeta | null
  questions: QuestionItem[]
  state: QuestionnaireState
}

export interface MyActiveItem {
  parentSeq: number
  seq: number
  answerText: string
}

export interface MyActiveResponse {
  questionnaireId: number
  submittedAt: string | null
  answers: MyActiveItem[]
}

export interface ReadyItem {
  id: number
  title: string
  subtitle: string | null
  updatedAt: string | null
}

export interface AnswerSubmit {
  parentSeq: number
  seq: number
  answerText: string
}

/** 当前（最新 READY）问卷定义 + 用户作答状态 */
export async function getCurrent(): Promise<CurrentResponse> {
  return unwrap<CurrentResponse>({ url: '/user/questionnaire/current', method: 'GET' })
}

/** 已发布(READY)问卷列表 */
export async function getReadyList(page = 1, size = 50): Promise<ReadyItem[]> {
  return unwrap<ReadyItem[]>({ url: '/user/questionnaire/ready-list', method: 'GET', params: { page, size } })
}

/** 指定问卷定义（含题目） */
export async function getQuestionnaireById(id: number): Promise<CurrentResponse> {
  return unwrap<CurrentResponse>({ url: `/user/questionnaire/${id}`, method: 'GET' })
}

/** 我的已提交答案（刷新回显用） */
export async function getMyActive(): Promise<MyActiveResponse> {
  return unwrap<MyActiveResponse>({ url: '/user/questionnaire/my-active', method: 'GET' })
}

/** 提交答案 */
export async function submitQuestionnaire(questionnaireId: number, answers: AnswerSubmit[]): Promise<void> {
  return unwrap<void>({ url: '/user/questionnaire/submit', method: 'POST', data: { questionnaireId, answers } })
}