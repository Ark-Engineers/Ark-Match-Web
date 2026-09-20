<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  adjustLmd,
  publishLmdMail,
  getLmdTransactionsAdmin,
  getLmdMailClaims,
  verifyLmd,
  type AdminTxItem,
  type AdminClaimItem,
  type VerifyResult,
  type PageResponse,
} from '@/api/admin/lmd'

type ApiResponse<T> = { code: number; message: string; data: T }

const isMobile = ref(false)

function updateResponsiveState(): void {
  isMobile.value = window.innerWidth < 1024
}

onMounted(() => {
  updateResponsiveState()
  window.addEventListener('resize', updateResponsiveState)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateResponsiveState)
})

const paginationLayout = computed(() => {
  if (isMobile.value) return 'prev, pager, next'
  return 'total, sizes, prev, pager, next, jumper'
})

const activeTab = ref('adjust')

// ============ 调整/发放 ============
const adjustForm = reactive({
  userId: '' as string,
  amount: '' as string,
  description: '',
})
const adjustLoading = ref(false)

async function submitAdjust(): Promise<void> {
  const userId = Number(adjustForm.userId)
  const amount = Number(adjustForm.amount)
  if (!Number.isInteger(userId) || userId <= 0) {
    ElMessage.error('请输入正确的用户ID')
    return
  }
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 10_000_000) {
    ElMessage.error('额度必须为非零整数且绝对值不超过 10000000')
    return
  }
  if (adjustForm.description.trim().length > 255) {
    ElMessage.error('备注不能超过255字')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定要对用户 ${userId} 执行龙门币${amount > 0 ? '发放' : '扣除'} ${Math.abs(amount)} 吗？`,
      '二次确认',
      { type: 'warning', confirmButtonText: '确认', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  adjustLoading.value = true
  try {
    const r = await adjustLmd(userId, amount, adjustForm.description)
    ElMessage.success(`操作成功：${r.amount > 0 ? '+' : ''}${r.amount}，当前余额 ${r.balanceAfter}`)
    adjustForm.userId = ''
    adjustForm.amount = ''
    adjustForm.description = ''
    await loadTx()
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    adjustLoading.value = false
  }
}

// ============ 发布邮件 ============
const publishForm = reactive({
  title: '',
  content: '',
  level: 'IMPORTANT' as 'NORMAL' | 'IMPORTANT',
  lmdAmount: '' as string,
  claimExpireAt: '' as string,
})
const publishLoading = ref(false)

function expireForSubmit(): string {
  if (!publishForm.claimExpireAt) return ''
  return publishForm.claimExpireAt.replace('T', ' ') + ':00'
}

async function submitPublish(): Promise<void> {
  const amount = Number(publishForm.lmdAmount)
  if (!publishForm.title.trim() || publishForm.title.trim().length > 128) {
    ElMessage.error('邮件标题必填且不超过128字')
    return
  }
  if (!publishForm.content.trim() || publishForm.content.trim().length > 5000) {
    ElMessage.error('邮件内容必填且不超过5000字')
    return
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > 10_000_000) {
    ElMessage.error('龙门币额度必须在 1 ~ 10000000 之间')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定向全部用户发布带 ${amount} 龙门币的邮件吗？${publishForm.claimExpireAt ? '' : '（永久有效）'}`,
      '二次确认',
      { type: 'warning', confirmButtonText: '确认发布', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  publishLoading.value = true
  try {
    const r = await publishLmdMail({
      title: publishForm.title,
      content: publishForm.content,
      level: publishForm.level,
      lmdAmount: amount,
      claimExpireAt: expireForSubmit(),
    })
    ElMessage.success(`发布成功（通知ID ${r.notificationId}，已投递 ${r.deliveredCount} 人）`)
    publishForm.title = ''
    publishForm.content = ''
    publishForm.lmdAmount = ''
    publishForm.claimExpireAt = ''
  } catch (e: any) {
    ElMessage.error(e.message || '发布失败')
  } finally {
    publishLoading.value = false
  }
}

// ============ 账目流水 ============
const txQuery = reactive({ userId: '', type: '', page: 1, size: 20 })
const txLoading = ref(false)
const txData = ref<PageResponse<AdminTxItem>>({ total: 0, page: 1, size: 20, items: [] })

async function loadTx(): Promise<void> {
  txLoading.value = true
  try {
    txData.value = await getLmdTransactionsAdmin({
      userId: txQuery.userId ? Number(txQuery.userId) : undefined,
      type: txQuery.type || undefined,
      page: txQuery.page,
      size: txQuery.size,
    })
  } catch (e: any) {
    ElMessage.error(e.message || '查询失败')
  } finally {
    txLoading.value = false
  }
}

// ============ 领取记录 ============
const claimQuery = reactive({ notificationId: '', userId: '', page: 1, size: 20 })
const claimLoading = ref(false)
const claimData = ref<PageResponse<AdminClaimItem>>({ total: 0, page: 1, size: 20, items: [] })

async function loadClaims(): Promise<void> {
  claimLoading.value = true
  try {
    claimData.value = await getLmdMailClaims({
      notificationId: claimQuery.notificationId ? Number(claimQuery.notificationId) : undefined,
      userId: claimQuery.userId ? Number(claimQuery.userId) : undefined,
      page: claimQuery.page,
      size: claimQuery.size,
    })
  } catch (e: any) {
    ElMessage.error(e.message || '查询失败')
  } finally {
    claimLoading.value = false
  }
}

// ============ 账面校验 ============
const verifyLoading = ref(false)
const verifyResult = ref<VerifyResult | null>(null)

async function runVerify(): Promise<void> {
  verifyLoading.value = true
  try {
    verifyResult.value = await verifyLmd()
    if (verifyResult.value.mismatches.length === 0) {
      ElMessage.success(`账面校验通过（共 ${verifyResult.value.totalAccounts} 个账户）`)
    } else {
      ElMessage.warning(`发现 ${verifyResult.value.mismatches.length} 个账户账面不一致`)
    }
  } catch (e: any) {
    ElMessage.error(e.message || '校验失败')
  } finally {
    verifyLoading.value = false
  }
}

function fmtTime(v: string | null | undefined): string {
  if (!v) return '-'
  return new Date(v).toLocaleString('zh-CN')
}

const txTypeLabels: Record<string, string> = {
  MAIL_CLAIM: '邮件领取',
  ADMIN_ADJUST: '系统调整',
}
</script>

<template>
  <div class="ark-admin-page">
    <el-card>
      <template #header>
        <span>龙门币管理</span>
      </template>

      <el-tabs v-model="activeTab">
        <!-- 调整/发放 -->
        <el-tab-pane label="余额调整" name="adjust">
          <el-form label-width="110px" style="max-width: 560px">
            <el-form-item label="用户ID">
              <el-input v-model="adjustForm.userId" placeholder="目标用户ID" clearable />
            </el-form-item>
            <el-form-item label="额度（±）">
              <el-input v-model="adjustForm.amount" placeholder="正数发放，负数扣除，如 1000 / -500" clearable />
            </el-form-item>
            <el-form-item label="备注">
              <el-input v-model="adjustForm.description" type="textarea" :rows="2" maxlength="255" show-word-limit placeholder="调整原因（将写入流水）" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="adjustLoading" @click="submitAdjust">提交调整</el-button>
              <span style="margin-left: 12px; font-size: 12px; opacity: 0.7">操作带签名校验与频率限制，单次额度不超过 10000000</span>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 发布邮件 -->
        <el-tab-pane label="发布龙门币邮件" name="publish">
          <el-form label-width="110px" style="max-width: 640px">
            <el-form-item label="邮件标题">
              <el-input v-model="publishForm.title" maxlength="128" show-word-limit placeholder="如：周年庆福利" />
            </el-form-item>
            <el-form-item label="邮件内容">
              <el-input v-model="publishForm.content" type="textarea" :rows="4" maxlength="5000" show-word-limit placeholder="邮件正文" />
            </el-form-item>
            <el-form-item label="邮件等级">
              <el-radio-group v-model="publishForm.level">
                <el-radio value="NORMAL">普通</el-radio>
                <el-radio value="IMPORTANT">重要</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="龙门币额度">
              <el-input v-model="publishForm.lmdAmount" placeholder="每位用户可领取的龙门币数量" clearable />
            </el-form-item>
            <el-form-item label="领取截止时间">
              <el-date-picker
                v-model="publishForm.claimExpireAt"
                type="datetime"
                placeholder="留空表示永久有效"
                value-format="YYYY-MM-DDTHH:mm"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="publishLoading" @click="submitPublish">发布邮件</el-button>
              <span style="margin-left: 12px; font-size: 12px; opacity: 0.7">发布即投递全部用户；单用户仅可领取一次，过期自动失效</span>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 账目流水 -->
        <el-tab-pane label="账目流水" name="tx">
          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px">
            <el-input v-model="txQuery.userId" placeholder="用户ID" clearable style="width: 160px" />
            <el-select v-model="txQuery.type" placeholder="流水类型" clearable style="width: 160px">
              <el-option label="邮件领取" value="MAIL_CLAIM" />
              <el-option label="系统调整" value="ADMIN_ADJUST" />
            </el-select>
            <el-button type="primary" :loading="txLoading" @click="txQuery.page = 1; loadTx()">查询</el-button>
          </div>
          <el-table v-loading="txLoading" :data="txData.items" border stripe>
            <el-table-column prop="id" label="流水ID" width="90" />
            <el-table-column label="用户" width="180">
              <template #default="{ row }">
                {{ row.nickname || row.account || '-' }}（#{{ row.userId }}）
              </template>
            </el-table-column>
            <el-table-column label="变动" width="110">
              <template #default="{ row }">
                <span :style="{ color: row.amount >= 0 ? '#67c23a' : '#f56c6c' }">{{ row.amount >= 0 ? '+' : '' }}{{ row.amount }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="balanceAfter" label="变动后余额" width="110" />
            <el-table-column label="类型" width="100">
              <template #default="{ row }">{{ txTypeLabels[row.type] || row.type }}</template>
            </el-table-column>
            <el-table-column prop="description" label="备注" min-width="140" show-overflow-tooltip />
            <el-table-column label="溯源" width="220">
              <template #default="{ row }">
                <div style="font-size: 12px; opacity: 0.8">{{ row.requestIp || '-' }}</div>
                <div style="font-size: 12px; opacity: 0.6">{{ row.traceId || '-' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="160">
              <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
          <el-pagination
            v-model:current-page="txQuery.page"
            v-model:page-size="txQuery.size"
            :total="txData.total"
            :layout="paginationLayout"
            style="margin-top: 12px; justify-content: flex-end"
            @current-change="loadTx"
            @size-change="txQuery.page = 1; loadTx()"
          />
        </el-tab-pane>

        <!-- 领取记录 -->
        <el-tab-pane label="邮件领取记录" name="claims">
          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px">
            <el-input v-model="claimQuery.notificationId" placeholder="通知ID" clearable style="width: 160px" />
            <el-input v-model="claimQuery.userId" placeholder="用户ID" clearable style="width: 160px" />
            <el-button type="primary" :loading="claimLoading" @click="claimQuery.page = 1; loadClaims()">查询</el-button>
          </div>
          <el-table v-loading="claimLoading" :data="claimData.items" border stripe>
            <el-table-column prop="id" label="记录ID" width="90" />
            <el-table-column label="邮件" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.mailTitle || '-' }}（#{{ row.notificationId }}）
              </template>
            </el-table-column>
            <el-table-column label="用户" width="180">
              <template #default="{ row }">
                {{ row.nickname || row.account || '-' }}（#{{ row.userId }}）
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="领取数量" width="110" />
            <el-table-column label="溯源" width="220">
              <template #default="{ row }">
                <div style="font-size: 12px; opacity: 0.8">{{ row.requestIp || '-' }}</div>
                <div style="font-size: 12px; opacity: 0.6">{{ row.traceId || '-' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="领取时间" width="160">
              <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
          <el-pagination
            v-model:current-page="claimQuery.page"
            v-model:page-size="claimQuery.size"
            :total="claimData.total"
            :layout="paginationLayout"
            style="margin-top: 12px; justify-content: flex-end"
            @current-change="loadClaims"
            @size-change="claimQuery.page = 1; loadClaims()"
          />
        </el-tab-pane>

        <!-- 账面校验 -->
        <el-tab-pane label="账面校验" name="verify">
          <div style="margin-bottom: 12px">
            <el-button type="primary" :loading="verifyLoading" @click="runVerify">执行全量校验</el-button>
            <span style="margin-left: 12px; font-size: 12px; opacity: 0.7">逐账户比对「余额」与「流水之和」，不一致只报告不自动修复（每日 04:30 自动执行一次）</span>
          </div>
          <el-alert
            v-if="verifyResult && verifyResult.mismatches.length === 0"
            type="success"
            :closable="false"
            :title="`账面校验通过，共 ${verifyResult.totalAccounts} 个账户`"
          />
          <el-table v-if="verifyResult && verifyResult.mismatches.length > 0" :data="verifyResult.mismatches" border stripe>
            <el-table-column prop="userId" label="用户ID" width="120" />
            <el-table-column prop="balance" label="账面余额" width="140" />
            <el-table-column prop="ledgerSum" label="流水之和" width="140" />
            <el-table-column label="差额" width="140">
              <template #default="{ row }">
                <span :style="{ color: row.diff !== 0 ? '#f56c6c' : '#67c23a' }">{{ row.diff > 0 ? '+' : '' }}{{ row.diff }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>
