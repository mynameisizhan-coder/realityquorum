import type { CaseView } from '../shared/api'

export type Intake = 'message' | 'issue'
export type Category = 'Safety & access' | 'Food & canteen' | 'Facilities' | 'Campus notice' | 'Other'
export type Urgency = 'Routine' | 'Needs attention' | 'Urgent'
export type Page = 'overview' | 'campus' | 'cases' | 'missions' | 'updates'
export type LocationKind = 'Academic' | 'Campus life' | 'Outdoors'
export interface CampusLocation {
  id: string
  name: string
  shortName: string
  kind: LocationKind
  description: string
  position: [number, number, number]
  photo: string
  photoLabel?: string
  labelPosition: [number, number, number]
  provisional?: boolean
}
export interface Attachment {
  id: string
  name: string
  type: string
  size: number
  blob: Blob
  /** Server-stored file; fetched on demand instead of downloading every attachment up front. */
  url?: string
}
export interface TimelineEntry { title: string; detail: string; at: string }
export interface Predicate { text: string; state: 'Supported' | 'Contradicted' | 'Unresolved' | 'Disputed'; explanation: string }
export interface CaseRecord {
  id: string
  route: Intake
  title: string
  description: string
  locationId: string
  category: Category
  urgency: Urgency
  status: 'Submitted' | 'Evidence review' | 'Action in progress' | 'Closure verified' | 'Reopening requested' | 'Rejected'
  createdAt: string
  attachments: Attachment[]
  timeline: TimelineEntry[]
  food?: { item: string; servedAt: string; receipt: string; disturbed: string }
  specificLocation: string
  demo: boolean
  predicates: Predicate[]
  /** Full server record (missions, work orders, closure, permissions). Absent for local-only records. */
  view?: CaseView
}
