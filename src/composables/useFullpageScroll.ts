import { ref, watch, onMounted, onUnmounted } from 'vue'

export interface FullpageScrollOptions {
  transitionDuration?: number
  wheelThreshold?: number
  touchThreshold?: number
}

export function useFullpageScroll(sectionCount: number, options: FullpageScrollOptions = {}) {
  const { transitionDuration = 800, wheelThreshold = 50, touchThreshold = 50 } = options

  const activeIndex = ref(0)
  const isTransitioning = ref(false)
  const containerRef = ref<HTMLElement | null>(null)

  let wheelAccumulator = 0
  let wheelTimer: ReturnType<typeof setTimeout> | null = null
  let touchStartY = 0
  let touchMoved = false

  function scrollTo(index: number) {
    if (index < 0 || index >= sectionCount || isTransitioning.value) return
    isTransitioning.value = true
    activeIndex.value = index
    if (containerRef.value) {
      containerRef.value.style.transform = `translateY(-${index * 100}vh)`
    }
    setTimeout(() => {
      isTransitioning.value = false
    }, transitionDuration)
  }

  function scrollNext() { scrollTo(activeIndex.value + 1) }
  function scrollPrev() { scrollTo(activeIndex.value - 1) }

  function isInsideScrollable(target: EventTarget | null, deltaY: number): boolean {
    let el = target as HTMLElement | null
    while (el && el !== containerRef.value) {
      const style = window.getComputedStyle(el)
      const overflowY = style.overflowY
      if (overflowY === 'auto' || overflowY === 'scroll') {
        if (deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true
        if (deltaY < 0 && el.scrollTop > 0) return true
      }
      el = el.parentElement
    }
    return false
  }

  function onWheel(event: WheelEvent) {
    if (isTransitioning.value) { event.preventDefault(); return }
    if (isInsideScrollable(event.target, event.deltaY)) return
    wheelAccumulator += event.deltaY
    if (wheelTimer) clearTimeout(wheelTimer)
    wheelTimer = setTimeout(() => { wheelAccumulator = 0 }, 300)
    if (Math.abs(wheelAccumulator) >= wheelThreshold) {
      if (wheelAccumulator > 0) scrollNext()
      else scrollPrev()
      wheelAccumulator = 0
    }
    event.preventDefault()
  }

  function onTouchStart(event: TouchEvent) {
    if (isTransitioning.value) return
    const touch = event.touches[0]
    if (!touch) return
    touchStartY = touch.clientY
    touchMoved = false
  }

  function onTouchMove(event: TouchEvent) {
    if (isTransitioning.value) return
    const touch = event.touches[0]
    if (!touch) return
    if (Math.abs(touchStartY - touch.clientY) > 5) {
      touchMoved = true
      event.preventDefault()
    }
  }

  function onTouchEnd(event: TouchEvent) {
    if (isTransitioning.value || !touchMoved) return
    const touch = event.changedTouches[0]
    if (!touch) return
    const deltaY = touchStartY - touch.clientY
    if (Math.abs(deltaY) >= touchThreshold) {
      if (deltaY > 0) scrollNext()
      else scrollPrev()
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (isTransitioning.value) return
    if (event.key === 'ArrowDown' || event.key === 'PageDown') { scrollNext(); event.preventDefault() }
    else if (event.key === 'ArrowUp' || event.key === 'PageUp') { scrollPrev(); event.preventDefault() }
  }

  // Auto-bind events when containerRef is populated from template ref
  let cleanup: (() => void) | null = null
  watch(containerRef, (el) => {
    cleanup?.(); cleanup = null
    if (el) {
      el.style.transition = `transform ${transitionDuration}ms cubic-bezier(0.77, 0, 0.175, 1)`
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.style.transition = 'none'
      }
      el.addEventListener('wheel', onWheel, { passive: false })
      el.addEventListener('touchstart', onTouchStart, { passive: false })
      el.addEventListener('touchmove', onTouchMove, { passive: false })
      el.addEventListener('touchend', onTouchEnd)
      cleanup = () => {
        el.removeEventListener('wheel', onWheel)
        el.removeEventListener('touchstart', onTouchStart)
        el.removeEventListener('touchmove', onTouchMove)
        el.removeEventListener('touchend', onTouchEnd)
      }
    }
  }, { immediate: true })

  onMounted(() => { document.addEventListener('keydown', onKeydown) })
  onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown)
    cleanup?.()
  })

  return { activeIndex, isTransitioning, scrollTo, scrollNext, scrollPrev, containerRef }
}