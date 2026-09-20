<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import 'pixi-spine'
import * as PIXI from 'pixi.js'
import { Spine } from 'pixi-spine'
import { ElMessage } from 'element-plus'

import {
  getRaceState,
  placeRaceBet,
  type RaceMyBetInfo,
  type RaceParticipantInfo,
  type RaceStateResponse
} from '@/api/race'
import { getLmdBalance } from '@/api/lmd'
import { API_BASE_URL } from '@/config'
import { TICK_MS, TOTAL_TICKS, TRACK_LENGTH, buildProfiles } from '@/utils/raceSim'

const props = defineProps<{
  roomId: string
  initial: RaceStateResponse | null
  getServerNow: () => number
}>()

const emit = defineEmits<{ exit: [] }>()

// ---------- 世界坐标 ----------
const TRACK_W = 1400
const TRACK_H = 540
const LANE_H = TRACK_H / 5
const START_X = 110
const FINISH_X = 1260

const trackWrapRef = ref<HTMLDivElement | null>(null)

let app: PIXI.Application | null = null
let worldLayer: PIXI.Container | null = null
let trackGfx: PIXI.Graphics | null = null
let lastViewW = 0
let lastViewH = 0

type RacerSprite = {
  pid: number
  lane: number
  spine: Spine
  label: PIXI.Text
  scale: number
  centerX: number
  centerY: number
}

let racers = new Map<number, RacerSprite>()
let podiumSprites = new Map<number, RacerSprite>()
let podiumGfx: PIXI.Graphics | null = null

const st = ref<RaceStateResponse>(
  props.initial ?? {
    exists: false,
    race: null,
    round: null,
    participants: [],
    myBets: [],
    myTotal: 0,
    minTotalBet: 100,
    maxTotalBet: 3000,
    serverTs: Date.now()
  }
)

const balance = ref<number | null>(null)
const nowMs = ref(Date.now())
const amounts = reactive<Record<number, number>>({})
const bettingPid = ref<number | null>(null)
const myResult = ref<{
  roundId: number
  roundNo: number
  payout: number
  betTotal: number
  wins: Array<{ participantId: number; participantName: string; rankNo: number; payout: number }>
} | null>(null)

let profiles: number[][] | null = null
let raceStartAtMs = 0
let clockTimer: number | null = null

const round = computed(() => st.value.round)
const status = computed(() => round.value?.status ?? '')
const pool = computed(() => round.value?.totalPool ?? 0)
const myTotal = computed(() => st.value.myTotal)
const myBetByPid = computed(() => {
  const m = new Map<number, number>()
  for (const b of st.value.myBets) m.set(b.participantId, (m.get(b.participantId) ?? 0) + b.amount)
  return m
})

const bettingOpen = computed(() => {
  const r = round.value
  if (!r || r.status !== 'BETTING') return false
  return nowMs.value < (r.betEndAt ?? 0)
})

const countdownText = computed(() => {
  const r = round.value
  if (!r) return '等待开场'
  const s = r.status
  if (s === 'BETTING') {
    const left = (r.betEndAt ?? 0) - nowMs.value
    if (left <= 0) return '投注通道已关闭，即将开赛…'
    return `距投注截止 ${fmtCountdown(left)}`
  }
  if (s === 'RACING') {
    const left = (r.raceStartAt ?? 0) + 60_000 - nowMs.value
    return `比赛中… 距结算 ${fmtCountdown(Math.max(0, left))}`
  }
  if (s === 'PODIUM') {
    const left = (r.podiumEndAt ?? 0) - nowMs.value
    return `颁奖中… ${fmtCountdown(Math.max(0, left))} 后可进入下一轮`
  }
  return '本场已结束'
})

const rankingNames = computed(() => {
  const r = round.value
  if (!r || !r.ranking) return []
  const byId = new Map<number, RaceParticipantInfo>()
  for (const p of st.value.participants) byId.set(p.id, p)
  return r.ranking.map((pid, i) => ({
    rank: i + 1,
    pid,
    name: byId.get(pid)?.name || byId.get(pid)?.assetKey || String(pid)
  }))
})

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function apiUrl(u: string): string {
  const base = String(API_BASE_URL || '').trim()
  if (!u) return base || ''
  if (!base) return u
  if (u.startsWith('/')) return `${base}${u}`
  return `${base}/${u}`
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  if (v < min) return min
  if (v > max) return max
  return v
}

