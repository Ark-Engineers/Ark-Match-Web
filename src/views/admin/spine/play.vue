<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { request } from '@/api'
import { API_BASE_URL } from '@/config'
import SpinePixiPlayer from '@/components/SpinePixiPlayer.vue'
import type { Spine } from 'pixi-spine'

type ApiResponse<T> = { code: number; message: string; data: T }

type SpineAssetItem = {
  id: number
  assetKey: string
  name: string | null
}

type SpineFileItem = {
  fileType: string
  storedName: string
  url: string
}

type SpineDetail = { asset: SpineAssetItem; files: SpineFileItem[] }

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const detail = ref<SpineDetail | null>(null)
const position = ref({ x: 0, y: 0 })
const pressed = ref<Set<string>>(new Set())
const shiftPressed = ref(false)
const moving = computed(() => pressed.value.size > 0)

const animations = ref<string[]>([])
const idleAnimation = ref('')
const moveAnimation = ref('')
const currentAnimation = ref('')

let rafId: number | null = null
let lastTs = 0

function apiUrl(u: string): string {
  const base = String(API_BASE_URL || '').trim()
  if (!u) return base || ''
  if (!base) return u
  if (u.startsWith('/')) return `${base}${u}`
  return `${base}/${u}`
}

const skelUrl = computed(() => {
  const d = detail.value
  if (!d) return ''
  return apiUrl(`/assets/spine/${d.asset.assetKey}/${d.asset.assetKey}.skel`)
})

function onKeyDown(e: KeyboardEvent): void {
  const key = e.key.toLowerCase()
  if (key === 'shift') {
    shiftPressed.value = true
    return
  }
  if (!['w', 'a', 's', 'd'].includes(key)) return
  e.preventDefault()
  if (!pressed.value.has(key)) {
    const next = new Set(pressed.value)
    next.add(key)
    pressed.value = next
  }
}

function onKeyUp(e: KeyboardEvent): void {
  const key = e.key.toLowerCase()
  if (key === 'shift') {
    shiftPressed.value = false
    return
  }
  if (!['w', 'a', 's', 'd'].includes(key)) return
  e.preventDefault()
  if (pressed.value.has(key)) {
    const next = new Set(pressed.value)
    next.delete(key)
    pressed.value = next
  }
}

function step(ts: number): void {
  if (!lastTs) lastTs = ts
  const dt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000))
  lastTs = ts

  const speed = shiftPressed.value ? 480 : 260
  let vx = 0
  let vy = 0

  if (pressed.value.has('w')) vy -= 1
  if (pressed.value.has('s')) vy += 1
  if (pressed.value.has('a')) vx -= 1
  if (pressed.value.has('d')) vx += 1

  if (vx !== 0 || vy !== 0) {
    const len = Math.sqrt(vx * vx + vy * vy) || 1
    vx /= len
    vy /= len
    const p = position.value
    position.value = {
      x: p.x + vx * speed * dt,
      y: p.y + vy * speed * dt,
    }
  }

  rafId = window.requestAnimationFrame(step)
}

function pickAnimation(list: string[], kind: 'idle' | 'move'): string {
  const l = list.map((x) => String(x || '')).filter(Boolean)
  const lower = l.map((x) => x.toLowerCase())
  const pick = (candidates: string[]): string => {
    for (const c of candidates) {
      const idx = lower.findIndex((x) => x === c || x.includes(c))
      if (idx >= 0) return l[idx] || ''
    }
    return ''
  }
  if (kind === 'idle') return pick(['idle', 'stand', 'wait', 'default'])
  return pick(['move', 'run', 'walk'])
}

function syncAnimation(): void {
  if (moving.value) {
    currentAnimation.value = moveAnimation.value || idleAnimation.value || animations.value[0] || ''
  } else {
    currentAnimation.value = idleAnimation.value || animations.value[0] || ''
  }
}

function onSpineLoaded(payload: { spine: Spine; animations: string[] }): void {
  animations.value = payload.animations || []
  idleAnimation.value = pickAnimation(animations.value, 'idle')
  moveAnimation.value = pickAnimation(animations.value, 'move')
  syncAnimation()

  try {
    const idle = idleAnimation.value
    const move = moveAnimation.value
    const stateData: any = (payload.spine as any)?.stateData
    if (idle && move && stateData?.setMix) {
      stateData.setMix(idle, move, 0.12)
      stateData.setMix(move, idle, 0.12)
    }
  } catch {}
}

async function load(): Promise<void> {
  const id = Number(route.params.id)
  if (!id) {
    ElMessage.error('参数错误')
    await router.replace('/admin/spine')
    return
  }
  loading.value = true
  try {
    const res = await request<ApiResponse<SpineDetail>>({ url: `/admin/spine/${id}`, method: 'GET' })
    if (res.code !== 0) {
      ElMessage.error(res.message || '加载失败')
      await router.replace('/admin/spine')
      return
    }
    detail.value = res.data
    position.value = { x: 0, y: 0 }
    pressed.value = new Set()
    shiftPressed.value = false
  } finally {
    loading.value = false
  }
}

function goBack(): void {
  router.push('/admin/spine')
}

onMounted(() => {
  void load()
  window.addEventListener('keydown', onKeyDown, { passive: false })
  window.addEventListener('keyup', onKeyUp, { passive: false })
  rafId = window.requestAnimationFrame(step)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown as any)
  window.removeEventListener('keyup', onKeyUp as any)
  if (rafId != null) window.cancelAnimationFrame(rafId)
  rafId = null
})

watch(moving, () => syncAnimation())
</script>

<template>
  <div class="spine-play">
    <div class="topbar">
      <div class="left">
        <el-button @click="goBack">返回</el-button>
        <div class="title">{{ detail?.asset.name || detail?.asset.assetKey || 'Spine' }}</div>
      </div>
      <div class="hint">W/A/S/D 移动（按住 Shift 加速）</div>
    </div>

    <div class="stage">
      <div class="actor" :style="{ transform: `translate(${position.x}px, ${position.y}px)` }">
        <SpinePixiPlayer
          v-if="skelUrl"
          :skel-url="skelUrl"
          :animation-name="currentAnimation || undefined"
          :loop="true"
          fit="contain"
          @loaded="onSpineLoaded"
        />
      </div>
      <div v-if="loading" class="loading">加载中…</div>
    </div>
  </div>
</template>

<style scoped>
.spine-play {
  height: calc(100vh - 0px);
  display: flex;
  flex-direction: column;
  background: radial-gradient(1200px 700px at 30% 10%, rgba(56, 189, 248, 0.18), transparent 60%),
    linear-gradient(180deg, #0b1220, #070b10);
}

.topbar {
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(2, 6, 23, 0.35);
  backdrop-filter: blur(10px);
}

.left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-size: 14px;
  font-weight: 800;
  color: rgba(226, 232, 240, 0.92);
}

.hint {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.68);
}

.stage {
  position: relative;
  flex: 1;
  overflow: hidden;
}

.actor {
  width: 520px;
  height: 520px;
  position: absolute;
  left: calc(50% - 260px);
  top: calc(50% - 260px);
}

.loading {
  position: absolute;
  left: 14px;
  top: 14px;
  padding: 8px 10px;
  border-radius: 12px;
  color: rgba(226, 232, 240, 0.92);
  background: rgba(2, 6, 23, 0.35);
  border: 1px solid rgba(148, 163, 184, 0.18);
  backdrop-filter: blur(10px);
}
</style>
