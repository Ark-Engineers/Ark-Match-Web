<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import 'pixi-spine'
import * as PIXI from 'pixi.js'
import { Spine } from 'pixi-spine'
import { ElMessage } from 'element-plus'

import { request } from '@/api'
import { getRaceState, type RaceStateResponse } from '@/api/race'
import { getPublicProfile, resolveArkAvatarUrl, type UserProfile } from '@/api/user'
import { submitReport } from '@/api/report'
import { API_BASE_URL } from '@/config'
import { useAuthStore } from '@/stores/auth'
import RaceScene from './race/RaceScene.vue'

type ApiResponse<T> = { code: number; message: string; data: T }

type SpineOption = {
  assetKey: string
  name: string
  skelUrl: string
}

type PlayerState = {
  clientId: string
  userId: number
  nickname: string
  assetKey: string
  x: number
  y: number
  moving: boolean
  dir: 1 | -1
}

type SnapshotPlayer = {
  clientId: string
  userId: number
  nickname: string
  assetKey: string
  x: number
  y: number
  moving: boolean
  dir: 1 | -1
  seq: number
}

type WelcomeMsg = {
  type: 'welcome'
  clientId: string
  resumeKey: string
  roomId: string
  worldW: number
  worldH: number
  tickHz: number
  serverTs: number
  hostClientId: string | null
  hostFps: number
  players: SnapshotPlayer[]
}

type SnapshotMsg = {
  type: 'snapshot'
  serverTs: number
  hostClientId: string | null
  hostFps: number
  players: SnapshotPlayer[]
}

type CtrlPongMsg = { type: 'pong'; ts: number; serverTs?: number; src?: string }

type RaceWsMsg =
  | { type: 'race_update' }
  | { type: 'race_pool_update'; roundId: number; totalPool: number }
  | { type: 'race_start'; roundId: number; roundNo: number; seed: string; raceStartAt: number; durationMs: number }
  | { type: 'race_result'; roundId: number; roundNo: number; ranking: number[]; totalPool: number; paidTotal: number }
  | { type: 'race_my_result'; roundId: number; roundNo: number; payout: number; betTotal: number; wins: any[] }

type WsMsg =
  | WelcomeMsg
  | SnapshotMsg
  | { type: 'player_join'; player: SnapshotPlayer }
  | { type: 'player_leave'; clientId: string }
  | { type: 'player_update'; player: SnapshotPlayer }
  | { type: 'emote'; clientId: string; emote: string }
  | { type: 'chat'; clientId: string; userId: number; nickname: string; content: string; ts: number }
  | { type: 'room_offline' }
  | { type: 'error'; code: string; message: string }
  | { type: 'host_fps'; fps: number }
  | { type: 'host_change'; hostClientId: string | null; hostFps: number }
  | CtrlPongMsg
  | RaceWsMsg

type RenderedPlayer = {
  state: PlayerState
  spine: Spine
  label: PIXI.Text
  hit: PIXI.Container
  baseBounds: PIXI.Rectangle
  scale: number
  target: { x: number; y: number }
  idleAnim: string
  moveAnim: string
  lastAnim: string
  buffer: Array<{ serverTs: number; x: number; y: number; moving: boolean; dir: 1 | -1 }>
}

type InputFrame = { seq: number; dx: number; dy: number; shift: boolean; dir: 1 | -1 }

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const roomId = computed(() => String(route.query.room || 'lobby').trim() || 'lobby')
const assetKey = computed(() => String(route.query.assetKey || '').trim())

const wrapRef = ref<HTMLDivElement | null>(null)
const raceSceneRef = ref<InstanceType<typeof RaceScene> | null>(null)
const raceState = ref<RaceStateResponse | null>(null)
const raceSceneVisible = ref(false)
// 仅消费本次入场意图，后续刷新和重连不再自动打开。
let autoOpenRacePending = route.query.race === '1'

const racePhaseLabel = computed(() => {
  const s = raceState.value?.round?.status
  if (s === 'BETTING') return '竞猜中'
  if (s === 'RACING') return '比赛中'
  if (s === 'PODIUM') return '颁奖中'
  return '等待中'
})
let app: PIXI.Application | null = null
let worldLayer: PIXI.Container | null = null
let guideGfx: PIXI.Graphics | null = null
let lastViewW = 0
let lastViewH = 0
let socket: WebSocket | null = null
let ctrlSocket: WebSocket | null = null

let destroyed = false
let reconnectTimer: number | null = null
const reconnectAttempt = ref(0)
const connectionLost = ref(false)

let myClientId = ''
let myResumeKey = ''
let worldW = 1920
let worldH = 1080
let tickHz = 30

let serverClockOffsetMs = 0
let lastMainPongAt = 0
let mainPongSupported = false
let mainPingTimer: number | null = null
let watchdogTimer: number | null = null

const fps = ref(0)
const ping = ref<number | null>(null)
const netUp = ref(0)
const netDown = ref(0)
let fpsCounter = 0
let fpsTimer: number | null = null
let pingTimer: number | null = null
let netTimer: number | null = null
let sentBytes = 0
let recvBytes = 0

const hostClientId = ref<string | null>(null)
const hostFps = ref(60)

const spineOptions = ref<SpineOption[]>([])
const selectedAssetKey = ref('')

const players = new Map<string, RenderedPlayer>()
const loadingPlayers = new Set<string>()

const profileCache = new Map<number, UserProfile>()
const cardVisible = ref(false)
const cardLoading = ref(false)
const cardProfile = ref<UserProfile | null>(null)
const cardPos = ref({ x: 0, y: 0 })
const emoteCooldown = new Map<string, number>()

type ChatMsg = { clientId: string; userId: number; nickname: string; content: string; ts: number; self: boolean }
const chatMessages = ref<ChatMsg[]>([])
const chatInput = ref('')
const chatPanelRef = ref<HTMLDivElement | null>(null)
const MAX_CHAT_MESSAGES = 100

function roleLabel(role: string | null | undefined): string {
  const r = String(role || '').toUpperCase()
  if (r === 'SUPER_ADMIN') return '超级管理员'
  if (r === 'ADMIN') return '管理员'
  return '普通用户'
}

function openProfileCard(userId: number, clientX: number, clientY: number): void {
  const w = window.innerWidth || 1
  const h = window.innerHeight || 1
  const cardW = 300
  const cardH = 180
  let x = Math.round(clientX + 14)
  let y = Math.round(clientY - 10)
  if (x + cardW > w - 8) x = Math.round(clientX - cardW - 14)
  if (x < 8) x = 8
  if (y + cardH > h - 8) y = Math.max(8, h - cardH - 8)
  if (y < 8) y = 8

  cardPos.value = { x, y }
  cardVisible.value = true
  cardLoading.value = false

  const cached = profileCache.get(userId) || null
  cardProfile.value = cached
  if (cached) return

  cardLoading.value = true
  void (async () => {
    try {
      const p = await getPublicProfile(userId)
      profileCache.set(userId, p)
      if (cardVisible.value) cardProfile.value = p
    } catch {
    } finally {
      if (cardVisible.value) cardLoading.value = false
    }
  })()
}

