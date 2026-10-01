// Core domain types shared by the server and the browser. Keep this file free of Node and DOM APIs.

export type Route = 'message' | 'issue'
export type Category = 'Safety & access' | 'Food & canteen' | 'Facilities' | 'Campus notice' | 'Other'
export type Urgency = 'Routine' | 'Needs attention' | 'Urgent'
export type CaseStatus = 'Submitted' | 'Evidence review' | 'Action in progress' | 'Closure verified' | 'Reopening requested' | 'Rejected'

export type Role = 'student' | 'volunteer' | 'canteen_supervisor' | 'facilities' | 'operator' | 'trust_officer'
export type Qualification = 'verified_volunteer' | 'food_safety' | 'facilities'
export type Department = 'Canteen supervisor' | 'Campus facilities' | 'Campus trust desk'

export interface User {
  id: string
  name: string
  role: Role
  alias: string
  qualifications: Qualification[]
  department?: Department
}

/** How far a claim reaches. Each tier needs a stronger kind of evidence than the one before it. */
export type ScopeTier = 'attribution' | 'observable' | 'origin' | 'responsibility'
export type PredicateState = 'Supported' | 'Contradicted' | 'Unresolved' | 'Disputed'

export type EvidenceKind =
  | 'message_text' | 'photo' | 'receipt' | 'observation' | 'official_source'
  | 'supervisor_record' | 'isolation_record' | 'authorized_inspection'
  | 'corrective_action' | 'reporter_notification' | 'closure_photo' | 'independent_confirmation'

export type CaseOutcome = 'Confirmed observable condition' | 'Attribution checked' | 'Disputed evidence' | 'Insufficient evidence' | 'Professional inspection required'

export interface PredicateTemplate {
  id: string
  text: string
  tier: ScopeTier
  appliesTo: Route | 'both'
  /** Evidence kinds that may count towards this predicate. */
  acceptedKinds: EvidenceKind[]
  /** Independent sources needed before the predicate can be Supported or Contradicted. */
  minIndependent: number
  /** Kinds that settle the predicate alone (e.g. an authorised issuer denying a notice). */
  decisiveKinds?: EvidenceKind[]
  /** Only fresh evidence counts (observable conditions). */
  requiresFresh?: boolean
  requiresProfessional?: boolean
  /** Wording used in public updates when Supported. */
  publicSupported?: string
  publicContradicted?: string
}

export interface MissionTemplate {
  id: string
  title: string
  instructions: string[]
  allowedRoles: Role[]
  requiredQualification?: Qualification
  area: 'public' | 'restricted'
  forbiddenActions: string[]
  isDisconfirmation: boolean
  evidenceKinds: EvidenceKind[]
  targets: string[]
  /** 'action' missions are created only after a work order is approved. */
  phase?: 'evidence' | 'action'
}

export interface ClosureRequirement { kind: EvidenceKind; label: string }

export interface PolicyPack {
  id: string
  name: string
  categories: Category[]
  freshnessHours: number
  predicates: PredicateTemplate[]
  missions: MissionTemplate[]
  closure: ClosureRequirement[]
  /** Explicitly approved safety policy that allows a work order without operator approval. */
  autoSafetyWorkOrder: boolean
  /** Predicate that must be Supported before the case can close (e.g. the exit is clear). */
  closurePredicate?: string
  workOrderActions: string[]
  publicCorrectiveSummary: string
}

export interface Predicate {
  id: string
  text: string
  tier: ScopeTier
  state: PredicateState
  explanation: string
}

export interface Finding { predicateId: string; effect: 'supports' | 'contradicts' }

export interface FileRef { id: string; name: string; type: string; size: number }

export interface EvidenceItem {
  id: string
  caseId: string
  kind: EvidenceKind
  note: string
  submittedBy: string
  sourceRole: Role
  sourceAlias: string
  /** Used to decide independence. Two items from the same source key count once. */
  sourceKey: string
  missionId?: string
  capturedAt: string
  recordedAt: string
  challengeCode?: string
  findings: Finding[]
  observations: string[]
  files: FileRef[]
  demo: boolean
}

export type MissionStatus = 'Open' | 'Accepted' | 'Submitted' | 'Cancelled'
export interface Mission {
  id: string
  caseId: string
  templateId: string
  title: string
  instructions: string[]
  forbiddenActions: string[]
  allowedRoles: Role[]
  requiredQualification?: Qualification
  area: 'public' | 'restricted'
  isDisconfirmation: boolean
  status: MissionStatus
  assigneeId?: string
  challengeCode: string
  createdAt: string
}

export type WorkOrderStatus = 'Open' | 'In progress' | 'Marked resolved'
export interface WorkOrder {
  id: string
  caseId: string
  department: Department
  actions: string[]
  status: WorkOrderStatus
  approvedBy: string
  approvalBasis: 'operator' | 'safety_policy'
  targetResponseHours: number
  dueAt: string
  createdAt: string
  notes: { at: string; by: string; text: string }[]
}

export interface PublicUpdate {
  id: string
  caseId: string
  text: string
  status: 'Draft' | 'Published'
  createdAt: string
  publishedAt?: string
  publishedBy?: string
}

export interface TimelineEntry { title: string; detail: string; at: string }

export interface FoodDetails { item: string; servedAt: string; receipt: string; disturbed: string }

export interface ExtractedClaim { text: string; tier: ScopeTier; predicateId?: string }

export interface Case {
  id: string
  route: Route
  title: string
  description: string
  locationId: string
  specificLocation: string
  category: Category
  suggestedCategory?: Category
  categoryCorrected: boolean
  urgency: Urgency
  status: CaseStatus
  policyPackId: string
  reporterId: string
  reporterAlias: string
  department: Department
  createdAt: string
  food?: FoodDetails
  claims: ExtractedClaim[]
  predicates: Predicate[]
  outcome: CaseOutcome
  outcomeSummary: string
  timeline: TimelineEntry[]
  files: FileRef[]
  demo: boolean
  reopenReason?: string
  statusBeforeReopen?: CaseStatus
  abuseFlags: number
}

export const CATEGORIES: Category[] = ['Safety & access', 'Food & canteen', 'Facilities', 'Campus notice', 'Other']
export const URGENCIES: Urgency[] = ['Routine', 'Needs attention', 'Urgent']
export const RESPONSE_HOURS: Record<Urgency, number> = { Urgent: 2, 'Needs attention': 24, Routine: 72 }

export function departmentFor(category: Category): Department {
  if (category === 'Food & canteen') return 'Canteen supervisor'
  if (category === 'Safety & access' || category === 'Facilities') return 'Campus facilities'
  return 'Campus trust desk'
}
