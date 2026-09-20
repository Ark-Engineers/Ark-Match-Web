<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  closeRace,
  createRace,
  getRaceCatalog,
  getRaceDetail,
  listActiveRaces,
  verifyRaceRound,
  type RaceAdminDetail,
  type RaceAdminRow,
  type RaceAssetOption,
  type RaceVerifyResult
} from '@/api/race'
import { listOnlineRooms, type OnlineRoomCard } from '@/api/online'

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
})

// ---------- 创建 ----------
const createVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive({
  roomId: '',
  name: '',
  sessionType: 1,
  totalRounds: 1,
  participantMode: 1,
  selectedIds: [] as number[],
  betStartAt: null as string | null,
  betEndAt: null as string | null
})

const selectedIdsSet = computed(() => new Set(createForm.selectedIds))
const isLoop = computed(() => createForm.sessionType === 3)

function openCreate(): void {
  createForm.roomId = ''
  createForm.name = ''
  createForm.sessionType = 1
  createForm.totalRounds = 1
  createForm.participantMode = 1
  createForm.selectedIds = []
  createForm.betStartAt = null
  createForm.betEndAt = null
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
  if (!createForm.roomId) {
    ElMessage.warning('请选择房间')
    return
  }
  const start = createForm.betStartAt ? new Date(createForm.betStartAt).getTime() : 0
  const end = createForm.betEndAt ? new Date(createForm.betEndAt).getTime() : 0
  if (!isLoop.value) {
    if (!start || !end) {
      ElMessage.warning('请选择竞猜开始与结束时间')
      return
    }
    if (start <= Date.now()) {
      ElMessage.warning('竞猜开始时间必须晚于当前时间')
      return
    }
    if (end - start < 60_000) {
      ElMessage.warning('竞猜开始与结束时间间隔不得低于 60 秒')
      return
    }
  }
  if (createForm.sessionType === 2 && (createForm.totalRounds < 1 || createForm.totalRounds > 100)) {
    ElMessage.warning('限定场次数量须在 1-100 之间')
    return
  }
  if (createForm.participantMode === 1 && createForm.selectedIds.length !== 5) {
    ElMessage.warning('手动模式必须选择 5 名参赛对象')
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
      betEndAtMs: isLoop.value ? undefined : end
    })
    ElMessage.success('赛马模式创建成功')
    createVisible.value = false
    void loadRows()
  } catch (e: any) {
    ElMessage.error(String(e?.message || '创建失败'))
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
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDetail(row)">详情</el-button>
          <el-button size="small" type="danger" @click="doClose(row)">关闭</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建对话框 -->
    <el-dialog v-model="createVisible" title="创建赛马模式" width="680px">
      <el-form label-width="120px">
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
            <el-radio :value="2">随机自动</el-radio>
          </el-radio-group>
          <div v-if="createForm.participantMode === 1" style="margin-top: 8px; width: 100%">
            <div style="margin-bottom: 4px; font-size: 12px; opacity: 0.7">
              已选 {{ createForm.selectedIds.length }}/5（敌人/Boss 均可；同一对象不可重复）
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
        <el-form-item v-if="!isLoop" label="竞猜结束">
          <el-date-picker
            v-model="createForm.betEndAt"
            type="datetime"
            placeholder="竞猜结束时间（与开始间隔 ≥60 秒）"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="createLoading" @click="submitCreate">创建</el-button>
          <span style="margin-left: 12px; font-size: 12px; opacity: 0.7">
            <template v-if="isLoop">无限循环：创建后立即开始，单轮竞猜周期 120 秒；开赛前 30 秒自动关闭投注</template>
            <template v-else>默认单轮竞猜周期为起止间隔；开赛前 30 秒自动关闭投注</template>
          </span>
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
            <span>竞猜周期：{{ detail.race.betDurationSeconds }} 秒</span>
          </div>
          <div style="margin-bottom: 4px; font-size: 13px; font-weight: 600">参赛对象</div>
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
          <div style="margin-bottom: 4px; font-size: 13px; font-weight: 600">轮次</div>
          <el-table :data="detail.rounds" border size="small">
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
