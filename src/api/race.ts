import { unwrap } from './user-http'

// ---------- 用户端 ----------

export interface RaceBrief {
  id: number
  roomId: string
  name: string | null
  status: string
  sessionType: number
  totalRounds: number
  participantMode: number
  betDurationSeconds: number
}

export interface RaceParticipantInfo {
  id: number
  sortNo: number
  assetKey: string
  name: string
  type: number
}

export interface RaceRoundInfo {
  id: number
  roundNo: number
  status: string
  betStartAt: number
  betEndAt: number
  raceStartAt: number
  podiumEndAt: number
  seed: string | null
  totalPool: number
  betCount: number
  paidTotal: number
  ranking: number[] | null
}

export interface RaceMyBetInfo {
  participantId: number
  amount: number
}

export interface RaceStateResponse {
  exists: boolean
  race: RaceBrief | null
  round: RaceRoundInfo | null
  participants: RaceParticipantInfo[]
  myBets: RaceMyBetInfo[]
  myTotal: number
  minTotalBet: number
  maxTotalBet: number
  serverTs: number
}

export interface RaceBetResult {
  betId: number
  myTotal: number
  totalPool: number
}

export async function getRaceState(roomId: string): Promise<RaceStateResponse> {
  return unwrap<RaceStateResponse>({
    url: `/user/online/race/state?roomId=${encodeURIComponent(roomId)}`,
    method: 'GET'
  })
}

export async function placeRaceBet(body: {
  roomId: string
  participantId: number
  amount: number
}): Promise<RaceBetResult> {
  return unwrap<RaceBetResult>({ url: '/user/online/race/bet', method: 'POST', data: body })
}

// ---------- 管理端 ----------

export interface RaceAssetOption {
  id: number
  assetKey: string
  name: string
  type: number
}

export interface RaceCreateRequest {
  roomId: string
  name?: string
  sessionType: number
  totalRounds?: number | null
  participantMode: number
  participantAssetIds?: number[] | null
  /** sessionType=3（无限循环）时省略，后端立即开始并取默认竞猜周期 */
  betStartAtMs?: number
  betEndAtMs?: number
}

export interface RaceAdminDetail {
  race: RaceBrief
  participants: RaceParticipantInfo[]
  rounds: RaceRoundInfo[]
}

export interface RaceVerifyResult {
  ok: boolean
  problems: string[]
}

export interface RaceAdminRow {
  race: RaceBrief
  round: RaceRoundInfo | null
  participantCount: number
}

export async function getRaceCatalog(): Promise<RaceAssetOption[]> {
  return unwrap<RaceAssetOption[]>({ url: '/admin/online/race/catalog', method: 'GET' })
}

export async function listActiveRaces(): Promise<RaceAdminRow[]> {
  return unwrap<RaceAdminRow[]>({ url: '/admin/online/race/list', method: 'GET' })
}

export async function createRace(body: RaceCreateRequest): Promise<number> {
  return unwrap<number>({ url: '/admin/online/race/create', method: 'POST', data: body })
}

export async function closeRace(id: number): Promise<boolean> {
  return unwrap<boolean>({ url: `/admin/online/race/${id}/close`, method: 'POST' })
}

export async function getRaceDetail(id: number): Promise<RaceAdminDetail> {
  return unwrap<RaceAdminDetail>({ url: `/admin/online/race/${id}`, method: 'GET' })
}

export async function verifyRaceRound(roundId: number): Promise<RaceVerifyResult> {
  return unwrap<RaceVerifyResult>({
    url: `/admin/online/race/round/${roundId}/verify`,
    method: 'POST'
  })
}
