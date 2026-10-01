import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clock3,
  Download,
  FileImage,
  LockKeyhole,
  MapPin,
  Paperclip,
  Plus,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { Dialog } from './Dialog'
import StaffActions from './StaffActions'
import { getLocation } from '../data/campus'
import { ownerFor, toAttachments, validateFiles } from '../lib/cases'
import type { Attachment, CaseRecord } from '../types'

const time = (at: string) =>
  new Date(at).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
function AttachmentItem({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (attachment.url) {
      setUrl(attachment.url)
      return
    }
    const value = URL.createObjectURL(attachment.blob)
    setUrl(value)
    return () => URL.revokeObjectURL(value)
  }, [attachment.blob, attachment.url])
  return (
    <a className="evidence-file" href={url || undefined} download={attachment.name}>
      {attachment.type.startsWith('image/') && url ? (
        <img src={url} alt={`Submitted evidence: ${attachment.name}`} />
      ) : (
        <span>
          <FileImage size={24} />
        </span>
      )}
      <div>
        <strong>{attachment.name}</strong>
        <small>Private preview attachment · {(attachment.size / 1024).toFixed(0)} KB</small>
      </div>
      <Download size={17} />
    </a>
  )
}
export default function CaseDialog({
  record,
  onClose,
  onUpdate,
  onRefresh,
}: {
  record: CaseRecord
  onClose: () => void
  onUpdate: (value: CaseRecord) => Promise<void>
  /** Reload this case from the server after a staff action. */
  onRefresh?: (id: string, notice: string) => Promise<void>
}) {
  const [tab, setTab] = useState<'overview' | 'evidence' | 'timeline'>('overview')
  const [files, setFiles] = useState<File[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [reason, setReason] = useState('')
  const location = getLocation(record.locationId)
  async function addEvidence() {
    if (saving) return
    if (!files.length && note.trim().length < 5) {
      setError('Add a file or a short context note first.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onUpdate({
        ...record,
        attachments: [...record.attachments, ...toAttachments(files)],
        timeline: [
          ...record.timeline,
          {
            title: 'Additional context submitted',
            detail: `${files.length ? `${files.length} attachment(s) added. ` : ''}${note.trim() || 'No additional note.'} Evidence has not been independently verified.`,
            at: new Date().toISOString(),
          },
        ],
      })
      setFiles([])
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the evidence.')
    } finally {
      setSaving(false)
    }
  }
  async function requestReopening() {
    if (reason.trim().length < 10) {
      setError('Explain why the case should reopen in at least 10 characters.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onUpdate({
        ...record,
        status: 'Reopening requested',
        timeline: [
          ...record.timeline,
          { title: 'Reopening requested', detail: reason.trim(), at: new Date().toISOString() },
        ],
      })
      setReopening(false)
    } catch {
      setError('Could not save your reopening request.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog
      title={record.title}
      subtitle={`${record.id} · ${record.demo ? 'Prepared demonstration' : 'Private development case'}`}
      onClose={onClose}
      wide
    >
      <div className="case-meta">
        <span className={`status-badge status-${record.status.toLowerCase().replaceAll(' ', '-')}`}>
          <i />
          {record.status}
        </span>
        <span>
          <MapPin size={14} />
          {location?.shortName || 'Campus-wide / unknown'}
        </span>
        <span>
          <LockKeyhole size={14} />
          {record.demo ? 'Example data' : 'Private case'}
        </span>
      </div>
      <div className="detail-tabs">
        {(['overview', 'evidence', 'timeline'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={tab === t ? 'active' : ''}
          >
            {t === 'evidence'
              ? `Evidence ${record.attachments.length ? `(${record.attachments.length})` : ''}`
              : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="dialog-content case-content">
        {record.demo && (
          <div className="demo-notice">
            <InfoIcon />
            Prepared scenario. This is not an allegation or a live incident at NMAMIT.
          </div>
        )}
        {tab === 'overview' && (
          <>
            <div className="case-description">
              <span className="eyebrow">
                {record.route === 'message' ? 'Message verification' : 'Direct observation'}
              </span>
              <p>{record.description || 'The submitted message is in the attachments.'}</p>
            </div>
            <div className="case-routing">
              <div>
                <span>Responsible team</span>
                <strong>
                  {record.view?.department ||
                    (record.demo ? ownerFor(record.category) : 'Not assigned')}
                </strong>
                <small>
                  {record.view
                    ? `Reporter: ${record.view.reporterAlias}`
                    : record.demo
                      ? 'Illustrative assignment'
                      : `Proposed: ${ownerFor(record.category)}`}
                </small>
              </div>
              <div>
                <span>Response target</span>
                <strong>
                  {record.view?.workOrders.length
                    ? time(record.view.workOrders.at(-1)!.dueAt)
                    : 'Awaiting operator triage'}
                </strong>
                <small>
                  {record.view?.workOrders.length
                    ? record.view.workOrders.at(-1)!.status
                    : 'No work order approved yet'}
                </small>
              </div>
            </div>
            {record.predicates.length ? (
              <div className="predicate-list">
                <h3>What the evidence actually supports</h3>
                {record.predicates.map((p) => (
                  <div key={p.text} className="predicate">
                    <span className={`predicate-icon ${p.state.toLowerCase()}`}>
                      {p.state === 'Supported' ? (
                        <CheckCircle2 size={18} />
                      ) : p.state === 'Contradicted' ? (
                        <RotateCcw size={17} />
                      ) : (
                        <Circle size={17} />
                      )}
                    </span>
                    <div>
                      <strong>{p.text}</strong>
                      <p>{p.explanation}</p>
                    </div>
                    <span className={`finding ${p.state.toLowerCase()}`}>{p.state}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pending-evidence">
                <ShieldCheck size={28} />
                <div>
                  <h3>No finding yet.</h3>
                  <p>
                    A submission starts the process. Evidence review and connected verification are
                    needed before any claim can be supported.
                  </p>
                </div>
              </div>
            )}
            {record.food && (
              <div className="food-context">
                <h3>Serving context</h3>
                <dl>
                  <div>
                    <dt>Food item</dt>
                    <dd>{record.food.item || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt>Serving time</dt>
                    <dd>{record.food.servedAt ? time(record.food.servedAt) : 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt>Order reference</dt>
                    <dd>{record.food.receipt || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt>Moved / disturbed</dt>
                    <dd>{record.food.disturbed}</dd>
                  </div>
                </dl>
              </div>
            )}
            <div className="closure-note">
              <ClipboardCheck size={21} />
              <div>
                <strong>Resolution needs evidence.</strong>
                <p>
                  {record.category === 'Food & canteen'
                    ? 'An authorized action record, serving or batch isolation, inspection result and reporter notification are required before closure.'
                    : 'An action record and fresh confirmation of the resolved condition are required before closure.'}
                </p>
              </div>
            </div>
            {record.view && (
              <section className="case-actions-summary">
                <h3>Campus response</h3>
                {record.view.workOrders.length ? (
                  record.view.workOrders.map((order) => (
                    <article key={order.id} className="work-order-card">
                      <div>
                        <span className="eyebrow">{order.id}</span>
                        <span className="status-badge">{order.status}</span>
                      </div>
                      <strong>{order.department}</strong>
                      <p>
                        Response target: {time(order.dueAt)} · {order.targetResponseHours} hours
                      </p>
                      <ul>
                        {order.actions.map((action) => (
                          <li key={action}>{action}</li>
                        ))}
                      </ul>
                      {order.notes.map((entry, i) => (
                        <p key={i}>{entry.text}</p>
                      ))}
                    </article>
                  ))
                ) : (
                  <p className="section-description">
                    No work order has been approved. Routing a report does not authorize an action
                    by itself.
                  </p>
                )}
                <h3>Closure checklist</h3>
                <div className="closure-checklist">
                  {record.view.closure.met.map((item) => (
                    <div key={item.kind} className="met">
                      <CheckCircle2 size={15} />
                      <span>{item.label}</span>
                      <small>Recorded</small>
                    </div>
                  ))}
                  {record.view.closure.missing.map((item) => (
                    <div key={item.kind}>
                      <Circle size={15} />
                      <span>{item.label}</span>
                      <small>Required</small>
                    </div>
                  ))}
                </div>
                {!record.view.closure.conditionConfirmed && (
                  <p className="input-note">
                    The resolved physical condition must also be supported by evidence.
                  </p>
                )}
              </section>
            )}
            {record.view && onRefresh && (
              <StaffActions view={record.view} onChanged={(notice) => onRefresh(record.id, notice)} />
            )}
            {record.status === 'Closure verified' &&
              record.view?.permissions.reopen &&
              !reopening && (
                <button className="button secondary" onClick={() => setReopening(true)}>
                  <RotateCcw size={15} /> Request reopening
                </button>
              )}
            {reopening && (
              <div className="add-evidence">
                <label>
                  Why should this case reopen?
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={2000}
                  />
                </label>
                <button className="button primary" disabled={saving} onClick={requestReopening}>
                  Save reopening request
                </button>
              </div>
            )}
          </>
        )}
        {tab === 'evidence' && (
          <>
            <h3>Evidence ledger</h3>
            <p className="section-description">
              Keep the original context. An attachment is evidence to review, not proof by itself.
            </p>
            {record.view && record.view.evidence.length > 0 && (
              <div className="evidence-records">
                {record.view.evidence.map((item) => (
                  <article className="evidence-record" key={item.id}>
                    <div>
                      <span className="eyebrow">{item.kind.replaceAll('_', ' ')}</span>
                      <time>{time(item.recordedAt)}</time>
                    </div>
                    <strong>{item.sourceAlias}</strong>
                    {item.note && <p>{item.note}</p>}
                    {item.observations.map((observation, i) => (
                      <p className="observation-note" key={i}>
                        {observation}
                      </p>
                    ))}
                    {item.demo && (
                      <span className="demo-pill">Prepared demonstration evidence</span>
                    )}
                  </article>
                ))}
              </div>
            )}
            {record.attachments.length > 0 ? (
              <div className="evidence-files">
                {record.attachments.map((a) => (
                  <AttachmentItem key={a.id} attachment={a} />
                ))}
              </div>
            ) : (
              <div className="empty-evidence">
                <FileImage size={30} />
                <strong>
                  {record.demo ? 'Illustrative observations only' : 'No attachments yet'}
                </strong>
                <p>
                  {record.demo
                    ? 'This example describes the review process without using real food photographs or campus accusations.'
                    : 'You can submit without a photograph and add context when it is safe.'}
                </p>
              </div>
            )}
            {record.view?.permissions.addEvidenceKinds.includes('observation') && (
              <div className="add-evidence">
                <h3>Add evidence or context</h3>
                <label className="upload-label" htmlFor="evidence-files">
                  <Paperclip size={20} />
                  <span>
                    <strong>
                      {files.length
                        ? `${files.length} files selected`
                        : 'Choose photos or documents'}
                    </strong>
                    <small>JPG, PNG, WebP, PDF · up to 5 files · 10 MB each</small>
                  </span>
                  <Plus size={18} />
                </label>
                <input
                  className="visually-hidden"
                  id="evidence-files"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  multiple
                  onChange={(e) => {
                    const selected = Array.from(e.target.files || [])
                    const err = validateFiles(selected)
                    if (err) {
                      setError(err)
                      setFiles([])
                    } else {
                      setFiles(selected)
                      setError('')
                    }
                    e.target.value = ''
                  }}
                />
                <label>
                  What does this add?
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Describe the time, location and what is visible…"
                  />
                </label>
                <p className="input-note">
                  Stay in public areas. Do not handle unsafe food or enter restricted areas to
                  collect evidence.
                </p>
                <button className="button primary" disabled={saving} onClick={addEvidence}>
                  {saving ? 'Saving…' : 'Add to evidence ledger'} <ArrowUpRight size={15} />
                </button>
              </div>
            )}
          </>
        )}
        {tab === 'timeline' && (
          <>
            <h3>Every step, in context.</h3>
            <div className="timeline">
              {record.timeline.map((entry, index) => (
                <div className="timeline-item" key={`${entry.at}-${index}`}>
                  <span className="timeline-dot">
                    {index === record.timeline.length - 1 ? (
                      <Clock3 size={14} />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                  </span>
                  <div>
                    <time>{time(entry.at)}</time>
                    <strong>{entry.title}</strong>
                    <p>{entry.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <span>
          <LockKeyhole size={15} />
          {record.demo
            ? 'Prepared demonstration · no live allegation'
            : 'Local development server · no real campus notification'}
        </span>
        <button className="button secondary compact" onClick={onClose}>
          Done <CheckCircle2 size={15} />
        </button>
      </div>
    </Dialog>
  )
}
function InfoIcon() {
  return <span className="tiny-info">i</span>
}
