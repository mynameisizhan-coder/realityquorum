import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { CaseView, MissionView, PublicUpdateView, RelatedView, SuggestResult } from '../shared/api'
import type { Case, Category, EvidenceItem, EvidenceKind, FileRef, Finding, FoodDetails, Mission, PolicyPack, PublicUpdate, Route, Urgency, User, WorkOrder } from '../shared/domain'
import { departmentFor, RESPONSE_HOURS } from '../shared/domain'
import { closureStatus, evaluateCase, predicatesFor } from '../shared/decision'
import { can, canViewCase, missionEligibility } from '../shared/permissions'
import { getPack, selectPack } from '../shared/policy'
import { draftPublicUpdate, guardPublicText } from '../shared/redaction'
import { suggestRelated } from '../shared/related'
import { validateFiles } from '../shared/validation'
import { locations } from '../src/data/campus'
import type { Store } from './db'
import { MissionSelectionSchema, ObservationSchema, SuggestionSchema } from './gemini/adapter'
import type { GeminiAdapter } from './gemini/adapter'

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) { super(message) }
}
const fail = (status: number, code: string, message: string, details?: unknown): never => { throw new HttpError(status, code, message, details) }

export interface Ctx { store: Store; gemini: GeminiAdapter; uploadDir: string }
export interface IncomingFile { name: string; type: string; data: Buffer }

export interface NewCaseInput {
  route: Route; description: string; locationId: string; specificLocation?: string
  category?: Category; urgency?: Urgency; food?: FoodDetails; capturedAt?: string
}
export interface EvidenceInput {
  kind: EvidenceKind; note?: string; capturedAt?: string; findings?: Finding[]; challengeCode?: string; issuer?: string
}

const nowIso = () => new Date().toISOString()
const newId = (prefix: string) => `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`
const challenge = () => `RQ-${randomBytes(2).toString('hex').toUpperCase()}`
const LOCATION_IDS = new Set([...locations.map(l => l.id), 'unknown'])
const CHALLENGE_KINDS: EvidenceKind[] = ['photo', 'closure_photo', 'independent_confirmation']

// ---------- lookups ----------

export function getUser(ctx: Ctx, id: string): User | undefined { return ctx.store.get<User>('users', id) }

function loadCase(ctx: Ctx, id: string): Case {
  return ctx.store.get<Case>('cases', id) ?? fail(404, 'case_not_found', 'This case does not exist.')
}

function loadVisibleCase(ctx: Ctx, user: User, id: string): Case {
  const record = loadCase(ctx, id)
  if (!canViewCase(user, record)) fail(404, 'case_not_found', 'This case does not exist.')
  return record
}

const isDepartmentStaff = (user: User, record: Case) => can(user, 'case.viewDepartment') && user.department === record.department

function timeline(record: Case, title: string, detail: string) {
  record.timeline.push({ title, detail, at: nowIso() })
}

// ---------- files ----------

