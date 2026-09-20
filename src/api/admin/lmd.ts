import { request } from '../request'
import { hmacSha256Hex, randomNonce } from '@/utils/hmac'

type ApiResponse<T> = { code: number; message: string; data: T }

export type AdminTxItem = {
  id: number
  userId: number
  account: string | null
  nickname: string | null
  amount: number
  balanceAfter: number
  type: string
  refType: string | null
  refId: number | null
  description: string | null
  traceId: string | null
  requestIp: string | null
  createdBy: number | null
  createdAt: string | null
}

export type PageResponse<T> = { total: number; page: number; size: number; items: T[] }

export type AdminClaimItem = {
  id: number
  notificationId: number
  mailTitle: string | null
  userId: number
  account: string | null
  nickname: string | null
  amount: number
  traceId: string | null
  requestIp: string | null
  createdAt: string | null
}

export type VerifyMismatch = {
  userId: number
  balance: number
  ledgerSum: number
  diff: number
}

export type VerifyResult = {
  totalAccounts: number
  mismatches: VerifyMismatch[]
}

/** 签名密钥（与后端 app.lmd.sign-secret 一致，见 env 文件 VITE_LMD_SIGN_SECRET） */
function signSecret(): string {
  const secret = import.meta.env.VITE_LMD_SIGN_SECRET
  if (!secret) {
    throw new Error('未配置 VITE_LMD_SIGN_SECRET，龙门币写操作不可用')
  }
  return String(secret)
}

/** 构造签名参数：canonical = scope|field1|...|ts|nonce，sign = HMAC-SHA256 十六进制小写 */
async function buildSigned(scope: string, fields: (string | number)[]): Promise<{ ts: number; nonce: string; sign: string }> {
  const ts = Math.floor(Date.now() / 1000)
  const nonce = randomNonce()
  const canonical = `${scope}|${fields.map((f) => (f == null ? '' : String(f))).join('|')}|${ts}|${nonce}`
  const sign = await hmacSha256Hex(signSecret(), canonical)
  return { ts, nonce, sign }
}

export async function getLmdTransactionsAdmin(params: {
  userId?: number
  type?: string
  refType?: string
  page?: number
  size?: number
}): Promise<PageResponse<AdminTxItem>> {
  const res = await request<ApiResponse<PageResponse<AdminTxItem>>>({
    url: '/admin/lmd/transactions',
    method: 'GET',
    params: {
      userId: params.userId || undefined,
      type: params.type || undefined,
      refType: params.refType || undefined,
      page: params.page ?? 1,
      size: params.size ?? 20,
    },
  })
  if (res.code !== 0) throw new Error(res.message || '查询失败')
  return res.data
}

/** 管理员调整余额（正=发放，负=扣除），需要 HMAC 签名 */
export async function adjustLmd(
  userId: number,
  amount: number,
  description: string,
): Promise<{ userId: number; amount: number; balanceAfter: number }> {
  const desc = description.trim()
  const signed = await buildSigned('lmd.adjust', [userId, amount, desc])
  const res = await request<ApiResponse<{ userId: number; amount: number; balanceAfter: number }>>({
    url: '/admin/lmd/adjust',
    method: 'POST',
    data: { userId, amount, description: desc, ts: signed.ts, nonce: signed.nonce, sign: signed.sign },
  })
  if (res.code !== 0) throw new Error(res.message || '调整失败')
  return res.data
}

/** 发布带龙门币奖励的系统通知邮件（claimExpireAt 为空串表示永久有效），需要 HMAC 签名 */
export async function publishLmdMail(input: {
  title: string
  content: string
  level: 'NORMAL' | 'IMPORTANT'
  lmdAmount: number
  claimExpireAt: string
}): Promise<{ notificationId: number; deliveredCount: number }> {
  const title = input.title.trim()
  const content = input.content.trim()
  const expire = input.claimExpireAt ?? ''
  const signed = await buildSigned('lmd.mail.publish', [title, content, input.lmdAmount, expire])
  const res = await request<ApiResponse<{ notificationId: number; deliveredCount: number }>>({
    url: '/admin/lmd/mail/publish',
    method: 'POST',
    data: {
      title,
      content,
      level: input.level,
      lmdAmount: input.lmdAmount,
      claimExpireAt: expire,
      ts: signed.ts,
      nonce: signed.nonce,
      sign: signed.sign,
    },
  })
  if (res.code !== 0) throw new Error(res.message || '发布失败')
  return res.data
}

export async function getLmdMailClaims(params: {
  notificationId?: number
  userId?: number
  page?: number
  size?: number
}): Promise<PageResponse<AdminClaimItem>> {
  const res = await request<ApiResponse<PageResponse<AdminClaimItem>>>({
    url: '/admin/lmd/mail/claims',
    method: 'GET',
    params: {
      notificationId: params.notificationId || undefined,
      userId: params.userId || undefined,
      page: params.page ?? 1,
      size: params.size ?? 20,
    },
  })
  if (res.code !== 0) throw new Error(res.message || '查询失败')
  return res.data
}

export async function verifyLmd(userId?: number): Promise<VerifyResult> {
  const res = await request<ApiResponse<VerifyResult>>({
    url: '/admin/lmd/verify',
    method: 'GET',
    params: userId ? { userId } : undefined,
  })
  if (res.code !== 0) throw new Error(res.message || '校验失败')
  return res.data
}
