import CryptoJS from 'crypto-js'
import { JSEncrypt } from 'jsencrypt'
import axios from 'axios'

import { md5Hex } from '@/utils/md5'

// 数美设备指纹服务：真实 dId 必须由该服务签发（"B" + deviceId），随机生成的 dId 会被森空岛判为设备信息无效（10001）。
// 流程对齐官方脚本（kafuneri/Skland-Sign-In，移植自 Rust 实现）：
// 浏览器指纹字段逐个 DES-ECB 加密 → 紧凑 JSON → gzip → AES-128-CBC → hex，
// UUID 用 RSA-PKCS1v15 加密为 ep，POST /deviceprofile/v4，code 1100 时取 detail.deviceId。
const FP_BASE = '/thirdparty/fp'
const FP_ORGANIZATION = 'UWXspnCCJN4sfYlNfqps'
const DID_STORAGE_KEY = 'skland_did_v2'

const DES_RULE: Record<string, { key?: string; name: string }> = {
  appId: { key: 'uy7mzc4h', name: 'xx' },
  box: { name: 'jf' },
  canvas: { key: 'snrn887t', name: 'yk' },
  clientSize: { key: 'cpmjjgsu', name: 'zx' },
  organization: { key: '78moqjfc', name: 'dp' },
  os: { key: 'je6vk6t4', name: 'pj' },
  platform: { key: 'pakxhcd2', name: 'gm' },
  plugins: { key: 'v51m3pzl', name: 'kq' },
  pmf: { key: '2mdeslu3', name: 'vw' },
  protocol: { name: 'protocol' },
  referer: { key: 'y7bmrjlc', name: 'ab' },
  res: { key: 'whxqm2a7', name: 'hf' },
  rtype: { key: 'x8o2h2bl', name: 'lo' },
  sdkver: { key: '9q3dcxp2', name: 'sc' },
  status: { key: '2jbrxxw4', name: 'an' },
  subVersion: { key: 'eo3i2puh', name: 'ns' },
  svm: { key: 'fzj3kaeh', name: 'qr' },
  time: { key: 'q2t3odsk', name: 'nb' },
  timezone: { key: '1uv05lj5', name: 'as' },
  tn: { key: 'x9nzj1bp', name: 'py' },
  trees: { key: 'acfs0xo4', name: 'pi' },
  ua: { key: 'k92crp1t', name: 'bj' },
  url: { key: 'y95hjkoo', name: 'cf' },
  version: { name: 'version' },
  vpw: { key: 'r9924ab5', name: 'ca' },
}

const DES_TARGET: Record<string, unknown> = {
  protocol: 102,
  organization: FP_ORGANIZATION,
  appId: 'default',
  os: 'web',
  version: '3.0.0',
  sdkver: '3.0.0',
  box: '',
  rtype: 'all',
  subVersion: '1.0.0',
  time: 0,
}

const BROWSER_ENV: Record<string, unknown> = {
  plugins: 'MicrosoftEdgePDFPluginPortableDocumentFormatinternal-pdf-viewer1,MicrosoftEdgePDFViewermhjfbmdgcfjbbpaeojofohoefgiehjai1',
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  canvas: '259ffe69',
  timezone: -480,
  platform: 'Win32',
  url: 'https://www.skland.com/',
  referer: '',
  res: '1920_1080_24_1.25',
  clientSize: '0_0_1080_1920_1920_1080_1920_1080',
  status: '0011',
}

const RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCmxMNr7n8ZeT0tE1R9j/mPixoin
PkeM+k4VGIn/s0k7N5rJAfnZ0eMER+QhwFvshzo0LNmeUkpR8uIlU/GEVr8mN28s
Kmwd2gpygqj0ePnBmOW4v0ZVwbSYK+izkhVFk2V/doLoMbWy6b+UnA8mkjvg0iYW
RByfRsK2gdl7llqCwIDAQAB
-----END PUBLIC KEY-----`

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i] || 0)
  return btoa(bin)
}

function desEncryptBase64(keyAscii: string, plain: string): string {
  // 空填充到 8 的倍数：恰好整块时也补满 8 字节（对齐官方脚本）
  const padded = plain + '\x00'.repeat(8 - (plain.length % 8))
  const encrypted = CryptoJS.DES.encrypt(CryptoJS.enc.Utf8.parse(padded), CryptoJS.enc.Utf8.parse(keyAscii), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.NoPadding,
  })
  return encrypted.ciphertext.toString(CryptoJS.enc.Base64)
}

function applyDesRules(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    const rule = DES_RULE[key]
    if (rule?.key) {
      result[rule.name] = desEncryptBase64(rule.key, String(value))
    } else if (rule) {
      result[rule.name] = value
    } else {
      result[key] = value
    }
  }
  return result
}

function tnPart(value: unknown): string {
  if (typeof value === 'number') return String(value * 10000)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return buildTnInput(value as Record<string, unknown>)
  }
  return value ? String(value) : ''
}

function buildTnInput(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .map((key) => tnPart(data[key]))
    .join('')
}

function buildSmid(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  const timeStr = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  const uid = crypto.randomUUID()
  const v = `${timeStr}${md5Hex(uid)}00`
  const digest = md5Hex(`smsk_web_${v}`)
  return `${v}${digest.slice(0, 14)}0`
}

function rsaEncryptUid(uid: string): string {
  const encryptor = new JSEncrypt()
  encryptor.setPublicKey(RSA_PUBLIC_KEY)
  const out = encryptor.encrypt(uid)
  if (!out) throw new Error('设备指纹 RSA 加密失败')
  return out
}

async function gzipBytes(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

async function aesCbcEncryptHex(data: Uint8Array, keyAscii: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(keyAscii)
  const ivBytes = new TextEncoder().encode('0102030405060708')
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt'])
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: ivBytes }, key, data)
  return Array.from(new Uint8Array(encrypted))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function padAesPlaintext(b64: string): Uint8Array {
  const padLen = 16 - (b64.length % 16)
  const aligned = padLen < 16 ? b64 + '\x00'.repeat(padLen) : b64
  const withPkcs7 = aligned + '\x10'.repeat(16)
  return new TextEncoder().encode(withPkcs7)
}

export async function requestShumeiDeviceId(base: string = FP_BASE): Promise<string> {
  const uid = crypto.randomUUID()
  const body = await buildFingerprintBody(uid, Date.now())
  const res = await axios.post(
    `${base}/deviceprofile/v4`,
    body,
    { timeout: 15_000 },
  )
  const root = res?.data
  if (!root || Number(root.code) !== 1100) {
    throw new Error(`设备指纹获取失败（${String(root?.code ?? '无响应')} ${String(root?.message || '')}）`)
  }
  const deviceId = String(root?.detail?.deviceId || '').trim()
  if (!deviceId) throw new Error('设备指纹响应缺少 deviceId')
  return deviceId
}

async function buildFingerprintBody(uid: string, nowMs: number): Promise<Record<string, unknown>> {
  const ep = rsaEncryptUid(uid)

  const target: Record<string, unknown> = {
    ...DES_TARGET,
    smid: buildSmid(),
    ...BROWSER_ENV,
    vpw: crypto.randomUUID(),
    trees: crypto.randomUUID(),
    svm: nowMs,
    pmf: nowMs,
  }
  target.tn = md5Hex(buildTnInput(target))

  const json = JSON.stringify(applyDesRules(target))
  const compressed = await gzipBytes(new TextEncoder().encode(json))
  const encrypted = await aesCbcEncryptHex(padAesPlaintext(bytesToBase64(compressed)), md5Hex(uid).slice(0, 16))

  return {
    appId: 'default',
    compress: 2,
    data: encrypted,
    encode: 5,
    ep,
    organization: FP_ORGANIZATION,
    os: 'web',
  }
}

const DID_PATTERN = /^B[A-Za-z0-9+/]{40,}={0,2}$/

let cachedDid: string | null = null
let inflight: Promise<string> | null = null

export async function getShumeiDeviceId(): Promise<string> {
  if (cachedDid && DID_PATTERN.test(cachedDid)) return cachedDid
  if (inflight) return inflight
  inflight = acquireDeviceId().finally(() => {
    inflight = null
  })
  return inflight
}

async function acquireDeviceId(): Promise<string> {
  try {
    const existed = String(localStorage.getItem(DID_STORAGE_KEY) || '').trim()
    if (DID_PATTERN.test(existed)) {
      cachedDid = existed
      return existed
    }
  } catch {}
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const deviceId = await requestShumeiDeviceId()
      const did = `B${deviceId}`
      cachedDid = did
      try {
        localStorage.setItem(DID_STORAGE_KEY, did)
      } catch {}
      return did
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('设备指纹获取失败')
}

export function clearShumeiDeviceId(): void {
  cachedDid = null
  try {
    localStorage.removeItem(DID_STORAGE_KEY)
  } catch {}
}