/** The browser's declared type is not trusted: the first bytes must match it. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': b => b.subarray(0, 5).toString('latin1') === '%PDF-',
}

function saveFiles(ctx: Ctx, caseId: string, files: IncomingFile[]): FileRef[] {
  const problem = validateFiles(files.map(f => ({ size: f.data.length, type: f.type })))
  if (problem) fail(400, 'invalid_files', problem)
  const mismatch = files.find(f => !SIGNATURES[f.type]?.(f.data))
  if (mismatch) fail(400, 'invalid_files', `“${mismatch.name.slice(0, 80)}” is not a valid ${mismatch.type.split('/')[1].toUpperCase()} file.`)
  mkdirSync(ctx.uploadDir, { recursive: true })
  return files.map(file => {
    const ref: FileRef = { id: randomUUID(), name: file.name.slice(0, 200), type: file.type, size: file.data.length }
    writeFileSync(join(ctx.uploadDir, ref.id), file.data)
    ctx.store.put('files', { ...ref, caseId }, caseId)
    return ref
  })
}

export function fileFor(ctx: Ctx, user: User, caseId: string, fileId: string): FileRef & { path: string } {
  loadVisibleCase(ctx, user, caseId)
  const file = ctx.store.get<FileRef & { caseId: string }>('files', fileId)
  if (!file || file.caseId !== caseId) fail(404, 'file_not_found', 'This file does not exist.')
  return { ...file!, path: join(ctx.uploadDir, fileId) }
}

// ---------- gemini (always validated) ----------

export async function suggest(ctx: Ctx, input: { route: Route; text: string; locationId: string }): Promise<SuggestResult> {
  const parsed = SuggestionSchema.safeParse(await ctx.gemini.suggest(input))
  if (!parsed.success) return { category: 'Other', urgency: 'Routine', confidence: 0, rationale: 'Suggestion unavailable; please choose the category.', claims: [], source: ctx.gemini.name }
  return { ...(parsed.data as Omit<SuggestResult, 'source'>), source: ctx.gemini.name }
}

async function observe(ctx: Ctx, kind: EvidenceKind, note: string, files: IncomingFile[], packId: string): Promise<string[]> {
  const images = files.filter(f => f.type.startsWith('image/')).map(f => ({ type: f.type, data: f.data }))
  const parsed = ObservationSchema.safeParse(await ctx.gemini.observe({ kind, note, fileNames: files.map(f => f.name), packId, images }))
  return parsed.success ? parsed.data : []
}

/**
 * Gemini picks from the pack; anything not in the pack is dropped, never invented. Gemini may trim
 * missions within a role, but it cannot leave a role with no task, and the alternative-explanation
 * check is always included.
 */
async function selectMissions(ctx: Ctx, pack: PolicyPack, record: Case): Promise<string[]> {
  const attributionOnly = new Set(pack.predicates.filter(p => p.appliesTo === 'message').map(p => p.id))
  const candidates = pack.missions.filter(m => (m.phase ?? 'evidence') === 'evidence')
    // Issuer checks only make sense when there is a message to attribute.
    .filter(m => record.route === 'message' || !m.targets.every(t => attributionOnly.has(t)))
  const allowed = new Set(candidates.map(m => m.id))
  const parsed = MissionSelectionSchema.safeParse(await ctx.gemini.selectMissions(pack, record))
  const chosen = new Set(parsed.success ? parsed.data.map(s => s.templateId).filter(id => allowed.has(id)) : [])
  if (!chosen.size) return candidates.map(m => m.id)
  for (const m of candidates) if (m.isDisconfirmation) chosen.add(m.id)
  for (const m of candidates) {
    const roleCovered = m.allowedRoles.some(role => candidates.some(c => chosen.has(c.id) && c.allowedRoles.includes(role)))
    if (!roleCovered) chosen.add(m.id)
  }
  return candidates.filter(m => chosen.has(m.id)).map(m => m.id)
}

function instantiateMissions(ctx: Ctx, record: Case, templateIds: string[]): Mission[] {
  const pack = getPack(record.policyPackId)
  return templateIds.map(templateId => {
    const t = pack.missions.find(m => m.id === templateId)!
    const mission: Mission = {
      id: newId('M'), caseId: record.id, templateId, title: t.title, instructions: t.instructions, forbiddenActions: t.forbiddenActions,
      allowedRoles: t.allowedRoles, requiredQualification: t.requiredQualification, area: t.area, isDisconfirmation: t.isDisconfirmation,
      status: 'Open', challengeCode: challenge(), createdAt: nowIso(),
    }
    return ctx.store.put('missions', mission, record.id)
  })
}

// ---------- decisions ----------

function recompute(ctx: Ctx, record: Case): Case {
  const pack = getPack(record.policyPackId)
  const decision = evaluateCase(pack, record.route, ctx.store.byCase<EvidenceItem>('evidence', record.id))
  record.predicates = decision.predicates
  record.outcome = decision.outcome
  record.outcomeSummary = decision.summary
  return record
}

function validateFindings(pack: PolicyPack, record: Case, user: User, kind: EvidenceKind, findings: Finding[]) {
  for (const finding of findings) {
    const template = pack.predicates.find(p => p.id === finding.predicateId)
    if (!template || !record.predicates.some(p => p.id === finding.predicateId)) fail(400, 'unknown_predicate', `“${finding.predicateId}” is not a question in this case.`)
    if (!template!.acceptedKinds.includes(kind)) fail(400, 'kind_not_accepted', `${kind.replace(/_/g, ' ')} evidence cannot count towards “${template!.text}”.`)
    if ((user.role === 'student' || user.role === 'volunteer') && template!.tier !== 'observable')
      fail(403, 'tier_not_allowed', 'Reporters and volunteers can only record what is observable.')
  }
}

