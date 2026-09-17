<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import { request } from '@/api'
import { API_BASE_URL } from '@/config'
import SpinePixiPlayer from '@/components/SpinePixiPlayer.vue'
import { listOnlineRooms, type OnlineRoomCard, createOnlineRoom, setOnlineRoomOffline, setOnlineRoomOnline } from '@/api/online'
import { useAuthStore } from '@/stores/auth'

type ApiResponse<T> = { code: number; message: string; data: T }

type SpineOption = {
  assetKey: string
  name: string
  skelUrl: string
}

const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const list = ref<SpineOption[]>([])
const selected = ref<SpineOption | null>(null)

const roomLoading = ref(false)
const rooms = ref<OnlineRoomCard[]>([])
const selectedRoom = ref<OnlineRoomCard | null>(null)
const roomPing = ref<number | null>(null)
let roomPingTimer: number | null = null
let roomPingWs: WebSocket | null = null

const createVisible = ref(false)
const creating = ref(false)
const createRoomId = ref('')
const createRoomName = ref('')
const createPermission = ref<'PUBLIC' | 'ADMIN_ONLY' | 'PASSWORD' | 'WHITELIST'>('PUBLIC')
const createCapacity = ref(10)
const createPassword = ref('')
const createWhitelist = ref('')

function wsUrl(path: string, query: Record<string, string>): string {
  const base = String(API_BASE_URL || '').trim()
  const search = new URLSearchParams(query)
  if (base.startsWith('http://') || base.startsWith('https://')) {
    const u = new URL(base)
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    const p = String(u.pathname || '').replace(/\/$/, '')
    return `${proto}//${u.host}${p}${path}?${search.toString()}`
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = location.host
  const p = String(base || '').replace(/\/$/, '')
  return `${proto}//${host}${p}${path}?${search.toString()}`
}

function apiUrl(u: string): string {
  const base = String(API_BASE_URL || '').trim()
  if (!u) return base || ''
  if (!base) return u
  if (u.startsWith('/')) return `${base}${u}`
  return `${base}/${u}`
}

const grid = computed(() => list.value)

async function loadList(): Promise<void> {
  loading.value = true
  try {
    const res = await request<ApiResponse<SpineOption[]>>({
      url: '/user/spine/list',
      method: 'GET',
    })
    if (res.code !== 0) {
      ElMessage.error(res.message || '加载失败')
      list.value = []
      return
    }
    list.value = res.data || []
    if (!selected.value && list.value.length > 0) selected.value = list.value[0]!
  } catch {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

function pick(item: SpineOption): void {
  selected.value = item
}

async function loadRooms(): Promise<void> {
  roomLoading.value = true
  try {
    const data = await listOnlineRooms()
    rooms.value = data || []
    if (!selectedRoom.value && rooms.value.length > 0) selectedRoom.value = rooms.value[0]!
  } catch (e: any) {
    ElMessage.error(e?.message || '加载房间失败')
    rooms.value = []
  } finally {
    roomLoading.value = false
  }
}

function startRoomPing(): void {
  stopRoomPing()
  const token = String(auth.session?.accessToken || '').trim()
  if (!token) return
  const url = wsUrl('/ws/online/ctrl', { token })
  roomPingWs = new WebSocket(url)
  roomPingWs.onmessage = (ev) => {
    try {
      const m = JSON.parse(String(ev.data || ''))
      if (m?.type === 'pong') {
        const rtt = performance.now() - Number(m.ts || 0)
        roomPing.value = Number.isFinite(rtt) ? Math.max(0, Math.round(rtt)) : null
      }
    } catch {}
  }
  roomPingWs.onclose = () => {
    roomPing.value = null
  }
  roomPingTimer = window.setInterval(() => {
    if (!roomPingWs || roomPingWs.readyState !== WebSocket.OPEN) return
    roomPingWs.send(JSON.stringify({ type: 'ping', ts: performance.now() }))
  }, 1000)
}

function stopRoomPing(): void {
  if (roomPingTimer) {
    clearInterval(roomPingTimer)
    roomPingTimer = null
  }
  if (roomPingWs) {
    try {
      roomPingWs.close()
    } catch {}
    roomPingWs = null
  }
}

async function enterRoom(): Promise<void> {
  if (!selected.value) {
    ElMessage.warning('请先选择小人')
    return
  }
  if (!selectedRoom.value) {
    ElMessage.warning('请先选择房间')
    return
  }
  if (!selectedRoom.value.canEnter) {
    ElMessage.warning(selectedRoom.value.denyReason || '无法进入')
    return
  }
  if (!selectedRoom.value.online) {
    ElMessage.warning('房间离线')
    return
  }
  const room = selectedRoom.value
  if (room.needPassword) {
    try {
      const { value } = await ElMessageBox.prompt('请输入房间密码', '房间密码', {
        confirmButtonText: '进入',
        cancelButtonText: '取消',
        inputType: 'password',
      })
      const pw = String(value || '').trim()
      if (!pw) return
      sessionStorage.setItem(`online_room_pw_${room.roomId}`, pw)
    } catch {
      return
    }
  } else {
    sessionStorage.removeItem(`online_room_pw_${room.roomId}`)
  }
  router.push({ path: '/online/room', query: { room: room.roomId, assetKey: selected.value.assetKey } })
}

function formatCapacity(r: OnlineRoomCard): string {
  if (Number(r.capacity || 0) <= 0) return '不限制'
  return `${r.onlineCount}/${r.capacity}`
}

function permLabel(p: OnlineRoomCard['permission']): string {
  if (p === 'ADMIN_ONLY') return '仅管理员'
  if (p === 'PASSWORD') return '密码'
  if (p === 'WHITELIST') return '白名单'
  return '公开'
}

function openCreate(): void {
  createVisible.value = true
  createRoomId.value = ''
  createRoomName.value = ''
  createPermission.value = 'PUBLIC'
  createCapacity.value = 10
  createPassword.value = ''
  createWhitelist.value = ''
}

async function submitCreate(): Promise<void> {
  if (!auth.isAdmin) {
    ElMessage.warning('仅管理员可创建房间')
    return
  }
  const id = String(createRoomId.value || '').trim()
  if (!id) {
    ElMessage.warning('请输入房间ID')
    return
  }
  if (createPermission.value === 'PASSWORD' && !String(createPassword.value || '').trim()) {
    ElMessage.warning('请输入房间密码')
    return
  }
  creating.value = true
  try {
    const wlRaw = String(createWhitelist.value || '').trim()
    const whitelistUserIds = wlRaw
      ? wlRaw
          .split(/[^0-9]+/g)
          .map((x) => Number(x))
          .filter((x) => Number.isFinite(x) && x > 0)
      : undefined
    await createOnlineRoom({
      roomId: id,
      name: String(createRoomName.value || '').trim() || id,
      permission: createPermission.value,
      capacity: Number(createCapacity.value || 0),
      password: createPermission.value === 'PASSWORD' ? String(createPassword.value || '').trim() : undefined,
      whitelistUserIds: createPermission.value === 'WHITELIST' ? whitelistUserIds : undefined,
      online: true,
    })
    ElMessage.success('创建成功')
    createVisible.value = false
    await loadRooms()
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

async function toggleRoomOnline(r: OnlineRoomCard): Promise<void> {
  if (!auth.isAdmin) return
  try {
    if (r.online) await setOnlineRoomOffline(r.roomId)
    else await setOnlineRoomOnline(r.roomId)
    await loadRooms()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

onMounted(() => {
  void loadList()
  void loadRooms()
  startRoomPing()
})

onBeforeUnmount(() => {
  stopRoomPing()
})
</script>

<template>
  <div class="min-h-screen bg-[#0b1220] relative">
    <button
      class="fixed right-6 top-6 z-20 px-4 h-10 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100 cursor-pointer"
      @click="router.push('/home')"
    >
      返回主页
    </button>
    <div class="mx-auto max-w-6xl px-6 py-10">
      <div class="flex items-end justify-between gap-6">
        <div>
          <h1 class="text-white text-2xl font-semibold">联机功能</h1>
          <p class="mt-2 text-gray-400">先选择小人，再选择房间进入</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="text-gray-300 text-sm">延迟</div>
          <div class="h-10 px-3 flex items-center rounded-lg bg-white/5 border border-white/10 text-gray-100">
            {{ roomPing === null ? '-' : `${roomPing}ms` }}
          </div>
          <button
            v-if="auth.isAdmin"
            class="h-10 px-4 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-100 cursor-pointer"
            @click="openCreate"
          >
            创建房间
          </button>
        </div>
      </div>

      <div v-if="loading" class="mt-8 text-gray-400">加载中…</div>

      <div v-else class="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <button
          v-for="item in grid"
          :key="item.assetKey"
          class="text-left rounded-xl border bg-white/5 hover:bg-white/8 transition cursor-pointer overflow-hidden relative"
          :class="selected?.assetKey === item.assetKey ? 'border-cyan-400/60 ring-2 ring-cyan-400/20' : 'border-white/10'"
          @click="pick(item)"
        >
          <div
            v-if="selected?.assetKey === item.assetKey"
            class="absolute left-2 top-2 z-10 text-xs px-2 py-1 rounded-md border border-cyan-400/40 text-cyan-100 bg-cyan-500/15"
          >
            已选择
          </div>
          <div class="h-40 w-full bg-black/20">
            <SpinePixiPlayer :skel-url="apiUrl(item.skelUrl)" fit="contain" />
          </div>
          <div class="px-4 py-3">
            <div class="text-gray-100 font-semibold truncate">{{ item.name || item.assetKey }}</div>
            <div class="text-gray-500 text-xs truncate">{{ item.assetKey }}</div>
          </div>
        </button>
      </div>

      <div class="mt-10">
        <div class="flex items-center justify-between">
          <div class="text-white text-lg font-semibold">房间列表</div>
          <button
            class="h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100 cursor-pointer"
            @click="loadRooms"
          >
            刷新
          </button>
        </div>

        <div v-if="roomLoading" class="mt-4 text-gray-400">加载中…</div>
        <div v-else class="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            v-for="r in rooms"
            :key="r.roomId"
            class="text-left rounded-xl border bg-white/5 hover:bg-white/8 transition cursor-pointer overflow-hidden"
            :class="selectedRoom?.roomId === r.roomId ? 'border-cyan-400/60' : 'border-white/10'"
            @click="selectedRoom = r"
          >
            <div class="px-4 py-3">
              <div class="flex items-center justify-between gap-3">
                <div class="text-gray-100 font-semibold truncate">{{ r.name || r.roomId }}</div>
                <div
                  class="text-xs px-2 py-1 rounded-md border"
                  :class="r.online ? 'border-emerald-400/40 text-emerald-200 bg-emerald-500/10' : 'border-gray-500/40 text-gray-200 bg-white/5'"
                >
                  {{ r.online ? '在线' : '离线' }}
                </div>
              </div>
              <div class="mt-1 text-xs text-gray-400 truncate">ID：{{ r.roomId }}</div>
              <div class="mt-3 flex items-center justify-between text-sm">
                <div class="text-gray-200">{{ permLabel(r.permission) }}</div>
                <div class="text-gray-200">{{ formatCapacity(r) }}</div>
              </div>
              <div class="mt-2 text-xs text-gray-400">延迟：{{ roomPing === null ? '-' : `${roomPing}ms` }}</div>
              <div class="mt-2 text-xs text-gray-400">
                {{ r.canEnter ? '可进入' : r.denyReason || '不可进入' }}
              </div>

              <div v-if="auth.isAdmin" class="mt-3 flex items-center gap-2">
                <button
                  class="h-8 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100 cursor-pointer"
                  type="button"
                  @click.stop="toggleRoomOnline(r)"
                >
                  {{ r.online ? '下线' : '上线' }}
                </button>
              </div>
            </div>
          </button>
        </div>

        <div class="mt-6 flex justify-end">
          <button
            class="h-10 px-6 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-100 cursor-pointer"
            @click="enterRoom"
          >
            进入房间
          </button>
        </div>
      </div>
    </div>

    <div v-if="createVisible" class="fixed inset-0 z-30 bg-black/60 flex items-center justify-center p-6">
      <div class="w-full max-w-md rounded-xl border border-white/10 bg-[#0b1220] p-5 text-gray-100">
        <div class="flex items-center justify-between">
          <div class="text-lg font-semibold">创建房间</div>
          <button
            class="h-8 w-8 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer"
            @click="createVisible = false"
          >
            ×
          </button>
        </div>

        <div class="mt-4 space-y-3">
          <div>
            <div class="text-sm text-gray-300">房间ID</div>
            <input
              v-model="createRoomId"
              class="mt-1 h-10 w-full px-3 rounded-lg bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-cyan-400/60"
              placeholder="例如 lobby2"
            />
          </div>
          <div>
            <div class="text-sm text-gray-300">房间名称</div>
            <input
              v-model="createRoomName"
              class="mt-1 h-10 w-full px-3 rounded-lg bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-cyan-400/60"
              placeholder="显示名称"
            />
          </div>
          <div>
            <div class="text-sm text-gray-300">权限</div>
            <select
              v-model="createPermission"
              class="mt-1 h-10 w-full px-3 rounded-lg bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-cyan-400/60"
            >
              <option value="PUBLIC">公开</option>
              <option value="ADMIN_ONLY">仅管理员</option>
              <option value="PASSWORD">密码</option>
              <option value="WHITELIST">白名单</option>
            </select>
          </div>
          <div>
            <div class="text-sm text-gray-300">人数限制（0=不限制）</div>
            <input
              v-model.number="createCapacity"
              type="number"
              class="mt-1 h-10 w-full px-3 rounded-lg bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-cyan-400/60"
              placeholder="0"
            />
          </div>
          <div v-if="createPermission === 'PASSWORD'">
            <div class="text-sm text-gray-300">房间密码</div>
            <input
              v-model="createPassword"
              class="mt-1 h-10 w-full px-3 rounded-lg bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-cyan-400/60"
              placeholder="密码"
            />
          </div>
          <div v-if="createPermission === 'WHITELIST'">
            <div class="text-sm text-gray-300">白名单用户ID（用逗号/空格分隔）</div>
            <input
              v-model="createWhitelist"
              class="mt-1 h-10 w-full px-3 rounded-lg bg-white/5 border border-white/10 text-gray-100 outline-none focus:border-cyan-400/60"
              placeholder="例如 2,3,5"
            />
          </div>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button
            class="h-10 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100 cursor-pointer"
            @click="createVisible = false"
          >
            取消
          </button>
          <button
            class="h-10 px-4 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-100 cursor-pointer disabled:opacity-50"
            :disabled="creating"
            @click="submitCreate"
          >
            {{ creating ? '创建中…' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