function closeProfileCard(): void {
  cardVisible.value = false
  cardLoading.value = false
  cardProfile.value = null
}

const reportDialogVisible = ref(false)
const reportType = ref<'NICKNAME' | 'SIGNATURE' | 'CHAT'>('NICKNAME')
const reportContent = ref('')
const reportTargetUserId = ref(0)
const reportSubmitting = ref(false)

function openReportDialog(type: 'NICKNAME' | 'SIGNATURE' | 'CHAT', content?: string): void {
  if (!cardProfile.value) return
  reportTargetUserId.value = cardProfile.value.userId
  reportType.value = type
  reportContent.value = content || ''
  reportDialogVisible.value = true
}

async function submitReportDialog(): Promise<void> {
  if (!reportContent.value.trim()) {
    ElMessage.warning('请填写举报内容')
    return
  }
  reportSubmitting.value = true
  try {
    await submitReport({
      reportedUserId: reportTargetUserId.value,
      reportType: reportType.value,
      content: reportContent.value.trim(),
      roomId: roomId.value || undefined,
    })
    ElMessage.success('举报已提交，感谢您的反馈')
    reportDialogVisible.value = false
    closeProfileCard()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '举报失败')
  } finally {
    reportSubmitting.value = false
  }
}

function reportChatMessage(msg: ChatMsg): void {
  if (!cardProfile.value || cardProfile.value.userId !== msg.userId) {
    reportTargetUserId.value = msg.userId
  } else {
    reportTargetUserId.value = cardProfile.value.userId
  }
  reportType.value = 'CHAT'
  reportContent.value = msg.content
  reportDialogVisible.value = true
}

const keyDown = new Set<string>()
let shiftPressed = false
let facing: 1 | -1 = 1

let inputSeq = 0
let lastAckSeq = 0
const pendingInputs: InputFrame[] = []
let simAcc = 0

const INTERP_DELAY_MS = 120
let simNetLagMs = 0

function detectFpsCap(): number {
  const w = window as any
  const hz = Number(w?.screen?.refreshRate || 0)
  if (Number.isFinite(hz) && hz > 0) return Math.max(30, Math.min(120, Math.round(hz)))
  return 60
}

function apiUrl(u: string): string {
  const base = String(API_BASE_URL || '').trim()
  if (!u) return base || ''
  if (!base) return u
  if (u.startsWith('/')) return `${base}${u}`
  return `${base}/${u}`
}

function wsUrl(path: string, query: Record<string, string>): string {
  const base = String(API_BASE_URL || '').trim()
  const search = new URLSearchParams(query)
  if (base.startsWith('http://') || base.startsWith('https://')) {
    const u = new URL(base)
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    const p = String(u.pathname || '').replace(/\/$/, '')
    return `${proto}//${u.host}${p}${path}?${search.toString()}`
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = location.host
  const p = String(base || '').replace(/\/$/, '')
  return `${proto}//${host}${p}${path}?${search.toString()}`
}

async function loadSpineOptions(): Promise<boolean> {
  if (destroyed) return false
  if (spineOptions.value.length > 0) return true
  try {
    const res = await request<ApiResponse<SpineOption[]>>({
      url: '/user/spine/list',
      method: 'GET',
    })
    if (destroyed || res.code !== 0 || !Array.isArray(res.data)) return false
    spineOptions.value = res.data
      .filter((option) => typeof option?.assetKey === 'string' && option.assetKey.trim())
      .map((option) => ({ ...option, assetKey: option.assetKey.trim() }))
    if (!selectedAssetKey.value) {
      selectedAssetKey.value = assetKey.value || spineOptions.value[0]?.assetKey || ''
    }
    return true
  } catch {
    return false
  }
}

async function applyAvatarChange(nextKey: string): Promise<void> {
  const key = String(nextKey || '').trim()
  if (destroyed || !key) return
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    ElMessage.warning('连接未建立')
    return
  }
  const me = myClientId ? players.get(myClientId) : null
  if (me && me.state.assetKey !== key) {
    try {
      await replacePlayerSpine(me, key)
    } catch {}
  }
  if (destroyed) return
  selectedAssetKey.value = key
  wsSend({ type: 'change_avatar', assetKey: key })
}

function pickDefaultAnimation(list: string[]): string {
  const l = list.map((x) => String(x || '')).filter(Boolean)
  const lower = l.map((x) => x.toLowerCase())
  const pick = (candidates: string[]): string => {
    for (const c of candidates) {
      const idx = lower.findIndex((x) => x === c || x.includes(c))
      if (idx >= 0) return l[idx] || ''
    }
    return ''
  }
  return pick(['relax', 'idle', 'stand', 'wait', 'default']) || l[0] || ''
}

function pickMoveAnimation(list: string[]): string {
  const l = list.map((x) => String(x || '')).filter(Boolean)
  const lower = l.map((x) => x.toLowerCase())
  for (const c of ['move', 'run', 'walk']) {
    const idx = lower.findIndex((x) => x === c || x.includes(c))
    if (idx >= 0) return l[idx] || ''
  }
  return ''
}

function pickInteractAnimation(list: string[]): string {
  const l = list.map((x) => String(x || '')).filter(Boolean)
  const lower = l.map((x) => x.toLowerCase())
  const pick = (candidates: string[]): string => {
    for (const c of candidates) {
      const idx = lower.findIndex((x) => x === c || x.includes(c))
      if (idx >= 0) return l[idx] || ''
    }
    return ''
  }
  return pick(['interact', 'interaction', 'touch', 'talk', 'greet'])
}

async function createSpineByAssetKey(assetKey: string): Promise<{
  spine: Spine
  baseBounds: PIXI.Rectangle
  scale: number
  idleAnim: string
  moveAnim: string
  interactAnim: string
}> {
  if (destroyed) throw new Error('页面已退出')
  const skel = apiUrl(`/assets/spine/${assetKey}/${assetKey}.skel`)
  const resource: any = await PIXI.Assets.load(skel)
  if (destroyed) throw new Error('页面已退出')
  const sp = new Spine(resource.spineData)
  sp.autoUpdate = true
  const anims = (sp as any)?.spineData?.animations?.map((a: any) => String(a?.name || '')).filter(Boolean) || []
  const idle = pickDefaultAnimation(anims)
  const moveAnim = pickMoveAnimation(anims)
  const interactAnim = pickInteractAnimation(anims)
  if (idle) sp.state.setAnimation(0, idle, true)
  if (idle && moveAnim) {
    ;(sp.stateData as any).setMix(idle, moveAnim, 0.12)
    ;(sp.stateData as any).setMix(moveAnim, idle, 0.12)
  }
  if (interactAnim) {
    if (idle) {
      ;(sp.stateData as any).setMix(idle, interactAnim, 0.12)
      ;(sp.stateData as any).setMix(interactAnim, idle, 0.12)
    }
    if (moveAnim) {
      ;(sp.stateData as any).setMix(moveAnim, interactAnim, 0.12)
      ;(sp.stateData as any).setMix(interactAnim, moveAnim, 0.12)
    }
  }
  try {
    ;(sp as any).update(0)
  } catch {}
  const bounds = sp.getLocalBounds()
  const bw = Math.max(1, bounds.width)
  const bh = Math.max(1, bounds.height)
  const scale = Math.min(180 / bw, 220 / bh)
  sp.scale.set(scale, scale)
  return { spine: sp, baseBounds: bounds, scale, idleAnim: idle, moveAnim, interactAnim }
}

