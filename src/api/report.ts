import { unwrap } from './user-http'

export interface SubmitReportPayload {
  reportedUserId: number
  reportType: 'NICKNAME' | 'SIGNATURE' | 'CHAT'
  content: string
  roomId?: string
  chatMessageId?: number
}

export async function submitReport(payload: SubmitReportPayload): Promise<void> {
  return unwrap<void>({ url: '/user/report', method: 'POST', data: payload })
}