// ---------- 状态 ----------

async function refreshState(): Promise<void> {
  try {
    const s = await getRaceState(props.roomId)
    st.value = s
    if (!s.exists) {
      ElMessage.info('赛马模式已结束')
      emit('exit')
      return
    }
    applyRoundState()
  } catch {}
}

function applyRoundState(): void {
  const r = round.value
  if (!r) {
    profiles = null
    raceStartAtMs = 0
    hideAllRacers()
    return
  }
  if (r.status === 'RACING' && r.seed) {
    if (!profiles) {
      profiles = buildProfiles(r.seed)
      raceStartAtMs = r.raceStartAt ?? 0
    }
  } else if (r.status === 'BETTING') {
    profiles = null
    raceStartAtMs = 0
    positionRacersAtStart()
  } else if (r.status === 'PODIUM') {
    profiles = null
    layoutPodium()
  }
}

function handleRaceMsg(m: any): void {
  const type = String(m?.type || '')
  if (type === 'race_update') {
    void refreshState()
    return
  }
  if (type === 'race_pool_update') {
    const r = round.value
    if (r && Number(m.roundId) === r.id) {
      st.value = { ...st.value, round: { ...r, totalPool: Number(m.totalPool || 0) } }
    }
    return
  }
  if (type === 'race_start') {
    const r = round.value
    if (r && Number(m.roundId) === r.id) {
      r.status = 'RACING'
      r.seed = String(m.seed || '')
      r.raceStartAt = Number(m.raceStartAt || 0)
    }
    if (r?.seed) {
      profiles = buildProfiles(String(m.seed || ''))
      raceStartAtMs = Number(m.raceStartAt || 0)
    }
    return
  }
  if (type === 'race_result') {
    const r = round.value
    if (r && Number(m.roundId) === r.id) {
      r.status = 'PODIUM'
      r.ranking = Array.isArray(m.ranking) ? m.ranking.map(Number) : null
      r.totalPool = Number(m.totalPool || 0)
      r.paidTotal = Number(m.paidTotal || 0)
    }
    profiles = null
    layoutPodium()
    return
  }
  if (type === 'race_my_result') {
    const wins = Array.isArray(m.wins)
      ? m.wins.map((w: any) => ({
          participantId: Number(w.participantId || 0),
          participantName: String(w.participantName || ''),
          rankNo: Number(w.rankNo || 0),
          payout: Number(w.payout || 0)
        }))
      : []
    myResult.value = {
      roundId: Number(m.roundId || 0),
      roundNo: Number(m.roundNo || 0),
      payout: Number(m.payout || 0),
      betTotal: Number(m.betTotal || 0),
      wins
    }
    if (myResult.value.payout > 0) {
      ElMessage.success(`恭喜！本场赛马竞猜获得 ${myResult.value.payout} 龙门币`)
    } else {
      ElMessage.info('本场赛马竞猜未中奖，再接再厉！')
    }
    void refreshBalance()
    return
  }
}

async function refreshBalance(): Promise<void> {
  try {
    const b = await getLmdBalance()
    balance.value = b.balance
  } catch {}
}

function amountFor(pid: number): number {
  const v = Number(amounts[pid] || 0)
  return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0
}

function setAmount(pid: number, v: number): void {
  amounts[pid] = Math.max(0, Math.floor(v))
}

function canBetPid(p: RaceParticipantInfo): { ok: boolean; reason: string } {
  if (!bettingOpen.value) return { ok: false, reason: '当前阶段不可下注' }
  const mine = myBetByPid.value.get(p.id) ?? 0
  if (p.type === 3 && mine > 0) return { ok: false, reason: 'Boss 每轮仅可下注一次' }
  return { ok: true, reason: '' }
}