async function createPlayer(p: SnapshotPlayer): Promise<RenderedPlayer | null> {
  if (destroyed || !app || !worldLayer) return null
  const built = await createSpineByAssetKey(p.assetKey)
  if (destroyed || !app || !worldLayer) {
    built.spine.destroy({ children: true, texture: false, baseTexture: false } as any)
    return null
  }
  const sp = built.spine
  const bounds = built.baseBounds
  const bw = Math.max(1, bounds.width)
  const bh = Math.max(1, bounds.height)
  const scale = built.scale
  worldLayer.addChild(sp)

  const hit = new PIXI.Graphics()
  hit.beginFill(0xffffff, 0)
  hit.drawRect(bounds.x, bounds.y, bw, bh)
  hit.endFill()
  ;(hit as any).eventMode = 'static'
  ;(hit as any).cursor = 'pointer'
  hit.hitArea = new PIXI.Rectangle(bounds.x, bounds.y, bw, bh)
  worldLayer.addChild(hit)

  const label = new PIXI.Text(p.nickname || '', {
    fill: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
    stroke: '#000000',
    strokeThickness: 4,
  })
  label.anchor.set(0.5, 1)
  ;(label as any).eventMode = 'static'
  ;(label as any).cursor = 'pointer'
  worldLayer.addChild(label)

  const rp: RenderedPlayer = {
    state: {
      clientId: p.clientId,
      userId: p.userId,
      nickname: p.nickname,
      assetKey: p.assetKey,
      x: p.x || worldW / 2,
      y: p.y || worldH / 2,
      moving: Boolean(p.moving),
      dir: p.dir === -1 ? -1 : 1,
    },
    spine: sp,
    label,
    hit,
    baseBounds: bounds,
    scale,
    target: { x: p.x || worldW / 2, y: p.y || worldH / 2 },
    idleAnim: built.idleAnim,
    moveAnim: built.moveAnim,
    lastAnim: built.idleAnim,
    buffer: [],
  }
  hit.on('pointertap', (e: any) => {
    onPlayerTap(rp, e)
  })
  label.on('pointertap', (e: any) => {
    onPlayerTap(rp, e)
  })
  applyState(rp, worldW, worldH, true)
  return rp
}

async function replacePlayerSpine(rp: RenderedPlayer, nextAssetKey: string): Promise<void> {
  if (destroyed || !app || !worldLayer) return
  if (!nextAssetKey || rp.state.assetKey === nextAssetKey) return
  const built = await createSpineByAssetKey(nextAssetKey)
  if (destroyed || !app || !worldLayer) {
    built.spine.destroy({ children: true, texture: false, baseTexture: false } as any)
    return
  }
  const prev = rp.spine
  try {
    worldLayer.addChild(built.spine)
  } catch {}
  try {
    worldLayer.removeChild(prev)
  } catch {}
  try {
    prev.destroy({ children: true, texture: false, baseTexture: false } as any)
  } catch {}

  rp.spine = built.spine
  rp.baseBounds = built.baseBounds
  rp.scale = built.scale
  rp.idleAnim = built.idleAnim
  rp.moveAnim = built.moveAnim
  rp.lastAnim = built.idleAnim
  rp.state.assetKey = nextAssetKey
  try {
    const b = rp.baseBounds
    const bw = Math.max(1, b.width)
    const bh = Math.max(1, b.height)
    const gfx = rp.hit as any
    gfx.clear()
    gfx.beginFill(0xffffff, 0)
    gfx.drawRect(b.x, b.y, bw, bh)
    gfx.endFill()
    rp.hit.hitArea = new PIXI.Rectangle(b.x, b.y, bw, bh)
  } catch {}
  applyState(rp, worldW, worldH, true)
}

function updateViewport(): void {
  if (!app || !worldLayer) return
  const vw = Math.max(1, app.renderer.width)
  const vh = Math.max(1, app.renderer.height)
  const scale = Math.min(vw / Math.max(1, worldW), vh / Math.max(1, worldH))
  const ox = Math.round((vw - worldW * scale) / 2)
  const oy = Math.round((vh - worldH * scale) / 2)
  worldLayer.scale.set(scale, scale)
  worldLayer.position.set(ox, oy)

  if (guideGfx) {
    guideGfx.clear()
    guideGfx.lineStyle(2, 0xffffff, 0.35)
    guideGfx.drawRect(1, 1, worldW - 2, worldH - 2)

    guideGfx.lineStyle(1.5, 0xffffff, 0.18)
    const x1 = Math.round(worldW * 0.25)
    const x2 = Math.round(worldW * 0.5)
    const x3 = Math.round(worldW * 0.75)
    const y1 = Math.round(worldH * 0.25)
    const y2 = Math.round(worldH * 0.5)
    const y3 = Math.round(worldH * 0.75)
    guideGfx.moveTo(x1, 0)
    guideGfx.lineTo(x1, worldH)
    guideGfx.moveTo(x2, 0)
    guideGfx.lineTo(x2, worldH)
    guideGfx.moveTo(x3, 0)
    guideGfx.lineTo(x3, worldH)
    guideGfx.moveTo(0, y1)
    guideGfx.lineTo(worldW, y1)
    guideGfx.moveTo(0, y2)
    guideGfx.lineTo(worldW, y2)
    guideGfx.moveTo(0, y3)
    guideGfx.lineTo(worldW, y3)
  }
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  if (v < min) return min
  if (v > max) return max
  return v
}

function lerp(a: number, b: number, t: number): number {
  if (t <= 0) return a
  if (t >= 1) return b
  return a + (b - a) * t
}

function playInteract(rp: RenderedPlayer): void {
  const names =
    (rp.spine as any)?.spineData?.animations?.map((a: any) => String(a?.name || '')).filter(Boolean) || []
  const anim = pickInteractAnimation(names)
  if (!anim) return
  try {
    rp.spine.state.setAnimation(0, anim, false)
    const idle = rp.idleAnim || anim
    rp.spine.state.addAnimation(0, idle, true, 0)
  } catch {}
}

function sendEmote(targetClientId: string, emote: string): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  const cid = String(targetClientId || '').trim()
  if (!cid) return
  const e = String(emote || '').trim()
  if (!e) return
  const k = `${cid}|${e}`
  const now = Date.now()
  const last = emoteCooldown.get(k) || 0
  if (now - last < 600) return
  emoteCooldown.set(k, now)
  wsSend({ type: 'emote', clientId: cid, emote: e })
}