function evidenceKindsFor(user: User, record: Case): EvidenceKind[] {
  if (record.status === 'Closure verified' || record.status === 'Rejected') return []
  if (user.id === record.reporterId) return ['photo', 'receipt', 'observation']
  if (user.role === 'operator') return ['official_source', 'observation', 'reporter_notification']
  if (user.role === 'trust_officer') return ['official_source']
  if (isDepartmentStaff(user, record)) {
    const kinds: EvidenceKind[] = ['supervisor_record', 'isolation_record', 'corrective_action', 'closure_photo', 'observation', 'reporter_notification']
    if (user.qualifications.includes('food_safety')) kinds.push('authorized_inspection')
    return kinds
  }
  return []
}

async function recordEvidence(ctx: Ctx, user: User, record: Case, input: EvidenceInput, files: IncomingFile[], mission?: Mission): Promise<EvidenceItem> {
  const pack = getPack(record.policyPackId)
  const findings = input.findings ?? []
  validateFindings(pack, record, user, input.kind, findings)
  const capturedAt = input.capturedAt && Number.isFinite(Date.parse(input.capturedAt)) ? new Date(input.capturedAt).toISOString() : nowIso()
  if (Date.parse(capturedAt) > Date.now() + 5 * 60_000) fail(400, 'future_capture', 'The capture time cannot be in the future.')
  const refs = saveFiles(ctx, record.id, files)
  const item: EvidenceItem = {
    id: newId('E'), caseId: record.id, kind: input.kind, note: (input.note ?? '').slice(0, 2000),
    submittedBy: user.id, sourceRole: user.role, sourceAlias: user.alias,
    // Official sources are independent by issuer, not by who typed them in.
    sourceKey: input.kind === 'official_source' && input.issuer ? `official:${input.issuer.toLowerCase().trim()}` : user.id,
    missionId: mission?.id, capturedAt, recordedAt: nowIso(), challengeCode: input.challengeCode, findings,
    observations: await observe(ctx, input.kind, input.note ?? '', files, pack.id), files: refs, demo: record.demo,
  }
  ctx.store.put('evidence', item, record.id)
  return item
}

// ---------- cases ----------

