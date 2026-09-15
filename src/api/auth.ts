import { unwrap } from './user-http'

// --- types ---

export interface TokenResponse {
  tokenType: string
  accessToken: string
  accessExpiresIn: number
  refreshToken: string
  refreshExpiresIn: number
  userId: number
  role: 'ADMIN' | 'USER'
  weight: number
}

export interface CaptchaResponse {
  captchaId: string
  svg: string
}

export interface UserInfo {
  id: number
  account: string
  email: string
  role: 'ADMIN' | 'USER'
  nickname: string
  avatarUrl: string | null
  status: 'NORMAL' | 'SUSPENDED' | 'BANNED'
}

// --- API calls ---

export async function getNewCaptcha(): Promise<CaptchaResponse> {
  return unwrap<CaptchaResponse>({ url: '/auth/captcha/new', method: 'GET' })
}

export async function login(
  account: string,
  password: string,
  captchaId: string,
  captchaText: string,
): Promise<TokenResponse> {
  return unwrap<TokenResponse>({ url: '/auth/login', method: 'POST', data: { account, password, captchaId, captchaText } })
}

export async function refresh(refreshToken: string): Promise<TokenResponse> {
  return unwrap<TokenResponse>({ url: '/auth/refresh', method: 'POST', data: { refreshToken } })
}

export async function logout(refreshToken?: string): Promise<void> {
  return unwrap<void>({ url: '/auth/logout', method: 'POST', data: refreshToken ? { refreshToken } : {} })
}

export async function logoutAll(): Promise<void> {
  return unwrap<void>({ url: '/auth/logout-all', method: 'POST' })
}

export async function userPing(): Promise<string> {
  return unwrap<string>({ url: '/user/ping', method: 'GET' })
}

export async function adminPing(): Promise<string> {
  return unwrap<string>({ url: '/admin/ping', method: 'GET' })
}

export async function sendRegisterEmailCode(email: string): Promise<void> {
  return unwrap<void>({ url: '/auth/register/email-code/send', method: 'POST', data: { email } })
}

export async function register(payload: {
  email: string
  emailCode: string
  password: string
  confirmPassword: string
  nickname: string
}): Promise<any> {
  return unwrap<any>({ url: '/auth/register', method: 'POST', data: payload })
}

export async function adminRevoke(userId: number): Promise<void> {
  return unwrap<void>({ url: `/admin/auth/revoke/${userId}`, method: 'POST' })
}