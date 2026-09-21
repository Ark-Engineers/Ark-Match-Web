<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  endRaceDeveloperRound,
  getRaceCatalog,
  getRaceDeveloperState,
  setRaceDeveloperNextParticipants,
  setRaceDeveloperRanking,
  startRaceDeveloperRound,
  type RaceAssetOption,
  type RaceDeveloperState,
  type RaceParticipantInfo
} from '@/api/race'
import SpinePixiPlayer from '@/components/SpinePixiPlayer.vue'
import { API_BASE_URL } from '@/config'
import { http } from '@/api'

type ApiResponse<T> = { code: number; message: string; data: T }

const props = defineProps<{ raceId: number }>()
const emit = defineEmits<{ changed: [] }>()

type Action = 'start' | 'ranking' | 'next' | 'clearNext' | 'end'
type Context = { generation: number; raceId: number }

const visible = ref(false)
// 从加载、二次确认到提交后的刷新共用一把锁。
const busy = ref(false)
const activeAction = ref<Action | null>(null)
const state = ref<RaceDeveloperState | null>(null)
const catalog = ref<RaceAssetOption[]>([])
const loadError = ref('')
const catalogError = ref('')
const actionError = ref('')
const rankingIds = ref<number[]>([])
const nextAssetIds = ref<Array<number | undefined>>(Array.from({ length: 5 }))
const now = ref(Date.now())
let generation = 0
let disposed = false
let clock: ReturnType<typeof setInterval> | undefined

const round = computed(() => state.value?.round ?? null)
const participants = computed(() =>
  [...(state.value?.participants ?? [])].sort((a, b) => a.sortNo - b.sortNo)
)
const savedNext = computed(() =>
  [...(state.value?.nextParticipants ?? [])].sort((a, b) => a.sortNo - b.sortNo)
)
const rankingParticipants = computed(() =>
  rankingIds.value
    .map((id) => participants.value.find((p) => p.id === id))
    .filter((p): p is RaceParticipantInfo => Boolean(p))
)
const canRank = computed(() => round.value?.status === 'BETTING' && round.value.betCount === 0)
const canStart = computed(() => {
  const r = round.value
  return Boolean(r && state.value?.race.status === 'ACTIVE'
    && (r.status === 'BETTING' || (r.status === 'RACING' && r.raceStartAt > now.value)))
})
const canEnd = computed(() => ['RACING', 'PODIUM'].includes(round.value?.status ?? ''))
const canScheduleNext = computed(() => Boolean(round.value && state.value?.canScheduleNext))
const rankingValid = computed(() => Boolean(state.value && fullRanking(rankingIds.value, state.value)))
const nextValid = computed(() => validAssets(nextAssetIds.value))
const savedRanking = computed(() => {
  const ids = state.value?.plannedRanking ?? round.value?.ranking
  if (!ids?.length) return '尚无已保存名次（编辑区默认按道次排列，不代表比赛结果）'
  return ids.map((id, index) => {
    const p = participants.value.find((item) => item.id === id)
    return `${index + 1}. ${p ? participantName(p) : `角色 #${id}`}`
  }).join(' → ')
})

// 参赛者实时预览（与明日方舟小人管理页一致：动画/缩放可修改并保存到 spine_asset 配置）
const previewParticipantId = ref<number | null>(null)
const previewAnimations = ref<string[]>([])
const previewSkins = ref<string[]>([])
const selectedAnimation = ref('')
const selectedSkin = ref('')
const previewScale = ref(1.0)
const savingIdle = ref(false)
const savingMove = ref(false)
let scaleSaveTimer: ReturnType<typeof setTimeout> | undefined
let savedScale = 1.0

const previewParticipant = computed(() => {
  if (!previewParticipantId.value || !state.value) return null
  return state.value.participants.find((p) => p.id === previewParticipantId.value) || null
})

const previewSkelUrl = computed(() => {
  const p = previewParticipant.value
  if (!p) return ''
  const base = String(API_BASE_URL || '').trim()
  const key = p.assetKey
  return base ? `${base}/assets/spine/${key}/${key}.skel` : `/assets/spine/${key}/${key}.skel`
})

