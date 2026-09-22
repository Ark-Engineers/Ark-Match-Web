<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  closeRace,
  createRace,
  getRaceCatalog,
  getRaceDetail,
  listActiveRaces,
  updateRaceDurations,
  verifyRaceRound,
  type RaceAdminDetail,
  type RaceAdminRow,
  type RaceAssetOption,
  type RaceDurations,
  type RaceRoundInfo,
  type RaceVerifyResult
} from '@/api/race'
import { listOnlineRooms, type OnlineRoomCard } from '@/api/online'
import { useAuthStore } from '@/stores/auth'
import RaceDeveloperConsole from './RaceDeveloperConsole.vue'

const auth = useAuthStore()
const router = useRouter()
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
const loading = ref(false)
const rows = ref<RaceAdminRow[]>([])
const rooms = ref<OnlineRoomCard[]>([])
const catalog = ref<RaceAssetOption[]>([])

const phaseLabel = (s: string | null | undefined): string => {
  const v = String(s || '')
  if (v === 'BETTING') return '竞猜中'
  if (v === 'RACING') return '比赛中'
  if (v === 'PODIUM') return '颁奖中'
  if (v === 'FINISHED') return '已结束'
  return '-'
}

const sessionLabel = (t: number | null | undefined): string => {
  const v = Number(t || 1)
  if (v === 1) return '一次性'
  if (v === 2) return '限定场次'
  return '无限循环'
}

