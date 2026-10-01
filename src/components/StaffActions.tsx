import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Flag,
  Globe2,
  Link2,
  ShieldCheck,
} from 'lucide-react'
import { api } from '../api/client'
import type { CaseView, RelatedView } from '../../shared/api'
import type { EvidenceKind, PublicUpdate, WorkOrder } from '../../shared/domain'
import './staff.css'

// Staff controls for one case. Every action is checked again by the server; these controls only
// appear when the server's permissions say the signed-in account may use them.

const KIND_LABEL: Partial<Record<EvidenceKind, string>> = {
  supervisor_record: 'Supervisor action record',
  isolation_record: 'Serving or batch isolated',
  authorized_inspection: 'Authorised inspection result',
  corrective_action: 'Corrective action',
  reporter_notification: 'Reporter notified',
  closure_photo: 'Closure photograph',
  official_source: 'Official source response',
  observation: 'Observation',
}
const RECORD_KINDS: EvidenceKind[] = [
  'supervisor_record',
  'isolation_record',
  'authorized_inspection',
  'corrective_action',
  'closure_photo',
  'reporter_notification',
]

/** Server errors already explain themselves (e.g. which closure items are missing, why text cannot be published). */
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.'

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <section className="staff-section">
      <h4>
        {icon}
        {title}
      </h4>
      {children}
    </section>
  )
}