async function savePreviewSpineField(fields: Record<string, string | number>): Promise<boolean> {
  const p = previewParticipant.value
  if (!p) return false
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value))
  const res = await http.post<ApiResponse<unknown>>(`/admin/spine/${p.id}/update`, form)
  return res.data.code === 0
}

async function setIdleFromPreview(): Promise<void> {
  const p = previewParticipant.value
  if (!p || !selectedAnimation.value || savingIdle.value) return
  savingIdle.value = true
  try {
    const ok = await savePreviewSpineField({ idleAnimation: selectedAnimation.value })
    if (!ok) throw new Error('保存失败')
    p.idleAnimation = selectedAnimation.value
    ElMessage.success(`已设置待机动画: ${selectedAnimation.value}`)
  } catch (error: unknown) {
    ElMessage.error(errorMessage(error, '待机动画保存失败'))
  } finally {
    savingIdle.value = false
  }
}

async function setMoveFromPreview(): Promise<void> {
  const p = previewParticipant.value
  if (!p || !selectedAnimation.value || savingMove.value) return
  savingMove.value = true
  try {
    const ok = await savePreviewSpineField({ moveAnimation: selectedAnimation.value })
    if (!ok) throw new Error('保存失败')
    p.moveAnimation = selectedAnimation.value
    ElMessage.success(`已设置移动动画: ${selectedAnimation.value}`)
  } catch (error: unknown) {
    ElMessage.error(errorMessage(error, '移动动画保存失败'))
  } finally {
    savingMove.value = false
  }
}

watch(previewParticipantId, (id) => {
  selectedAnimation.value = ''
  previewAnimations.value = []
  previewSkins.value = []
  selectedSkin.value = ''
  const p = id == null ? null : state.value?.participants.find((x) => x.id === id) ?? null
  savedScale = p?.displayScale ?? 1.0
  previewScale.value = savedScale
})

watch(previewScale, (newScale) => {
  const p = previewParticipant.value
  if (!p || savedScale === newScale) return
  if (scaleSaveTimer !== undefined) clearTimeout(scaleSaveTimer)
  scaleSaveTimer = setTimeout(async () => {
    const target = previewParticipant.value
    if (!target) return
    try {
      const ok = await savePreviewSpineField({ displayScale: newScale })
      if (!ok) throw new Error('保存失败')
      target.displayScale = newScale
      savedScale = newScale
      ElMessage.success(`显示缩放已更新: ${newScale.toFixed(2)}`)
    } catch (error: unknown) {
      ElMessage.error(errorMessage(error, '显示缩放保存失败'))
    }
  }, 500)
})

function onPreviewLoaded(payload: { animations: string[]; skins: string[] }): void {
  previewAnimations.value = payload.animations || []
  previewSkins.value = payload.skins || []
  if (!selectedAnimation.value && previewAnimations.value.length > 0) {
    selectedAnimation.value = previewAnimations.value[0] || ''
  }
}

function onPreviewError(msg: string): void {
  console.warn('开发者控制台预览加载失败:', msg)
}

function participantName(p: RaceParticipantInfo): string {
  return p.name || p.assetKey
}

function typeLabel(type: number): string {
  return type === 3 ? 'Boss' : '敌人'
}

function phaseLabel(status: string): string {
  return ({ BETTING: '竞猜中', RACING: '比赛中', PODIUM: '领奖台', FINISHED: '已结束' } as Record<string, string>)[status] || status
}

function formatTime(ms: number): string {
  return ms ? new Date(ms).toLocaleString('zh-CN', { hour12: false }) : '-'
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : fallback
}

function fullRanking(ids: number[], value: RaceDeveloperState): boolean {
  return value.participants.length === 5 && ids.length === 5 && new Set(ids).size === 5
    && ids.every((id) => value.participants.some((p) => p.id === id))
}

function validAssets(ids: Array<number | undefined>): boolean {
  return !catalogError.value && ids.length === 5 && new Set(ids).size === 5
    && ids.every((id) => typeof id === 'number' && catalog.value.some((a) => a.id === id))
}