async function bet(pid: number): Promise<void> {
  const p = st.value.participants.find((x) => x.id === pid)
  if (!p) return
  const check = canBetPid(p)
  if (!check.ok) {
    ElMessage.warning(check.reason)
    return
  }
  const amt = amountFor(pid)
  if (amt < 1) {
    ElMessage.warning('请输入下注金额')
    return
  }
  if (myTotal.value + amt > st.value.maxTotalBet) {
    ElMessage.warning(`单场总额不能超过 ${st.value.maxTotalBet} 龙门币`)
    return
  }
  if (bettingPid.value !== null) return
  bettingPid.value = pid
  try {
    const res = await placeRaceBet({ roomId: props.roomId, participantId: pid, amount: amt })
    const r = round.value
    if (r) {
      r.totalPool = res.totalPool
      st.value = {
        ...st.value,
        myTotal: res.myTotal,
        myBets: mergeBets(st.value.myBets, pid, amt)
      }
    }
    setAmount(pid, 0)
    void refreshBalance()
    ElMessage.success('下注成功')
  } catch (e: any) {
    ElMessage.error(String(e?.message || '下注失败'))
  } finally {
    bettingPid.value = null
  }
}

function mergeBets(bets: RaceMyBetInfo[], pid: number, amt: number): RaceMyBetInfo[] {
  const out = bets.map((b) => ({ ...b }))
  const hit = out.find((b) => b.participantId === pid)
  if (hit) hit.amount += amt
  else out.push({ participantId: pid, amount: amt })
  return out
}

// ---------- Pixi ----------

function pickDefaultAnimation(list: string[]): string {
  const l = list.map((x) => String(x || '')).filter(Boolean)
  const lower = l.map((x) => x.toLowerCase())
  for (const c of ['run', 'move', 'walk', 'idle', 'relax', 'stand', 'wait', 'default']) {
    const idx = lower.findIndex((x) => x === c || x.includes(c))
    if (idx >= 0) return l[idx] || ''
  }
  return l[0] || ''
}

async function loadSpine(assetKey: string): Promise<Spine | null> {
  try {
    const skel = apiUrl(`/assets/spine/${assetKey}/${assetKey}.skel`)
    const resource: any = await PIXI.Assets.load(skel)
    const sp = new Spine(resource.spineData)
    sp.autoUpdate = true
    const anims =
      (sp as any)?.spineData?.animations?.map((a: any) => String(a?.name || '')).filter(Boolean) || []
    const anim = pickDefaultAnimation(anims)
    if (anim) sp.state.setAnimation(0, anim, true)
    try {
      ;(sp as any).update(0)
    } catch {}
    return sp
  } catch {
    return null
  }
}

function laneY(lane: number): number {
  return lane * LANE_H
}

function racerPose(pid: number, x: number): void {
  const rs = racers.get(pid)
  if (!rs) return
  const laneCenterY = laneY(rs.lane) + LANE_H / 2
  rs.spine.x = x - rs.centerX * rs.scale
  rs.spine.y = laneCenterY - rs.centerY * rs.scale
  rs.label.x = x
  rs.label.y = laneY(rs.lane) + 6
}

function positionRacersAtStart(): void {
  for (const rs of racers.values()) {
    racerPose(rs.pid, START_X + 40)
  }
}

function hideAllRacers(): void {
  for (const rs of racers.values()) {
    rs.spine.visible = false
    rs.label.visible = false
  }
  for (const rs of podiumSprites.values()) {
    rs.spine.visible = false
    rs.label.visible = false
  }
}

async function ensureRacers(): Promise<void> {
  if (!worldLayer) return
  const need = st.value.participants.filter((p) => !racers.has(p.id))
  for (const p of need) {
    const lane = Math.min(4, Math.max(0, (p.sortNo ?? 1) - 1))
    const sp = await loadSpine(p.assetKey)
    if (!sp) continue
    const bounds = sp.getLocalBounds()
    const bw = Math.max(1, bounds.width)
    const bh = Math.max(1, bounds.height)
    const scale = Math.min(150 / bw, (LANE_H * 0.72) / bh)
    sp.scale.set(scale, scale)
    const label = new PIXI.Text(p.name || p.assetKey || '', {
      fill: '#fde68a',
      fontSize: 15,
      fontWeight: '600',
      stroke: '#000000',
      strokeThickness: 4
    })
    label.anchor.set(0.5, 0)
    worldLayer.addChild(sp)
    worldLayer.addChild(label)
    const rs: RacerSprite = {
      pid: p.id,
      lane,
      spine: sp,
      label,
      scale,
      centerX: bounds.x + bounds.width / 2,
      centerY: bounds.y + bounds.height / 2
    }
    racers.set(p.id, rs)
    if (!profiles) racerPose(p.id, START_X + 40)
  }
  const alive = new Set(st.value.participants.map((p) => p.id))
  for (const [pid, rs] of racers.entries()) {
    if (!alive.has(pid)) {
      worldLayer.removeChild(rs.spine)
      worldLayer.removeChild(rs.label)
      rs.spine.destroy({ children: true, texture: false, baseTexture: false } as any)
      rs.label.destroy()
      racers.delete(pid)
    }
  }
}