const fmtTime = (ms: number | null | undefined): string => {
  if (!ms) return '-'
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

async function loadRows(): Promise<void> {
  loading.value = true
  try {
    rows.value = await listActiveRaces()
  } catch (e: any) {
    ElMessage.error(String(e?.message || '加载失败'))
  } finally {
    loading.value = false
  }
}

async function loadBase(): Promise<void> {
  try {
    const [r, c] = await Promise.all([listOnlineRooms(), getRaceCatalog()])
    rooms.value = r
    catalog.value = c
  } catch {}
}

onMounted(() => {
  void loadRows()
  void loadBase()
  clock = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => clearInterval(clock))

const durationFields = [
  { key: 'betDurationSeconds', label: '竞猜', min: 1 },
  { key: 'preRaceDurationSeconds', label: '预备', min: 0 },
  { key: 'raceDurationSeconds', label: '比赛', min: 1 },
  { key: 'podiumDurationSeconds', label: '颁奖', min: 1 }
] as const
const defaultDurations: RaceDurations = {
  betDurationSeconds: 120,
  preRaceDurationSeconds: 30,
  raceDurationSeconds: 60,
  podiumDurationSeconds: 60
}

function durationError(values: RaceDurations): string {
  for (const field of durationFields) {
    const value = values[field.key]
    if (!Number.isInteger(value) || value < field.min || value > 86400) {
      return `${field.label}时长须为 ${field.min}–86400 秒的整数`
    }
  }
  return ''
}

const durationsVisible = ref(false)
const durationsLoading = ref(false)
const durationsRow = ref<RaceAdminRow | null>(null)
const durationsError = ref('')
const durationsForm = reactive({ ...defaultDurations })
const durationsApplyNow = computed(() => {
  const round = durationsRow.value?.round
  return !!round && round.status === 'BETTING' && now.value < round.betEndAt
})
const durationsHaveNext = computed(() => {
  const row = durationsRow.value
  return !!row?.round && (row.race.sessionType === 3
    || (row.race.sessionType === 2 && row.round.roundNo < row.race.totalRounds))
})
const durationsCanSave = computed(() => durationsApplyNow.value || durationsHaveNext.value)
const durationsApplyMessage = computed(() => {
  if (durationsApplyNow.value) {
    return '投注尚未截止：更新默认时长，并应用于本场。竞猜开始时间不变，新截止时间为开始时间 + 竞猜时长，且必须晚于当前时间。'
  }
  return durationsHaveNext.value
    ? '投注已截止：仅更新默认时长，从下一场起生效。本场各阶段及正在进行的比赛不受影响。'
    : '投注已截止，且没有剩余场次，不能修改阶段时长。'
})

function openDurations(row: RaceAdminRow): void {
  if (!row.round) return
  durationsRow.value = { ...row, race: { ...row.race }, round: { ...row.round } }
  for (const field of durationFields) durationsForm[field.key] = row.race[field.key]
  durationsError.value = ''
  now.value = Date.now()
  durationsVisible.value = true
}

async function saveDurations(): Promise<void> {
  const row = durationsRow.value
  if (!row?.round || durationsLoading.value) return
  durationsError.value = durationError(durationsForm)
  if (durationsError.value) return
  now.value = Date.now()
  if (!durationsCanSave.value) {
    durationsError.value = '投注已截止，且没有剩余场次；请刷新列表并重新打开设置'
    return
  }
  if (durationsApplyNow.value && row.round.betStartAt + durationsForm.betDurationSeconds * 1000 <= now.value) {
    durationsError.value = '新投注截止时间须晚于当前时间，请增加竞猜时长'
    return
  }
  durationsLoading.value = true
  try {
    await updateRaceDurations(row.race.id, {
      roundId: row.round.id,
      expectedStatus: row.round.status,
      ...durationsForm
    })
    durationsVisible.value = false
    ElMessage.success('阶段时长已更新')
    await loadRows()
  } catch (e: unknown) {
    durationsError.value = `${e instanceof Error ? e.message : '修改失败'}；请刷新列表并重新打开设置`
    await loadRows()
  } finally {
    durationsLoading.value = false
  }
}

const enteringRaceId = ref<number | null>(null)

async function enterRace(row: RaceAdminRow): Promise<void> {
  if (enteringRaceId.value !== null) return
  enteringRaceId.value = row.race.id
  try {
    rooms.value = await listOnlineRooms()
    if (router.currentRoute.value.name !== 'admin-race') return
    const room = rooms.value.find((item) => item.roomId === row.race.roomId)
    if (!room || !room.online || !room.canEnter) {
      ElMessage.warning(room?.denyReason || '房间离线或不可进入，请刷新后重试')
      return
    }
    if (room.needPassword) {
      try {
        const { value } = await ElMessageBox.prompt('请输入房间密码', '房间密码', {
          confirmButtonText: '进入', cancelButtonText: '取消', inputType: 'password'
        })
        const password = String(value || '').trim()
        if (!password) return
        sessionStorage.setItem(`online_room_pw_${room.roomId}`, password)
      } catch {
        return
      }
    } else {
      sessionStorage.removeItem(`online_room_pw_${room.roomId}`)
    }
    if (router.currentRoute.value.name !== 'admin-race') return
    await router.push({ name: 'online-room', query: { room: room.roomId, race: '1', randomAvatar: '1' } })
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '进入房间失败')
  } finally {
    enteringRaceId.value = null
  }
}

// ---------- 创建 ----------
const createVisible = ref(false)
const createLoading = ref(false)
const createError = ref('')
const createForm = reactive({
  ...defaultDurations,
  roomId: '',
  name: '',
  sessionType: 1,
  totalRounds: 1,
  participantMode: 1,
  selectedIds: [] as number[],
  betStartAt: null as string | null
})

const selectedIdsSet = computed(() => new Set(createForm.selectedIds))
const isLoop = computed(() => createForm.sessionType === 3)

function openCreate(): void {
  Object.assign(createForm, defaultDurations)
  createError.value = ''
  createForm.roomId = ''
  createForm.name = ''
  createForm.sessionType = 1
  createForm.totalRounds = 1
  createForm.participantMode = 1
  createForm.selectedIds = []
  createForm.betStartAt = null
  createVisible.value = true
}

function toggleAsset(id: number): void {
  const set = selectedIdsSet.value
  if (set.has(id)) {
    createForm.selectedIds = createForm.selectedIds.filter((x) => x !== id)
  } else {
    if (createForm.selectedIds.length >= 5) {
      ElMessage.warning('最多选择 5 名参赛对象')
      return
    }
    createForm.selectedIds = [...createForm.selectedIds, id]
  }
}

async function submitCreate(): Promise<void> {
  if (createLoading.value) return
  createError.value = durationError(createForm)
  if (createError.value) return
  if (!createForm.roomId) {
    ElMessage.warning('请选择房间')
    return
  }
  const start = createForm.betStartAt ? new Date(createForm.betStartAt).getTime() : 0
  if (!isLoop.value) {
    if (!start) {
      ElMessage.warning('请选择竞猜开始时间')
      return
    }
    if (start <= Date.now()) {
      ElMessage.warning('竞猜开始时间必须晚于当前时间')
      return
    }
  }
  if (createForm.sessionType === 2 && (createForm.totalRounds < 1 || createForm.totalRounds > 100)) {
    ElMessage.warning('限定场次数量须在 1-100 之间')
    return
  }
  if (createForm.participantMode === 1 && createForm.selectedIds.length !== 5) {
    ElMessage.warning('手动选择模式必须选择 5 名参赛对象')
    return
  }
  createLoading.value = true
  try {
    await createRace({
      roomId: createForm.roomId,
      name: createForm.name.trim() || undefined,
      sessionType: createForm.sessionType,
      totalRounds: createForm.sessionType === 2 ? createForm.totalRounds : null,
      participantMode: createForm.participantMode,
      participantAssetIds: createForm.participantMode === 1 ? createForm.selectedIds : null,
      betStartAtMs: isLoop.value ? undefined : start,
      betDurationSeconds: createForm.betDurationSeconds,
      preRaceDurationSeconds: createForm.preRaceDurationSeconds,
      raceDurationSeconds: createForm.raceDurationSeconds,
      podiumDurationSeconds: createForm.podiumDurationSeconds
    })
    ElMessage.success('赛马模式创建成功')
    createVisible.value = false
    void loadRows()
  } catch (e: unknown) {
    createError.value = e instanceof Error ? e.message : '创建失败，请重试'
  } finally {
    createLoading.value = false
  }
}

async function doClose(row: RaceAdminRow): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认关闭房间「${row.race.roomId}」的赛马模式？所有未结算下注将原路退款。`,
      '关闭赛马模式',
      { type: 'warning', confirmButtonText: '关闭', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    await closeRace(row.race.id)
    ElMessage.success('已关闭')
    void loadRows()
  } catch (e: any) {
    ElMessage.error(String(e?.message || '关闭失败'))
  }
}

// ---------- 详情 ----------
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<RaceAdminDetail | null>(null)
const verifyLoading = ref<number | null>(null)
const verifyResults = reactive<Record<number, RaceVerifyResult>>({})

async function openDetail(row: RaceAdminRow): Promise<void> {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  for (const k of Object.keys(verifyResults)) delete verifyResults[Number(k)]
  try {
    detail.value = await getRaceDetail(row.race.id)
  } catch (e: any) {
    ElMessage.error(String(e?.message || '加载失败'))
  } finally {
    detailLoading.value = false
  }
}

async function doVerify(roundId: number): Promise<void> {
  if (verifyLoading.value !== null) return
  verifyLoading.value = roundId
  try {
    const r = await verifyRaceRound(roundId)
    verifyResults[roundId] = r
    if (r.ok) ElMessage.success('校验通过：账目一致')
    else ElMessage.warning(`校验未通过：${r.problems.join('；')}`)
  } catch (e: any) {
    ElMessage.error(String(e?.message || '校验失败'))
  } finally {
    verifyLoading.value = null
  }
}

const typeLabel = (t: number | null | undefined): string => (Number(t) === 3 ? 'BOSS' : '敌人')
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px">
      <div style="font-size: 16px; font-weight: 600">赛马竞猜管理</div>
      <div style="display: flex; gap: 8px">
        <el-button :loading="loading" @click="loadRows">刷新</el-button>
        <el-button type="primary" @click="openCreate">创建赛马模式</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column prop="race.id" label="ID" width="70" />
      <el-table-column prop="race.roomId" label="房间" width="140" />
      <el-table-column label="名称" min-width="140">
        <template #default="{ row }">{{ row.race.name || '-' }}</template>
      </el-table-column>
      <el-table-column label="场次类型" width="100">
        <template #default="{ row }">{{ sessionLabel(row.race.sessionType) }}</template>
      </el-table-column>
      <el-table-column label="参赛数" width="80">
        <template #default="{ row }">{{ row.participantCount }}/5</template>
      </el-table-column>
      <el-table-column label="当前轮次" width="90">
        <template #default="{ row }">{{ row.round?.roundNo ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="阶段" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.round?.status === 'BETTING' ? 'success' : row.round?.status === 'RACING' ? 'warning' : 'info'">
            {{ phaseLabel(row.round?.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="奖池" width="120">
        <template #default="{ row }">{{ (row.round?.totalPool ?? 0).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="投注截止" width="170">
        <template #default="{ row }">{{ fmtTime(row.round?.betEndAt) }}</template>
      </el-table-column>
      <el-table-column label="颁奖时长" width="100">
        <template #default="{ row }">{{ row.round ? `${row.round.podiumDurationSeconds} 秒` : '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <div class="race-actions">
            <el-button size="small" type="primary" plain :loading="enteringRaceId === row.race.id"
              :disabled="enteringRaceId !== null && enteringRaceId !== row.race.id" @click="enterRace(row)">进入赛马</el-button>
            <el-button size="small" :disabled="!['BETTING', 'RACING', 'PODIUM'].includes(row.round?.status)" @click="openDurations(row)">阶段时长</el-button>
            <el-button size="small" @click="openDetail(row)">详情</el-button>
            <RaceDeveloperConsole v-if="auth.isSuperAdmin" :key="row.race.id" :race-id="row.race.id" @changed="loadRows" />
            <el-button size="small" type="danger" plain @click="doClose(row)">关闭</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="durationsVisible" title="阶段时长" width="min(580px, calc(100vw - 24px))"
      :close-on-click-modal="!durationsLoading" :close-on-press-escape="!durationsLoading" :show-close="!durationsLoading">
      <template v-if="durationsRow?.round">
        <p class="time-help">第 {{ durationsRow.round.roundNo }} 场 · {{ phaseLabel(durationsRow.round.status) }}，以下预填赛马模式的默认时长。</p>
        <el-form label-position="top" :disabled="durationsLoading || !durationsCanSave">
          <div class="duration-grid">
            <el-form-item v-for="field in durationFields" :key="field.key" :label="`${field.label}（秒）`" :for="`edit-${field.key}`">
              <el-input-number :id="`edit-${field.key}`" v-model="durationsForm[field.key]"
                :min="field.min" :max="86400" :step="1" controls-position="right" />
            </el-form-item>
          </div>
        </el-form>
        <p class="time-help">单位为整数秒；预备允许为 0，投注截止后立即开赛。其余阶段最少 1 秒，所有阶段最多 86400 秒。</p>
        <el-alert :title="durationsApplyMessage" :type="durationsCanSave ? 'info' : 'warning'" :closable="false" show-icon />
        <p class="time-help">若提交时投注已截止，仅下一场生效；没有下一场时拒绝修改。最终以服务端校验为准。</p>
        <el-alert v-if="durationsError" :title="durationsError" type="error" :closable="false" show-icon />
      </template>
      <template #footer>
        <el-button :disabled="durationsLoading" @click="durationsVisible = false">取消</el-button>
        <el-button type="primary" :loading="durationsLoading" :disabled="!durationsCanSave" @click="saveDurations">保存时长</el-button>
      </template>
    </el-dialog>

    <!-- 创建对话框 -->
    <el-dialog v-model="createVisible" title="创建赛马模式" width="min(680px, calc(100vw - 24px))"
      :close-on-click-modal="!createLoading" :close-on-press-escape="!createLoading" :show-close="!createLoading">
      <el-form label-width="120px" :disabled="createLoading">
        <el-form-item label="房间">
          <el-select v-model="createForm.roomId" placeholder="选择房间" style="width: 100%" filterable>
            <el-option v-for="r in rooms" :key="r.roomId" :label="`${r.name || r.roomId} (${r.roomId})`" :value="r.roomId" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="createForm.name" placeholder="可选，展示用名称" clearable />
        </el-form-item>
        <el-form-item label="场次类型">
          <el-radio-group v-model="createForm.sessionType">
            <el-radio :value="1">一次性</el-radio>
            <el-radio :value="2">限定场次</el-radio>
            <el-radio :value="3">无限循环</el-radio>
          </el-radio-group>
          <el-input-number
            v-if="createForm.sessionType === 2"
            v-model="createForm.totalRounds"
            :min="1"
            :max="100"
            style="margin-left: 12px"
          />
        </el-form-item>
        <el-form-item label="参赛对象">
          <el-radio-group v-model="createForm.participantMode">
            <el-radio :value="1">手动选择</el-radio>
            <el-radio :value="2">随机生成</el-radio>
          </el-radio-group>
          <div v-if="createForm.participantMode === 1" style="margin-top: 8px; width: 100%">
            <div style="margin-bottom: 4px; font-size: 12px; opacity: 0.7">
              已选 {{ createForm.selectedIds.length }}/5（敌人/Boss 均可；同一对象不可重复；全部场次沿用所选阵容）
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 180px; overflow-y: auto">
              <button
                v-for="a in catalog"
                :key="a.id"
                type="button"
                :style="{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  border: selectedIdsSet.has(a.id) ? '1px solid #409eff' : '1px solid #dcdfe6',
                  background: selectedIdsSet.has(a.id) ? '#ecf5ff' : '#fff',
                  color: selectedIdsSet.has(a.id) ? '#409eff' : '#606266'
                }"
                @click="toggleAsset(a.id)"
              >
                {{ a.name || a.assetKey }}（{{ typeLabel(a.type) }}）
              </button>
            </div>
          </div>
        </el-form-item>
        <el-form-item v-if="!isLoop" label="竞猜开始">
          <el-date-picker
            v-model="createForm.betStartAt"
            type="datetime"
            placeholder="竞猜开始时间"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="阶段时长">
          <div class="duration-grid">
            <label v-for="field in durationFields" :key="field.key" class="duration-field" :for="`create-${field.key}`">
              <span>{{ field.label }}（秒）</span>
              <el-input-number :id="`create-${field.key}`" v-model="createForm[field.key]"
                :min="field.min" :max="86400" :step="1" controls-position="right" />
            </label>
          </div>
          <p class="time-help">单位为整数秒；预备可为 0（投注截止后立即开赛），其余阶段最少 1 秒；每项最多 86400 秒。</p>
        </el-form-item>
        <el-form-item>
          <p class="time-help">
            <template v-if="isLoop">无限循环创建后立即开始。</template>
            每轮独立保存阶段时长；创建后可通过「阶段时长」按钮调整。
          </p>
          <el-alert v-if="createError" :title="createError" type="error" :closable="false" show-icon />
          <el-button type="primary" :loading="createLoading" @click="submitCreate">创建</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailVisible" title="赛马模式详情" width="860px">
      <div v-loading="detailLoading">
        <template v-if="detail">
          <div style="margin-bottom: 12px; display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px">
            <span>房间：{{ detail.race.roomId }}</span>
            <span>名称：{{ detail.race.name || '-' }}</span>
            <span>状态：{{ detail.race.status }}</span>
            <span>场次：{{ sessionLabel(detail.race.sessionType) }}</span>
            <span v-for="field in durationFields" :key="field.key">默认{{ field.label }}：{{ detail.race[field.key] }} 秒</span>
          </div>
          <div style="margin-bottom: 4px; font-size: 13px; font-weight: 600">当前参赛对象</div>
          <el-table :data="detail.participants" border size="small" style="margin-bottom: 12px">
            <el-table-column prop="sortNo" label="道次" width="70" />
            <el-table-column prop="name" label="名称" min-width="140">
              <template #default="{ row }">{{ row.name || row.assetKey }}</template>
            </el-table-column>
            <el-table-column prop="assetKey" label="资源Key" min-width="120" />
            <el-table-column label="类型" width="80">
              <template #default="{ row }">{{ typeLabel(row.type) }}</template>
            </el-table-column>
          </el-table>
          <div style="margin-bottom: 4px; font-size: 13px; font-weight: 600">轮次（展开查看本轮名单与名次）</div>
          <el-table :data="detail.rounds" border size="small" row-key="id">
            <el-table-column type="expand">
              <template #default="{ row: raceRound }">
                <p class="time-help" style="padding: 8px 24px">
                  本轮时长快照：<span v-for="field in durationFields" :key="field.key" style="margin-right: 12px">{{ field.label }} {{ raceRound[field.key] }} 秒</span>
                </p>
                <el-table :data="detail.roundParticipants[raceRound.id]" size="small" style="padding: 8px 24px">
                  <el-table-column prop="sortNo" label="道次" width="70" />
                  <el-table-column label="参赛对象" min-width="160">
                    <template #default="{ row }">{{ row.name || row.assetKey }}</template>
                  </el-table-column>
                  <el-table-column prop="assetKey" label="资源Key" min-width="140" />
                  <el-table-column label="最终名次" width="100">
                    <template #default="{ row }">
                      {{ raceRound.ranking?.includes(row.id) ? raceRound.ranking.indexOf(row.id) + 1 : '-' }}
                    </template>
                  </el-table-column>
                </el-table>
              </template>
            </el-table-column>
            <el-table-column prop="roundNo" label="轮次" width="70" />
            <el-table-column label="阶段" width="90">
              <template #default="{ row }">{{ phaseLabel(row.status) }}</template>
            </el-table-column>
            <el-table-column label="竞猜开始" width="170">
              <template #default="{ row }">{{ fmtTime(row.betStartAt) }}</template>
            </el-table-column>
            <el-table-column label="竞猜结束" width="170">
              <template #default="{ row }">{{ fmtTime(row.betEndAt) }}</template>
            </el-table-column>
            <el-table-column label="开赛" width="170">
              <template #default="{ row }">{{ fmtTime(row.raceStartAt) }}</template>
            </el-table-column>
            <el-table-column label="颁奖结束" width="170">
              <template #default="{ row }">{{ fmtTime(row.podiumEndAt) }}</template>
            </el-table-column>
            <el-table-column label="奖池" width="100">
              <template #default="{ row }">{{ row.totalPool.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="betCount" label="注数" width="70" />
            <el-table-column label="已发放" width="100">
              <template #default="{ row }">{{ row.paidTotal.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="校验" width="130">
              <template #default="{ row }">
                <el-button
                  size="small"
                  :loading="verifyLoading === row.id"
                  @click="doVerify(row.id)"
                >
                  台账校验
                </el-button>
                <div v-if="verifyResults[row.id]" style="font-size: 11px; margin-top: 4px" :style="{ color: verifyResults[row.id]?.ok ? '#67c23a' : '#f56c6c' }">
                  {{ verifyResults[row.id]?.ok ? '一致' : '不一致' }}
                </div>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.duration-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));
  gap: 12px;
  width: 100%;
}
.duration-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.5;
}
.duration-grid :deep(.el-input-number) {
  width: 100%;
}
.race-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.race-actions :deep(.el-button) {
  margin-left: 0;
}
.time-help {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.el-form-item .time-help {
  margin: 6px 0 0;
}
</style>
