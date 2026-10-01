import { describe, expect, it } from 'vitest'
import type { Case, EvidenceItem, EvidenceKind, Mission, Role, User } from '../shared/domain'
import { closureStatus, evaluateCase } from '../shared/decision'
import { getPack } from '../shared/policy'
import { missionEligibility } from '../shared/permissions'
import { draftPublicUpdate, guardPublicText } from '../shared/redaction'
import { suggestRelated } from '../shared/related'

const NOW = '2026-10-01T06:00:00.000Z'
let n = 0
function ev(kind: EvidenceKind, predicateId: string, effect: 'supports' | 'contradicts', sourceKey: string, sourceRole: Role = 'student', capturedAt = NOW): EvidenceItem {
  return { id: `e${++n}`, caseId: 'c1', kind, note: '', submittedBy: sourceKey, sourceRole, sourceAlias: sourceKey, sourceKey, capturedAt, recordedAt: NOW, findings: [{ predicateId, effect }], observations: [], files: [], demo: true }
}
const food = getPack('food-safety'), exit = getPack('exit-access')
const state = (decision: ReturnType<typeof evaluateCase>, id: string) => decision.predicates.find(p => p.id === id)!.state

describe('decision engine', () => {
  it('confirms presence while origin and responsibility stay unresolved', () => {
    const d = evaluateCase(food, 'issue', [ev('photo', 'food.object_visible', 'supports', 'reporter')])
    expect(state(d, 'food.object_visible')).toBe('Supported')
    expect(state(d, 'food.origin_at_serving')).toBe('Unresolved')
    expect(state(d, 'food.responsibility')).toBe('Unresolved')
    expect(d.outcome).toBe('Confirmed observable condition')
    expect(d.summary).toMatch(/does not establish/)
  })

  it('never supports responsibility from photos or reports', () => {
    const d = evaluateCase(food, 'issue', [
      ev('photo', 'food.responsibility', 'supports', 'reporter'),
      ev('supervisor_record', 'food.responsibility', 'supports', 'sup', 'canteen_supervisor'),
    ])
    expect(state(d, 'food.responsibility')).toBe('Unresolved')
  })

  it('does not establish origin from the reporter alone', () => {
    const d = evaluateCase(food, 'issue', [ev('receipt', 'food.origin_at_serving', 'supports', 'r1'), ev('receipt', 'food.origin_at_serving', 'supports', 'r2')])
    expect(state(d, 'food.origin_at_serving')).toBe('Unresolved')
  })

  it('ignores stale evidence for fresh-only predicates', () => {
    const d = evaluateCase(food, 'issue', [ev('photo', 'food.object_visible', 'supports', 'reporter', 'student', '2026-09-28T06:00:00.000Z')])
    expect(state(d, 'food.object_visible')).toBe('Unresolved')
    expect(d.outcome).toBe('Insufficient evidence')
  })

  it('marks conflicting independent sources as disputed', () => {
    const d = evaluateCase(food, 'issue', [ev('photo', 'food.object_visible', 'supports', 'reporter'), ev('independent_confirmation', 'food.object_visible', 'contradicts', 'vol', 'volunteer')])
    expect(state(d, 'food.object_visible')).toBe('Disputed')
    expect(d.outcome).toBe('Disputed evidence')
  })

  it('splits the hybrid exit case: attribution contradicted, obstruction supported', () => {
    const d = evaluateCase(exit, 'message', [
      ev('official_source', 'exit.notice_official', 'contradicts', 'registrar', 'operator'),
      ev('photo', 'exit.obstructed', 'supports', 'vol1', 'volunteer'),
      ev('observation', 'exit.obstructed', 'supports', 'vol2', 'volunteer'),
    ])
    expect(state(d, 'exit.notice_official')).toBe('Contradicted')
    expect(state(d, 'exit.obstructed')).toBe('Supported')
    expect(state(d, 'exit.cleared')).toBe('Unresolved')
  })

  it('needs two independent sources; one source twice still counts once', () => {
    const d = evaluateCase(exit, 'issue', [ev('photo', 'exit.obstructed', 'supports', 'vol1'), ev('observation', 'exit.obstructed', 'supports', 'vol1')])
    expect(state(d, 'exit.obstructed')).toBe('Unresolved')
  })

  it('hides the attribution predicate on direct reports', () => {
    const d = evaluateCase(exit, 'issue', [])
    expect(d.predicates.map(p => p.id)).not.toContain('exit.notice_official')
  })
})

