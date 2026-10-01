import type { Case, Category, EvidenceItem, EvidenceKind, ExtractedClaim, Mission, PublicUpdate, ScopeTier, Urgency, User, WorkOrder } from './domain'
import type { ClosureStatus } from './decision'
import type { Eligibility } from './permissions'
import type { RelatedSuggestion } from './related'

// Shapes returned by the HTTP API. Reporter identity is never part of these.

export type EvidenceView = Omit<EvidenceItem, 'submittedBy' | 'sourceKey'>

export interface CaseSummary { id: string; title: string; locationId: string; specificLocation: string; category: Category }

export interface MissionView extends Omit<Mission, 'challengeCode' | 'assigneeId'> {
  /** Only shown to the person doing the mission. */
  challengeCode?: string
  assignedToMe: boolean
  eligibility: Eligibility
  caseSummary: CaseSummary
  /** Evidence types this mission accepts. */
  evidenceKinds: EvidenceKind[]
  /** Questions this mission can answer that the current user is allowed to record a finding on. */
  targets: { id: string; text: string; tier: ScopeTier; acceptedKinds: EvidenceKind[] }[]
}

export interface CasePermissions {
  addEvidenceKinds: EvidenceKind[]
  approveWorkOrder: boolean
  updateWorkOrder: boolean
  close: boolean
  reopen: boolean
  reviewReopen: boolean
  draftUpdate: boolean
  publishUpdate: boolean
  revealIdentity: boolean
  flagAbuse: boolean
  viewRelated: boolean
}

export interface CaseView extends Omit<Case, 'reporterId'> {
  isReporter: boolean
  pack: { id: string; name: string }
  evidence: EvidenceView[]
  missions: MissionView[]
  workOrders: WorkOrder[]
  closure: ClosureStatus
  publicUpdates: PublicUpdate[]
  permissions: CasePermissions
}

export interface SuggestResult { category: Category; urgency: Urgency; confidence: number; rationale: string; claims: ExtractedClaim[]; source: string }

export interface RelatedView extends RelatedSuggestion { summary: CaseSummary & { createdAt: string } }

export interface PublicUpdateView { id: string; text: string; publishedAt: string; category: Category; locationId: string }

export type SessionUser = User

export interface AuditEntry { id: number; at: string; actorId: string; action: string; caseId: string | null; detail: string }

export interface ApiError { error: string; code: string; details?: unknown }
