import { unwrap } from './user-http'

// ---------- 用户端 ----------

export interface RaceDurations {
  betDurationSeconds: number
  preRaceDurationSeconds: number
  raceDurationSeconds: number
  podiumDurationSeconds: number
}

export interface RaceBrief extends RaceDurations {
  id: number
  roomId: string
  name: string | null
  status: string
  sessionType: number
  totalRounds: number
  participantMode: number
}

export interface RaceParticipantInfo {
  id: number
  sortNo: number
  assetKey: string
  name: string
  type: number
  idleAnimation: string | null
  moveAnimation: string | null
  displayScale: number | null
}

export interface RaceRoundInfo extends RaceDurations {
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
  developerControlled: boolean
}

export interface RaceMyBetInfo {
  assetId: number
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
  /** 各参赛对象实时彩池（assetId 字符串键 → 金额），不含已退款注单 */
  horsePools: Record<string, number>
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
  assetId: number
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

export interface RaceCreateRequest extends RaceDurations {
  roomId: string
  name?: string
  sessionType: number
  totalRounds?: number | null
  /** 1=手动选择 5 名（全部场次沿用）；2=随机生成（每轮开赛时重新随机） */
  participantMode: number
  /** participantMode=1 时必传：5 个不重复的 spine_asset.id */
  participantAssetIds?: number[] | null
  /** sessionType=3（无限循环）时省略，后端按指定时长立即开始 */
  betStartAtMs?: number
}

export interface RaceDurationsRequest extends RaceDurations {
  roundId: number
  expectedStatus: string
}

export interface RaceAdminDetail {
  race: RaceBrief
  participants: RaceParticipantInfo[]
  rounds: RaceRoundInfo[]
  roundParticipants: Record<number, RaceParticipantInfo[]>
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

export interface RaceDeveloperState {
  race: RaceBrief
  round: RaceRoundInfo | null
  participants: RaceParticipantInfo[]
  plannedRanking: number[] | null
  /** 开发者已指定的下一场参赛名单（空=未指定） */
  nextParticipants: RaceParticipantInfo[]
  /** 当前模式是否还有下一场可安排 */
  canScheduleNext: boolean
}

export async function getRaceDeveloperState(id: number): Promise<RaceDeveloperState> {
  return unwrap<RaceDeveloperState>({
    url: `/admin/online/race/${id}/developer`,
    method: 'GET'
  })
}

export async function startRaceDeveloperRound(id: number, roundId: number): Promise<boolean> {
  return unwrap<boolean>({
    url: `/admin/online/race/${id}/developer/start`,
    method: 'POST',
    data: { roundId }
  })
}

export async function setRaceDeveloperRanking(
  id: number,
  body: { roundId: number; participantIds: number[] }
): Promise<boolean> {
  return unwrap<boolean>({
    url: `/admin/online/race/${id}/developer/ranking`,
    method: 'POST',
    data: body
  })
}

export async function endRaceDeveloperRound(id: number, roundId: number, expectedStatus: string): Promise<boolean> {
  return unwrap<boolean>({
    url: `/admin/online/race/${id}/developer/end`,
    method: 'POST',
    data: { roundId, expectedStatus }
  })
}

export async function setRaceDeveloperNextParticipants(
  id: number,
  assetIds: number[]
): Promise<boolean> {
  return unwrap<boolean>({
    url: `/admin/online/race/${id}/developer/next-participants`,
    method: 'POST',
    data: { assetIds }
  })
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

export async function updateRaceDurations(id: number, body: RaceDurationsRequest): Promise<boolean> {
  return unwrap<boolean>({ url: `/admin/online/race/${id}/durations`, method: 'POST', data: body })
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