describe('closure', () => {
  it('cannot close without every required closure item', () => {
    const partial = closureStatus(food, [ev('supervisor_record', 'x', 'supports', 's'), ev('isolation_record', 'x', 'supports', 's')])
    expect(partial.complete).toBe(false)
    expect(partial.missing.map(m => m.kind)).toEqual(['authorized_inspection', 'corrective_action', 'reporter_notification'])
  })
})

const user = (id: string, role: Role, qualifications: User['qualifications'] = []): User => ({ id, name: id, role, alias: id, qualifications })
const mission = (templateId: string): Mission => {
  const t = food.missions.find(m => m.id === templateId)!
  return { id: 'm1', caseId: 'c1', templateId, title: t.title, instructions: t.instructions, forbiddenActions: t.forbiddenActions, allowedRoles: t.allowedRoles, requiredQualification: t.requiredQualification, area: t.area, isDisconfirmation: t.isDisconfirmation, status: 'Open', challengeCode: 'RQ-1', createdAt: NOW }
}

describe('mission eligibility', () => {
  const reportCase = { reporterId: 'student-1' }
  it('volunteer cannot access a kitchen inspection', () => {
    const r = missionEligibility(user('v', 'volunteer', ['verified_volunteer']), mission('food.kitchen_inspection'), reportCase)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/restricted/)
  })
  it('untrained responder cannot accept a food-safety mission', () => {
    const r = missionEligibility(user('trainee', 'canteen_supervisor'), mission('food.supervisor_isolate'), reportCase)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/food safety/)
  })
  it('trained supervisor can', () => {
    expect(missionEligibility(user('s', 'canteen_supervisor', ['food_safety']), mission('food.supervisor_isolate'), reportCase).ok).toBe(true)
  })
  it('only the reporter takes the reporter mission', () => {
    expect(missionEligibility(user('other', 'student'), mission('food.reporter_capture'), reportCase).ok).toBe(false)
    expect(missionEligibility(user('student-1', 'student'), mission('food.reporter_capture'), reportCase).ok).toBe(true)
  })
})

describe('public redaction', () => {
  it('produces the plan’s food outcome without accusation', () => {
    const d = evaluateCase(food, 'issue', [ev('photo', 'food.object_visible', 'supports', 'reporter')])
    const text = draftPublicUpdate(food, d.predicates, true)
    expect(text).toBe('A foreign object was confirmed in one reported serving. The serving and related preparation batch were isolated, and the canteen completed an internal food-safety inspection.')
    expect(guardPublicText(text, ['Asha Rao', 'Reporter-7Q'])).toEqual([])
  })
  it('blocks identities and unsupported accusations', () => {
    expect(guardPublicText('Asha Rao reported this', ['Asha Rao'])).toContain('identifies a person involved in the case')
    expect(guardPublicText('Main Canteen serves contaminated food', [])).toContain('generalises contamination')
    expect(guardPublicText('Staff were negligent', [])).toContain('alleges negligence')
    expect(guardPublicText('Contact 4NM22CS101', [])).toContain('contains a university seat number')
  })
})

describe('related reports', () => {
  const base = (id: string, specificLocation: string, servedAt: string): Case => ({
    id, route: 'issue', title: '', description: '', locationId: 'canteen', specificLocation, category: 'Food & canteen', categoryCorrected: false, urgency: 'Needs attention', status: 'Submitted', policyPackId: 'food-safety', reporterId: id, reporterAlias: id, department: 'Canteen supervisor', createdAt: NOW, food: { item: 'Veg meals', servedAt, receipt: '', disturbed: '' }, claims: [], predicates: [], outcome: 'Insufficient evidence', outcomeSummary: '', timeline: [], files: [], demo: false, abuseFlags: 0,
  })
  it('suggests two reports from the same counter, and does not modify either', () => {
    const a = base('A', 'Counter 2', '2026-10-01T12:30'), b = base('B', 'counter 2', '2026-10-01T13:00'), c = base('C', 'Counter 5', '2026-10-02T09:00')
    const before = JSON.stringify([a, b])
    const s = suggestRelated(a, [a, b, c])
    expect(s.map(x => x.caseId)).toEqual(['B'])
    expect(s[0].reasons).toContain('Same counter or landmark')
    expect(JSON.stringify([a, b])).toBe(before)
  })
})