export async function createCase(ctx: Ctx, user: User, input: NewCaseInput, files: IncomingFile[], seed?: { id: string }): Promise<CaseView> {
  if (!can(user, 'case.create')) fail(403, 'forbidden', 'Only students and volunteers can submit reports.')
  if (!LOCATION_IDS.has(input.locationId)) fail(400, 'invalid_location', 'Choose a campus location, or “Location not known”.')
  const description = input.description.trim()
  if (input.route === 'issue' && description.length < 10) fail(400, 'too_short', 'Describe what you observed in at least 10 characters.')
  if (input.route === 'message' && description.length < 10 && !files.length) fail(400, 'too_short', 'Paste the message (at least 10 characters) or attach a screenshot.')

  const suggestion = await suggest(ctx, { route: input.route, text: description, locationId: input.locationId })
  const category = input.category ?? suggestion.category
  const pack = selectPack(category, input.route)
  const id = seed?.id ?? newId('RQ')
  const record: Case = {
    id, route: input.route, title: (description.split('\n')[0] || 'Attached screenshot').slice(0, 82), description,
    locationId: input.locationId, specificLocation: (input.specificLocation ?? '').trim().slice(0, 160),
    category, suggestedCategory: suggestion.category, categoryCorrected: category !== suggestion.category,
    urgency: input.urgency ?? suggestion.urgency, status: 'Submitted', policyPackId: pack.id,
    reporterId: user.id, reporterAlias: user.alias, department: departmentFor(category), createdAt: nowIso(),
    food: category === 'Food & canteen' ? input.food : undefined,
    claims: suggestion.claims, predicates: [], outcome: 'Insufficient evidence', outcomeSummary: '', timeline: [], files: [], demo: !!seed, abuseFlags: 0,
  }
  timeline(record, input.route === 'message' ? 'Message submitted privately' : 'Issue reported privately', `Visible to the reporter and ${record.department} as ${user.alias}.`)
  if (record.categoryCorrected) timeline(record, 'Category set by reporter', `Suggested “${suggestion.category}”; the reporter chose “${category}”.`)
  recompute(ctx, record)

  ctx.store.put('cases', record, id)
  if (input.route === 'message') await recordEvidence(ctx, user, record, { kind: 'message_text', note: description }, [])

  const images = files.filter(f => f.type.startsWith('image/')), documents = files.filter(f => !f.type.startsWith('image/'))
  // Intake media from a direct report supports what is observable; screenshots of a message prove only that the message exists.
  const observableFor = (kind: EvidenceKind): Finding[] => input.route === 'issue'
    ? record.predicates.filter(p => p.tier === 'observable' && p.id !== pack.closurePredicate && pack.predicates.find(t => t.id === p.id)!.acceptedKinds.includes(kind)).map(p => ({ predicateId: p.id, effect: 'supports' as const }))
    : []
  // Mission selection does not depend on the evidence, so it runs while the photos are being analysed.
  const missionChoice = selectMissions(ctx, pack, record)
  const photoKind: EvidenceKind = input.route === 'message' ? 'message_text' : 'photo'
  if (images.length) await recordEvidence(ctx, user, record, { kind: photoKind, note: 'Submitted with the report.', capturedAt: input.capturedAt, findings: observableFor(photoKind) }, images)
  if (documents.length) {
    const docKind: EvidenceKind = category === 'Food & canteen' ? 'receipt' : 'observation'
    await recordEvidence(ctx, user, record, { kind: docKind, note: 'Document submitted with the report.', capturedAt: input.capturedAt, findings: observableFor(docKind) }, documents)
  }
  record.files = [...ctx.store.byCase<EvidenceItem>('evidence', id).flatMap(e => e.files)]
  if (input.route === 'message') timeline(record, 'Claims separated', `${record.claims.length} claim(s) extracted. Attribution and physical conditions are checked separately.`)

  const missions = instantiateMissions(ctx, record, await missionChoice)
  timeline(record, 'Evidence missions prepared', `${missions.length} mission(s) from the ${pack.name} policy pack.`)
  recompute(ctx, record)

  if (pack.autoSafetyWorkOrder && record.urgency === 'Urgent') createWorkOrder(ctx, record, 'safety_policy', 'system')
  ctx.store.put('cases', record, id)
  return caseView(ctx, user, record)
}

export function listCases(ctx: Ctx, user: User): CaseView[] {
  return ctx.store.all<Case>('cases').filter(c => canViewCase(user, c))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(c => caseView(ctx, user, c))
}

export function getCase(ctx: Ctx, user: User, id: string): CaseView {
  return caseView(ctx, user, loadVisibleCase(ctx, user, id))
}

export async function addEvidence(ctx: Ctx, user: User, caseId: string, input: EvidenceInput, files: IncomingFile[]): Promise<CaseView> {
  const record = loadVisibleCase(ctx, user, caseId)
  if (!evidenceKindsFor(user, record).includes(input.kind)) fail(403, 'kind_forbidden', `You cannot add ${input.kind.replace(/_/g, ' ')} evidence to this case.`)
  await recordEvidence(ctx, user, record, input, files)
  if (record.status === 'Submitted') record.status = 'Evidence review'
  timeline(record, 'Evidence added', `${user.alias} added ${input.kind.replace(/_/g, ' ')} evidence.`)
  recompute(ctx, record)
  ctx.store.put('cases', record, record.id)
  return caseView(ctx, user, record)
}

// ---------- missions ----------

function missionView(user: User, mission: Mission, record: Case): MissionView {
  const { challengeCode, assigneeId, ...rest } = mission
  const assignedToMe = assigneeId === user.id
  return {
    ...rest, assignedToMe, challengeCode: assignedToMe ? challengeCode : undefined,
    eligibility: assignedToMe ? { ok: mission.status === 'Accepted', reason: 'Assigned to you.' } : missionEligibility(user, mission, record),
    caseSummary: { id: record.id, title: record.title, locationId: record.locationId, specificLocation: record.specificLocation, category: record.category },
    ...missionTargets(user, mission, record),
  }
}