function drawTrack(): void {
  if (!worldLayer) return
  if (!trackGfx) {
    trackGfx = new PIXI.Graphics()
    worldLayer.addChild(trackGfx)
  }
  const g = trackGfx
  g.clear()

  // 草地
  g.beginFill(0x1e3a2f)
  g.drawRect(0, 0, TRACK_W, TRACK_H)
  g.endFill()
  // 跑道带（每道沙色）
  for (let i = 0; i < 5; i++) {
    g.beginFill(i % 2 === 0 ? 0x8a6d3b : 0x7c6133)
    g.drawRect(START_X - 90, laneY(i) + LANE_H * 0.14, FINISH_X - START_X + 200, LANE_H * 0.72)
    g.endFill()
  }
  // 分道虚线
  g.lineStyle(2, 0xffffff, 0.35)
  for (let i = 1; i < 5; i++) {
    for (let x = START_X - 90; x < FINISH_X + 110; x += 40) {
      g.moveTo(x, laneY(i))
      g.lineTo(x + 20, laneY(i))
    }
  }
  // 起跑线
  g.lineStyle(3, 0xffffff, 0.9)
  g.moveTo(START_X, laneY(0) + 6)
  g.lineTo(START_X, TRACK_H - 6)
  // 终点线（黑白格）
  const cell = 14
  for (let i = 0; i < 5; i++) {
    for (let r = 0; r < Math.ceil(LANE_H / cell); r++) {
      for (let c = 0; c < 2; c++) {
        g.beginFill((r + c) % 2 === 0 ? 0xffffff : 0x111111)
        g.drawRect(FINISH_X + c * cell, laneY(i) + r * cell, cell, cell)
        g.endFill()
      }
    }
  }
  // 终点旗杆
  g.lineStyle(4, 0xcbd5e1)
  g.moveTo(FINISH_X + 30, laneY(0))
  g.lineTo(FINISH_X + 30, laneY(0) - 70)
  g.beginFill(0xef4444)
  g.moveTo(FINISH_X + 30, laneY(0) - 70)
  g.lineTo(FINISH_X + 90, laneY(0) - 55)
  g.lineTo(FINISH_X + 30, laneY(0) - 40)
  g.endFill()
  // 顶栏装饰
  g.lineStyle(2, 0xffffff, 0.18)
  g.drawRect(2, 2, TRACK_W - 4, TRACK_H - 4)
}

function drawPodium(): void {
  if (!worldLayer) return
  if (!podiumGfx) {
    podiumGfx = new PIXI.Graphics()
    worldLayer.addChild(podiumGfx)
  }
  const g = podiumGfx
  g.clear()
  const baseY = TRACK_H - 10
  const w = 150
  const platforms = [
    { cx: FINISH_X - 260, h: 70, rank: 2 },
    { cx: FINISH_X - 100, h: 110, rank: 1 },
    { cx: FINISH_X + 60, h: 46, rank: 3 }
  ]
  for (const p of platforms) {
    g.beginFill(p.rank === 1 ? 0xd4a017 : p.rank === 2 ? 0x9ca3af : 0x92400e)
    g.drawRoundedRect(p.cx - w / 2, baseY - p.h, w, p.h, 10)
    g.endFill()
    const t = new PIXI.Text(String(p.rank), { fill: '#ffffff', fontSize: 34, fontWeight: '800', stroke: '#000000', strokeThickness: 5 })
    t.anchor.set(0.5, 0.5)
    t.x = p.cx
    t.y = baseY - p.h / 2
    podiumGfx.addChild(t)
  }
}

