import fs from 'node:fs/promises'
import path from 'node:path'

const now = new Date()
const y = String(now.getFullYear())
const m = String(now.getMonth() + 1).padStart(2, '0')
const d = String(now.getDate()).padStart(2, '0')
const buildDate = `${y}${m}${d}`

const root = process.cwd()
const dated = path.resolve(root, `dist-${buildDate}`)
const latest = path.resolve(root, 'dist')

async function copyDirRecursive(src, dest) {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const from = path.join(src, e.name)
    const to = path.join(dest, e.name)
    if (e.isDirectory()) {
      await copyDirRecursive(from, to)
      continue
    }
    if (e.isFile()) {
      await fs.copyFile(from, to)
    }
  }
}

await fs.rm(latest, { recursive: true, force: true })
await copyDirRecursive(dated, latest)
