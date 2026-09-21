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
    scale?: number
    skinName?: string
  }>(),
  {
    loop: true,
    fit: 'contain',
    scale: 1.0,
  },
)

const emit = defineEmits<{
  loaded: [payload: { spine: Spine; animations: string[]; skins: string[] }]
  error: [message: string]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let app: PIXI.Application | null = null
let spine: Spine | null = null
let currentSkelUrl = ''
let resizeObserver: ResizeObserver | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null

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

// 将 spine 居中到容器中心（同步执行）
function centerSpine(): void {
  if (!spine || !app) return
  const el = containerRef.value
  if (!el) return

  const w = Math.max(1, el.clientWidth)
  const h = Math.max(1, el.clientHeight)

  // 获取 spine 的本地 bounds（不受 transform 影响）
  const localBounds = spine.getLocalBounds()
  const bw = Math.max(1, localBounds.width)
  const bh = Math.max(1, localBounds.height)

  // 计算缩放：基于本地尺寸适配容器
  const baseScale =
    props.fit === 'cover'
      ? Math.max(w / bw, h / bh)
      : Math.min(w / bw, h / bh)
  const finalScale = baseScale * (props.scale || 1.0)

  // 设置缩放
  spine.scale.set(finalScale, finalScale)

  // 将 spine 的原点（0,0）移到容器中心，再减去本地 bounds 的偏移
  // 这样角色的视觉中心就会在容器正中央
  spine.x = w / 2 - (localBounds.x + bw / 2) * finalScale
  spine.y = h / 2 - (localBounds.y + bh / 2) * finalScale
}

function destroy(): void {
  if (resizeTimer) {
    clearTimeout(resizeTimer)
    resizeTimer = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
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

  // 设置 ResizeObserver 监听容器大小变化（带防抖）
  resizeObserver = new ResizeObserver(() => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      centerSpine()
    }, 100)
  })
  resizeObserver.observe(el)

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
    const skins = (spine as any)?.spineData?.skins?.map((s: any) => String(s?.name || '')).filter(Boolean) || []

    // 设置皮肤
    if (props.skinName && skins.includes(props.skinName)) {
      try {
        sp.skeleton.setSkinByName(props.skinName)
        sp.skeleton.setSlotsToSetupPose()
      } catch {
        // skin 不存在则忽略
      }
    }

    const target =
      props.animationName && anims.includes(props.animationName) ? props.animationName : pickDefaultAnimation(anims)
    if (target) {
      sp.state.setAnimation(0, target, props.loop)
      sp.autoUpdate = true
    }

    // 直接居中（同步执行）
    centerSpine()

    emit('loaded', { spine: sp, animations: anims, skins })
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
  // 动画切换后重新居中
  centerSpine()
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

// 监听缩放变化，实时应用并重新居中
watch(
  () => props.scale,
  () => {
    centerSpine()
  },
)

// 监听皮肤变化，实时切换并重新居中
watch(
  () => props.skinName,
  (newSkin) => {
    if (!spine) return
    if (!newSkin) return
    try {
      spine.skeleton.setSkinByName(newSkin)
      spine.skeleton.setSlotsToSetupPose()
      // 皮肤切换后重新居中
      centerSpine()
    } catch {
      // skin 不存在则忽略
    }
  },
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