/** Mirrors validateFindings: reporters and volunteers may only record observable findings, and only on this case's questions. */
function missionTargets(user: User, mission: Mission, record: Case): Pick<MissionView, 'evidenceKinds' | 'targets'> {
  const pack = getPack(record.policyPackId)
  const template = pack.missions.find(m => m.id === mission.templateId)
  if (!template) return { evidenceKinds: [], targets: [] }
  const observableOnly = user.role === 'student' || user.role === 'volunteer'
  const targets = predicatesFor(pack, record.route)
    .filter(p => template.targets.includes(p.id) && (!observableOnly || p.tier === 'observable'))
    .map(p => ({ id: p.id, text: p.text, tier: p.tier, acceptedKinds: p.acceptedKinds.filter(k => template.evidenceKinds.includes(k)) }))
  return { evidenceKinds: template.evidenceKinds, targets }
}

/** Missions are listed only to people whose role could take them; restricted work is never shown to volunteers. */
export function listMissions(ctx: Ctx, user: User): MissionView[] {
  const cases = new Map(ctx.store.all<Case>('cases').map(c => [c.id, c]))
  return ctx.store.all<Mission>('missions').filter(m => {
    const record = cases.get(m.caseId)
    if (!record || m.status === 'Cancelled' || record.status === 'Closure verified') return false
    if (m.assigneeId === user.id) return true
    if (user.role === 'operator') return true
    // A mission someone else has taken is no longer available to anyone else.
    if (m.status !== 'Open') return false
    if (user.role === 'student') return record.reporterId === user.id && m.allowedRoles.includes('student')
    return m.allowedRoles.includes(user.role) && (!can(user, 'case.viewDepartment') || user.department === record.department)
  }).map(m => missionView(user, m, cases.get(m.caseId)!))
}

export function acceptMission(ctx: Ctx, user: User, missionId: string): MissionView {
  const mission = ctx.store.get<Mission>('missions', missionId) ?? fail(404, 'mission_not_found', 'This mission does not exist.')
  const record = loadCase(ctx, mission.caseId)
  const eligibility = missionEligibility(user, mission, record)
  if (!eligibility.ok) fail(403, 'not_eligible', eligibility.reason)
  mission.status = 'Accepted'
  mission.assigneeId = user.id
  ctx.store.put('missions', mission, record.id)
  timeline(record, 'Mission accepted', `“${mission.title}” accepted by ${user.alias}.`)
  ctx.store.put('cases', record, record.id)
  return missionView(user, mission, record)
}

export async function submitMission(ctx: Ctx, user: User, missionId: string, input: EvidenceInput, files: IncomingFile[]): Promise<CaseView> {
  const mission = ctx.store.get<Mission>('missions', missionId) ?? fail(404, 'mission_not_found', 'This mission does not exist.')
  if (mission.assigneeId !== user.id || mission.status !== 'Accepted') fail(403, 'not_assignee', 'Accept this mission before submitting evidence.')
  const record = loadCase(ctx, mission.caseId)
  const template = getPack(record.policyPackId).missions.find(m => m.id === mission.templateId)!
  if (!template.evidenceKinds.includes(input.kind)) fail(400, 'kind_not_in_mission', `This mission accepts ${template.evidenceKinds.join(', ').replace(/_/g, ' ')} evidence.`)
  if (CHALLENGE_KINDS.includes(input.kind) && files.length && input.challengeCode?.trim().toUpperCase() !== mission.challengeCode)
    fail(400, 'challenge_mismatch', 'Include the capture challenge code shown with this mission.')
  await recordEvidence(ctx, user, record, input, files, mission)
  mission.status = 'Submitted'
  ctx.store.put('missions', mission, record.id)
  if (record.status === 'Submitted') record.status = 'Evidence review'
  timeline(record, mission.isDisconfirmation ? 'Alternative explanation tested' : 'Mission evidence submitted', `“${mission.title}” — ${user.alias}.`)
  recompute(ctx, record)
  ctx.store.put('cases', record, record.id)
  return caseView(ctx, user, record)
}

// ---------- work orders and closure ----------