function onPlayerTap(rp: RenderedPlayer, e: any): void {
  playInteract(rp)
  sendEmote(rp.state.clientId, 'interact')
  const ne = (e as any)?.nativeEvent as PointerEvent | undefined
  const cx = Number(ne?.clientX ?? 0)
  const cy = Number(ne?.clientY ?? 0)
  if (rp.state.userId) openProfileCard(rp.state.userId, cx, cy)
}

function applyState(rp: RenderedPlayer, wW: number, wH: number, snap = false): void {
  if (!app) return
  const bx = rp.baseBounds.x + rp.baseBounds.width / 2
  const by = rp.baseBounds.y + rp.baseBounds.height / 2
  const halfW = (rp.baseBounds.width * rp.scale) / 2
  const halfH = (rp.baseBounds.height * rp.scale) / 2

  const nextX = clamp(rp.state.x, halfW, wW - halfW)
  const nextY = clamp(rp.state.y, halfH, wH - halfH)
  rp.state.x = nextX
  rp.state.y = nextY

  if (snap) {
    rp.target.x = nextX
    rp.target.y = nextY
  } else {
    rp.target.x = rp.target.x + (nextX - rp.target.x) * 0.25
    rp.target.y = rp.target.y + (nextY - rp.target.y) * 0.25
  }

  const dir = rp.state.dir === -1 ? -1 : 1
  rp.spine.scale.x = rp.scale * dir
  rp.spine.scale.y = rp.scale
  rp.spine.x = rp.target.x - bx * rp.spine.scale.x
  rp.spine.y = rp.target.y - by * rp.scale
  rp.hit.scale.x = rp.spine.scale.x
  rp.hit.scale.y = rp.scale
  rp.hit.x = rp.spine.x
  rp.hit.y = rp.spine.y
  if (rp.label.text !== rp.state.nickname) rp.label.text = rp.state.nickname || ''
  rp.label.x = rp.target.x
  rp.label.y = rp.target.y - halfH - 8

  const targetAnim = rp.state.moving ? (rp.moveAnim || rp.idleAnim) : rp.idleAnim
  if (targetAnim && targetAnim !== rp.lastAnim) {
    rp.spine.state.setAnimation(0, targetAnim, true)
    rp.lastAnim = targetAnim
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) {
    keyDown.clear()
    shiftPressed = false
    return
  }
  const key = e.key.toLowerCase()
  if (key === 'shift') {
    shiftPressed = true
    return
  }
  if (!['w', 'a', 's', 'd'].includes(key)) return
  e.preventDefault()
  keyDown.add(key)
}

function onKeyUp(e: KeyboardEvent): void {
  const key = e.key.toLowerCase()
  if (key === 'shift') {
    shiftPressed = false
    return
  }
  if (!['w', 'a', 's', 'd'].includes(key)) return
  e.preventDefault()
  keyDown.delete(key)
}

function currentInputVector(): { dx: number; dy: number; moving: boolean } {
  let dx = 0
  let dy = 0
  if (keyDown.has('w')) dy -= 1
  if (keyDown.has('s')) dy += 1
  if (keyDown.has('a')) dx -= 1
  if (keyDown.has('d')) dx += 1
  const moving = dx !== 0 || dy !== 0
  if (dx < 0) facing = -1
  if (dx > 0) facing = 1
  return { dx, dy, moving }
}

function predictStep(me: RenderedPlayer, dt: number, dx: number, dy: number, shift: boolean, dir: 1 | -1): void {
  const speed = shift ? 800 : 260
  const len = Math.hypot(dx, dy) || 1
  const nx = dx / len
  const ny = dy / len
  me.state.x += nx * speed * dt
  me.state.y += ny * speed * dt
  me.state.moving = dx !== 0 || dy !== 0
  me.state.dir = dir
}

function reconcile(me: RenderedPlayer, authX: number, authY: number, ackSeq: number): void {
  me.state.x = authX
  me.state.y = authY
  lastAckSeq = Math.max(lastAckSeq, ackSeq)
  while (pendingInputs.length && pendingInputs[0]!.seq <= lastAckSeq) {
    pendingInputs.shift()
  }
  const step = 1 / Math.max(1, tickHz || 30)
  for (const f of pendingInputs) {
    predictStep(me, step, f.dx, f.dy, f.shift, f.dir)
  }
  applyState(me, worldW, worldH, true)
}

function pushRemoteSnapshot(rp: RenderedPlayer, serverTs: number, snap: SnapshotPlayer): void {
  const buf = rp.buffer
  const t = Number(serverTs || 0)
  buf.push({ serverTs: t, x: snap.x, y: snap.y, moving: Boolean(snap.moving), dir: snap.dir === -1 ? -1 : 1 })
  if (buf.length > 40) buf.splice(0, buf.length - 40)
}

function sampleRemote(rp: RenderedPlayer, targetServerTs: number): void {
  const buf = rp.buffer
  if (!buf.length) return
  while (buf.length >= 2 && buf[1]!.serverTs <= targetServerTs) {
    buf.shift()
  }
  if (buf.length === 1) {
    const a = buf[0]!
    rp.state.x = a.x
    rp.state.y = a.y
    rp.state.moving = a.moving
    rp.state.dir = a.dir
    return
  }
  const a = buf[0]!
  const b = buf[1]!
  const span = Math.max(1, b.serverTs - a.serverTs)
  const t = (targetServerTs - a.serverTs) / span
  rp.state.x = lerp(a.x, b.x, t)
  rp.state.y = lerp(a.y, b.y, t)
  rp.state.moving = t < 0.5 ? a.moving : b.moving
  rp.state.dir = t < 0.5 ? a.dir : b.dir
}

function tick(): void {
  if (!app) return
  const vw = app.renderer.width
  const vh = app.renderer.height
  if (vw !== lastViewW || vh !== lastViewH) {
    lastViewW = vw
    lastViewH = vh
    updateViewport()
  }
  const dt = Math.min(0.05, app.ticker.deltaMS / 1000)
  fpsCounter += 1

  const me = myClientId ? players.get(myClientId) : null
  if (me) {
    simAcc += dt
    const fixed = 1 / Math.max(1, tickHz || 30)
    while (simAcc >= fixed) {
      simAcc -= fixed
      const v = currentInputVector()
      inputSeq += 1
      const frame: InputFrame = { seq: inputSeq, dx: v.dx, dy: v.dy, shift: shiftPressed, dir: facing }
      pendingInputs.push(frame)
      predictStep(me, fixed, frame.dx, frame.dy, frame.shift, frame.dir)
      if (socket && socket.readyState === WebSocket.OPEN) {
        wsSend({ type: 'input', seq: frame.seq, dx: frame.dx, dy: frame.dy, shift: frame.shift, dir: frame.dir })
      }
    }
  }

  const wW = worldW
  const wH = worldH
  const targetServerTs = Date.now() + serverClockOffsetMs - INTERP_DELAY_MS
  for (const rp of players.values()) {
    if (rp === me) continue
    sampleRemote(rp, targetServerTs)
  }

  for (const rp of players.values()) {
    applyState(rp, wW, wH, false)
  }
}