export default function StaffActions({
  view,
  onChanged,
}: {
  view: CaseView
  onChanged: (notice: string) => Promise<void>
}) {
  const p = view.permissions
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [recordKind, setRecordKind] = useState<EvidenceKind>(
    () => RECORD_KINDS.find((k) => p.addEvidenceKinds.includes(k)) ?? 'observation',
  )
  const [recordNote, setRecordNote] = useState('')
  const [recordFiles, setRecordFiles] = useState<File[]>([])
  const [issuer, setIssuer] = useState('')
  const [issuerSays, setIssuerSays] = useState<'supports' | 'contradicts'>('contradicts')
  const [issuerNote, setIssuerNote] = useState('')
  const [draft, setDraft] = useState<PublicUpdate | null>(null)
  const [draftText, setDraftText] = useState('')
  const [related, setRelated] = useState<RelatedView[] | null>(null)
  const [revealReason, setRevealReason] = useState('')
  const [revealed, setRevealed] = useState('')
  const [abuseReason, setAbuseReason] = useState('')
  const [woNote, setWoNote] = useState('')

  const openOrder = view.workOrders.find((w) => w.status !== 'Marked resolved')
  const attribution = view.predicates.filter((pr) => pr.tier === 'attribution')
  const recordKinds = RECORD_KINDS.filter((k) => p.addEvidenceKinds.includes(k))
  const staffView = p.viewRelated || p.updateWorkOrder || p.revealIdentity
  if (!staffView) return null

  async function run(label: string, action: () => Promise<unknown>, notice: string) {
    setBusy(label)
    setError('')
    try {
      await action()
      await onChanged(notice)
      return true
    } catch (e) {
      setError(message(e))
      return false
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="staff-actions" aria-label="Staff actions">
      <div className="staff-heading">
        <ShieldCheck size={18} />
        <div>
          <strong>Staff actions</strong>
          <small>Every action is permission-checked and recorded on the case timeline.</small>
        </div>
      </div>

      {p.approveWorkOrder && !openOrder && (
        <Section icon={<ClipboardCheck size={15} />} title="Campus action">
          <p className="input-note">
            {view.outcome === 'Confirmed observable condition'
              ? 'An observable condition is supported. Approving creates a work order for ' +
                view.department +
                '.'
              : 'Nothing observable is supported yet. You can still approve precautionary triage.'}
          </p>
          <div className="staff-row">
            <button
              className="button primary compact"
              disabled={!!busy || view.outcome !== 'Confirmed observable condition'}
              onClick={() =>
                run('wo', () => api.approveWorkOrder(view.id, 'verified'), 'Work order approved.')
              }
            >
              Approve work order
            </button>
            <button
              className="button secondary compact"
              disabled={!!busy}
              onClick={() =>
                run(
                  'wo',
                  () => api.approveWorkOrder(view.id, 'precautionary'),
                  'Precautionary work order approved.',
                )
              }
            >
              Approve as precaution
            </button>
          </div>
        </Section>
      )}

      {p.updateWorkOrder && openOrder && (
        <Section
          icon={<ClipboardCheck size={15} />}
          title={`Work order ${openOrder.id} · ${openOrder.status}`}
        >
          <label>
            <span>
              Progress note <span className="optional">optional</span>
            </span>
            <input
              value={woNote}
              maxLength={1000}
              onChange={(e) => setWoNote(e.target.value)}
              placeholder="What was done?"
            />
          </label>
          <div className="staff-row">
            {(['In progress', 'Marked resolved'] as WorkOrder['status'][])
              .filter((s) => s !== openOrder.status)
              .map((status) => (
                <button
                  key={status}
                  className={`button ${status === 'Marked resolved' ? 'primary' : 'secondary'} compact`}
                  disabled={!!busy}
                  onClick={async () => {
                    if (
                      await run(
                        'wostatus',
                        () => api.updateWorkOrder(openOrder.id, status, woNote),
                        `Work order: ${status}.`,
                      )
                    )
                      setWoNote('')
                  }}
                >
                  {status === 'Marked resolved' ? 'Mark resolved' : 'Mark in progress'}
                </button>
              ))}
          </div>
          {openOrder.status !== 'Marked resolved' && (
            <p className="input-note">
              Marking resolved does not close the case. Closure evidence is checked separately.
            </p>
          )}
        </Section>
      )}

      {attribution.length > 0 && p.addEvidenceKinds.includes('official_source') && (
        <Section icon={<Link2 size={15} />} title="Check with the claimed issuer">
          {attribution.map((pr) => (
            <p key={pr.id} className="input-note">
              {pr.text} <b>· {pr.state}</b>
            </p>
          ))}
          <div className="field-pair">
            <label>
              Office contacted
              <input
                value={issuer}
                maxLength={120}
                onChange={(e) => setIssuer(e.target.value)}
                placeholder="e.g. Registrar office"
              />
            </label>
            <label>
              Their answer
              <select
                value={issuerSays}
                onChange={(e) => setIssuerSays(e.target.value as 'supports' | 'contradicts')}
              >
                <option value="contradicts">Explicitly denies issuing it</option>
                <option value="supports">Confirms issuing it</option>
              </select>
            </label>
          </div>
          <label>
            Record
            <input
              value={issuerNote}
              maxLength={2000}
              onChange={(e) => setIssuerNote(e.target.value)}
              placeholder="Who answered, how, and when"
            />
          </label>
          <p className="input-note">
            If the office cannot be reached, record nothing. Absence from a registry is not a
            denial.
          </p>
          <button
            className="button secondary compact"
            disabled={!!busy || issuer.trim().length < 3}
            onClick={async () => {
              const ok = await run(
                'issuer',
                () =>
                  api.addEvidence(view.id, {
                    kind: 'official_source',
                    issuer,
                    note: issuerNote,
                    findings: attribution.map((pr) => ({ predicateId: pr.id, effect: issuerSays })),
                  }),
                'Official source response recorded.',
              )
              if (ok) {
                setIssuer('')
                setIssuerNote('')
              }
            }}
          >
            Record response
          </button>
        </Section>
      )}

      {recordKinds.length > 0 && (
        <Section icon={<CheckCircle2 size={15} />} title="Record action or closure evidence">
          <div className="field-pair">
            <label>
              Record type
              <select
                value={recordKind}
                onChange={(e) => setRecordKind(e.target.value as EvidenceKind)}
              >
                {recordKinds.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k] ?? k}
                    {view.closure.missing.some((m) => m.kind === k) ? ' · required' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                Attachment <span className="optional">optional</span>
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                onChange={(e) => setRecordFiles(Array.from(e.target.files ?? []))}
              />
            </label>
          </div>
          <label>
            Details
            <textarea
              rows={2}
              maxLength={2000}
              value={recordNote}
              onChange={(e) => setRecordNote(e.target.value)}
              placeholder="What was done, by whom, and when"
            />
          </label>
          <button
            className="button secondary compact"
            disabled={!!busy || recordNote.trim().length < 5}
            onClick={async () => {
              const ok = await run(
                'record',
                () => api.addEvidence(view.id, { kind: recordKind, note: recordNote }, recordFiles),
                `${KIND_LABEL[recordKind] ?? 'Record'} added to the ledger.`,
              )
              if (ok) {
                setRecordNote('')
                setRecordFiles([])
              }
            }}
          >
            Add to evidence ledger
          </button>
        </Section>
      )}

      {p.close && (
        <Section icon={<CheckCircle2 size={15} />} title="Close the case">
          <p className="input-note">
            {view.closure.complete
              ? 'All closure evidence is recorded.'
              : `Still required: ${[...view.closure.missing.map((m) => m.label), ...(view.closure.conditionConfirmed ? [] : ['Resolution independently confirmed'])].join('; ')}.`}
          </p>
          <button
            className="button primary compact"
            disabled={!!busy || !view.closure.complete}
            onClick={() => run('close', () => api.closeCase(view.id), 'Closure verified.')}
          >
            Verify closure
          </button>
        </Section>
      )}

      {p.reviewReopen && (
        <Section icon={<AlertTriangle size={15} />} title="Reopening requested">
          <p className="input-note">“{view.reopenReason}”</p>
          <div className="staff-row">
            <button
              className="button primary compact"
              disabled={!!busy}
              onClick={() => run('reopen', () => api.reviewReopen(view.id, true), 'Case reopened.')}
            >
              Reopen
            </button>
            <button
              className="button secondary compact"
              disabled={!!busy}
              onClick={() =>
                run('reopen', () => api.reviewReopen(view.id, false), 'Reopening declined.')
              }
            >
              Decline
            </button>
          </div>
        </Section>
      )}

      {p.draftUpdate && (
        <Section icon={<Globe2 size={15} />} title="Public update">
          {view.publicUpdates
            .filter((u) => u.status === 'Published')
            .map((u) => (
              <p key={u.id} className="staff-published">
                Published: {u.text}
              </p>
            ))}
          {draft ? (
            <>
              <label>
                Draft (built from settled findings only)
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                />
              </label>
              <p className="input-note">
                Publishing is blocked if the text names a person, includes contact details, or
                claims blame, negligence or a whole-facility problem.
              </p>
              <div className="staff-row">
                <button
                  className="button primary compact"
                  disabled={!!busy || !draftText.trim()}
                  onClick={async () => {
                    if (
                      await run(
                        'publish',
                        () => api.publishUpdate(draft.id, draftText),
                        'Public update published.',
                      )
                    )
                      setDraft(null)
                  }}
                >
                  Publish
                </button>
                <button
                  className="button secondary compact"
                  disabled={!!busy}
                  onClick={() => setDraft(null)}
                >
                  Discard
                </button>
              </div>
            </>
          ) : (
            <button
              className="button secondary compact"
              disabled={!!busy}
              onClick={async () => {
                setBusy('draft')
                setError('')
                try {
                  const created = await api.draftPublicUpdate(view.id)
                  setDraft(created)
                  setDraftText(created.text)
                } catch (e) {
                  setError(message(e))
                } finally {
                  setBusy('')
                }
              }}
            >
              Draft a redacted update
            </button>
          )}
        </Section>
      )}

      {p.viewRelated && (
        <Section icon={<Link2 size={15} />} title="Related reports">
          {related === null ? (
            <button
              className="button secondary compact"
              disabled={!!busy}
              onClick={async () => {
                try {
                  setRelated(await api.related(view.id))
                } catch (e) {
                  setError(message(e))
                }
              }}
            >
              Check for related reports
            </button>
          ) : related.length ? (
            <ul className="staff-related">
              {related.map((r) => (
                <li key={r.caseId}>
                  <strong>{r.caseId}</strong> {r.summary.title}
                  <small>{r.reasons.join(' · ')}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="input-note">No related reports found.</p>
          )}
          <p className="input-note">
            Suggestions only. Related reports are never merged automatically.
          </p>
        </Section>
      )}

      {p.revealIdentity && (
        <Section icon={<Eye size={15} />} title="Reveal reporter identity">
          {revealed ? (
            <p className="staff-published">{revealed}</p>
          ) : (
            <>
              <label>
                Reason (recorded in the audit log)
                <input
                  value={revealReason}
                  maxLength={1000}
                  onChange={(e) => setRevealReason(e.target.value)}
                  placeholder="e.g. Abuse review, ticket reference"
                />
              </label>
              <button
                className="button danger compact"
                disabled={!!busy || revealReason.trim().length < 10}
                onClick={async () => {
                  try {
                    const who = await api.revealIdentity(view.id, revealReason)
                    setRevealed(`${who.name} (${who.userId}). This reveal has been audited.`)
                  } catch (e) {
                    setError(message(e))
                  }
                }}
              >
                Reveal identity
              </button>
            </>
          )}
        </Section>
      )}

      {p.flagAbuse && (
        <Section icon={<Flag size={15} />} title="Abuse review">
          <p className="input-note">
            Flags so far: {view.abuseFlags}. Reporters with repeated flags go to trust-officer
            review by alias.
          </p>
          <div className="staff-row">
            <input
              value={abuseReason}
              maxLength={500}
              onChange={(e) => setAbuseReason(e.target.value)}
              placeholder="Reason for flagging"
              aria-label="Reason for flagging"
            />
            <button
              className="button secondary compact"
              disabled={!!busy || abuseReason.trim().length < 5}
              onClick={async () => {
                if (
                  await run(
                    'flag',
                    () => api.flagAbuse(view.id, abuseReason),
                    'Report flagged for abuse review.',
                  )
                )
                  setAbuseReason('')
              }}
            >
              Flag
            </button>
          </div>
        </Section>
      )}

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  )
}
