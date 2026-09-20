// 生成 100 个确定性种子的前端模拟结果 JSON，供后端 JUnit 逐位比对（RaceSimConsistencyTest）。
// 用法：node scripts/raceSimCrossCheck.mjs <输出路径>
import { writeFileSync } from 'node:fs'
import { buildProfiles, finishOrder, RACER_COUNT, TOTAL_TICKS, TRACK_LENGTH } from '../src/utils/raceSim.ts'

const SEED_COUNT = 100
const SAMPLE_TICKS = [200, 400, 600, 800, 1000, 1200]

const seeds = []
for (let i = 0; i < SEED_COUNT; i++) {
  const s = (0x12345678 + Math.imul(i, 0x1b873593)) >>> 0
  seeds.push(s.toString(16).padStart(8, '0'))
}

const entries = seeds.map((seed) => {
  const profiles = buildProfiles(seed)
  const order = finishOrder(profiles)
  const ticks = []
  const samples = []
  for (let i = 0; i < RACER_COUNT; i++) {
    const curve = profiles[i]
    let t = TOTAL_TICKS
    for (let k = 1; k <= TOTAL_TICKS; k++) {
      if ((curve[k] ?? 0) >= TRACK_LENGTH) {
        t = k
        break
      }
    }
    ticks.push(t)
    samples.push(SAMPLE_TICKS.map((k) => curve[k] ?? 0))
  }
  return { seed, order, ticks, samples }
})

const out = process.argv[2]
if (!out) {
  console.error('用法：node scripts/raceSimCrossCheck.mjs <输出路径>')
  process.exit(1)
}
writeFileSync(out, JSON.stringify({ seedCount: SEED_COUNT, sampleTicks: SAMPLE_TICKS, seeds, entries }, null, 2))
console.log(`written ${entries.length} entries -> ${out}`)