function startFpsPing(): void {
  stopFpsPing()
  fpsCounter = 0
  fpsTimer = window.setInterval(() => {
    fps.value = fpsCounter
    fpsCounter = 0
  }, 1000)
  pingTimer = window.setInterval(() => {
    if (!ctrlSocket || ctrlSocket.readyState !== WebSocket.OPEN) return
    const now = performance.now()
    wsSendCtrl({ type: 'ping', ts: now })
  }, 1000)
  mainPingTimer = window.setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    const now = performance.now()
    wsSend({ type: 'ping', ts: now, src: 'main' })
  }, 10000)
  watchdogTimer = window.setInterval(() => {
    // 仅在服务端确认支持主连接 pong 后启用，避免旧后端被误判断线而反复重连
    if (mainPongSupported && socket && socket.readyState === WebSocket.OPEN) {
      if (Date.now() - lastMainPongAt > 30000) {
        connectionLost.value = true
        try {
          socket.close()
        } catch {}
      }
    }
  }, 5000)
  netTimer = window.setInterval(() => {
    netUp.value = Math.max(0, Math.round(sentBytes / 1024))
    netDown.value = Math.max(0, Math.round(recvBytes / 1024))
    sentBytes = 0
    recvBytes = 0
  }, 1000)
}

function stopFpsPing(): void {
  if (fpsTimer) {
    clearInterval(fpsTimer)
    fpsTimer = null
  }
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
  if (mainPingTimer) {
    clearInterval(mainPingTimer)
    mainPingTimer = null
  }
  if (watchdogTimer) {
    clearInterval(watchdogTimer)
    watchdogTimer = null
  }
  if (netTimer) {
    clearInterval(netTimer)
    netTimer = null
  }
}

function wsSend(payload: any): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
  sentBytes += text.length
  socket.send(text)
}

function wsSendCtrl(payload: any): void {
  if (!ctrlSocket || ctrlSocket.readyState !== WebSocket.OPEN) return
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
  sentBytes += text.length
  ctrlSocket.send(text)
}

function sendChat(): void {
  const text = chatInput.value.trim()
  if (!text) return
  wsSend({ type: 'chat', content: text })
  chatInput.value = ''
}

async function ensurePlayer(p: SnapshotPlayer): Promise<void> {
  if (destroyed || !app) return
  const existed = players.get(p.clientId)
  if (existed) {
    existed.state.nickname = p.nickname
    if (p.assetKey && existed.state.assetKey !== p.assetKey) {
      try {
        await replacePlayerSpine(existed, p.assetKey)
      } catch {}
    } else {
      existed.state.assetKey = p.assetKey
    }
    return
  }
  if (loadingPlayers.has(p.clientId)) return
  loadingPlayers.add(p.clientId)
  try {
    const rp = await createPlayer(p)
    if (!rp) return
    const already = players.get(p.clientId)
    if (destroyed || already) {
      try {
        worldLayer?.removeChild(rp.spine)
        worldLayer?.removeChild(rp.hit)
        worldLayer?.removeChild(rp.label)
        rp.spine.destroy({ children: true, texture: false, baseTexture: false } as any)
        rp.hit.destroy()
        rp.label.destroy()
      } catch {}
      return
    }
    players.set(p.clientId, rp)
  } catch {
    if (!destroyed && p.clientId === myClientId) ElMessage.error('角色加载失败')
  } finally {
    loadingPlayers.delete(p.clientId)
  }
}

function removePlayer(clientId: string): void {
  if (!app || !worldLayer) return
  const rp = players.get(clientId)
  if (!rp) return
  try {
    worldLayer.removeChild(rp.spine)
    worldLayer.removeChild(rp.hit)
    worldLayer.removeChild(rp.label)
    rp.spine.destroy({ children: true, texture: false, baseTexture: false } as any)
    rp.hit.destroy()
    rp.label.destroy()
  } catch {}
  players.delete(clientId)
  loadingPlayers.delete(clientId)
}

