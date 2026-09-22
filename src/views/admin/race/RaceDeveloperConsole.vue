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

type Action = 'start' | 'ranking' | 'end' | 'nextParticipants'
type Context = { generation: number; raceId: number }

const visible = ref(false)
const busy = ref(false)
const activeAction = ref<Action | null>(null)
const state = ref<RaceDeveloperState | null>(null)
const loadError = ref('')
const actionError = ref('')
const rankingIds = ref<number[]>([])
const now = ref(Date.now())
const catalog = ref<RaceAssetOption[]>([])
const nextAssetIds = ref<number[]>([])
let generation = 0
let disposed = false
let clock: ReturnType<typeof setInterval> | undefined

const round = computed(() => state.value?.round ?? null)
const participants = computed(() =>
  [...(state.value?.participants ?? [])].sort((a, b) => a.sortNo - b.sortNo)
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
const rankingValid = computed(() => Boolean(state.value && fullRanking(rankingIds.value, state.value)))
const savedRanking = computed(() => {
  const ids = state.value?.plannedRanking ?? round.value?.ranking
  if (!ids?.length) return '尚无已保存名次'
  return ids.map((id, index) => {
    const p = participants.value.find((item) => item.id === id)
    return `${index + 1}. ${p ? participantName(p) : `#${id}`}`
  }).join(' → ')
})

const canScheduleNext = computed(() => Boolean(state.value?.canScheduleNext))
const nextParticipantsSummary = computed(() => {
  const np = state.value?.nextParticipants
  if (!np?.length) return '未指定（按模式规则决定）'
  return np.map((p, i) => `${i + 1}. ${participantName(p)}`).join('、')
})
const nextSelectionValid = computed(() => nextAssetIds.value.length === 5 && new Set(nextAssetIds.value).size === 5)

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
    ElMessage.success(`待机动画: ${selectedAnimation.value}`)
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
    ElMessage.success(`移动动画: ${selectedAnimation.value}`)
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
  console.warn('预览加载失败:', msg)
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

function context(): Context {
  return { generation, raceId: props.raceId }
}

function isCurrent(ctx: Context): boolean {
  return !disposed && visible.value && ctx.generation === generation && ctx.raceId === props.raceId
}

function resetState(): void {
  generation += 1
  state.value = null
  rankingIds.value = []
  loadError.value = ''
  actionError.value = ''
  busy.value = false
  activeAction.value = null
}

async function loadState(ctx: Context): Promise<void> {
  let value: RaceDeveloperState
  try {
    value = await getRaceDeveloperState(ctx.raceId)
  } catch (error: unknown) {
    if (!isCurrent(ctx)) return
    state.value = null
    rankingIds.value = []
    loadError.value = errorMessage(error, '控制台状态加载失败')
    ElMessage.error(loadError.value)
    return
  }
  if (!isCurrent(ctx)) return
  if (value.race.id !== ctx.raceId) {
    state.value = null
    rankingIds.value = []
    loadError.value = '返回的模式与当前模式不一致，请刷新重试'
    ElMessage.error(loadError.value)
    return
  }
  loadError.value = ''
  state.value = value
  const saved = value.plannedRanking ?? value.round?.ranking ?? []
  rankingIds.value = fullRanking(saved, value) ? [...saved] : participants.value.map((p) => p.id)
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
    void loadCatalog()
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

async function loadCatalog(): Promise<void> {
  if (catalog.value.length > 0) return
  try {
    catalog.value = await getRaceCatalog()
  } catch (error: unknown) {
    ElMessage.error(errorMessage(error, '参赛对象目录加载失败'))
  }
}

async function saveNextParticipants(): Promise<void> {
  if (busy.value || !state.value || !canScheduleNext.value || !nextSelectionValid.value) return
  const ctx = context()
  busy.value = true
  activeAction.value = 'nextParticipants'
  actionError.value = ''
  try {
    const ids = [...nextAssetIds.value]
    const result = await setRaceDeveloperNextParticipants(ctx.raceId, ids)
    if (!result) throw new Error('操作未成功')
    ElMessage.success('已指定下一场参赛名单')
    await loadState(ctx)
    if (isCurrent(ctx)) emit('changed')
  } catch (error: unknown) {
    actionError.value = errorMessage(error, '操作失败，请刷新状态后重试')
    ElMessage.error(actionError.value)
  } finally {
    busy.value = false
    activeAction.value = null
  }
}

async function clearNextParticipants(): Promise<void> {
  if (busy.value || !state.value || !canScheduleNext.value) return
  const ctx = context()
  busy.value = true
  activeAction.value = 'nextParticipants'
  actionError.value = ''
  try {
    const result = await setRaceDeveloperNextParticipants(ctx.raceId, [])
    if (!result) throw new Error('操作未成功')
    nextAssetIds.value = []
    ElMessage.success('已清除下一场指定名单')
    await loadState(ctx)
    if (isCurrent(ctx)) emit('changed')
  } catch (error: unknown) {
    actionError.value = errorMessage(error, '操作失败，请刷新状态后重试')
    ElMessage.error(actionError.value)
  } finally {
    busy.value = false
    activeAction.value = null
  }
}

function actionProblem(action: Action, value: RaceDeveloperState, ids: number[]): string {
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
  }
  return ''
}

function confirmation(action: Action, value: RaceDeveloperState): { title: string; message: string } {
  const target = `房间「${value.race.roomId}」第 ${value.round?.roundNo} 场（ID：${value.round?.id}）`
  if (action === 'ranking') return {
    title: '确认设置演示名次',
    message: `${target}：确认保存编辑区的完整名次？设置后本场为演示场，禁止下注；开赛后不能改名次。`
  }
  if (action === 'start') return {
    title: '确认立即开赛',
    message: `${target}：将立即截止下注、跳过开赛前等待并开赛，已有下注保留并按本场结果结算。是否继续？`
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
  const problem = actionProblem(action, snapshot, ids)
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

    const latest = await getRaceDeveloperState(ctx.raceId)
    if (!isCurrent(ctx)) return
    if (latest.race.id !== ctx.raceId || latest.round?.id !== roundId || latest.round.status !== phase) {
      throw new Error('轮次或阶段已变化，本次操作已取消，请根据刷新后的状态重新操作')
    }
    const latestProblem = actionProblem(action, latest, ids)
    if (latestProblem) throw new Error(latestProblem)

    let result: boolean
    if (action === 'ranking') {
      result = await setRaceDeveloperRanking(ctx.raceId, { roundId, participantIds: ids })
    } else if (action === 'start') {
      result = await startRaceDeveloperRound(ctx.raceId, roundId)
    } else {
      result = await endRaceDeveloperRound(ctx.raceId, roundId, phase)
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
    width="1100px"
    append-to-body
    class="race-developer-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="!busy"
    :show-close="!busy"
  >
    <div class="console-toolbar">
      <div class="toolbar-left">
        <span class="toolbar-id">模式 #{{ raceId }}</span>
        <el-tag v-if="state" :type="state.race.status === 'ACTIVE' ? 'success' : 'info'" size="small">
          {{ state.race.status }}
        </el-tag>
        <span v-if="round" class="toolbar-round">第 {{ round.roundNo }} 场 · {{ phaseLabel(round.status) }}</span>
      </div>
      <el-button size="small" :loading="busy && !activeAction" :disabled="busy" @click="refresh">刷新</el-button>
    </div>

    <el-alert v-if="loadError" :title="`状态加载失败：${loadError}`" type="error" show-icon :closable="false" style="margin-bottom:12px" />
    <el-alert v-if="actionError" :title="actionError" type="error" show-icon :closable="false" style="margin-bottom:12px" />

    <div v-loading="busy && !activeAction" class="console-body">
      <template v-if="state">
        <!-- 左栏：状态 + 名单 + 名次 + 下一场 + 控制 -->
        <div class="col-left">
          <!-- 状态摘要 -->
          <section class="panel">
            <div class="panel-title">场次信息</div>
            <div class="info-grid">
              <div class="info-row"><span class="info-label">房间</span><span>{{ state.race.roomId }}</span></div>
              <div class="info-row"><span class="info-label">模式</span><span>{{ state.race.name || '-' }}</span></div>
              <div class="info-row"><span class="info-label">开赛</span><span>{{ round ? formatTime(round.raceStartAt) : '-' }}</span></div>
              <div class="info-row">
                <span class="info-label">下注</span>
                <span>
                  {{ round?.betCount ?? 0 }} 笔
                  <el-tag v-if="round?.developerControlled" type="warning" size="small" style="margin-left:4px">演示场</el-tag>
                </span>
              </div>
            </div>
          </section>

          <!-- 本场参赛 -->
          <section class="panel">
            <div class="panel-title">本场参赛角色</div>
            <div class="participant-tags">
              <el-tag v-for="p in participants" :key="p.id" size="small" type="info">
                {{ p.sortNo }}道 {{ participantName(p) }}
              </el-tag>
              <span v-if="!participants.length" class="hint">暂无</span>
            </div>
          </section>

          <!-- 名次 -->
          <section class="panel">
            <div class="panel-title">
              本场名次
              <el-tag v-if="canRank" type="warning" size="small" effect="plain">可编辑</el-tag>
            </div>
            <div class="saved-ranking">{{ savedRanking }}</div>
            <ol class="ranking-list">
              <li v-for="(p, index) in rankingParticipants" :key="p.id" class="ranking-row">
                <span class="rank-badge">{{ index + 1 }}</span>
                <span class="rank-name">{{ participantName(p) }} <small>{{ p.sortNo }}道</small></span>
                <el-button link size="small" :disabled="!canRank || !rankingValid || index === 0" @click="moveRank(index, -1)">▲</el-button>
                <el-button link size="small" :disabled="!canRank || !rankingValid || index === rankingParticipants.length - 1" @click="moveRank(index, 1)">▼</el-button>
              </li>
            </ol>
            <el-button
              v-if="canRank"
              size="small"
              type="warning"
              plain
              :disabled="busy || !rankingValid"
              :loading="activeAction === 'ranking'"
              @click="submit('ranking')"
            >保存演示名次</el-button>
          </section>

          <!-- 下一场 -->
          <section class="panel">
            <div class="panel-title">
              下一场名单
              <el-tag v-if="canScheduleNext" type="success" size="small" effect="plain">可指定</el-tag>
            </div>
            <div class="saved-ranking">{{ nextParticipantsSummary }}</div>
            <template v-if="canScheduleNext">
              <el-select
                v-model="nextAssetIds"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                placeholder="选 5 名角色"
                size="small"
                style="width:100%;margin-top:6px"
              >
                <el-option
                  v-for="opt in catalog"
                  :key="opt.id"
                  :label="`${opt.name || opt.assetKey}（${typeLabel(opt.type)}）`"
                  :value="opt.id"
                />
              </el-select>
              <div class="next-actions">
                <el-button size="small" type="primary" plain :disabled="!nextSelectionValid" :loading="activeAction === 'nextParticipants'" @click="saveNextParticipants">保存</el-button>
                <el-button size="small" plain :disabled="!state?.nextParticipants?.length" :loading="activeAction === 'nextParticipants'" @click="clearNextParticipants">清除</el-button>
                <span class="hint">{{ nextAssetIds.length }}/5</span>
              </div>
            </template>
          </section>

          <!-- 进度控制 -->
          <section class="panel panel-actions">
            <div class="panel-title">进度控制</div>
            <div class="action-buttons">
              <el-button size="small" type="primary" :disabled="busy || !canStart" :loading="activeAction === 'start'" @click="submit('start')">立即开赛</el-button>
              <el-button size="small" type="danger" :disabled="busy || !canEnd" :loading="activeAction === 'end'" @click="submit('end')">
                {{ round?.status === 'PODIUM' ? '跳过领奖台' : '提前结束' }}
              </el-button>
            </div>
          </section>
        </div>

        <!-- 右栏：预览 -->
        <div class="col-right">
          <section class="panel panel-preview">
            <div class="panel-title">角色预览</div>
            <div class="preview-select-row">
              <el-select v-model="previewParticipantId" placeholder="选择角色" size="small" style="flex:1">
                <el-option v-for="p in participants" :key="p.id" :label="`${p.sortNo}道 · ${participantName(p)}`" :value="p.id" />
              </el-select>
            </div>
            <div class="preview-canvas-wrap">
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
              <el-empty v-else description="请选择角色" :image-size="60" />
            </div>
            <template v-if="previewParticipant">
              <div class="preview-controls">
                <div class="preview-ctrl-row">
                  <label class="ctrl-label">时装</label>
                  <el-select v-model="selectedSkin" placeholder="默认" size="small" style="flex:1" clearable>
                    <el-option v-for="s in previewSkins" :key="s" :label="s" :value="s" />
                  </el-select>
                </div>
                <div class="preview-ctrl-row">
                  <label class="ctrl-label">动画</label>
                  <el-select v-model="selectedAnimation" placeholder="选择动画" size="small" style="flex:1">
                    <el-option v-for="a in previewAnimations" :key="a" :label="a" :value="a" />
                  </el-select>
                </div>
                <div class="preview-ctrl-row preview-btn-row">
                  <el-button size="small" :disabled="!selectedAnimation" :loading="savingIdle" @click="setIdleFromPreview">设为待机</el-button>
                  <el-button size="small" :disabled="!selectedAnimation" :loading="savingMove" @click="setMoveFromPreview">设为移动</el-button>
                </div>
                <div class="preview-ctrl-row">
                  <label class="ctrl-label">缩放</label>
                  <el-input-number v-model="previewScale" :min="0.1" :max="10" :step="0.1" :precision="2" size="small" style="width:100px" />
                </div>
                <div class="preview-current-info">
                  待机：{{ previewParticipant.idleAnimation || 'Idle' }} · 移动：{{ previewParticipant.moveAnimation || 'Move' }}
                </div>
              </div>
            </template>
          </section>
        </div>
      </template>
      <el-empty v-else-if="!busy && !loadError" description="暂无可用状态" />
    </div>

    <template #footer>
      <span v-if="busy" class="hint">操作中，请勿重复点击。</span>
      <el-button size="small" :disabled="busy" @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.console-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-id {
  font-weight: 700;
  font-size: 14px;
  color: var(--el-text-color-primary);
}
.toolbar-round {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.console-body {
  display: flex;
  gap: 14px;
  min-height: 420px;
}

.col-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  max-height: 520px;
  padding-right: 4px;
}

.col-right {
  width: 320px;
  flex-shrink: 0;
}

.panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--el-fill-color-blank);
}

.panel-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 场次信息 */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
}
.info-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.info-label {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
  width: 36px;
}

/* 参赛标签 */
.participant-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* 名次 */
.saved-ranking {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  margin-bottom: 6px;
  overflow-wrap: anywhere;
}
.ranking-list {
  list-style: none;
  padding: 0;
  margin: 0 0 8px;
}
.ranking-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.ranking-row:last-child {
  border-bottom: none;
}
.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}
.rank-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rank-name small {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-left: 4px;
}
.ranking-row .el-button {
  padding: 0 4px;
}

/* 下一场 */
.next-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

/* 控制按钮 */
.panel-actions {
  margin-top: auto;
}
.action-buttons {
  display: flex;
  gap: 8px;
}
.action-buttons .el-button + .el-button {
  margin-left: 0;
}

/* 预览面板 */
.panel-preview {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px;
}
.preview-select-row {
  margin-bottom: 8px;
}
.preview-canvas-wrap {
  flex: 1;
  min-height: 200px;
  border-radius: 8px;
  background: repeating-conic-gradient(#e8ecf1 0% 25%, transparent 0% 50%) 0 0 / 16px 16px;
  border: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
  margin-bottom: 10px;
}
.preview-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.preview-ctrl-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.ctrl-label {
  width: 32px;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.preview-btn-row {
  gap: 4px;
}
.preview-btn-row .el-button {
  flex: 1;
}
.preview-current-info {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

:global(.race-developer-dialog .el-dialog__body) {
  padding: 16px 20px;
}
:global(.race-developer-dialog) {
  max-width: calc(100vw - 24px);
}
</style>