function createWorkOrder(ctx: Ctx, record: Case, basis: WorkOrder['approvalBasis'], approvedBy: string, actions?: string[]): WorkOrder {
  const pack = getPack(record.policyPackId)
  const hours = RESPONSE_HOURS[record.urgency]
  const order: WorkOrder = {
    id: newId('WO'), caseId: record.id, department: record.department, actions: actions?.length ? actions : pack.workOrderActions,
    status: 'Open', approvedBy, approvalBasis: basis, targetResponseHours: hours,
    dueAt: new Date(Date.now() + hours * 3_600_000).toISOString(), createdAt: nowIso(), notes: [],
  }
  ctx.store.put('work_orders', order, record.id)
  const actionMissions = pack.missions.filter(m => m.phase === 'action').map(m => m.id)
  instantiateMissions(ctx, record, actionMissions)
  record.status = 'Action in progress'
  timeline(record, basis === 'operator' ? 'Work order approved' : 'Work order created by safety policy', `${record.department} must respond within ${hours} hours. Closure evidence is still required.`)
  return order
}

export function approveWorkOrder(ctx: Ctx, user: User, caseId: string, basis: 'verified' | 'precautionary', actions?: string[]): CaseView {
  if (!can(user, 'workorder.approve')) fail(403, 'forbidden', 'Only an operator can approve a work order.')
  const record = loadCase(ctx, caseId)
  if (ctx.store.byCase<WorkOrder>('work_orders', caseId).some(w => w.status !== 'Marked resolved')) fail(409, 'work_order_open', 'This case already has an open work order.')
  if (record.status === 'Closure verified') fail(409, 'closed', 'This case is closed.')
  if (basis === 'verified' && !record.predicates.some(p => p.tier === 'observable' && p.state === 'Supported'))
    fail(409, 'not_verified', 'No observable condition is supported yet. Approve as a precaution instead, or gather more evidence.')
  const order = createWorkOrder(ctx, record, 'operator', user.id, actions)
  if (basis === 'precautionary') order.actions = ['Precautionary triage: no condition is confirmed yet', ...order.actions]
  ctx.store.put('work_orders', order, caseId)
  ctx.store.put('cases', record, caseId)
  ctx.store.audit(user.id, 'workorder.approve', caseId, `${order.id} (${basis})`)
  return caseView(ctx, user, record)
}

export function updateWorkOrder(ctx: Ctx, user: User, workOrderId: string, status: WorkOrder['status'], note: string): WorkOrder {
  const order = ctx.store.get<WorkOrder>('work_orders', workOrderId) ?? fail(404, 'work_order_not_found', 'This work order does not exist.')
  const record = loadCase(ctx, order.caseId)
  if (!(user.role === 'operator' || isDepartmentStaff(user, record))) fail(403, 'forbidden', 'Only the assigned department can update this work order.')
  order.status = status
  if (note.trim()) order.notes.push({ at: nowIso(), by: user.alias, text: note.trim().slice(0, 1000) })
  ctx.store.put('work_orders', order, record.id)
  timeline(record, status === 'Marked resolved' ? 'Department marked work resolved' : 'Work order updated', status === 'Marked resolved' ? 'This does not close the case. Closure evidence is checked separately.' : `${order.department}: ${status}.`)
  ctx.store.put('cases', record, record.id)
  return order
}

export function closeCase(ctx: Ctx, user: User, caseId: string): CaseView {
  if (!can(user, 'case.close')) fail(403, 'forbidden', 'Only an operator can close a case.')
  const record = loadCase(ctx, caseId)
  const status = closureStatus(getPack(record.policyPackId), ctx.store.byCase<EvidenceItem>('evidence', caseId), record.predicates)
  if (!status.complete) {
    const missing = status.missing.map(m => m.label)
    if (!status.conditionConfirmed) missing.push('Resolution independently confirmed')
    fail(409, 'closure_incomplete', `Closure evidence is missing: ${missing.join('; ')}.`, { missing })
  }
  record.status = 'Closure verified'
  timeline(record, 'Closure verified', 'Every required closure item is on the evidence ledger.')
  ctx.store.put('cases', record, caseId)
  ctx.store.audit(user.id, 'case.close', caseId, 'closure verified')
  return caseView(ctx, user, record)
}