function handleMsg(m: WsMsg): void {
  if (destroyed) return
  if (m.type === 'error') {
    ElMessage.error(m.message || '进入房间失败')
    router.push('/online')
    return
  }
  if (m.type === 'room_offline') {
    ElMessage.warning('房间已下线')
    router.push('/online')
    return
  }
  if (m.type === 'pong') {
    const rtt = performance.now() - Number(m.ts || 0)
    ping.value = Number.isFinite(rtt) ? Math.max(0, Math.round(rtt)) : null
    if (m.serverTs) {
      const offset = Number(m.serverTs) - Date.now()
      serverClockOffsetMs = serverClockOffsetMs * 0.9 + offset * 0.1
    }
    if (m.src === 'main') {
      lastMainPongAt = Date.now()
      mainPongSupported = true
    }
    return
  }
  if (m.type === 'race_update') {
    void refreshRaceState()
    raceSceneRef.value?.onRaceMsg(m)
    return
  }
  if (m.type === 'race_pool_update') {
    const r = raceState.value?.round
    if (r && Number(m.roundId) === r.id) {
      raceState.value = { ...raceState.value!, round: { ...r, totalPool: Number(m.totalPool || 0) } }
    }
    raceSceneRef.value?.onRaceMsg(m)
    return
  }
  if (m.type === 'race_start') {
    const r = raceState.value?.round
    if (r && Number(m.roundId) === r.id) {
      const durationSeconds = Number(m.durationMs) / 1000
      raceState.value = {
        ...raceState.value!,
        round: {
          ...r,
          status: 'RACING',
          seed: String(m.seed || ''),
          raceStartAt: Number(m.raceStartAt || 0),
          raceDurationSeconds: Number.isInteger(durationSeconds) && durationSeconds >= 1 && durationSeconds <= 86400
            ? durationSeconds : r.raceDurationSeconds
        }
      }
    }
    raceSceneRef.value?.onRaceMsg(m)
    return
  }
  if (m.type === 'race_result') {
    const r = raceState.value?.round
    if (r && Number(m.roundId) === r.id) {
      raceState.value = {
        ...raceState.value!,
        round: {
          ...r,
          status: 'PODIUM',
          ranking: Array.isArray(m.ranking) ? m.ranking.map(Number) : null,
          totalPool: Number(m.totalPool || 0),
          paidTotal: Number(m.paidTotal || 0)
        }
      }
    }
    void refreshRaceState()
    raceSceneRef.value?.onRaceMsg(m)
    return
  }
  if (m.type === 'race_my_result') {
    const payout = Number(m.payout || 0)
    if (payout > 0) {
      ElMessage.success(`赛马竞猜结果：第 ${m.roundNo} 场获得 ${payout} 龙门币奖金`)
    } else {
      ElMessage.info(`赛马竞猜结果：第 ${m.roundNo} 场未中奖`)
    }
    raceSceneRef.value?.onRaceMsg(m)
    return
  }
  if (m.type === 'chat') {
    const msg: ChatMsg = {
      clientId: m.clientId,
      userId: m.userId,
      nickname: m.nickname,
      content: m.content,
      ts: Number(m.ts || Date.now()),
      self: m.clientId === myClientId
    }
    chatMessages.value.push(msg)
    if (chatMessages.value.length > MAX_CHAT_MESSAGES) {
      chatMessages.value = chatMessages.value.slice(-MAX_CHAT_MESSAGES)
    }
    nextTick(() => {
      if (chatPanelRef.value) {
        chatPanelRef.value.scrollTop = chatPanelRef.value.scrollHeight
      }
    })
    return
  }
  if (!app) return
  if (m.type === 'welcome') {
    myClientId = m.clientId
    myResumeKey = m.resumeKey || ''
    worldW = Math.max(1, Number(m.worldW || 1920))
    worldH = Math.max(1, Number(m.worldH || 1080))
    tickHz = Math.max(10, Math.min(60, Number(m.tickHz || 30)))
    if (m.serverTs) serverClockOffsetMs = Number(m.serverTs) - Date.now()
    updateViewport()

    const incomingIds = new Set((m.players || []).map((x) => x.clientId))
    for (const id of players.keys()) {
      if (!incomingIds.has(id)) removePlayer(id)
    }

    hostClientId.value = m.hostClientId || null
    hostFps.value = Math.max(30, Math.min(120, Number(m.hostFps || 60)))
    ;(app.ticker as any).maxFPS = hostFps.value
    if (hostClientId.value === myClientId) {
      const cap = detectFpsCap()
      hostFps.value = cap
      ;(app.ticker as any).maxFPS = cap
      wsSend({ type: 'host_fps', fps: cap })
    }
    for (const p of m.players || []) {
      void ensurePlayer(p)
    }

    const meSnap = (m.players || []).find((x) => x.clientId === myClientId)
    if (meSnap) {
      selectedAssetKey.value = meSnap.assetKey || selectedAssetKey.value
      lastAckSeq = Math.max(lastAckSeq, Number(meSnap.seq || 0))
      while (pendingInputs.length && pendingInputs[0]!.seq <= lastAckSeq) {
        pendingInputs.shift()
      }
      if (inputSeq < lastAckSeq) inputSeq = lastAckSeq
      if (socket && socket.readyState === WebSocket.OPEN) {
        for (const f of pendingInputs) {
          wsSend({ type: 'input', seq: f.seq, dx: f.dx, dy: f.dy, shift: f.shift, dir: f.dir })
        }
      }
    }
    void refreshRaceState()
    return
  }
  if (m.type === 'snapshot') {
    if (simNetLagMs > 0 && !(m as any)._lagged) {
      const lag = simNetLagMs
      const copy = m
      window.setTimeout(() => {
        if (destroyed) return
        handleMsg({ ...(copy as any), _lagged: true } as any)
      }, lag)
      return
    }
    if (m.serverTs) {
      const offset = Number(m.serverTs) - Date.now()
      serverClockOffsetMs = serverClockOffsetMs * 0.95 + offset * 0.05
    }
    hostClientId.value = m.hostClientId || null
    hostFps.value = Math.max(30, Math.min(120, Number(m.hostFps || 60)))
    ;(app.ticker as any).maxFPS = hostFps.value

    const byId = new Map<string, SnapshotPlayer>()
    for (const p of m.players || []) {
      byId.set(p.clientId, p)
      void ensurePlayer(p)
    }

    const me = myClientId ? players.get(myClientId) : null
    const meSnap = myClientId ? byId.get(myClientId) : null
    if (me && meSnap) {
      reconcile(me, Number(meSnap.x || 0), Number(meSnap.y || 0), Number(meSnap.seq || 0))
      me.state.dir = meSnap.dir === -1 ? -1 : 1
      me.state.moving = Boolean(meSnap.moving)
    }
    for (const [id, rp] of players.entries()) {
      if (id === myClientId) continue
      const snap = byId.get(id)
      if (!snap) continue
      pushRemoteSnapshot(rp, m.serverTs, snap)
    }
    return
  }
  if (m.type === 'host_fps') {
    hostFps.value = Math.max(30, Math.min(120, Number(m.fps || 60)))
    ;(app.ticker as any).maxFPS = hostFps.value
    return
  }
  if (m.type === 'host_change') {
    hostClientId.value = m.hostClientId || null
    hostFps.value = Math.max(30, Math.min(120, Number(m.hostFps || 60)))
    ;(app.ticker as any).maxFPS = hostFps.value
    if (hostClientId.value === myClientId) {
      const cap = detectFpsCap()
      hostFps.value = cap
      ;(app.ticker as any).maxFPS = cap
      wsSend({ type: 'host_fps', fps: cap })
    }
    return
  }
  if (m.type === 'player_join') {
    void ensurePlayer(m.player)
    return
  }
  if (m.type === 'player_update') {
    void ensurePlayer(m.player)
    return
  }
  if (m.type === 'player_leave') {
    removePlayer(m.clientId)
    return
  }
  if (m.type === 'emote') {
    const rp = players.get(m.clientId)
    if (rp && String(m.emote || '').toLowerCase() === 'interact') {
      playInteract(rp)
    }
    return
  }
}

function scheduleReconnect(): void {
  if (destroyed) return
  if (reconnectTimer) return
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    connectionLost.value = true
  }
  const attempt = Math.min(8, reconnectAttempt.value)
  const wait = Math.min(8000, 500 * 2 ** attempt)
  reconnectAttempt.value += 1
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    void connect()
  }, wait)
}

function reloadPage(): void {
  window.location.reload()
}

async function refreshRaceState(): Promise<void> {
  if (destroyed) return
  const requestedRoomId = roomId.value
  try {
    const s = await getRaceState(requestedRoomId)
    if (destroyed || requestedRoomId !== roomId.value) return
    raceState.value = s
    if (s.exists && autoOpenRacePending) {
      autoOpenRacePending = false
      raceSceneVisible.value = true
    }
    if (!s.exists && raceSceneVisible.value) {
      raceSceneVisible.value = false
      ElMessage.info('赛马模式已结束')
    }
  } catch {}
}

function getServerNow(): number {
  return Date.now() + serverClockOffsetMs
}

function toggleRaceScene(): void {
  if (!raceState.value?.exists) return
  raceSceneVisible.value = !raceSceneVisible.value
}

watch(raceSceneVisible, () => {
  closeProfileCard()
  app?.resize()
  updateViewport()
}, { flush: 'post' })

