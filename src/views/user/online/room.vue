<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import 'pixi-spine'
import * as PIXI from 'pixi.js'
import { Spine } from 'pixi-spine'
import { ElMessage } from 'element-plus'

import { API_BASE_URL } from '@/config'
import { useAuthStore } from '@/stores/auth'

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

type CtrlPongMsg = { type: 'pong'; ts: number; serverTs?: number }

type WsMsg = WelcomeMsg | SnapshotMsg | { type: 'player_join'; player: SnapshotPlayer } | { type: 'player_leave'; clientId: string } | { type: 'host_fps'; fps: number } | { type: 'host_change'; hostClientId: string | null; hostFps: number } | CtrlPongMsg

type RenderedPlayer = {
  state: PlayerState
  spine: Spine
  label: PIXI.Text
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
let app: PIXI.Application | null = null
let socket: WebSocket | null = null
let ctrlSocket: WebSocket | null = null

let destroyed = false
let reconnectTimer: number | null = null
let reconnectAttempt = 0

let myClientId = ''
let myResumeKey = ''
let worldW = 1920
let worldH = 1080
let tickHz = 30

let serverClockOffsetMs = 0

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

const players = new Map<string, RenderedPlayer>()

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

async function createPlayer(p: SnapshotPlayer): Promise<RenderedPlayer | null> {
  if (!app) return null
  const skel = apiUrl(`/assets/spine/${p.assetKey}/${p.assetKey}.skel`)
  const resource: any = await PIXI.Assets.load(skel)
  const sp = new Spine(resource.spineData)
  sp.autoUpdate = true
  const anims = (sp as any)?.spineData?.animations?.map((a: any) => String(a?.name || '')).filter(Boolean) || []
  const idle = pickDefaultAnimation(anims)
  const moveAnim = pickMoveAnimation(anims)
  if (idle) sp.state.setAnimation(0, idle, true)
  if (idle && moveAnim) {
    ;(sp.stateData as any).setMix(idle, moveAnim, 0.12)
    ;(sp.stateData as any).setMix(moveAnim, idle, 0.12)
  }
  try {
    ;(sp as any).update(0)
  } catch {}
  const bounds = sp.getLocalBounds()
  const viewW = Math.max(1, app.renderer.width)
  const viewH = Math.max(1, app.renderer.height)
  const bw = Math.max(1, bounds.width)
  const bh = Math.max(1, bounds.height)
  const scale = Math.min(180 / bw, 220 / bh)
  sp.scale.set(scale, scale)
  app.stage.addChild(sp)

  const label = new PIXI.Text(p.nickname || '', {
    fill: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
    stroke: '#000000',
    strokeThickness: 4,
  })
  label.anchor.set(0.5, 1)
  app.stage.addChild(label)

  const rp: RenderedPlayer = {
    state: {
      clientId: p.clientId,
      userId: p.userId,
      nickname: p.nickname,
      assetKey: p.assetKey,
      x: p.x || viewW / 2,
      y: p.y || viewH / 2,
      moving: Boolean(p.moving),
      dir: p.dir === -1 ? -1 : 1,
    },
    spine: sp,
    label,
    baseBounds: bounds,
    scale,
    target: { x: p.x || viewW / 2, y: p.y || viewH / 2 },
    idleAnim: idle,
    moveAnim,
    lastAnim: idle,
    buffer: [],
  }
  applyState(rp, worldW, worldH, true)
  return rp
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

async function ensurePlayer(p: SnapshotPlayer): Promise<void> {
  if (!app) return
  const existed = players.get(p.clientId)
  if (existed) {
    existed.state.nickname = p.nickname
    existed.state.assetKey = p.assetKey
    return
  }
  try {
    const rp = await createPlayer(p)
    if (!rp) return
    players.set(p.clientId, rp)
  } catch {
    if (p.clientId === myClientId) ElMessage.error('角色加载失败')
  }
}

function removePlayer(clientId: string): void {
  if (!app) return
  const rp = players.get(clientId)
  if (!rp) return
  try {
    app.stage.removeChild(rp.spine)
    app.stage.removeChild(rp.label)
    rp.spine.destroy({ children: true, texture: false, baseTexture: false } as any)
    rp.label.destroy()
  } catch {}
  players.delete(clientId)
}

function handleMsg(m: WsMsg): void {
  if (m.type === 'pong') {
    const rtt = performance.now() - Number(m.ts || 0)
    ping.value = Number.isFinite(rtt) ? Math.max(0, Math.round(rtt)) : null
    if (m.serverTs) {
      const offset = Number(m.serverTs) - Date.now()
      serverClockOffsetMs = serverClockOffsetMs * 0.9 + offset * 0.1
    }
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
  if (m.type === 'player_leave') {
    removePlayer(m.clientId)
    return
  }
}

function scheduleReconnect(): void {
  if (destroyed) return
  if (reconnectTimer) return
  const attempt = Math.min(8, reconnectAttempt)
  const wait = Math.min(8000, 500 * 2 ** attempt)
  reconnectAttempt += 1
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    void connect()
  }, wait)
}

async function connect(): Promise<void> {
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
      reconnectAttempt = 0
      const join: any = { type: 'join', roomId: roomId.value, assetKey: assetKey.value, nickname: myNickname }
      if (myClientId && myResumeKey) {
        join.clientId = myClientId
        join.resumeKey = myResumeKey
      }
      wsSend(join)
      startFpsPing()
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
      app?.stage.removeChild(rp.spine)
      app?.stage.removeChild(rp.label)
      rp.spine.destroy({ children: true, texture: false, baseTexture: false } as any)
      rp.label.destroy()
    } catch {}
  }
  players.clear()
  if (app) {
    app.destroy(true, { children: true, texture: false, baseTexture: false })
    app = null
  }
  if (wrapRef.value) wrapRef.value.innerHTML = ''
}

function initPixi(): void {
  const el = wrapRef.value
  if (!el) return
  app = new PIXI.Application({ backgroundAlpha: 0, antialias: true, resizeTo: el })
  ;(app.ticker as any).maxFPS = 60
  el.appendChild(app.view as any)
  const w = Math.max(1, el.clientWidth)
  const h = Math.max(1, el.clientHeight)
  app.renderer.resize(w, h)
  app.ticker.add(tick)
}

function back(): void {
  router.push('/home')
}

onMounted(() => {
  if (!assetKey.value) {
    ElMessage.error('请选择角色')
    router.push('/online')
    return
  }
  simNetLagMs = Math.max(0, Math.min(300, Number(route.query.lag || 0)))
  destroyed = false
  initPixi()
  void connect()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  destroy()
})
</script>

<template>
  <div class="relative min-h-screen bg-[#0b1220] overflow-hidden">
    <div class="absolute right-6 top-6 z-10">
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
      </div>
    </div>

    <div class="absolute inset-0" ref="wrapRef"></div>
  </div>
</template>