export function requestReopen(ctx: Ctx, user: User, caseId: string, reason: string): CaseView {
  const record = loadVisibleCase(ctx, user, caseId)
  if (record.reporterId !== user.id) fail(403, 'forbidden', 'Only the reporter can request reopening.')
  if (record.status === 'Reopening requested') fail(409, 'already_requested', 'Reopening has already been requested.')
  if (reason.trim().length < 10) fail(400, 'reason_required', 'Explain why in at least 10 characters.')
  record.statusBeforeReopen = record.status
  record.status = 'Reopening requested'
  record.reopenReason = reason.trim().slice(0, 1000)
  timeline(record, 'Reopening requested', 'The reporter asked for the case to be reviewed again.')
  ctx.store.put('cases', record, caseId)
  return caseView(ctx, user, record)
}

export function reviewReopen(ctx: Ctx, user: User, caseId: string, accept: boolean): CaseView {
  if (!can(user, 'case.close')) fail(403, 'forbidden', 'Only an operator can review a reopening request.')
  const record = loadCase(ctx, caseId)
  if (record.status !== 'Reopening requested') fail(409, 'no_request', 'There is no reopening request.')
  record.status = accept ? 'Evidence review' : record.statusBeforeReopen ?? 'Evidence review'
  timeline(record, accept ? 'Case reopened' : 'Reopening declined', accept ? 'New evidence can be added.' : 'The previous outcome stands. The reporter can appeal to the trust desk.')
  ctx.store.put('cases', record, caseId)
  ctx.store.audit(user.id, accept ? 'case.reopen' : 'case.reopen_declined', caseId, record.reopenReason ?? '')
  return caseView(ctx, user, record)
}

// ---------- public updates ----------

function identities(ctx: Ctx): string[] {
  return ctx.store.all<User>('users').flatMap(u => [u.name, u.alias, u.id, u.name.split(' (')[0]])
}

export function draftUpdate(ctx: Ctx, user: User, caseId: string): PublicUpdate {
  if (!can(user, 'update.draft')) fail(403, 'forbidden', 'Only an operator can draft public updates.')
  const record = loadCase(ctx, caseId)
  const complete = closureStatus(getPack(record.policyPackId), ctx.store.byCase<EvidenceItem>('evidence', caseId), record.predicates).complete && record.status === 'Closure verified'
  const update: PublicUpdate = { id: newId('PU'), caseId, text: draftPublicUpdate(getPack(record.policyPackId), record.predicates, complete), status: 'Draft', createdAt: nowIso() }
  return ctx.store.put('public_updates', update, caseId)
}

export function publishUpdate(ctx: Ctx, user: User, updateId: string, text?: string): PublicUpdate {
  if (!can(user, 'update.publish')) fail(403, 'forbidden', 'Only an operator can publish public updates.')
  const update = ctx.store.get<PublicUpdate>('public_updates', updateId) ?? fail(404, 'update_not_found', 'This update does not exist.')
  const finalText = (text ?? update.text).trim()
  const problems = guardPublicText(finalText, identities(ctx))
  if (problems.length) fail(422, 'unsafe_public_text', `This update cannot be published: it ${problems.join(', ')}.`, { problems })
  Object.assign(update, { text: finalText, status: 'Published', publishedAt: nowIso(), publishedBy: user.id })
  ctx.store.put('public_updates', update, update.caseId)
  const record = loadCase(ctx, update.caseId)
  timeline(record, 'Public update published', 'A redacted outcome was published after operator review.')
  ctx.store.put('cases', record, record.id)
  ctx.store.audit(user.id, 'update.publish', update.caseId, finalText)
  return update
}

