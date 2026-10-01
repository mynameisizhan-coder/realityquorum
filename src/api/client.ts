import type {
  ApiError,
  AuditEntry,
  CaseView,
  MissionView,
  PublicUpdateView,
  RelatedView,
  SessionUser,
  SuggestResult,
} from '../../shared/api'
import type {
  Category,
  EvidenceKind,
  Finding,
  FoodDetails,
  PublicUpdate,
  Route,
  Urgency,
  WorkOrder,
} from '../../shared/domain'

// Typed client for the RealityQuorum API. Vite proxies /api to the server in development.

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: object | FormData): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
  }
  let response: Response
  try {
    response = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiRequestError(
      0,
      'offline',
      'The RealityQuorum server could not be reached. Check your connection and try again.',
    )
  }
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    const error = (data ?? {}) as Partial<ApiError>
    throw new ApiRequestError(
      response.status,
      error.code ?? 'error',
      error.error ?? 'Something went wrong. Please try again.',
      error.details,
    )
  }
  return data as T
}

function form(data: object, files: Blob[] = [], names: string[] = []): FormData | object {
  if (!files.length) return data
  const body = new FormData()
  body.append('data', JSON.stringify(data))
  files.forEach((file, i) =>
    body.append('files', file, names[i] ?? (file instanceof File ? file.name : `file-${i + 1}`)),
  )
  return body
}

export interface NewCase {
  route: Route
  description: string
  locationId: string
  specificLocation?: string
  category?: Category
  urgency?: Urgency
  food?: FoodDetails
  capturedAt?: string
}
export interface NewEvidence {
  kind: EvidenceKind
  note?: string
  capturedAt?: string
  findings?: Finding[]
  challengeCode?: string
  issuer?: string
}

export const api = {
  // session
  users: () => request<SessionUser[]>('GET', '/auth/users'),
  me: () => request<SessionUser | null>('GET', '/auth/me'),
  login: (userId: string) => request<SessionUser>('POST', '/auth/demo-login', { userId }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout', {}),

  // intake and cases
  suggest: (route: Route, text: string, locationId = 'unknown') =>
    request<SuggestResult>('POST', '/intake/suggest', { route, text, locationId }),
  createCase: (data: NewCase, files: Blob[] = [], names?: string[]) =>
    request<CaseView>('POST', '/cases', form(data, files, names)),
  cases: () => request<CaseView[]>('GET', '/cases'),
  case: (id: string) => request<CaseView>('GET', `/cases/${encodeURIComponent(id)}`),
  related: (id: string) =>
    request<RelatedView[]>('GET', `/cases/${encodeURIComponent(id)}/related`),
  addEvidence: (id: string, data: NewEvidence, files: Blob[] = [], names?: string[]) =>
    request<CaseView>(
      'POST',
      `/cases/${encodeURIComponent(id)}/evidence`,
      form(data, files, names),
    ),
  fileUrl: (caseId: string, fileId: string) =>
    `/api/cases/${encodeURIComponent(caseId)}/files/${encodeURIComponent(fileId)}`,

  // missions
  missions: () => request<MissionView[]>('GET', '/missions'),
  acceptMission: (id: string) =>
    request<MissionView>('POST', `/missions/${encodeURIComponent(id)}/accept`, {}),
  submitMission: (id: string, data: NewEvidence, files: Blob[] = [], names?: string[]) =>
    request<CaseView>(
      'POST',
      `/missions/${encodeURIComponent(id)}/submit`,
      form(data, files, names),
    ),

  // campus action and closure
  approveWorkOrder: (
    caseId: string,
    basis: 'verified' | 'precautionary' = 'verified',
    actions?: string[],
  ) =>
    request<CaseView>('POST', `/cases/${encodeURIComponent(caseId)}/workorders`, {
      basis,
      actions,
    }),
  updateWorkOrder: (id: string, status: WorkOrder['status'], note = '') =>
    request<WorkOrder>('PATCH', `/workorders/${encodeURIComponent(id)}`, { status, note }),
  closeCase: (id: string) =>
    request<CaseView>('POST', `/cases/${encodeURIComponent(id)}/close`, {}),
  requestReopen: (id: string, reason: string) =>
    request<CaseView>('POST', `/cases/${encodeURIComponent(id)}/reopen`, { reason }),
  reviewReopen: (id: string, accept: boolean) =>
    request<CaseView>('POST', `/cases/${encodeURIComponent(id)}/reopen/review`, { accept }),

  // public updates
  draftPublicUpdate: (caseId: string) =>
    request<PublicUpdate>('POST', `/cases/${encodeURIComponent(caseId)}/public-update`, {}),
  publishUpdate: (updateId: string, text?: string) =>
    request<PublicUpdate>('POST', `/public-updates/${encodeURIComponent(updateId)}/publish`, {
      text,
    }),
  publicUpdates: () => request<PublicUpdateView[]>('GET', '/public/updates'),

  // trust and abuse
  revealIdentity: (caseId: string, reason: string) =>
    request<{ userId: string; name: string }>(
      'POST',
      `/cases/${encodeURIComponent(caseId)}/reveal-identity`,
      { reason },
    ),
  flagAbuse: (caseId: string, reason: string) =>
    request<CaseView>('POST', `/cases/${encodeURIComponent(caseId)}/abuse-flag`, { reason }),
  abuseQueue: () =>
    request<{ reporterAlias: string; flags: number; caseIds: string[] }[]>('GET', '/abuse-queue'),
  audit: () => request<AuditEntry[]>('GET', '/audit'),
  resetDemo: () => request<{ ok: true }>('POST', '/demo/reset', {}),
}
