import axios from 'axios'

import { getShumeiDeviceId, clearShumeiDeviceId } from './device-fingerprint'
import { md5Hex } from '@/utils/md5'

export interface OfficialBasic {
  isMinor: boolean
  hgId: string
}

export interface OfficialAccountBinding {
  uid: string
  nickName: string
  channelName: string
}

// 鹰角官方接口按来源白名单放行跨域，前端无法直连，统一走同源 /thirdparty 代理（dev 由 vite 转发，生产由网关转发）
const HG_BASE = '/thirdparty/hg'
const SKLAND_BASE = '/thirdparty/skland'

const SKLAND_APP_CODE = '4ca99fa6b56cc2ba'
const SKLAND_USER_AGENT = 'Skland/1.0.1 (com.hypergryph.skland; build:100001014; Android 31; ) Okhttp/4.11.0'
const SKLAND_V_NAME = '1.0.0'

const hg = axios.create({ baseURL: HG_BASE, timeout: 20_000 })
const skland = axios.create({ baseURL: SKLAND_BASE, timeout: 20_000 })

function errorText(err: any): string {
  const msg = err?.response?.data?.message || err?.response?.data?.msg || err?.message
  return String(msg || '操作失败')
}

// 官方 dId = "B" + 数美设备指纹签发的 deviceId（base64，device-fingerprint.ts），随机生成会被判设备信息无效（10001）
function dId(): Promise<string> {
  return getShumeiDeviceId()
}

function clearDid(): void {
  clearShumeiDeviceId()
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message))
  const bytes = new Uint8Array(sig)
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i]!.toString(16).padStart(2, '0')
  return out
}

export async function sendHgPhoneCode(phone: string): Promise<void> {
  const res = await hg.post('/general/v1/send_phone_code', { phone, type: 2 })
  const root = res?.data
  if (!root || Number(root.status) !== 0) throw new Error(String(root?.msg || '发送失败'))
}

async function loginHgByPassword(phone: string, password: string): Promise<string> {
  const res = await hg.post('/user/auth/v1/token_by_phone_password', { phone, password })
  const root = res?.data
  if (!root || Number(root.status) !== 0) throw new Error(String(root?.msg || '登录失败'))
  const token = String(root?.data?.token || '').trim()
  if (!token) throw new Error('登录失败')
  return token
}

async function loginHgByPhoneCode(phone: string, code: string): Promise<string> {
  const res = await hg.post('/user/auth/v2/token_by_phone_code', { phone, code })
  const root = res?.data
  if (!root || Number(root.status) !== 0) throw new Error(String(root?.msg || '登录失败'))
  const token = String(root?.data?.token || '').trim()
  if (!token) throw new Error('登录失败')
  return token
}

async function fetchHgBasic(token: string): Promise<OfficialBasic> {
  const res = await hg.get('/user/info/v1/basic', { params: { token } })
  const root = res?.data
  if (!root || Number(root.status) !== 0) throw new Error(String(root?.msg || '获取用户信息失败'))
  const hgId = String(root?.data?.hgId || '').trim()
  const isMinor = root?.data?.isMinor === true
  if (!hgId) throw new Error('获取用户信息失败')
  return { isMinor, hgId }
}

async function grantHgCode(token: string): Promise<string> {
  const res = await hg.post(
    '/user/oauth2/v2/grant',
    { token, appCode: SKLAND_APP_CODE, type: 0 },
    { headers: { dId: await dId(), 'User-Agent': SKLAND_USER_AGENT } },
  )
  const root = res?.data
  if (!root || Number(root.status) !== 0) throw new Error(String(root?.msg || '获得认证代码失败'))
  const code = String(root?.data?.code || '').trim()
  if (!code) throw new Error('获得认证代码失败')
  return code
}

async function generateSklandCred(code: string): Promise<{ cred: string; signToken: string }> {
  const res = await skland.post(
    '/web/v1/user/auth/generate_cred_by_code',
    { code, kind: 1 },
    { headers: { dId: await dId(), 'User-Agent': SKLAND_USER_AGENT } },
  )
  const root = res?.data
  if (!root || Number(root.code) !== 0) throw new Error(String(root?.message || '获得 cred 失败'))
  const cred = String(root?.data?.cred || '').trim()
  const signToken = String(root?.data?.token || '').trim()
  if (!cred || !signToken) throw new Error('获得 cred 失败')
  return { cred, signToken }
}

