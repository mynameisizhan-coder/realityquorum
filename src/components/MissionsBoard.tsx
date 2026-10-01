import { useState } from 'react'
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  ShieldX,
} from 'lucide-react'
import { api } from '../api/client'
import { useMissions } from '../api/hooks'
import { getLocation } from '../data/campus'
import { validateFiles } from '../lib/cases'
import type { MissionView } from '../../shared/api'
import type { EvidenceKind, Finding } from '../../shared/domain'
import './staff.css'

// Live evidence missions for the signed-in account. Eligibility comes from the server, which also
// re-checks role, qualification and the capture challenge on every request.

const KIND_LABEL: Partial<Record<EvidenceKind, string>> = {
  photo: 'Photograph',
  receipt: 'Receipt or order reference',
  observation: 'Written observation',
  independent_confirmation: 'Independent confirmation',
  closure_photo: 'Closure photograph',
  supervisor_record: 'Supervisor record',
  isolation_record: 'Isolation record',
  authorized_inspection: 'Authorised inspection result',
  corrective_action: 'Corrective action',
  official_source: 'Official source response',
}
const PHOTO_KINDS: EvidenceKind[] = ['photo', 'closure_photo', 'independent_confirmation']

function SubmitForm({
  mission,
  onDone,
}: {
  mission: MissionView
  onDone: (notice: string) => void
}) {
  const [kind, setKind] = useState<EvidenceKind>(mission.evidenceKinds[0])
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [answers, setAnswers] = useState<Record<string, 'supports' | 'contradicts' | ''>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const targets = mission.targets.filter((t) => t.acceptedKinds.includes(kind))
  const needsPhoto = PHOTO_KINDS.includes(kind)

  async function submit() {
    const findings: Finding[] = targets.flatMap((t) =>
      answers[t.id] ? [{ predicateId: t.id, effect: answers[t.id] as Finding['effect'] }] : [],
    )
    if (note.trim().length < 5 && !files.length)
      return setError('Describe what you found, or attach a photograph.')
    setSaving(true)
    setError('')
    try {
      await api.submitMission(
        mission.id,
        { kind, note, findings, challengeCode: mission.challengeCode },
        files,
      )
      onDone(`Evidence submitted for “${mission.title}”.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit the evidence.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mission-submit">
      <div className="challenge-code">
        <span>Capture challenge</span>
        <strong>{mission.challengeCode}</strong>
        <small>
          Write this code on paper and include it in one photograph. It shows the photo was taken
          for this mission.
        </small>
      </div>
      <label>
        Evidence type
        <select value={kind} onChange={(e) => setKind(e.target.value as EvidenceKind)}>
          {mission.evidenceKinds.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k] ?? k}
            </option>
          ))}
        </select>
      </label>
      {targets.map((t) => (
        <fieldset key={t.id} className="finding-choice">
          <legend>{t.text}</legend>
          {(
            [
              ['supports', 'Yes, I saw this'],
              ['contradicts', 'No, it is not the case'],
              ['', 'Could not tell'],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name={`${mission.id}-${t.id}`}
                checked={(answers[t.id] ?? '') === value}
                onChange={() => setAnswers({ ...answers, [t.id]: value })}
              />
              {label}
            </label>
          ))}
        </fieldset>
      ))}
      <label>
        What you observed
        <textarea
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Time, exact spot, and what is visible"
        />
      </label>
      <label>
        <span>
          {needsPhoto ? 'Photograph' : 'Attachment'}{' '}
          <span className="optional">{needsPhoto ? 'recommended' : 'optional'}</span>
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          onChange={(e) => {
            const chosen = Array.from(e.target.files ?? [])
            const problem = validateFiles(chosen)
            if (problem) setError(problem)
            else setFiles(chosen)
          }}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="button primary compact" disabled={saving} onClick={submit}>
        {saving ? 'Submitting…' : 'Submit evidence'}
      </button>
    </div>
  )
}

export default function MissionsBoard({
  userId,
  onNotice,
}: {
  userId?: string
  onNotice: (notice: string) => void
}) {
  const { data: missions, loading, error, reload } = useMissions(userId)
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState('')
  // Open missions, plus ones you have accepted; your submitted work; and (operators only) missions others are handling.
  const open = missions.filter(
    (m) => m.status === 'Open' || (m.assignedToMe && m.status === 'Accepted'),
  )
  const done = missions.filter((m) => m.assignedToMe && m.status === 'Submitted')
  const others = missions.filter((m) => !m.assignedToMe && m.status !== 'Open')

  async function accept(mission: MissionView) {
    setBusy(mission.id)
    setActionError('')
    try {
      await api.acceptMission(mission.id)
      await reload()
      onNotice(`Mission accepted: ${mission.title}.`)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not accept the mission.')
    } finally {
      setBusy('')
    }
  }

  if (loading && !missions.length) return <p className="input-note">Loading missions…</p>
  if (error)
    return (
      <p role="alert" className="form-error">
        {error}
      </p>
    )

  return (
    <div className="missions-board">
      {actionError && (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      )}
      {!open.length && (
        <div className="staff-empty">
          <ClipboardCheck size={30} />
          <strong>No open missions for this account.</strong>
          <p>
            Missions appear when a case needs evidence that your role is allowed to collect. Switch
            demo account to see other roles.
          </p>
        </div>
      )}
      <div className="mission-grid">
        {open.map((m) => (
          <section
            className={`mission-card live ${m.eligibility.ok || m.assignedToMe ? '' : 'is-locked'}`}
            key={m.id}
          >
            <div>
              <span className="mission-icon">
                {m.area === 'restricted' ? <LockKeyhole size={20} /> : <Camera size={20} />}
              </span>
              <span className="mission-number">{m.caseSummary.id}</span>
            </div>
            <span className="eyebrow">
              {m.isDisconfirmation
                ? 'Alternative explanation'
                : m.area === 'restricted'
                  ? 'Authorised staff'
                  : 'Public area'}{' '}
              · {m.status}
            </span>
            <h2>{m.title}</h2>
            <p className="mission-case">
              <MapPin size={13} />{' '}
              {getLocation(m.caseSummary.locationId)?.shortName ?? 'Campus-wide'}
              {m.caseSummary.specificLocation ? ` · ${m.caseSummary.specificLocation}` : ''}
            </p>
            <ul className="mission-steps">
              {m.instructions.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
            {m.forbiddenActions.length > 0 && (
              <div className="mission-boundary">
                <ShieldCheck size={15} />
                Do not: {m.forbiddenActions.join('; ').toLowerCase()}.
              </div>
            )}
            {m.assignedToMe && m.status === 'Accepted' ? (
              <SubmitForm
                mission={m}
                onDone={(notice) => {
                  onNotice(notice)
                  void reload()
                }}
              />
            ) : m.eligibility.ok ? (
              <button
                className="button primary compact"
                disabled={busy === m.id}
                onClick={() => accept(m)}
              >
                {busy === m.id ? 'Accepting…' : 'Accept mission'}
              </button>
            ) : (
              <p className="mission-locked">
                <ShieldX size={14} /> {m.eligibility.reason}
              </p>
            )}
          </section>
        ))}
      </div>
      {done.length > 0 && (
        <div className="missions-done">
          <h3>Your submitted evidence</h3>
          {done.map((m) => (
            <p key={m.id}>
              <CheckCircle2 size={14} /> {m.title} · {m.caseSummary.id}
            </p>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="missions-done">
          <h3>Being handled by others</h3>
          {others.map((m) => (
            <p key={m.id}>
              <CheckCircle2 size={14} /> {m.title} · {m.caseSummary.id} · {m.status}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
