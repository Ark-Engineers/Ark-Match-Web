import { unwrap } from './user-http'

export type OnlineRoomPermission = 'PUBLIC' | 'ADMIN_ONLY' | 'PASSWORD' | 'WHITELIST'

export interface OnlineRoomCard {
  roomId: string
  name: string
  online: boolean
  permission: OnlineRoomPermission
  capacity: number
  onlineCount: number
  needPassword: boolean
  canEnter: boolean
  denyReason: string | null
}

export interface CreateOnlineRoomRequest {
  roomId: string
  name?: string
  permission: OnlineRoomPermission
  capacity: number
  password?: string
  whitelistUserIds?: number[]
  online?: boolean
}

export async function listOnlineRooms(): Promise<OnlineRoomCard[]> {
  return unwrap<OnlineRoomCard[]>({ url: '/user/online/rooms', method: 'GET' })
}

export async function createOnlineRoom(body: CreateOnlineRoomRequest): Promise<OnlineRoomCard> {
  return unwrap<OnlineRoomCard>({ url: '/admin/online/rooms', method: 'POST', data: body })
}

export async function setOnlineRoomOnline(roomId: string): Promise<void> {
  return unwrap<void>({ url: `/admin/online/rooms/${encodeURIComponent(roomId)}/online`, method: 'POST' })
}

export async function setOnlineRoomOffline(roomId: string): Promise<void> {
  return unwrap<void>({ url: `/admin/online/rooms/${encodeURIComponent(roomId)}/offline`, method: 'POST' })
}