function context(): Context {
  return { generation, raceId: props.raceId }
}

function isCurrent(ctx: Context): boolean {
  return !disposed && visible.value && ctx.generation === generation && ctx.raceId === props.raceId
}

function resetState(): void {
  generation += 1
  state.value = null
  catalog.value = []
  rankingIds.value = []
  nextAssetIds.value = Array.from({ length: 5 })
  loadError.value = ''
  catalogError.value = ''
  actionError.value = ''
  busy.value = false
  activeAction.value = null
}

async function loadState(ctx: Context): Promise<void> {
  const [stateResult, catalogResult] = await Promise.allSettled([
    getRaceDeveloperState(ctx.raceId),
    getRaceCatalog()
  ])
  // 关闭、切换 raceId 或卸载后，旧请求不能写回状态或释放新请求的锁。
  if (!isCurrent(ctx)) return

  catalog.value = catalogResult.status === 'fulfilled'
    ? catalogResult.value.filter((a) => a.type === 2 || a.type === 3)
    : []
  catalogError.value = catalogResult.status === 'rejected'
    ? errorMessage(catalogResult.reason, '角色目录加载失败')
    : ''

  if (stateResult.status === 'rejected' || stateResult.value.race.id !== ctx.raceId) {
    state.value = null
    rankingIds.value = []
    nextAssetIds.value = Array.from({ length: 5 })
    loadError.value = stateResult.status === 'rejected'
      ? errorMessage(stateResult.reason, '控制台状态加载失败')
      : '返回的模式与当前模式不一致，请刷新重试'
    ElMessage.error(loadError.value)
    return
  }

  loadError.value = ''
  state.value = stateResult.value
  const value = stateResult.value
  const saved = value.plannedRanking ?? value.round?.ranking ?? []
  rankingIds.value = fullRanking(saved, value) ? [...saved] : participants.value.map((p) => p.id)
  // 参赛者 id 即 spine_asset.id，直接作为下一场名单的资产 id
  nextAssetIds.value = Array.from({ length: 5 }, (_, index) => savedNext.value[index]?.id)
  now.value = Date.now()
}

async function refresh(): Promise<void> {
  if (busy.value || !visible.value || disposed) return
  const ctx = context()
  busy.value = true
  try {
    await loadState(ctx)
  } finally {
    if (isCurrent(ctx)) busy.value = false
  }
}

watch(visible, (open) => {
  resetState()
  if (clock !== undefined) clearInterval(clock)
  clock = undefined
  if (open) {
    now.value = Date.now()
    clock = setInterval(() => { now.value = Date.now() }, 1000)
    void refresh()
  }
}, { flush: 'sync' })

watch(() => props.raceId, () => {
  resetState()
  if (visible.value) void refresh()
}, { flush: 'sync' })

onBeforeUnmount(() => {
  disposed = true
  generation += 1
  if (clock !== undefined) clearInterval(clock)
  if (scaleSaveTimer !== undefined) clearTimeout(scaleSaveTimer)
})

function moveRank(index: number, direction: -1 | 1): void {
  if (busy.value || !canRank.value || !rankingValid.value) return
  const target = index + direction
  const ids = [...rankingIds.value]
  const currentId = ids[index]
  const targetId = ids[target]
  if (currentId === undefined || targetId === undefined) return
  ids[index] = targetId
  ids[target] = currentId
  rankingIds.value = ids
}

function actionProblem(action: Action, value: RaceDeveloperState, ids: number[], assets: number[]): string {
  const r = value.round
  if (value.race.status !== 'ACTIVE') return '模式已经结束'
  if (!r) return '当前没有可操作的轮次'
  if (action === 'ranking') {
    if (r.status !== 'BETTING' || r.betCount !== 0) return '只有竞猜阶段且尚无下注时才能设置名次'
    if (!fullRanking(ids, value)) return '名次必须包含本场全部 5 名角色，且不可重复'
  } else if (action === 'start') {
    if (r.status !== 'BETTING' && !(r.status === 'RACING' && r.raceStartAt > Date.now())) {
      return '只能在竞猜中或开赛前等待阶段立即开赛，请刷新状态'
    }
  } else if (action === 'end') {
    if (!['RACING', 'PODIUM'].includes(r.status)) return '只有比赛中或领奖台阶段可以提前结束'
  } else {
    if (!value.canScheduleNext) return '当前模式不允许安排下一场角色'
    if (action === 'next' && !validAssets(assets)) return '请按道次选择 5 个不重复的敌人或 Boss'
  }
  return ''
}

