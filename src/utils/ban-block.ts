import { ElMessageBox } from 'element-plus'

import { remove } from '@/utils/storage'
import { STORAGE_KEYS } from '@/constants/storage-keys'

type BanBlockInfo = {
  reason?: string | null
  effectiveAt?: string | null
  expiresAt?: string | null
  remainingSeconds?: number | null
  remainingDays?: number | null
}

type ApiResponse<T> = { code: number; message: string; data: T }

let showing = false

function safeText(v: unknown): string {
  return String(v ?? '').trim()
}

function formatTime(v: string | null | undefined): string {
  const s = safeText(v)
  return s || '-'
}

function calcRemainingText(info: BanBlockInfo): string {
  if (!info.expiresAt) return '永久'
  const end = new Date(String(info.expiresAt))
  const now = new Date()
  const diff = end.getTime() - now.getTime()
  if (!Number.isFinite(diff) || diff <= 0) return '0 天'
  const days = Math.ceil(diff / 86400000)
  return `${days} 天`
}

export async function handleBanBlockedIfNeeded(resp: ApiResponse<any> | undefined): Promise<boolean> {
  if (!resp) return false
  if (resp.code !== 2004) return false
  if (showing) return true
  showing = true

  const info: BanBlockInfo = (resp.data || {}) as any
  const reason = safeText(info.reason) || '未填写'
  const start = formatTime(info.effectiveAt)
  const end = info.expiresAt ? formatTime(info.expiresAt) : '永久'
  const remaining = calcRemainingText(info)

  const html = `
  <div style="line-height:1.7">
    <div style="font-size:16px;font-weight:700;color:#b91c1c;margin-bottom:6px">账号已被封禁</div>
    <div style="color:#334155">封禁原因：${reason}</div>
    <div style="color:#334155">封禁开始：${start}</div>
    <div style="color:#334155">封禁结束：${end}</div>
    <div style="color:#334155">剩余封禁时长：${remaining}</div>
    <div style="margin-top:10px;color:#64748b;font-size:12px">
      申诉渠道：
      <a href="/appeal/ban" target="_blank" rel="noreferrer">提交申诉表单</a>
      &nbsp;|&nbsp;
      <a href="/appeal/ban?tab=contact" target="_blank" rel="noreferrer">官方客服/管理员咨询</a>
    </div>
  </div>
  `

  try {
    await ElMessageBox.confirm(html, '封禁提示', {
      dangerouslyUseHTMLString: true,
      showCancelButton: true,
      confirmButtonText: '提交申诉',
      cancelButtonText: '我知道了',
      type: 'error',
      closeOnClickModal: false,
    })
    window.location.href = '/appeal/ban'
  } catch {
  } finally {
    remove(STORAGE_KEYS.authSession)
    try {
      sessionStorage.clear()
    } catch {}
    showing = false
  }
  return true
}