// 设备信息无效（10001）时清掉 dId 重生成，grant + cred 整体重试一次（对齐官方脚本流程）
async function grantAndGenerateCred(hgToken: string): Promise<{ cred: string; signToken: string }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const grant = await grantHgCode(hgToken)
      return await generateSklandCred(grant)
    } catch (e: any) {
      const msg = errorText(e)
      const deviceInvalid = msg.toLowerCase().includes('device') || msg.includes('设备')
      if (attempt === 0 && deviceInvalid) {
        clearDid()
        continue
      }
      throw e
    }
  }
  throw new Error('设备信息无效，请稍后重试')
}

async function fetchSklandBinding(cred: string, signToken: string): Promise<any> {
  const pathname = '/api/v1/game/player/binding'
  const did = await dId()
  for (const offset of [2, 3, 4, 5, 6]) {
    const ts = Math.floor(Date.now() / 1000) - offset
    const signHeaders = `{\"platform\":\"web\",\"timestamp\":\"${ts}\",\"dId\":\"${did}\",\"vName\":\"${SKLAND_V_NAME}\"}`
    const signString = `${pathname}${''}${ts}${signHeaders}`
    const h = await hmacSha256Hex(signToken, signString)
    const sign = md5Hex(h)
    try {
      const res = await skland.get(pathname, {
        headers: {
          cred,
          sign,
          platform: 'web',
          timestamp: String(ts),
          dId: did,
          vName: SKLAND_V_NAME,
          'User-Agent': SKLAND_USER_AGENT,
        },
      })
      const root = res?.data
      if (!root || Number(root.code) !== 0) {
        const msg = String(root?.message || '')
        // 官方脚本仅对 10003（时间戳/签名类错误）换 offset 重试，其余直接抛错
        if (Number(root?.code) === 10003) continue
        throw new Error(msg || '获取绑定信息失败')
      }
      return root
    } catch (e: any) {
      const msg = errorText(e).toLowerCase()
      if (msg.includes('sign') || msg.includes('timestamp')) continue
      throw e
    }
  }
  throw new Error('签名失败，请稍后重试')
}

function parseArknightsBinding(root: any): OfficialAccountBinding {
  const list = root?.data?.list
  if (!Array.isArray(list)) throw new Error('该账号未绑定明日方舟')
  const ark = list.find((x: any) => String(x?.appCode || '').trim() === 'arknights')
  if (!ark) throw new Error('该账号未绑定明日方舟')
  const bindingList = Array.isArray(ark?.bindingList) ? ark.bindingList : []
  if (bindingList.length <= 0) throw new Error('未找到明日方舟角色，请确认已在该账号下创建角色')
  const pick = bindingList.find((x: any) => x?.isDelete === false) || bindingList[0]
  const uid = String(pick?.uid || '').trim()
  const nickName = String(pick?.nickName || '').trim()
  const channelName = String(pick?.channelName || '').trim()
  if (!uid || !nickName || !channelName) throw new Error('未找到明日方舟角色，请确认已在该账号下创建角色')
  return { uid, nickName, channelName }
}

export async function fetchArknightsOfficialBinding(
  phone: string,
  auth: { password?: string; phoneCode?: string },
): Promise<{ basic: OfficialBasic; accountBinding: OfficialAccountBinding }> {
  const hgToken = auth.phoneCode
    ? await loginHgByPhoneCode(phone, auth.phoneCode)
    : await loginHgByPassword(phone, String(auth.password || ''))
  const basic = await fetchHgBasic(hgToken)
  const { cred, signToken } = await grantAndGenerateCred(hgToken)
  const bindingRoot = await fetchSklandBinding(cred, signToken)
  const accountBinding = parseArknightsBinding(bindingRoot)
  return { basic, accountBinding }
}