function confirmation(action: Action, value: RaceDeveloperState): { title: string; message: string } {
  const target = `房间「${value.race.roomId}」第 ${value.round?.roundNo} 场（轮次 ID：${value.round?.id}）`
  if (action === 'ranking') return {
    title: '确认设置演示名次',
    message: `${target}：确认保存编辑区的完整名次？设置后本场为演示场，禁止下注；开赛后不能改名次。`
  }
  if (action === 'start') return {
    title: '确认立即开赛',
    message: `${target}：将立即截止下注、跳过开赛前等待并开赛，已有下注保留并按本场结果结算。是否继续？`
  }
  if (action === 'next') return {
    title: '确认保存下场名单',
    message: `${target}：确认按所选道次保存下一场的 5 名角色？仅下一场切换，不会改本场与历史。`
  }
  if (action === 'clearNext') return {
    title: '确认清除待生效名单',
    message: `${target}：确认清除已保存的下场名单？清除后下一场按模式规则自动确定：无限循环随机模式重新随机 5 名，其余模式沿用本场名单。不会改本场与历史。`
  }
  return value.round?.status === 'PODIUM' ? {
    title: '确认跳过领奖台',
    message: `${target}：将跳过剩余领奖台展示，并按模式规则开启下一场或结束模式。是否继续？`
  } : {
    title: '确认提前结束本场',
    message: `${target}：将按本场现有排名立即结算并进入领奖台，不会更改名次。此操作不可撤销，是否继续？`
  }
}

async function submit(action: Action): Promise<void> {
  if (busy.value || loadError.value || !state.value?.round) return
  const ctx = context()
  const snapshot = state.value
  const roundId = snapshot.round!.id
  const phase = snapshot.round!.status
  const ids = [...rankingIds.value]
  const assets = action === 'clearNext' ? [] : nextAssetIds.value.filter((id): id is number => typeof id === 'number')
  const problem = actionProblem(action, snapshot, ids, assets)
  if (problem) {
    ElMessage.warning(problem)
    return
  }

  busy.value = true
  activeAction.value = action
  actionError.value = ''
  let confirmed = false
  try {
    const prompt = confirmation(action, snapshot)
    try {
      await ElMessageBox.confirm(prompt.message, prompt.title, {
        type: 'warning',
        confirmButtonText: '确认执行',
        cancelButtonText: '取消',
        closeOnClickModal: false
      })
    } catch {
      return
    }
    if (!isCurrent(ctx)) return
    confirmed = true

    // 确认等待期间可能已经换场/换阶段：先只读校验，绝不把旧操作迁移到新轮次。
    const latest = await getRaceDeveloperState(ctx.raceId)
    if (!isCurrent(ctx)) return
    if (latest.race.id !== ctx.raceId || latest.round?.id !== roundId || latest.round.status !== phase) {
      throw new Error('轮次或阶段已变化，本次操作已取消，请根据刷新后的状态重新操作')
    }
    const latestProblem = actionProblem(action, latest, ids, assets)
    if (latestProblem) throw new Error(latestProblem)

    let result: boolean
    if (action === 'ranking') {
      result = await setRaceDeveloperRanking(ctx.raceId, { roundId, participantIds: ids })
    } else if (action === 'start') {
      result = await startRaceDeveloperRound(ctx.raceId, roundId)
    } else if (action === 'end') {
      result = await endRaceDeveloperRound(ctx.raceId, roundId, phase)
    } else {
      result = await setRaceDeveloperNextParticipants(ctx.raceId, { roundId, assetIds: assets })
    }
    if (!result) throw new Error('操作未成功，请根据最新状态重试')
    if (isCurrent(ctx)) ElMessage.success('操作成功')
  } catch (error: unknown) {
    if (isCurrent(ctx)) {
      actionError.value = errorMessage(error, '操作失败，请刷新状态后重试')
      ElMessage.error(actionError.value)
    }
  } finally {
    if (isCurrent(ctx)) {
      try {
        // 包括接口报错/返回 false：后端可能已推进，必须重新加载，不沿用旧快照。
        if (confirmed) {
          await loadState(ctx)
          if (isCurrent(ctx)) emit('changed')
        }
      } finally {
        if (isCurrent(ctx)) {
          busy.value = false
          activeAction.value = null
        }
      }
    }
  }
}
</script>

