import type { CaseView, SessionUser } from '../../shared/api'
import type { EvidenceKind } from '../../shared/domain'
import type { Attachment, CaseRecord } from '../types'
import { api } from './client'

// Server-backed replacement for the IndexedDB preview store in src/lib/cases.ts.
// Same function names, so the UI keeps its data flow; saveCase returns the server's version of the record.

export const DEFAULT_DEMO_USER = 'u-student'
const known = new Map<string, CaseRecord>()

let session: Promise<SessionUser> | null = null

/** Signs in as the default demo student if needed. Concurrent callers share one request. */
export function ensureSession(): Promise<SessionUser> {
  session ??= api
    .me()
    .then((me) => me ?? api.login(DEFAULT_DEMO_USER))
    .catch((error) => {
      session = null
      throw error
    })
  return session
}

export async function switchUser(userId: string): Promise<SessionUser> {
  known.clear()
  session = api.login(userId)
  return session
}

async function toRecord(view: CaseView): Promise<CaseRecord> {
  const files = [...new Map(view.evidence.flatMap((e) => e.files).map((f) => [f.id, f])).values()]
  // Files stay on the server; the UI loads each one from its private URL only when shown.
  const attachments: Attachment[] = files.map((file) => ({
    id: file.id,
    name: file.name,
    type: file.type,
    size: file.size,
    blob: new Blob([], { type: file.type }),
    url: api.fileUrl(view.id, file.id),
  }))
  const record: CaseRecord = {
    id: view.id,
    route: view.route,
    title: view.title,
    description: view.description,
    locationId: view.locationId,
    specificLocation: view.specificLocation,
    category: view.category,
    urgency: view.urgency,
    status: view.status,
    createdAt: view.createdAt,
    attachments,
    timeline: view.timeline,
    food: view.food,
    demo: view.demo,
    predicates: view.predicates.map(({ text, state, explanation }) => ({
      text,
      state,
      explanation,
    })),
    view,
  }
  known.set(record.id, record)
  return record
}

/** Cases visible to the signed-in account, newest first. Prepared demo cases are loaded separately. */
export async function loadCases(): Promise<CaseRecord[]> {
  await ensureSession()
  const views = await api.cases()
  return Promise.all(views.filter((v) => !v.demo).map(toRecord))
}

export async function loadDemoCases(): Promise<CaseRecord[]> {
  await ensureSession()
  return Promise.all((await api.cases()).filter((v) => v.demo).map(toRecord))
}

export async function loadCase(id: string): Promise<CaseRecord> {
  return toRecord(await api.case(id))
}

/** Reporters file photos and receipts; staff files go on the ledger as observations (their records use dedicated kinds). */
const kindFor = (type: string, allowed: EvidenceKind[]): EvidenceKind => {
  const wanted: EvidenceKind = type.startsWith('image/') ? 'photo' : 'receipt'
  return allowed.includes(wanted) ? wanted : 'observation'
}

/** Creates a case the server has not seen, or sends the reporter's changes (new evidence, reopening) for one it has. */
export async function saveCase(record: CaseRecord): Promise<CaseRecord> {
  await ensureSession()
  const previous = known.get(record.id)
  if (!previous) {
    const view = await api.createCase(
      {
        route: record.route,
        description: record.description,
        locationId: record.locationId,
        specificLocation: record.specificLocation,
        category: record.category,
        urgency: record.urgency,
        food: record.food,
      },
      record.attachments.map((a) => a.blob),
      record.attachments.map((a) => a.name),
    )
    return toRecord(view)
  }

  const added = record.attachments.filter((a) => !previous.attachments.some((p) => p.id === a.id))
  const newEntries = record.timeline.slice(previous.timeline.length)
  const note = newEntries
    .map((e) => e.detail)
    .join(' ')
    .slice(0, 2000)

  if (record.status === 'Reopening requested' && previous.status !== 'Reopening requested') {
    await api.requestReopen(record.id, note)
  } else if (added.length || newEntries.length) {
    // Files are grouped by evidence kind so each lands on the ledger correctly.
    const allowed = previous.view?.permissions.addEvidenceKinds ?? [
      'photo',
      'receipt',
      'observation',
    ]
    const groups = new Map<EvidenceKind, Attachment[]>()
    for (const file of added)
      groups.set(kindFor(file.type, allowed), [
        ...(groups.get(kindFor(file.type, allowed)) ?? []),
        file,
      ])
    for (const [kind, files] of groups)
      await api.addEvidence(
        record.id,
        { kind, note },
        files.map((f) => f.blob),
        files.map((f) => f.name),
      )
    if (!added.length) await api.addEvidence(record.id, { kind: 'observation', note })
  }
  return loadCase(record.id)
}

/** There is no local data to wipe any more; this signs the demo account out. Cases stay on the server. */
export async function clearCases(): Promise<void> {
  known.clear()
  session = null
  await api.logout()
}
