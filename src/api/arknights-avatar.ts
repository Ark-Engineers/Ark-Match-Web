import axios from 'axios'

import { ARK_AVATAR_CDN } from './user'

export interface AvatarOption {
  id: string
  name: string
  rarity: number | null
  avatarUrl: string
}

interface RawCharacter {
  id?: unknown
  name?: unknown
  rarity?: unknown
}

interface CharBookResponse {
  data?: {
    characters?: RawCharacter[]
  }
}

// 森空岛干员图鉴接口对任意来源开放 CORS（Access-Control-Allow-Origin: *），前端可直连，无需后端代理
const CHAR_BOOK_URL = 'https://zonai.skland.com/h5/v1/game/arknights/char-book/list'

const skland = axios.create({ timeout: 20_000 })

export async function getArknightsAvatarOptions(): Promise<AvatarOption[]> {
  const res = await skland.get<CharBookResponse>(CHAR_BOOK_URL)
  const characters = res?.data?.data?.characters
  if (!Array.isArray(characters)) throw new Error('获取头像列表失败')
  const options: AvatarOption[] = []
  for (const item of characters) {
    const option = toOption(item)
    if (option) options.push(option)
  }
  options.sort(
    (a, b) =>
      (b.rarity ?? -1) - (a.rarity ?? -1) ||
      a.name.localeCompare(b.name),
  )
  return options
}

function toOption(item: RawCharacter): AvatarOption | null {
  const id = String(item?.id ?? '').trim()
  const name = String(item?.name ?? '').trim()
  if (!id || !name) return null
  return {
    id,
    name,
    rarity: toRarity(item?.rarity),
    avatarUrl: `${ARK_AVATAR_CDN}/${id}.png`,
  }
}

function toRarity(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const n = Number.parseInt(String(value).trim(), 10)
  return Number.isFinite(n) ? n : null
}