export function publicUpdates(ctx: Ctx): PublicUpdateView[] {
  return ctx.store.all<PublicUpdate>('public_updates').filter(u => u.status === 'Published').map(u => {
    const record = ctx.store.get<Case>('cases', u.caseId)!
    return { id: u.id, text: u.text, publishedAt: u.publishedAt!, category: record.category, locationId: record.locationId }
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

// ---------- trust and abuse ----------

export function revealIdentity(ctx: Ctx, user: User, caseId: string, reason: string): { userId: string; name: string } {
  if (!can(user, 'identity.reveal')) {
    ctx.store.audit(user.id, 'identity.reveal_denied', caseId, `role ${user.role}`)
    fail(403, 'forbidden', 'Only an audited trust officer can reveal a reporter’s identity.')
  }
  if (reason.trim().length < 10) fail(400, 'reason_required', 'Record the reason for revealing identity (at least 10 characters).')
  const record = loadCase(ctx, caseId)
  const reporter = getUser(ctx, record.reporterId)!
  ctx.store.audit(user.id, 'identity.reveal', caseId, reason.trim())
  return { userId: reporter.id, name: reporter.name }
}

export function flagAbuse(ctx: Ctx, user: User, caseId: string, reason: string): CaseView {
  if (!can(user, 'abuse.flag')) fail(403, 'forbidden', 'Only an operator or trust officer can flag a report.')
  const record = loadCase(ctx, caseId)
  record.abuseFlags += 1
  ctx.store.put('cases', record, caseId)
  ctx.store.audit(user.id, 'abuse.flag', caseId, reason.trim().slice(0, 500))
  return caseView(ctx, user, record)
}

export function abuseQueue(ctx: Ctx, user: User, threshold = 2): { reporterAlias: string; flags: number; caseIds: string[] }[] {
  if (!can(user, 'abuse.view')) fail(403, 'forbidden', 'Only an operator or trust officer can view abuse review.')
  const byReporter = new Map<string, { reporterAlias: string; flags: number; caseIds: string[] }>()
  for (const c of ctx.store.all<Case>('cases').filter(c => c.abuseFlags > 0)) {
    const entry = byReporter.get(c.reporterId) ?? { reporterAlias: c.reporterAlias, flags: 0, caseIds: [] }
    entry.flags += c.abuseFlags
    entry.caseIds.push(c.id)
    byReporter.set(c.reporterId, entry)
  }
  return [...byReporter.values()].filter(e => e.flags >= threshold)
}

export function related(ctx: Ctx, user: User, caseId: string): RelatedView[] {
  const record = loadVisibleCase(ctx, user, caseId)
  if (!(can(user, 'case.viewAll') || isDepartmentStaff(user, record))) fail(403, 'forbidden', 'Related reports are visible to staff only.')
  const pool = ctx.store.all<Case>('cases').filter(c => canViewCase(user, c))
  return suggestRelated(record, pool).map(s => {
    const other = pool.find(c => c.id === s.caseId)!
    return { ...s, summary: { id: other.id, title: other.title, locationId: other.locationId, specificLocation: other.specificLocation, category: other.category, createdAt: other.createdAt } }
  })
}

// ---------- view ----------

export function caseView(ctx: Ctx, user: User, record: Case): CaseView {
  const { reporterId, ...rest } = record
  const isReporter = reporterId === user.id
  const pack = getPack(record.policyPackId)
  const evidence = ctx.store.byCase<EvidenceItem>('evidence', record.id)
  const staff = can(user, 'case.viewAll') || isDepartmentStaff(user, record)
  const missions = ctx.store.byCase<Mission>('missions', record.id)
    .filter(m => staff || m.assigneeId === user.id || (isReporter && m.allowedRoles.includes('student')))
    .map(m => missionView(user, m, record))
  return {
    ...rest, isReporter, pack: { id: pack.id, name: pack.name },
    evidence: evidence.map(({ submittedBy: _s, sourceKey: _k, ...e }) => e),
    missions,
    workOrders: ctx.store.byCase<WorkOrder>('work_orders', record.id),
    closure: closureStatus(pack, evidence, record.predicates),
    publicUpdates: staff || isReporter ? ctx.store.byCase<PublicUpdate>('public_updates', record.id) : [],
    permissions: {
      addEvidenceKinds: evidenceKindsFor(user, record),
      approveWorkOrder: can(user, 'workorder.approve') && record.status !== 'Closure verified',
      updateWorkOrder: user.role === 'operator' || isDepartmentStaff(user, record),
      close: can(user, 'case.close') && record.status !== 'Closure verified',
      reopen: isReporter && record.status !== 'Reopening requested',
      reviewReopen: can(user, 'case.close') && record.status === 'Reopening requested',
      draftUpdate: can(user, 'update.draft'),
      publishUpdate: can(user, 'update.publish'),
      revealIdentity: can(user, 'identity.reveal'),
      flagAbuse: can(user, 'abuse.flag'),
      viewRelated: staff,
    },
  }
}
