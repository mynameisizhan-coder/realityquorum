import type { User } from '../shared/domain'
import { DEMO_USERS } from './users'
import * as svc from './service'
import type { Ctx } from './service'

// Both prepared demonstration cases are built through the real service, so they obey every rule live cases do.
// All their evidence is flagged demo: true and labelled "Prepared demonstration record".

const PREPARED = 'Prepared demonstration record — not a real campus finding.'

export async function seed(ctx: Ctx, force = false): Promise<void> {
  for (const user of DEMO_USERS) ctx.store.put('users', user)
  if (!force && ctx.store.count('cases') > 0) return
  const as = (id: string) => ctx.store.get<User>('users', id)!
  const mission = (caseId: string, templateId: string) => ctx.store.byCase<{ id: string; templateId: string }>('missions', caseId).find(m => m.templateId === templateId)!.id
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

  // Primary demo: false official attribution, genuinely blocked exit.
  const exitId = 'DEMO-0142'
  await svc.createCase(ctx, as('u-student'), {
    route: 'message', locationId: 'ramanujan', specificLocation: 'Ground-floor east emergency exit', category: 'Safety & access', urgency: 'Urgent',
    description: 'URGENT: The college has officially closed the ground-floor emergency exit of Ramanujan Block until further notice. The exit is blocked, use the main staircase only.',
  }, [], { id: exitId })
  await svc.addEvidence(ctx, as('u-operator'), exitId, {
    kind: 'official_source', issuer: 'Registrar office', capturedAt: minutesAgo(40),
    note: `${PREPARED} The registrar’s office states it issued no notice closing this exit.`,
    findings: [{ predicateId: 'exit.notice_official', effect: 'contradicts' }],
  }, [])
  // Two independent volunteers: one photographs the exit, the other tests the "approved temporary closure" explanation.
  const volunteerVisits = [
    { userId: 'u-volunteer', templateId: 'exit.volunteer_check', kind: 'photo', note: 'Stacked furniture blocks about two-thirds of the exit passage.' },
    { userId: 'u-volunteer2', templateId: 'exit.alternative_explanation', kind: 'observation', note: 'No official signage or barrier; the passage is obstructed by furniture.' },
  ] as const
  for (const visit of volunteerVisits) {
    const missionId = mission(exitId, visit.templateId)
    svc.acceptMission(ctx, as(visit.userId), missionId)
    await svc.submitMission(ctx, as(visit.userId), missionId, {
      kind: visit.kind, capturedAt: minutesAgo(30), note: `${PREPARED} ${visit.note}`,
      findings: [{ predicateId: 'exit.obstructed', effect: 'supports' }],
    }, [])
  }
  svc.approveWorkOrder(ctx, as('u-operator'), exitId, 'verified')

  // Secondary demo: a direct report about one food serving.
  const foodId = 'DEMO-0143'
  const servedAt = minutesAgo(50).slice(0, 16)
  await svc.createCase(ctx, as('u-student'), {
    route: 'issue', locationId: 'canteen', specificLocation: 'Counter A', category: 'Food & canteen', urgency: 'Needs attention',
    description: 'There is a cockroach in the food served to me at the Main Canteen.',
    food: { item: 'Veg meals plate', servedAt, receipt: 'Order 0417', disturbed: 'Not moved' },
  }, [], { id: foodId })
  const capture = mission(foodId, 'food.reporter_capture')
  svc.acceptMission(ctx, as('u-student'), capture)
  await svc.submitMission(ctx, as('u-student'), capture, {
    kind: 'photo', capturedAt: minutesAgo(45), note: `${PREPARED} Whole plate and object photographed from a safe distance, without touching the food.`,
    findings: [{ predicateId: 'food.object_visible', effect: 'supports' }, { predicateId: 'food.serving_visible', effect: 'supports' }, { predicateId: 'food.counter_identified', effect: 'supports' }],
  }, [])
}
