<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'pixi-spine'
import * as PIXI from 'pixi.js'
import { Spine } from 'pixi-spine'

const props = withDefaults(
  defineProps<{
    skelUrl: string
    animationName?: string
    loop?: boolean
    fit?: 'contain' | 'cover'
  }>(),
  {
    loop: true,
    fit: 'contain',
  },
)

const emit = defineEmits<{
  loaded: [payload: { spine: Spine; animations: string[] }]
  error: [message: string]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let app: PIXI.Application | null = null
let spine: Spine | null = null
let currentSkelUrl = ''

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

function destroy(): void {
  spine = null
  if (app) {
    app.destroy(true, { children: true, texture: false, baseTexture: false })
    app = null
  }
  const el = containerRef.value
  if (el) el.innerHTML = ''
}

async function load(sk: string): Promise<void> {
  const el = containerRef.value
  if (!el) return

  destroy()
  currentSkelUrl = sk

  app = new PIXI.Application({
    backgroundAlpha: 0,
    antialias: true,
    resizeTo: el,
  })
  el.appendChild(app.view as any)

  try {
    const resource: any = await PIXI.Assets.load(sk)
    const sp = new Spine(resource.spineData)
    spine = sp
    app.stage.addChild(sp)

    const anims = (spine as any)?.spineData?.animations?.map((a: any) => String(a?.name || '')).filter(Boolean) || []
    const target =
      props.animationName && anims.includes(props.animationName) ? props.animationName : pickDefaultAnimation(anims)
    if (target) {
      sp.state.setAnimation(0, target, props.loop)
      sp.autoUpdate = true
    }

    const bounds = sp.getBounds()
    const w = Math.max(1, el.clientWidth)
    const h = Math.max(1, el.clientHeight)
    const bw = Math.max(1, bounds.width)
    const bh = Math.max(1, bounds.height)
    const scale =
      props.fit === 'cover'
        ? Math.max(w / bw, h / bh)
        : Math.min(w / bw, h / bh)

    sp.scale.set(scale, scale)
    sp.x = w / 2 - (bounds.x + bounds.width / 2) * scale
    sp.y = h / 2 - (bounds.y + bounds.height / 2) * scale

    emit('loaded', { spine: sp, animations: anims })
  } catch (e) {
    emit('error', (e as any)?.message || '资源加载失败')
  }
}

function replay(): void {
  if (!app || !spine) return
  const anims = (spine as any)?.spineData?.animations?.map((a: any) => String(a?.name || '')).filter(Boolean) || []
  const target =
    props.animationName && anims.includes(props.animationName) ? props.animationName : pickDefaultAnimation(anims)
  if (!target) return
  spine.state.setAnimation(0, target, props.loop)
}

onMounted(() => {
  if (props.skelUrl) void load(props.skelUrl)
})

watch(
  () => props.skelUrl,
  (v) => {
    if (!v) return
    if (v === currentSkelUrl) return
    void load(v)
  },
)

watch(
  () => `${props.animationName || ''}__${props.loop}`,
  () => replay(),
)

onBeforeUnmount(() => destroy())
</script>

<template>
  <div class="spine-pixi" ref="containerRef"></div>
</template>

<style scoped>
.spine-pixi {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