function layoutPodium(): void {
  if (!worldLayer) return
  drawPodium()
  const ranking = round.value?.ranking
  const byId = new Map<number, RaceParticipantInfo>()
  for (const p of st.value.participants) byId.set(p.id, p)
  hideAllRacers()

  const spots = [
    { rank: 1, cx: FINISH_X - 100, baseY: TRACK_H - 10 - 110 },
    { rank: 2, cx: FINISH_X - 260, baseY: TRACK_H - 10 - 70 },
    { rank: 3, cx: FINISH_X + 60, baseY: TRACK_H - 10 - 46 }
  ]
  for (const spot of spots) {
    const pid = ranking?.[spot.rank - 1]
    if (!pid) continue
    const p = byId.get(pid)
    if (!p) continue
    void placeOnPodium(pid, p, spot.cx, spot.baseY)
  }
}

async function placeOnPodium(
  pid: number,
  p: RaceParticipantInfo,
  cx: number,
  baseY: number
): Promise<void> {
  let rs = podiumSprites.get(pid)
  if (!rs) {
    const sp = await loadSpine(p.assetKey)
    if (!sp || !worldLayer) return
    const bounds = sp.getLocalBounds()
    const bw = Math.max(1, bounds.width)
    const bh = Math.max(1, bounds.height)
    const scale = Math.min(140 / bw, 130 / bh)
    sp.scale.set(scale, scale)
    const label = new PIXI.Text(p.name || p.assetKey || '', {
      fill: '#fde68a',
      fontSize: 15,
      fontWeight: '600',
      stroke: '#000000',
      strokeThickness: 4
    })
    label.anchor.set(0.5, 1)
    worldLayer.addChild(sp)
    worldLayer.addChild(label)
    rs = {
      pid,
      lane: 0,
      spine: sp,
      label,
      scale,
      centerX: bounds.x + bounds.width / 2,
      centerY: bounds.y + bounds.height / 2
    }
    podiumSprites.set(pid, rs)
  }
  rs.spine.visible = true
  rs.label.visible = true
  rs.spine.x = cx - rs.centerX * rs.scale
  rs.spine.y = baseY - rs.centerY * rs.scale
  rs.label.x = cx
  rs.label.y = baseY - 130 * rs.scale - 4
}

function updateViewport(): void {
  if (!app || !worldLayer) return
  const vw = Math.max(1, app.renderer.width)
  const vh = Math.max(1, app.renderer.height)
  const scale = Math.min(vw / TRACK_W, vh / TRACK_H)
  const ox = Math.round((vw - TRACK_W * scale) / 2)
  const oy = Math.round((vh - TRACK_H * scale) / 2)
  worldLayer.scale.set(scale, scale)
  worldLayer.position.set(ox, oy)
}

function tickRace(): void {
  if (!app) return
  const vw = app.renderer.width
  const vh = app.renderer.height
  if (vw !== lastViewW || vh !== lastViewH) {
    lastViewW = vw
    lastViewH = vh
    updateViewport()
  }
  const serverNow = props.getServerNow()
  if (status.value === 'RACING' && profiles && raceStartAtMs) {
    const elapsed = serverNow - raceStartAtMs
    const idx = clamp(Math.floor(elapsed / TICK_MS), 0, TOTAL_TICKS)
    for (const rs of racers.values()) {
      const pos = profiles[Math.min(4, Math.max(0, rs.lane))]?.[idx] ?? 0
      const x = START_X + (pos / TRACK_LENGTH) * (FINISH_X - START_X)
      rs.spine.visible = true
      rs.label.visible = true
      racerPose(rs.pid, x)
    }
    if (elapsed >= TOTAL_TICKS * TICK_MS) {
      // 等待结算广播，保持最终位置
    }
  } else if (status.value === 'PODIUM') {
    // 领奖台由 layoutPodium 摆放
  } else if (status.value === 'BETTING') {
    for (const rs of racers.values()) {
      rs.spine.visible = true
      rs.label.visible = true
    }
    for (const rs of podiumSprites.values()) {
      rs.spine.visible = false
      rs.label.visible = false
    }
  }
}

function initPixi(): void {
  const el = trackWrapRef.value
  if (!el) return
  app = new PIXI.Application({ backgroundAlpha: 0, antialias: true, resizeTo: el })
  ;(app.ticker as any).maxFPS = 60
  el.appendChild(app.view as any)
  const w = Math.max(1, el.clientWidth)
  const h = Math.max(1, el.clientHeight)
  app.renderer.resize(w, h)
  lastViewW = app.renderer.width
  lastViewH = app.renderer.height
  worldLayer = new PIXI.Container()
  app.stage.addChild(worldLayer)
  drawTrack()
  updateViewport()
  void ensureRacers()
  applyRoundState()
  app.ticker.add(tickRace)
}

