import { unwrap } from './user-http'

/** GET /user/lmd/balance */
export interface LmdBalance {
  balance: number
}

/** GET /user/lmd/transactions items */
export interface LmdTxItem {
  id: number
  amount: number
  balanceAfter: number
  type: string
  refType: string | null
  refId: number | null
  description: string | null
  createdAt: string | null
}

export interface LmdTxPage {
  total: number
  page: number
  size: number
  items: LmdTxItem[]
}

/** POST /user/lmd/mail/claim-ticket */
export interface ClaimTicketResponse {
  ticket: string
  expiresInSeconds: number
}

/** POST /user/lmd/mail/claim */
export interface ClaimResponse {
  amount: number
  balance: number
}

export async function getLmdBalance(): Promise<LmdBalance> {
  return unwrap<LmdBalance>({ url: '/user/lmd/balance', method: 'GET' })
}

export async function getLmdTransactions(page = 1, size = 20, type?: string): Promise<LmdTxPage> {
  return unwrap<LmdTxPage>({ url: '/user/lmd/transactions', method: 'GET', params: { page, size, type } })
}

export async function requestClaimTicket(notificationId: number): Promise<ClaimTicketResponse> {
  return unwrap<ClaimTicketResponse>({
    url: '/user/lmd/mail/claim-ticket',
    method: 'POST',
    data: { notificationId },
  })
}

export async function claimLmdMail(notificationId: number, ticket: string): Promise<ClaimResponse> {
  return unwrap<ClaimResponse>({
    url: '/user/lmd/mail/claim',
    method: 'POST',
    data: { notificationId, ticket },
  })
}