<template>
  <el-button size="small" type="warning" plain :disabled="visible" @click="visible = true">
    开发者控制台
  </el-button>
  <el-dialog
    v-model="visible"
    title="赛马开发者控制台"
    width="820px"
    append-to-body
    class="race-developer-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="!busy"
    :show-close="!busy"
  >
    <div class="console-toolbar">
      <span>模式 ID：{{ raceId }}</span>
      <el-button :loading="busy && !activeAction" :disabled="busy" @click="refresh">刷新状态</el-button>
    </div>
    <el-alert v-if="loadError" :title="`状态加载失败：${loadError}。已禁用操作，请刷新重试。`" type="error" show-icon :closable="false" />
    <el-alert v-if="actionError" :title="actionError" type="error" show-icon :closable="false" />

    <div v-loading="busy && !activeAction" class="console-content">
      <template v-if="state">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="房间">{{ state.race.roomId }}</el-descriptions-item>
          <el-descriptions-item label="模式">{{ state.race.name || '-' }}（{{ state.race.status }}）</el-descriptions-item>
          <el-descriptions-item label="当前场">
            {{ round ? `第 ${round.roundNo} 场 / ID ${round.id}` : '无当前场次' }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">{{ round ? phaseLabel(round.status) : '-' }}</el-descriptions-item>
          <el-descriptions-item v-if="round" label="开赛时间">{{ formatTime(round.raceStartAt) }}</el-descriptions-item>
          <el-descriptions-item v-if="round" label="下注笔数">
            {{ round.betCount }}
            <el-tag v-if="round.developerControlled" type="warning" size="small">演示场 · 禁止下注</el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <h3>本场参赛角色（按道次）</h3>
        <div class="participant-list">
          <el-tag v-for="p in participants" :key="p.id" type="info">
            {{ p.sortNo }} 道 · {{ participantName(p) }}（{{ typeLabel(p.type) }}）
          </el-tag>
          <span v-if="!participants.length" class="hint">暂无参赛角色</span>
        </div>

        <!-- 参赛者实时预览（与明日方舟小人管理页一致，动画与缩放可直接修改并保存到 spine_asset 配置） -->
        <div v-if="participants.length > 0" class="participant-preview-panel">
          <div class="preview-panel-header">角色状态预览</div>
          <div class="preview-panel-body">
            <div class="preview-panel-controls">
              <div class="control-group">
                <label class="control-label">选择角色</label>
                <el-select v-model="previewParticipantId" placeholder="选择参赛者" size="small" style="width: 100%">
                  <el-option v-for="p in participants" :key="p.id" :label="`${p.sortNo} 道 · ${participantName(p)}`" :value="p.id" />
                </el-select>
              </div>
              <template v-if="previewParticipant">
                <div class="control-group">
                  <label class="control-label">时装组</label>
                  <el-select v-model="selectedSkin" placeholder="默认" size="small" style="width: 100%" clearable>
                    <el-option v-for="s in previewSkins" :key="s" :label="s" :value="s" />
                  </el-select>
                </div>
                <div class="control-group">
                  <label class="control-label">动画</label>
                  <el-select v-model="selectedAnimation" placeholder="选择动画" size="small" style="width: 100%">
                    <el-option v-for="a in previewAnimations" :key="a" :label="a" :value="a" />
                  </el-select>
                </div>
                <div class="control-group">
                  <label class="control-label">设为待机动画</label>
                  <el-button size="small" style="width: 100%" :disabled="!selectedAnimation" :loading="savingIdle" @click="setIdleFromPreview">
                    使用当前动画
                  </el-button>
                  <span class="control-current">当前：{{ previewParticipant.idleAnimation || '默认 Idle' }}</span>
                </div>
                <div class="control-group">
                  <label class="control-label">设为移动动画</label>
                  <el-button size="small" style="width: 100%" :disabled="!selectedAnimation" :loading="savingMove" @click="setMoveFromPreview">
                    使用当前动画
                  </el-button>
                  <span class="control-current">当前：{{ previewParticipant.moveAnimation || '默认 Move' }}</span>
                </div>
              </template>
            </div>
            <div class="preview-panel-canvas">
              <SpinePixiPlayer
                v-if="previewSkelUrl"
                :skel-url="previewSkelUrl"
                :animation-name="selectedAnimation || undefined"
                :scale="previewScale"
                :skin-name="selectedSkin || undefined"
                fit="contain"
                @loaded="onPreviewLoaded"
                @error="onPreviewError"
              />
              <el-empty v-else description="请选择角色" :image-size="80" />
            </div>
          </div>
          <div v-if="previewParticipant" class="preview-scale-row">
            <label class="control-label" style="width: 80px">显示缩放</label>
            <el-input-number v-model="previewScale" :min="0.1" :max="10.0" :step="0.1" :precision="2" size="small" style="width: 140px" />
            <span class="form-hint ml-2">修改后自动保存到明日方舟小人配置并实时预览</span>
          </div>
        </div>

        <h3>本场名次</h3>
        <p class="saved-ranking">已保存名次：{{ savedRanking }}</p>
        <el-alert
          title="设置后本场为演示场，禁止下注；开赛后不能改名次。"
          description="仅竞猜中（BETTING）且下注笔数为 0 时允许设置。调整下方顺序后需要手动保存，不会自动生效。"
          type="warning"
          show-icon
          :closable="false"
        />
        <ol class="ranking-list" aria-label="完整名次编辑，自上而下为第一至第五名">
          <li v-for="(p, index) in rankingParticipants" :key="p.id" class="ranking-row">
            <span class="rank-number">第 {{ index + 1 }} 名</span>
            <span class="rank-name">{{ participantName(p) }} <small>（{{ p.sortNo }} 道）</small></span>
            <el-button size="small" :disabled="busy || !canRank || !rankingValid || index === 0" :aria-label="`将${participantName(p)}上移`" @click="moveRank(index, -1)">上移</el-button>
            <el-button size="small" :disabled="busy || !canRank || !rankingValid || index === rankingParticipants.length - 1" :aria-label="`将${participantName(p)}下移`" @click="moveRank(index, 1)">下移</el-button>
          </li>
        </ol>
        <el-button type="warning" :disabled="busy || !canRank || !rankingValid" :loading="activeAction === 'ranking'" @click="submit('ranking')">保存本场演示名次</el-button>

        <h3>进度控制</h3>
        <p class="hint">立即开赛会截止下注、跳过开赛前等待。比赛中提前结束按现有排名结算；领奖台阶段跳过展示后，按模式规则开启下一场或结束模式。</p>
        <div class="action-list">
          <el-button type="primary" :disabled="busy || !canStart" :loading="activeAction === 'start'" @click="submit('start')">立即开赛</el-button>
          <el-button type="danger" :disabled="busy || !canEnd" :loading="activeAction === 'end'" @click="submit('end')">{{ round?.status === 'PODIUM' ? '跳过领奖台' : '提前结束本场' }}</el-button>
        </div>

        <h3>下一场角色（按道次）</h3>
        <el-alert title="仅下一场切换，不会改本场与历史。" description="名单需完整选择 5 个不重复的敌人 / Boss。清除计划后，下一场按模式规则自动确定：无限循环随机模式重新随机 5 名，其余模式沿用本场名单。" type="info" show-icon :closable="false" />
        <div class="saved-next">
          <strong>已保存下场名单：</strong>
          <span v-if="!savedNext.length" class="hint">无待生效名单</span>
          <div class="participant-list">
            <el-tag v-for="p in savedNext" :key="p.id" type="success">
              {{ p.sortNo }} 道 · {{ participantName(p) }}（{{ typeLabel(p.type) }}）
            </el-tag>
          </div>
        </div>
        <el-alert v-if="catalogError" :title="`角色目录加载失败：${catalogError}。请刷新后再选择角色。`" type="error" show-icon :closable="false" />
        <p v-if="!canScheduleNext" class="hint">当前无法安排下一场（无当前场次、模式已结束或已是最后一场，以服务器状态为准）。</p>
        <el-form label-width="70px" class="next-form">
          <el-form-item v-for="lane in 5" :key="lane" :label="`第 ${lane} 道`">
            <el-select v-model="nextAssetIds[lane - 1]" filterable clearable placeholder="选择敌人 / Boss" :disabled="busy || !canScheduleNext || !!catalogError || !catalog.length" style="width: 100%">
              <el-option
                v-for="asset in catalog"
                :key="asset.id"
                :label="`${asset.name || asset.assetKey}（${typeLabel(asset.type)} · ${asset.assetKey}）`"
                :value="asset.id"
                :disabled="nextAssetIds.some((id, index) => index !== lane - 1 && id === asset.id)"
              />
            </el-select>
          </el-form-item>
        </el-form>
        <div class="action-list">
          <el-button type="primary" :disabled="busy || !canScheduleNext || !nextValid" :loading="activeAction === 'next'" @click="submit('next')">保存下场名单</el-button>
          <el-button :disabled="busy || !canScheduleNext || !savedNext.length" :loading="activeAction === 'clearNext'" @click="submit('clearNext')">清除待生效名单</el-button>
        </div>
      </template>
      <el-empty v-else-if="!busy && !loadError" description="暂无可用状态" />
    </div>
    <template #footer>
      <span v-if="busy" class="hint">正在加载、确认或提交，请勿重复操作。</span>
      <el-button :disabled="busy" @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.console-toolbar,
.action-list,
.participant-list {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.console-toolbar {
  justify-content: space-between;
  margin-bottom: 12px;
}
.console-content {
  min-height: 100px;
}
h3 {
  margin: 22px 0 10px;
  font-size: 15px;
  color: var(--el-text-color-primary);
}
.hint,
.rank-name small {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.7;
}
.saved-ranking {
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.ranking-list {
  list-style: none;
  padding: 0;
  margin: 12px 0;
}
.ranking-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.rank-number {
  flex-shrink: 0;
  color: var(--el-color-primary);
}
.rank-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.ranking-row .el-button + .el-button,
.action-list .el-button + .el-button {
  margin-left: 0;
}
.saved-next,
.next-form {
  margin: 12px 0;
}
.saved-next .participant-list {
  margin-top: 8px;
}
.el-alert + .el-alert,
.el-alert + .console-content {
  margin-top: 12px;
}
:global(.race-developer-dialog) {
  max-width: calc(100vw - 24px);
}

/* 参赛者实时预览面板 */
.participant-preview-panel {
  margin-top: 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: linear-gradient(180deg, #f8fafc, #f1f5f9);
  overflow: hidden;
}

.preview-panel-header {
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  background: rgba(241, 245, 249, 0.8);
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.preview-panel-body {
  display: flex;
  gap: 12px;
  padding: 12px;
}

.preview-panel-controls {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(15, 23, 42, 0.7);
}

.control-current {
  font-size: 11px;
  color: rgba(15, 23, 42, 0.55);
  overflow-wrap: anywhere;
}

.preview-panel-canvas {
  flex: 1;
  min-height: 240px;
  max-height: 360px;
  border-radius: 8px;
  background: repeating-conic-gradient(#e2e8f0 0% 25%, transparent 0% 50%) 0 0 / 20px 20px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  overflow: hidden;
}

.preview-scale-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
}

.form-hint {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.62);
  line-height: 1.5;
}

.ml-2 {
  margin-left: 8px;
}
</style>