function destroyPixi(): void {
  if (app) {
    try {
      app.ticker.remove(tickRace)
    } catch {}
  }
  for (const rs of racers.values()) {
    try {
      rs.spine.destroy({ children: true, texture: false, baseTexture: false } as any)
      rs.label.destroy()
    } catch {}
  }
  for (const rs of podiumSprites.values()) {
    try {
      rs.spine.destroy({ children: true, texture: false, baseTexture: false } as any)
      rs.label.destroy()
    } catch {}
  }
  racers = new Map()
  podiumSprites = new Map()
  try {
    app?.destroy(true, { children: true, texture: false, baseTexture: false })
  } catch {}
  app = null
  worldLayer = null
  trackGfx = null
  podiumGfx = null
  if (trackWrapRef.value) trackWrapRef.value.innerHTML = ''
}

function exitScene(): void {
  emit('exit')
}

defineExpose({ onRaceMsg: handleRaceMsg })

onMounted(() => {
  nowMs.value = props.getServerNow()
  clockTimer = window.setInterval(() => {
    nowMs.value = props.getServerNow()
  }, 250)
  initPixi()
  void refreshState()
  void refreshBalance()
})

onBeforeUnmount(() => {
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
  destroyPixi()
})
</script>

<template>
  <div class="absolute inset-0 z-10 flex flex-col bg-[#0a1622]">
    <!-- 顶部信息栏 -->
    <div class="flex items-center justify-between gap-3 px-4 py-2 bg-black/40 border-b border-white/10 text-gray-100">
      <div class="flex items-center gap-3 min-w-0">
        <div class="text-sm font-semibold truncate">
          赛马竞猜 · {{ st.race?.name || st.race?.roomId || roomId }}
        </div>
        <span
          class="px-2 py-0.5 rounded-full text-xs border"
          :class="
            status === 'BETTING'
              ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
              : status === 'RACING'
                ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                : status === 'PODIUM'
                  ? 'bg-sky-500/15 border-sky-400/40 text-sky-300'
                  : 'bg-white/10 border-white/15 text-gray-300'
          "
        >
          {{
            status === 'BETTING'
              ? '竞猜中'
              : status === 'RACING'
                ? '比赛中'
                : status === 'PODIUM'
                  ? '颁奖中'
                  : '等待中'
          }}
        </span>
        <span v-if="round" class="text-xs text-gray-400">第 {{ round.roundNo }} 场</span>
      </div>
      <div class="flex items-center gap-4">
        <div class="text-xs text-gray-400">全房间奖池</div>
        <div class="text-sm font-bold text-amber-300">{{ pool.toLocaleString() }} <span class="text-xs font-normal text-gray-400">龙门币</span></div>
        <div v-if="balance !== null" class="text-xs text-gray-400">
          余额 <span class="text-gray-200">{{ balance.toLocaleString() }}</span>
        </div>
        <button
          class="h-8 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100 cursor-pointer text-sm"
          @click="exitScene"
        >
          退出场景
        </button>
      </div>
    </div>

    <!-- 赛道 -->
    <div class="relative flex-1 min-h-0">
      <div class="absolute inset-0" ref="trackWrapRef"></div>
      <!-- 中央倒计时横幅 -->
      <div class="absolute left-1/2 top-3 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/55 border border-white/10 text-gray-100 text-sm backdrop-blur-sm">
        {{ countdownText }}
      </div>
      <!-- 下注面板（竞猜阶段显示） -->
      <div
        v-if="status === 'BETTING'"
        class="absolute left-3 bottom-3 w-[420px] max-w-[calc(100%-24px)] rounded-xl bg-black/60 border border-white/10 backdrop-blur-md p-3 text-gray-100"
      >
        <div class="flex items-center justify-between text-xs text-gray-300">
          <div>
            我的下注 <span class="font-bold text-amber-300">{{ myTotal.toLocaleString() }}</span>
            <span class="text-gray-500"> / {{ st.minTotalBet }}-{{ st.maxTotalBet }} 龙门币</span>
          </div>
          <div>截止 {{ round ? fmtTime(round.betEndAt) : '-' }}</div>
        </div>
        <div class="mt-2 flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
          <div v-for="p in st.participants" :key="p.id" class="flex items-center gap-2">
            <span class="w-4 text-xs text-gray-500">{{ p.sortNo }}</span>
            <span class="flex-1 text-sm truncate">{{ p.name || p.assetKey }}</span>
            <span
              class="px-1.5 py-0.5 rounded text-[10px] border"
              :class="p.type === 3 ? 'bg-purple-500/15 border-purple-400/40 text-purple-300' : 'bg-red-500/15 border-red-400/40 text-red-300'"
            >
              {{ p.type === 3 ? 'BOSS' : '敌人' }}
            </span>
            <span class="text-xs text-gray-500 w-16 text-right">
              已投 {{ (myBetByPid.get(p.id) ?? 0).toLocaleString() }}
            </span>
            <div class="flex items-center gap-1">
              <button
                class="h-6 w-6 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-gray-200 cursor-pointer text-xs"
                @click="setAmount(p.id, amountFor(p.id) - 100)"
              >
                -100
              </button>
              <input
                :value="amountFor(p.id) || ''"
                type="number"
                min="0"
                step="100"
                placeholder="0"
                class="h-6 w-20 px-1 rounded bg-white/5 border border-white/10 text-gray-100 text-xs outline-none focus:border-amber-400/60"
                @input="setAmount(p.id, Number(($event.target as HTMLInputElement).value || 0))"
              />
              <button
                class="h-6 w-6 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-gray-200 cursor-pointer text-xs"
                @click="setAmount(p.id, amountFor(p.id) + 100)"
              >
                +100
              </button>
            </div>
            <button
              class="h-6 px-3 rounded bg-amber-500/80 hover:bg-amber-400 text-black text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="!canBetPid(p).ok || bettingPid === p.id"
              :title="canBetPid(p).reason"
              @click="bet(p.id)"
            >
              下注
            </button>
          </div>
        </div>
      </div>
      <!-- 领奖台信息（颁奖阶段显示） -->
      <div
        v-if="status === 'PODIUM'"
        class="absolute left-3 bottom-3 w-[360px] max-w-[calc(100%-24px)] rounded-xl bg-black/60 border border-white/10 backdrop-blur-md p-3 text-gray-100"
      >
        <div class="text-sm font-semibold text-amber-300">本场结果</div>
        <div class="mt-2 flex flex-col gap-1.5 text-sm">
          <div v-for="r in rankingNames" :key="r.rank" class="flex items-center gap-2">
            <span
              class="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
              :class="r.rank === 1 ? 'bg-amber-400 text-black' : r.rank === 2 ? 'bg-gray-300 text-black' : 'bg-orange-700 text-white'"
            >
              {{ r.rank }}
            </span>
            <span class="flex-1 truncate">{{ r.name }}</span>
            <span class="text-xs text-gray-400">{{ r.rank === 1 ? '60%' : r.rank === 2 ? '30%' : '10%' }}</span>
          </div>
        </div>
        <div class="mt-2 text-xs text-gray-400">
          奖池 {{ pool.toLocaleString() }} · 已发放 {{ (round?.paidTotal ?? 0).toLocaleString() }}
        </div>
        <div v-if="myResult && myResult.roundId === round?.id" class="mt-2 rounded-lg bg-white/5 border border-white/10 p-2 text-xs">
          <div v-if="myResult.payout > 0" class="text-emerald-300">
            你本场下注 {{ myResult.betTotal.toLocaleString() }}，中奖 <b>{{ myResult.payout.toLocaleString() }}</b> 龙门币
          </div>
          <div v-else class="text-gray-400">
            你本场下注 {{ myResult.betTotal.toLocaleString() }} 龙门币，未中奖
          </div>
        </div>
        <button
          class="mt-3 w-full h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100 cursor-pointer text-sm"
          @click="exitScene"
        >
          提前退出领奖台
        </button>
      </div>
      <!-- 等待下一轮提示 -->
      <div
        v-if="status === 'FINISHED' || !round"
        class="absolute left-1/2 top-16 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/55 border border-white/10 text-gray-200 text-sm"
      >
        等待下一场竞猜开始…
      </div>
    </div>
  </div>
</template>
