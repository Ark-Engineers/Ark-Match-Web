import { unwrap } from './user-http'

export interface UserProfile {
  userId: number
  account: string
  email: string
  role: string
  nickname: string
  avatarUrl: string | null
  avatarCharId?: string | null
  avatarCharName?: string | null
  gender: string
  bio: string | null
  birthYear: number | null
  status: string
  featuredRole?: string | null
  signature?: string | null
  region?: string | null
  age?: number | null
  birthday?: string | null
  birthdayVisible?: boolean | null
  tags?: string[]
  qq?: string | null
  wechat?: string | null
  createdAt: string
  lastLoginAt: string
  pendingMatches: number
  confirmedMatches: number
}

export interface AvatarOption {
  id: string
  name: string
  rarity: number
  avatarUrl: string
}

// 干员头像 CDN（规范项目约定）：后端给 charId，前端拼 CDN；无 charId 时回落后端 avatarUrl
const ARK_AVATAR_CDN = 'https://web.hycdn.cn/arknights/game/assets/char/avatar'

export function resolveArkAvatarUrl(
  charId: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  if (charId) return `${ARK_AVATAR_CDN}/${charId}.png`
  return fallback ?? null
}

export async function getMe(): Promise<UserProfile> {
  return unwrap<UserProfile>({ url: '/user/profile', method: 'GET' })
}

export async function updateProfile(data: {
  featuredRole?: string | null
  signature?: string | null
  birthday?: string | null
  birthdayVisible?: boolean | null
  tags?: string[]
  avatarCharId?: string | null
  avatarCharName?: string | null
  qq?: string | null
  wechat?: string | null
  email?: string | null
}): Promise<UserProfile> {
  return unwrap<UserProfile>({ url: '/user/profile', method: 'PUT', data })
}

export async function getPublicProfile(userId: number): Promise<UserProfile> {
  return unwrap<UserProfile>({ url: `/user/profile/${userId}`, method: 'GET' })
}

export async function getAvatarOptions(): Promise<AvatarOption[]> {
  return unwrap<AvatarOption[]>({ url: '/user/profile/avatar-options', method: 'GET' })
}