import { unwrap } from './user-http'

export type SurveyTrack = 'FRIEND' | 'LOVE'

export async function submitSurvey(track: string, answers: Record<string, any>): Promise<any> {
  return unwrap<any>({ url: `/user/surveys/${track}`, method: 'POST', data: answers })
}

export async function getSurvey(track: string): Promise<any> {
  return unwrap<any>({ url: `/user/surveys/${track}`, method: 'GET' })
}

export async function getSurveyStatus(): Promise<any> {
  return unwrap<any>({ url: '/user/surveys/status', method: 'GET' })
}

export async function leavePool(): Promise<any> {
  return unwrap<any>({ url: '/user/pool/leave', method: 'POST' })
}