async function connect(): Promise<void> {
  if (destroyed) return
  const token = String(auth.session?.accessToken || '').trim()
  if (!token) {
    ElMessage.error('未登录')
    router.push('/')
    return
  }
  if (!String(auth.nickname || '').trim()) {
    try {
      await auth.fetchProfile()
    } catch {}
  }
  if (destroyed) return
  await loadSpineOptions()
  if (destroyed) return
  if (!selectedAssetKey.value) selectedAssetKey.value = assetKey.value
  const myNickname = String(auth.nickname || (auth as any).profile?.nickname || '').trim() || `玩家${auth.userId}`

  if (!ctrlSocket || ctrlSocket.readyState === WebSocket.CLOSED) {
    const ctrlUrl = wsUrl('/ws/online/ctrl', { token })
    ctrlSocket = new WebSocket(ctrlUrl)
    ctrlSocket.onmessage = (ev) => {
      try {
        const raw = ev.data
        if (typeof raw === 'string') recvBytes += raw.length
        const m = JSON.parse(String(ev.data || '')) as WsMsg
        handleMsg(m)
      } catch {}
    }
    ctrlSocket.onclose = () => {
      ping.value = null
      scheduleReconnect()
    }
    ctrlSocket.onerror = () => {}
  }

  if (!socket || socket.readyState === WebSocket.CLOSED) {
    const url = wsUrl('/ws/online', { token, room: roomId.value })
    socket = new WebSocket(url)

    socket.onopen = () => {
      if (destroyed) return
      reconnectAttempt.value = 0
      connectionLost.value = false
      lastMainPongAt = Date.now()
      mainPongSupported = false
      const joinAssetKey = String(selectedAssetKey.value || assetKey.value || '').trim()
      const join: any = { type: 'join', roomId: roomId.value, assetKey: joinAssetKey, nickname: myNickname }
      const pw = String(sessionStorage.getItem(`online_room_pw_${roomId.value}`) || '').trim()
      if (pw) join.password = pw
      if (myClientId && myResumeKey) {
        join.clientId = myClientId
        join.resumeKey = myResumeKey
      }
      wsSend(join)
      startFpsPing()
      // 重连期间可能错过赛马广播，立即同步一次当前状态
      void refreshRaceState()
    }
    socket.onmessage = (ev) => {
      try {
        const raw = ev.data
        if (typeof raw === 'string') recvBytes += raw.length
        const m = JSON.parse(String(ev.data || '')) as WsMsg
        handleMsg(m)
      } catch {}
    }
    socket.onclose = () => {
      stopFpsPing()
      scheduleReconnect()
    }
    socket.onerror = () => {}
  }
}

function destroy(): void {
  if (destroyed) return
  destroyed = true
  stopFpsPing()
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ctrlSocket) {
    try {
      ctrlSocket.close()
    } catch {}
    ctrlSocket = null
  }
  if (socket) {
    try {
      if (socket.readyState === WebSocket.OPEN && myClientId) {
        wsSend({ type: 'leave' })
      }
    } catch {}
    try {
      socket.close()
    } catch {}
    socket = null
  }
  if (app) {
    try {
      app.ticker.remove(tick)
    } catch {}
  }
  for (const rp of players.values()) {
    try {
      worldLayer?.removeChild(rp.spine)
      worldLayer?.removeChild(rp.hit)
      worldLayer?.removeChild(rp.label)
      rp.spine.destroy({ children: true, texture: false, baseTexture: false } as any)
      rp.hit.destroy()
      rp.label.destroy()
    } catch {}
  }
  players.clear()
  if (worldLayer) {
    try {
      app?.stage.removeChild(worldLayer)
      worldLayer.destroy({ children: true } as any)
    } catch {}
    worldLayer = null
    guideGfx = null
  }
  if (app) {
    app.destroy(true, { children: true, texture: false, baseTexture: false })
    app = null
  }
  if (wrapRef.value) wrapRef.value.innerHTML = ''
}

function initPixi(): void {
  const el = wrapRef.value
  if (destroyed || app || !el) return
  app = new PIXI.Application({ backgroundAlpha: 0, antialias: true, resizeTo: el })
  ;(app.ticker as any).maxFPS = 60
  el.appendChild(app.view as any)
  const w = Math.max(1, el.clientWidth)
  const h = Math.max(1, el.clientHeight)
  app.renderer.resize(w, h)
  lastViewW = app.renderer.width
  lastViewH = app.renderer.height
  worldLayer = new PIXI.Container()
  guideGfx = new PIXI.Graphics()
  worldLayer.addChild(guideGfx)
  app.stage.addChild(worldLayer)
  updateViewport()
  app.ticker.add(tick)
}

function reselectRoom(): void {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  closeProfileCard()
  destroy()
  router.push({ path: '/online', query: { keepAssetKey: selectedAssetKey.value || undefined } })
}

function back(): void {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  closeProfileCard()
  destroy()
  router.push('/home')
}

onBeforeRouteLeave(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  closeProfileCard()
  destroy()
})

onMounted(async () => {
  if (destroyed) return
  // 显式选角优先；随机只在本次首次挂载执行，重连复用 selectedAssetKey。
  selectedAssetKey.value = assetKey.value
  if (!selectedAssetKey.value && route.query.randomAvatar === '1') {
    const loaded = await loadSpineOptions()
    if (destroyed) return
    if (!loaded || spineOptions.value.length === 0) {
      ElMessage.error(loaded ? '暂无可用角色，请稍后重试' : '角色目录加载失败，请稍后重试')
      destroy()
      void router.push('/online')
      return
    }
    const index = Math.floor(Math.random() * spineOptions.value.length)
    selectedAssetKey.value = spineOptions.value[index]!.assetKey
  }
  if (!selectedAssetKey.value) {
    ElMessage.error('请选择角色')
    destroy()
    void router.push('/online')
    return
  }
  simNetLagMs = Math.max(0, Math.min(300, Number(route.query.lag || 0)))
  initPixi()
  void connect()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  closeProfileCard()
  destroy()
})
</script>

