import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileImage,
  LockKeyhole,
  MapPin,
  Paperclip,
  ShieldCheck,
  X,
} from 'lucide-react'
import { Dialog } from './Dialog'
import { locations, getLocation } from '../data/campus'
import {
  categories,
  ownerFor,
  toAttachments,
  urgencies,
  validateFiles,
  validateSubmission,
} from '../lib/cases'
import type { CaseRecord, Category, Intake, Urgency } from '../types'
import { api } from '../api/client'
import type { SuggestResult } from '../../shared/api'

export default function IntakeDialog({
  route,
  initialLocation,
  onClose,
  onSave,
}: {
  route: Intake
  initialLocation: string | null
  onClose: () => void
  onSave: (record: CaseRecord) => Promise<void>
}) {
  const [step, setStep] = useState(1)
  const [description, setDescription] = useState('')
  const [locationId, setLocationId] = useState(initialLocation || '')
  const [specificLocation, setSpecificLocation] = useState('')
  const [category, setCategory] = useState<Category>(
    initialLocation === 'canteen'
      ? 'Food & canteen'
      : route === 'message'
        ? 'Campus notice'
        : 'Other',
  )
  const [urgency, setUrgency] = useState<Urgency>('Needs attention')
  const [files, setFiles] = useState<File[]>([])
  const [food, setFood] = useState({ item: '', servedAt: '', receipt: '', disturbed: 'Not sure' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState<SuggestResult | null>(null)
  const isMessage = route === 'message'
  const isFood = category === 'Food & canteen'
  async function suggest() {
    if (description.trim().length < 10) {
      setError('Add a short description before requesting a suggestion.')
      return
    }
    setSuggesting(true)
    setError('')
    try {
      setSuggestion(await api.suggest(route, description, locationId || 'unknown'))
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'The category helper is unavailable. You can still choose a category yourself.',
      )
    } finally {
      setSuggesting(false)
    }
  }
  function next(event: FormEvent) {
    event.preventDefault()
    const error = validateSubmission(route, description, locationId, files)
    if (error) {
      setError(error)
      return
    }
    setError('')
    setStep(2)
  }
  async function submit() {
    if (saving) return
    setSaving(true)
    setError('')
    const now = new Date().toISOString()
    const record: CaseRecord = {
      id: `RQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      route,
      title: description.trim().slice(0, 82) || 'Message submitted as an attachment',
      description: description.trim(),
      locationId,
      specificLocation: specificLocation.trim(),
      category,
      urgency,
      status: 'Submitted',
      createdAt: now,
      attachments: toAttachments(files),
      demo: false,
      predicates: [],
      ...(isFood ? { food } : {}),
      timeline: [
        {
          title: 'Saved in your preview workspace',
          detail:
            'Development submission. Server records replace this draft timeline when the case is saved. No real campus notification is sent.',
          at: now,
        },
        {
          title: 'Awaiting connected verification',
          detail: `Proposed routing: ${ownerFor(category)}. No department assignment or response deadline has been confirmed.`,
          at: now,
        },
      ],
    }
    try {
      await onSave(record)
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'The report could not be saved. Please try again.',
      )
      setSaving(false)
    }
  }
  return (
    <Dialog
      title={isMessage ? 'Let’s check the message.' : 'Tell us what you noticed.'}
      subtitle={isMessage ? 'Verify a message' : 'Report an issue'}
      onClose={() => {
        if (!saving) onClose()
      }}
    >
      <div className="form-steps">
        <span className={step === 1 ? 'current' : 'complete'}>
          <b>{step > 1 ? <Check size={12} /> : '1'}</b>The details
        </span>
        <span className="step-line" />
        <span className={step === 2 ? 'current' : ''}>
          <b>2</b>Review & submit
        </span>
      </div>
      {step === 1 ? (
        <form onSubmit={next}>
          <div className="dialog-content form-grid">
            <div className="soft-note">
              <LockKeyhole size={17} />
              <span>
                Private development case. Saved on the local server for demo accounts. Use sample
                data; actual campus staff will not be notified.
              </span>
            </div>
            <label>
              {isMessage ? 'What’s being shared?' : 'What did you observe?'}
              <span className="field-hint">
                {isMessage
                  ? 'Paste a message, notice or link. You can also attach a screenshot.'
                  : 'Stick to what you saw, where it happened and when.'}
              </span>
              <textarea
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={4000}
                rows={4}
                placeholder={
                  isMessage
                    ? '“The college has officially closed the ground-floor emergency exit…”'
                    : 'For example: I noticed an insect-like object in the lunch served to me…'
                }
              />
            </label>
            <div className="field-pair">
              <label>
                <span>
                  <MapPin size={14} /> Campus location
                </span>
                <select
                  required
                  value={locationId}
                  onChange={(e) => {
                    setLocationId(e.target.value)
                    if (e.target.value === 'canteen') setCategory('Food & canteen')
                  }}
                >
                  <option value="" disabled>
                    Choose a location
                  </option>
                  {locations.map((l) => (
                    <option value={l.id} key={l.id}>
                      {l.name}
                      {l.provisional ? ' (provisional)' : ''}
                    </option>
                  ))}
                  <option value="unknown">Location not known / campus-wide</option>
                </select>
              </label>
              <label>
                More precisely <span className="optional">optional</span>
                <input
                  value={specificLocation}
                  onChange={(e) => setSpecificLocation(e.target.value)}
                  maxLength={160}
                  placeholder="Floor, counter or landmark"
                />
              </label>
            </div>
            <div className="field-pair">
              <label>
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                How urgent is it?
                <select value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
                  {urgencies.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="input-note">
              You control the category. The category helper currently uses a demonstration adapter;
              live Gemini is not connected.
            </p>
            <div className="suggestion-box">
              <button
                className="text-button"
                type="button"
                disabled={suggesting}
                onClick={() => void suggest()}
              >
                {suggesting ? 'Checking the description…' : 'Get a category suggestion'}{' '}
                <ArrowRight size={14} />
              </button>
              {suggestion && (
                <div>
                  <span className="demo-pill">Demonstration suggestion</span>
                  <strong>
                    {suggestion.category} · {suggestion.urgency}
                  </strong>
                  <p>{suggestion.rationale}</p>
                  <button
                    className="button secondary compact"
                    type="button"
                    onClick={() => {
                      setCategory(suggestion.category)
                      setUrgency(suggestion.urgency)
                      setSuggestion(null)
                    }}
                  >
                    Use suggestion <Check size={14} />
                  </button>
                  <span>You can edit this choice before submitting.</span>
                </div>
              )}
            </div>
            {urgency === 'Urgent' && (
              <div className="warning-note">
                For immediate danger, move to safety and contact campus security or local emergency
                services directly. This preview does not dispatch help.
              </div>
            )}
            {isFood && (
              <fieldset className="food-fields">
                <legend>
                  About the food serving <span className="optional">add what you know</span>
                </legend>
                <div className="field-pair">
                  <label>
                    Food item
                    <input
                      value={food.item}
                      maxLength={120}
                      onChange={(e) => setFood({ ...food, item: e.target.value })}
                      placeholder="E.g. lunch plate"
                    />
                  </label>
                  <label>
                    Approximate serving time
                    <input
                      type="datetime-local"
                      value={food.servedAt}
                      onChange={(e) => setFood({ ...food, servedAt: e.target.value })}
                    />
                  </label>
                </div>
                <div className="field-pair">
                  <label>
                    Receipt / order reference
                    <input
                      value={food.receipt}
                      maxLength={100}
                      onChange={(e) => setFood({ ...food, receipt: e.target.value })}
                      placeholder="Optional"
                    />
                  </label>
                  <label>
                    Has the food been moved?
                    <select
                      value={food.disturbed}
                      onChange={(e) => setFood({ ...food, disturbed: e.target.value })}
                    >
                      {[
                        'Not sure',
                        'Not moved',
                        'Moved after serving',
                        'Replaced or discarded',
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="input-note">
                  Photograph from a safe distance. Do not taste, touch or preserve potentially
                  unsafe food.
                </p>
              </fieldset>
            )}
            <div>
              <label className="upload-label" htmlFor="intake-files">
                <span className="upload-symbol">
                  <Paperclip size={20} />
                </span>
                <span>
                  <strong>
                    Add {isMessage ? 'screenshots or a notice' : 'photos or a receipt'}
                  </strong>
                  <small>Optional · JPG, PNG, WebP, PDF · 10 MB each · up to 5 files</small>
                </span>
                <span className="upload-plus">+</span>
              </label>
              <input
                id="intake-files"
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                onChange={(e) => {
                  const added = [...files, ...Array.from(e.target.files || [])]
                  const error = validateFiles(added)
                  if (error) setError(error)
                  else {
                    setFiles(added)
                    setError('')
                  }
                  e.target.value = ''
                }}
              />
              {files.map((file, index) => (
                <div className="file-row" key={`${file.name}-${index}`}>
                  <FileImage size={16} />
                  <span>{file.name}</span>
                  <small>{(file.size / 1024).toFixed(0)} KB</small>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles(files.filter((_, i) => i !== index))}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="dialog-footer">
            <span>
              <ShieldCheck size={15} /> Evidence before conclusions
            </span>
            <button type="submit" className="button primary">
              Review report <ArrowRight size={16} />
            </button>
          </div>
        </form>
      ) : (
        <div>
          <div className="dialog-content review-content">
            <div className="review-icon">
              <Check size={24} />
            </div>
            <h3>A clear account is a good start.</h3>
            <p>Check the details before saving your case.</p>
            <div className="review-summary">
              <span className="eyebrow">
                {isMessage ? 'Submitted message' : 'Your observation'}
              </span>
              <p>{description || 'See attached screenshot.'}</p>
              <dl>
                <div>
                  <dt>Location</dt>
                  <dd>{getLocation(locationId)?.name || 'Campus-wide / unknown'}</dd>
                </div>
                {specificLocation && (
                  <div>
                    <dt>Landmark</dt>
                    <dd>{specificLocation}</dd>
                  </div>
                )}
                <div>
                  <dt>Category</dt>
                  <dd>{category}</dd>
                </div>
                <div>
                  <dt>Urgency</dt>
                  <dd>{urgency}</dd>
                </div>
                <div>
                  <dt>Proposed team</dt>
                  <dd>{ownerFor(category)}</dd>
                </div>
                <div>
                  <dt>Attachments</dt>
                  <dd>
                    {files.length
                      ? files.map((f) => f.name).join(', ')
                      : 'None — you can add evidence later'}
                  </dd>
                </div>
                {isFood && (
                  <>
                    <div>
                      <dt>Food item</dt>
                      <dd>{food.item || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt>Serving time</dt>
                      <dd>
                        {food.servedAt ? new Date(food.servedAt).toLocaleString() : 'Not provided'}
                      </dd>
                    </div>
                    <div>
                      <dt>Food moved?</dt>
                      <dd>{food.disturbed}</dd>
                    </div>
                    <div>
                      <dt>Order reference</dt>
                      <dd>{food.receipt || 'Not provided'}</dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
            <div className="soft-note">
              <LockKeyhole size={18} />
              <span>
                This report does not establish a finding or create a public allegation. It will be
                saved on the local development server and visible to permitted demo accounts. Actual
                campus staff will not be notified.
              </span>
            </div>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="dialog-footer">
            <button className="text-button" disabled={saving} onClick={() => setStep(1)}>
              <ArrowLeft size={16} /> Edit details
            </button>
            <button className="button primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : 'Create private case'} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
