import { unwrap } from './user-http'

export async function getMatches(page = 1, size = 20): Promise<any> {
  return unwrap<any>({ url: '/user/matches', method: 'GET', params: { page, size } })
}

export async function getMatch(id: number): Promise<any> {
  return unwrap<any>({ url: `/user/matches/${id}`, method: 'GET' })
}

export async function confirmMatch(id: number): Promise<any> {
  return unwrap<any>({ url: `/user/matches/${id}/confirm`, method: 'POST' })
}

export async function rejectMatch(id: number): Promise<any> {
  return unwrap<any>({ url: `/user/matches/${id}/reject`, method: 'POST' })
}

export async function getMatchStats(): Promise<any> {
  return unwrap<any>({ url: '/user/matches/stats', method: 'GET' })
}