<template>
  <div class="relative min-h-screen bg-[#0b1220] overflow-hidden">
    <div
      v-if="connectionLost"
      class="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm text-gray-100"
    >
      <div class="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      <div class="text-base font-semibold">连接已断开，正在重连…</div>
      <div class="text-xs text-gray-400">第 {{ reconnectAttempt }} 次尝试</div>
      <button
        class="mt-2 rounded-md border border-white/10 bg-white/5 px-4 py-1.5 text-sm hover:bg-white/10 cursor-pointer"
        @click="reloadPage"
      >
        重新加载页面
      </button>
    </div>
    <div
      v-if="cardVisible"
      class="absolute z-20 w-[300px] rounded-xl border border-white/10 bg-black/70 backdrop-blur-md text-gray-100 p-3"
      :style="{ left: `${cardPos.x}px`, top: `${cardPos.y}px` }"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="text-sm font-semibold truncate">
            {{ cardProfile?.nickname || '加载中…' }}
          </div>
          <div class="mt-0.5 text-xs text-gray-400">
            {{ roleLabel(cardProfile?.role) }}
          </div>
        </div>
        <button
          class="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100 cursor-pointer"
          @click="closeProfileCard"
        >
          ×
        </button>
      </div>

      <div v-if="cardLoading" class="mt-3 text-sm text-gray-300">加载中…</div>

      <div v-else class="mt-3 flex items-start gap-3">
        <img
          v-if="cardProfile"
          class="h-14 w-14 rounded-lg object-cover bg-white/5 border border-white/10"
          :src="resolveArkAvatarUrl(cardProfile.avatarCharId, cardProfile.avatarUrl) || ''"
          alt=""
        />
        <div class="min-w-0 flex-1">
          <div class="text-xs text-gray-300 truncate">
            {{ cardProfile?.region || '-' }}
          </div>
          <div class="mt-1 text-xs text-gray-300 truncate">
            {{ cardProfile?.gender || '-' }} · {{ cardProfile?.age ?? '-' }}
          </div>
          <div class="mt-2 text-xs text-gray-400 line-clamp-2">
            {{ cardProfile?.signature || cardProfile?.bio || '暂无简介' }}
          </div>
        </div>
      </div>

      <div v-if="cardProfile && !cardLoading" class="mt-3 flex gap-2 border-t border-white/10 pt-2">
        <button
          class="flex-1 rounded-md bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-400/30 px-2 py-1.5 text-xs text-gray-300 hover:text-red-300 cursor-pointer transition-colors"
          @click="openReportDialog('NICKNAME')"
        >
          举报昵称
        </button>
        <button
          class="flex-1 rounded-md bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-400/30 px-2 py-1.5 text-xs text-gray-300 hover:text-red-300 cursor-pointer transition-colors"
          @click="openReportDialog('SIGNATURE')"
        >
          举报签名
        </button>
      </div>
    </div>

    <el-dialog v-model="reportDialogVisible" title="举报" width="420px" :close-on-click-modal="false" append-to-body>
      <el-form label-position="top">
        <el-form-item label="举报类型">
          <el-select v-model="reportType" style="width: 100%">
            <el-option label="昵称" value="NICKNAME" />
            <el-option label="个性签名" value="SIGNATURE" />
            <el-option label="聊天记录" value="CHAT" />
          </el-select>
        </el-form-item>
        <el-form-item label="举报内容">
          <el-input
            v-model="reportContent"
            type="textarea"
            :rows="3"
            placeholder="请描述举报内容，如为聊天记录举报则引用具体消息"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reportDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="reportSubmitting" @click="submitReportDialog">提交举报</el-button>
      </template>
    </el-dialog>

    <div v-if="!raceSceneVisible && raceState?.exists" class="absolute left-6 top-6 z-10">
      <button
        class="rounded-xl bg-black/45 border border-amber-400/30 hover:border-amber-300/70 backdrop-blur-md px-4 py-3 text-gray-100 cursor-pointer text-left shadow-lg transition-colors"
        @click="toggleRaceScene"
      >
        <div class="text-sm font-bold text-amber-300">赛马竞猜</div>
        <div class="mt-0.5 text-xs text-gray-300 truncate max-w-[220px]">
          {{ raceState.race?.name || '赛马竞猜' }}
        </div>
        <div class="mt-1 flex items-center gap-2 text-xs">
          <span
            class="px-1.5 py-0.5 rounded-full border"
            :class="
              racePhaseLabel === '竞猜中'
                ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                : racePhaseLabel === '比赛中'
                  ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                  : racePhaseLabel === '颁奖中'
                    ? 'bg-sky-500/15 border-sky-400/40 text-sky-300'
                    : 'bg-white/10 border-white/15 text-gray-300'
            "
          >
            {{ racePhaseLabel }}
          </span>
          <span class="text-gray-400">奖池 {{ (raceState.round?.totalPool ?? 0).toLocaleString() }}</span>
        </div>
        <div class="mt-0.5 text-[10px] text-gray-500">点击进入赛马场景</div>
      </button>
    </div>

    <div v-if="raceSceneVisible" class="absolute inset-x-0 top-0 h-1/2 z-20">
      <RaceScene
        ref="raceSceneRef"
        :room-id="roomId"
        :initial="raceState"
        :get-server-now="getServerNow"
        @exit="raceSceneVisible = false"
      />
    </div>

    <div
      class="absolute right-6 z-10"
      :class="raceSceneVisible ? 'top-[calc(50%+1.5rem)]' : 'top-6'"
    >
      <button
        class="mb-2 w-full px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100 cursor-pointer"
        @click="reselectRoom"
      >
        重新选择房间
      </button>
      <button
        class="mb-3 w-full px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100 cursor-pointer"
        @click="back"
      >
        返回主页
      </button>
      <div class="rounded-xl bg-black/45 border border-white/10 backdrop-blur-md px-4 py-3 text-gray-100">
        <div class="text-xs text-gray-400">房间：{{ roomId }}</div>
        <div class="mt-1 flex items-center gap-4">
          <div class="text-sm">FPS {{ fps }}</div>
          <div class="text-sm">延迟 {{ ping ?? '-' }}ms</div>
        </div>
        <div class="mt-1 flex items-center gap-4">
          <div class="text-sm">上行 {{ netUp }}KB/s</div>
          <div class="text-sm">下行 {{ netDown }}KB/s</div>
        </div>
        <div class="mt-2 flex items-center gap-2">
          <select
            v-model="selectedAssetKey"
            class="h-9 flex-1 px-2 rounded-lg bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-cyan-400/60"
          >
            <option v-for="o in spineOptions" :key="o.assetKey" :value="o.assetKey">
              {{ o.name || o.assetKey }}
            </option>
          </select>
          <button
            class="h-9 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100 cursor-pointer"
            @click="applyAvatarChange(selectedAssetKey)"
          >
            切换
          </button>
        </div>
      </div>
    </div>

    <div class="absolute left-4 bottom-4 z-10 w-80 flex flex-col">
      <div
        ref="chatPanelRef"
        class="h-52 overflow-y-auto rounded-t-xl bg-black/45 border border-white/10 backdrop-blur-md px-3 py-2 scrollbar-thin"
      >
        <div v-if="chatMessages.length === 0" class="h-full flex items-center justify-center text-xs text-gray-500">
          暂无消息
        </div>
        <div v-for="(msg, i) in chatMessages" :key="i" class="py-0.5 text-sm leading-relaxed" @contextmenu.prevent="!msg.self && reportChatMessage(msg)">
          <span class="font-semibold" :class="msg.self ? 'text-cyan-300' : 'text-amber-300 cursor-pointer hover:underline'" @click.stop="!msg.self && reportChatMessage(msg)">{{ msg.nickname }}</span>
          <span class="text-gray-500 mx-1">:</span>
          <span class="text-gray-200 break-all">{{ msg.content }}</span>
        </div>
      </div>
      <div class="flex items-center gap-2 rounded-b-xl bg-black/55 border border-white/10 border-t-0 px-3 py-2">
        <input
          v-model="chatInput"
          class="flex-1 h-8 px-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-100 outline-none focus:border-cyan-400/60 placeholder-gray-500"
          placeholder="输入消息…"
          maxlength="500"
          @keydown.enter.prevent="sendChat"
        />
        <button
          class="h-8 px-3 rounded-lg bg-cyan-600/70 hover:bg-cyan-500/80 border border-cyan-400/30 text-sm text-white cursor-pointer transition-colors"
          @click="sendChat"
        >
          发送
        </button>
      </div>
    </div>

    <div
      class="absolute inset-x-0 bottom-0"
      :class="raceSceneVisible ? 'top-1/2' : 'top-0'"
      ref="wrapRef"
    ></div>
  </div>
</template>
