/**
 * 赛马动画确定性模拟器（与后端 RaceSimulator.java 逐位一致）。
 * 后端只下发种子与开赛时间戳，前端用同一算法重建速度曲线，
 * 保证动画冲线名次与后端加密存储的名次 100% 一致。
 */
export const RACER_COUNT = 5
export const TRACK_LENGTH = 1000.0
export const TICK_MS = 50
export const TOTAL_TICKS = 1200

export const BASE_SPEED = TRACK_LENGTH / ((TOTAL_TICKS * TICK_MS) / 1000.0)
export const M_MIN = 1.03
export const M_RANGE = 0.12
export const JITTER = 0.02

const MIX = 0x9e3779b9

/** mulberry32：与 Java Mulberry32 逐位一致的 32 位 PRNG */
export class Mulberry32 {
  private state: number

  constructor(seed: number) {
    this.state = seed | 0
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = ((t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t) | 0
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 由种子生成 5 名参赛者的累计位置曲线（profiles[i][t] = 第 i 名在 t tick 的位置） */
export function buildProfiles(seedHex: string): number[][] {
  const baseSeed = parseInt(seedHex.trim(), 16) | 0
  const profiles: number[][] = []
  for (let i = 0; i < RACER_COUNT; i++) {
    const rng = new Mulberry32((baseSeed + Math.imul(i, MIX)) | 0)
    const m = M_MIN + rng.next() * M_RANGE
    let pos = 0.0
    const curve: number[] = new Array(TOTAL_TICKS + 1)
    curve[0] = 0.0
    for (let t = 0; t < TOTAL_TICKS; t++) {
      const jitter = 1.0 + (rng.next() * 2.0 - 1.0) * JITTER
      pos += BASE_SPEED * m * jitter * (TICK_MS / 1000.0)
      curve[t + 1] = pos
    }
    profiles.push(curve)
  }
  return profiles
}

/** 由曲线计算冲线顺序（道次下标 0-4；冲线 tick 早者在前，并列按道次） */
export function finishOrder(profiles: number[][]): number[] {
  const finishTick: number[] = []
  for (let i = 0; i < RACER_COUNT; i++) {
    const curve = profiles[i]!
    let t = TOTAL_TICKS
    for (let k = 1; k <= TOTAL_TICKS; k++) {
      if ((curve[k] ?? 0) >= TRACK_LENGTH) {
        t = k
        break
      }
    }
    finishTick[i] = t
  }
  const idx = [0, 1, 2, 3, 4]
  idx.sort((a, b) => {
    const ta = finishTick[a] ?? TOTAL_TICKS
    const tb = finishTick[b] ?? TOTAL_TICKS
    return ta !== tb ? ta - tb : a - b
  })
  return idx
}
