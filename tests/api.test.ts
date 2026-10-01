import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../server/app'
import type { GeminiAdapter } from '../server/gemini/adapter'
import { MockGemini } from '../server/gemini/mock'
import type { CaseView, MissionView } from '../shared/api'

type App = Awaited<ReturnType<typeof buildApp>>['app']
let app: App
let uploadDir: string

async function start(gemini?: GeminiAdapter) {
  uploadDir = mkdtempSync(join(tmpdir(), 'rq-test-'))
  app = (await buildApp({ dbPath: ':memory:', uploadDir, sessionSecret: 'test-secret', gemini })).app
}
beforeEach(() => start())
afterEach(async () => { await app.close(); rmSync(uploadDir, { recursive: true, force: true }) })

async function login(userId: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/demo-login', payload: { userId } })
  expect(res.statusCode).toBe(200)
  const c = res.cookies[0]
  return `${c.name}=${c.value}`
}

async function call<T = any>(userId: string | null, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object, expected = 200): Promise<T> {
  const headers = userId ? { cookie: await login(userId) } : {}
  const res = await app.inject({ method, url, payload, headers })
  if (res.statusCode !== expected) throw new Error(`${method} ${url} → ${res.statusCode} (expected ${expected}): ${res.body}`)
  return res.json() as T
}

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
const PDF = Buffer.from('%PDF-1.4\n%demo\n')

async function upload<T = any>(userId: string, url: string, data: object, files: { name: string; type: string; content: Buffer }[], expected = 200): Promise<T> {
  const boundary = `----rq${Math.random().toString(16).slice(2)}`
  const parts: Buffer[] = [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${JSON.stringify(data)}\r\n`)]
  for (const f of files) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`), f.content, Buffer.from('\r\n'))
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  const res = await app.inject({ method: 'POST', url, payload: Buffer.concat(parts), headers: { cookie: await login(userId), 'content-type': `multipart/form-data; boundary=${boundary}` } })
  if (res.statusCode !== expected) throw new Error(`POST ${url} → ${res.statusCode}: ${res.body}`)
  return res.json() as T
}

const canteenReport = (extra: object = {}) => ({
  route: 'issue', description: 'There is a cockroach in the food served to me at the Main Canteen.', locationId: 'canteen', specificLocation: 'Counter B',
  category: 'Food & canteen', urgency: 'Needs attention', food: { item: 'Veg meals', servedAt: new Date().toISOString().slice(0, 16), receipt: '', disturbed: 'Not moved' }, ...extra,
})
const state = (c: CaseView, id: string) => c.predicates.find(p => p.id === id)?.state

describe('intake', () => {
  it('student submits a canteen report without a photograph', async () => {
    const c = await call<CaseView>('u-student', 'POST', '/api/cases', canteenReport(), 201)
    expect(c.status).toBe('Submitted')
    expect(c.pack.id).toBe('food-safety')
    expect(c.department).toBe('Canteen supervisor')
    expect(state(c, 'food.object_visible')).toBe('Unresolved')
    expect(c.outcome).toBe('Insufficient evidence')
    expect(c).not.toHaveProperty('reporterId')
    expect(c.missions.map(m => m.templateId)).toContain('food.reporter_capture')
  })

  it('student submits with a photograph and receipt', async () => {
    const c = await upload<CaseView>('u-student', '/api/cases', canteenReport({ food: { item: 'Veg meals', servedAt: '', receipt: 'Order 12', disturbed: 'Not moved' } }),
      [{ name: 'plate.png', type: 'image/png', content: PNG }, { name: 'receipt.pdf', type: 'application/pdf', content: PDF }], 201)
    expect(c.evidence.map(e => e.kind)).toEqual(['photo', 'receipt'])
    // The offline mock cannot see the photo, so it is kept for review but proves nothing yet.
    expect(state(c, 'food.object_visible')).toBe('Unresolved')
    expect(c.timeline.map(t => t.title)).toContain('Photo kept for review')
    expect(state(c, 'food.origin_at_serving')).toBe('Unresolved')
    expect(c.files).toHaveLength(2)
    // Raw files stay private: the reporter can fetch them, another student cannot.
    const fileUrl = `/api/cases/${c.id}/files/${c.files[0].id}`
    expect((await app.inject({ url: fileUrl, headers: { cookie: await login('u-student') } })).statusCode).toBe(200)
    expect((await app.inject({ url: fileUrl, headers: { cookie: await login('u-student2') } })).statusCode).toBe(404)
  })

  it('rejects disallowed file types', async () => {
    await upload('u-student', '/api/cases', canteenReport(), [{ name: 'x.exe', type: 'application/octet-stream', content: PDF }], 400)
  })

  it('Gemini suggests the wrong category and the student corrects it', async () => {
    const text = 'There is a cockroach near the water cooler on the second floor.'
    const suggestion = await call('u-student', 'POST', '/api/intake/suggest', { route: 'issue', text, locationId: 'ramanujan' })
    expect(suggestion.category).toBe('Food & canteen')
    const c = await call<CaseView>('u-student', 'POST', '/api/cases', { route: 'issue', description: text, locationId: 'ramanujan', category: 'Facilities' }, 201)
    expect(c.category).toBe('Facilities')
    expect(c.suggestedCategory).toBe('Food & canteen')
    expect(c.categoryCorrected).toBe(true)
    expect(c.department).toBe('Campus facilities')
    expect(c.pack.id).toBe('general-facilities')
  })

  it('requires a session', async () => {
    await call(null, 'GET', '/api/cases', undefined, 401)
  })

  it('the direct-report flow works independently of WhatsApp verification', async () => {
    await app.close()
    // A Gemini adapter that returns garbage must not stop a direct report.
    const broken: GeminiAdapter = { name: 'broken', suggest: async () => ({ nonsense: true }), observe: async () => 42 }
    await start(broken)
    const c = await call<CaseView>('u-student', 'POST', '/api/cases', canteenReport(), 201)
    expect(c.predicates.every(p => p.tier !== 'attribution')).toBe(true)
    expect(c.evidence.some(e => e.kind === 'message_text')).toBe(false)
    expect(c.missions.every(m => m.templateId.startsWith('food.'))).toBe(true)
  })
})

describe('missions and permissions', () => {
  it('a volunteer cannot access a kitchen-inspection mission', async () => {
    await call('u-operator', 'POST', '/api/cases/DEMO-0143/workorders', { basis: 'verified' })
    const all = await call<MissionView[]>('u-operator', 'GET', '/api/missions')
    const kitchen = all.find(m => m.templateId === 'food.kitchen_inspection')!
    expect(kitchen).toBeTruthy()
    const visible = await call<MissionView[]>('u-volunteer', 'GET', '/api/missions')
    expect(visible.some(m => m.templateId === 'food.kitchen_inspection')).toBe(false)
    const denied = await call('u-volunteer', 'POST', `/api/missions/${kitchen.id}/accept`, undefined, 403)
    expect(denied.error).toMatch(/canteen supervisors/)
  })

  it('an untrained responder cannot accept a food-safety mission', async () => {
    const missions = await call<MissionView[]>('u-canteen-trainee', 'GET', '/api/missions')
    const isolate = missions.find(m => m.templateId === 'food.supervisor_isolate')!
    expect(isolate.eligibility.ok).toBe(false)
    const denied = await call('u-canteen-trainee', 'POST', `/api/missions/${isolate.id}/accept`, undefined, 403)
    expect(denied.error).toMatch(/food safety qualification/)
    await call('u-canteen', 'POST', `/api/missions/${isolate.id}/accept`)
  })

  it('an unverified volunteer cannot accept a public-area food mission either', async () => {
    const missions = await call<MissionView[]>('u-volunteer-untrained', 'GET', '/api/missions')
    const view = missions.find(m => m.templateId === 'food.volunteer_public_view')!
    await call('u-volunteer-untrained', 'POST', `/api/missions/${view.id}/accept`, undefined, 403)
  })

  it('students cannot see other students’ cases and staff never see reporter identity', async () => {
    await call('u-student2', 'GET', '/api/cases/DEMO-0143', undefined, 404)
    const staffView = await call('u-canteen', 'GET', '/api/cases/DEMO-0143')
    expect(JSON.stringify(staffView)).not.toMatch(/u-student|Asha/)
    expect(staffView.reporterAlias).toBe('Reporter-7Q')
  })
})

describe('related reports', () => {
  it('two reports from the same counter are suggested as related but not merged', async () => {
    const a = await call<CaseView>('u-student', 'POST', '/api/cases', canteenReport(), 201)
    const b = await call<CaseView>('u-student2', 'POST', '/api/cases', canteenReport({ description: 'Found an insect in my veg meals at counter B just now.' }), 201)
    const related = await call('u-operator', 'GET', `/api/cases/${a.id}/related`)
    expect(related.map((r: { caseId: string }) => r.caseId)).toContain(b.id)
    expect(JSON.stringify(related)).not.toMatch(/u-student|Reporter-/)
    // Still two separate cases, each with its own reporter and evidence.
    const all = await call<CaseView[]>('u-operator', 'GET', '/api/cases')
    expect(all.filter(c => c.id === a.id || c.id === b.id)).toHaveLength(2)
    expect((await call<CaseView>('u-student2', 'GET', `/api/cases/${b.id}`)).timeline.some(t => /merge/i.test(t.title))).toBe(false)
    await call('u-student', 'GET', `/api/cases/${a.id}/related`, undefined, 403)
  })
})

describe('food case: decisions, closure, reopening and publication', () => {
  it('presence is confirmed while origin remains unresolved', async () => {
    const c = await call<CaseView>('u-operator', 'GET', '/api/cases/DEMO-0143')
    expect(state(c, 'food.object_visible')).toBe('Supported')
    expect(state(c, 'food.origin_at_serving')).toBe('Unresolved')
    expect(state(c, 'food.responsibility')).toBe('Unresolved')
    expect(c.outcome).toBe('Confirmed observable condition')
    expect(c.outcomeSummary).toMatch(/does not establish/)
    expect(c.evidence.every(e => e.demo)).toBe(true)
  })

  it('a canteen supervisor cannot reveal or publish the student’s identity', async () => {
    await call('u-canteen', 'POST', '/api/cases/DEMO-0143/reveal-identity', { reason: 'I want to know who complained' }, 403)
    await call('u-operator', 'POST', '/api/cases/DEMO-0143/reveal-identity', { reason: 'I want to know who complained' }, 403)
    await call('u-canteen', 'POST', '/api/cases/DEMO-0143/public-update', undefined, 403)
    const draft = await call('u-operator', 'POST', '/api/cases/DEMO-0143/public-update')
    await call('u-canteen', 'POST', `/api/public-updates/${draft.id}/publish`, { text: 'Reported by Asha.' }, 403)
    const blocked = await call('u-operator', 'POST', `/api/public-updates/${draft.id}/publish`, { text: 'Asha reported that the canteen was negligent.' }, 422)
    expect(blocked.details.problems).toEqual(expect.arrayContaining(['identifies a person involved in the case', 'alleges negligence']))
    const revealed = await call('u-trust', 'POST', '/api/cases/DEMO-0143/reveal-identity', { reason: 'Repeated malicious-report review, ticket 12' })
    expect(revealed.userId).toBe('u-student')
    const audit = await call('u-trust', 'GET', '/api/audit')
    expect(audit.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['identity.reveal', 'identity.reveal_denied']))
  })

  it('cannot close without the required closure evidence; the reporter can then reopen', async () => {
    await call('u-operator', 'POST', '/api/cases/DEMO-0143/workorders', { basis: 'verified' })
    const wo = (await call<CaseView>('u-operator', 'GET', '/api/cases/DEMO-0143')).workOrders[0]
    await call('u-canteen', 'PATCH', `/api/workorders/${wo.id}`, { status: 'Marked resolved', note: 'Done' })
    const refused = await call('u-operator', 'POST', '/api/cases/DEMO-0143/close', undefined, 409)
    expect(refused.details.missing).toContain('Authorised inspection result')

    await call('u-canteen-trainee', 'POST', '/api/cases/DEMO-0143/evidence', { kind: 'authorized_inspection', note: 'x' }, 403)
    for (const kind of ['supervisor_record', 'isolation_record', 'authorized_inspection', 'corrective_action'])
      await call('u-canteen', 'POST', '/api/cases/DEMO-0143/evidence', { kind, note: `Demo ${kind}` })
    expect((await call('u-operator', 'POST', '/api/cases/DEMO-0143/close', undefined, 409)).details.missing).toEqual(['Reporter notified'])
    await call('u-operator', 'POST', '/api/cases/DEMO-0143/evidence', { kind: 'reporter_notification', note: 'Reporter notified in-app.' })
    const closed = await call<CaseView>('u-operator', 'POST', '/api/cases/DEMO-0143/close')
    expect(closed.status).toBe('Closure verified')
    // Responsibility is still not established, even after the inspection record exists without a finding.
    expect(state(closed, 'food.responsibility')).toBe('Unresolved')

    const draft = await call('u-operator', 'POST', '/api/cases/DEMO-0143/public-update')
    expect(draft.text).toBe('A foreign object was confirmed in one reported serving. The serving and related preparation batch were isolated, and the canteen completed an internal food-safety inspection.')
    await call('u-operator', 'POST', `/api/public-updates/${draft.id}/publish`, {})
    const published = await call(null, 'GET', '/api/public/updates')
    expect(published).toHaveLength(1)
    expect(JSON.stringify(published)).not.toMatch(/Asha|Reporter-7Q|u-student|negligen|responsib|contaminated/i)

    await call('u-student2', 'POST', '/api/cases/DEMO-0143/reopen', { reason: 'I was served the same thing today.' }, 404)
    const reopened = await call<CaseView>('u-student', 'POST', '/api/cases/DEMO-0143/reopen', { reason: 'The same counter served a similar plate today.' })
    expect(reopened.status).toBe('Reopening requested')
    expect((await call<CaseView>('u-operator', 'POST', '/api/cases/DEMO-0143/reopen/review', { accept: true })).status).toBe('Evidence review')
  })

  it('repeated malicious reports go to abuse review by alias only', async () => {
    const c = await call<CaseView>('u-student2', 'POST', '/api/cases', canteenReport(), 201)
    await call('u-operator', 'POST', `/api/cases/${c.id}/abuse-flag`, { reason: 'Fabricated' })
    expect(await call('u-operator', 'GET', '/api/abuse-queue')).toEqual([])
    await call('u-operator', 'POST', `/api/cases/${c.id}/abuse-flag`, { reason: 'Fabricated again' })
    expect(await call('u-operator', 'GET', '/api/abuse-queue')).toEqual([{ reporterAlias: 'Reporter-K4', flags: 2, caseIds: [c.id] }])
  })
})

describe('primary demo: WhatsApp message and blocked exit', () => {
  it('runs end to end: attribution contradicted, obstruction supported, verified clearance, public correction', async () => {
    const start = await call<CaseView>('u-operator', 'GET', '/api/cases/DEMO-0142')
    expect(state(start, 'exit.notice_official')).toBe('Contradicted')
    expect(state(start, 'exit.obstructed')).toBe('Supported')
    expect(state(start, 'exit.cleared')).toBe('Unresolved')
    expect(start.status).toBe('Action in progress')
    expect(start.claims.some(c => c.tier === 'attribution')).toBe(true)

    const missions = await call<MissionView[]>('u-facilities', 'GET', '/api/missions')
    const clear = missions.find(m => m.templateId === 'exit.facilities_clear')!
    const accepted = await call<MissionView>('u-facilities', 'POST', `/api/missions/${clear.id}/accept`)
    expect(accepted.challengeCode).toMatch(/^RQ-/)
    const photo = [{ name: 'cleared.png', type: 'image/png', content: PNG }]
    const finding = { predicateId: 'exit.cleared', effect: 'supports' }
    await upload('u-facilities', `/api/missions/${clear.id}/submit`, { kind: 'closure_photo', challengeCode: 'RQ-0000', findings: [finding] }, photo, 400)
    await upload('u-facilities', `/api/missions/${clear.id}/submit`, { kind: 'closure_photo', challengeCode: accepted.challengeCode, findings: [finding], note: 'Furniture removed.' }, photo)

    // The facilities photo alone is not enough to close.
    const wo = start.workOrders[0]
    await call('u-facilities', 'PATCH', `/api/workorders/${wo.id}`, { status: 'Marked resolved', note: 'Cleared' })
    await call('u-facilities', 'POST', '/api/cases/DEMO-0142/evidence', { kind: 'corrective_action', note: 'Furniture moved to store room B.' })
    await call('u-operator', 'POST', '/api/cases/DEMO-0142/evidence', { kind: 'reporter_notification', note: 'Reporter notified.' })
    const notYet = await call('u-operator', 'POST', '/api/cases/DEMO-0142/close', undefined, 409)
    expect(notYet.error).toMatch(/Independent confirmation|independently confirmed/)

    // The volunteer who first photographed the obstruction confirms independently of facilities.
    const confirm = (await call<MissionView[]>('u-volunteer', 'GET', '/api/missions')).find(m => m.templateId === 'exit.independent_confirmation')!
    const mine = await call<MissionView>('u-volunteer', 'POST', `/api/missions/${confirm.id}/accept`)
    await upload('u-volunteer', `/api/missions/${confirm.id}/submit`, { kind: 'independent_confirmation', challengeCode: mine.challengeCode, findings: [finding] }, photo)

    const closed = await call<CaseView>('u-operator', 'POST', '/api/cases/DEMO-0142/close')
    expect(closed.status).toBe('Closure verified')
    expect(state(closed, 'exit.cleared')).toBe('Supported')
    const draft = await call('u-operator', 'POST', '/api/cases/DEMO-0142/public-update')
    expect(draft.text).toMatch(/was not issued by the college/)
    expect(draft.text).toMatch(/independently confirmed clear/)
    await call('u-operator', 'POST', `/api/public-updates/${draft.id}/publish`, {})
  })

  it('operator cannot approve a "verified" work order before anything is supported', async () => {
    const c = await call<CaseView>('u-student', 'POST', '/api/cases', { route: 'message', description: 'The principal announced that exams are postponed by one week.', locationId: 'unknown' }, 201)
    expect(c.predicates.map(p => p.tier)).toContain('attribution')
    await call('u-operator', 'POST', `/api/cases/${c.id}/workorders`, { basis: 'verified' }, 409)
    await call('u-operator', 'POST', `/api/cases/${c.id}/workorders`, { basis: 'precautionary' })
  })
})

describe('mock gemini', () => {
  it('separates attribution from physical claims', async () => {
    const s = await new MockGemini().suggest({ route: 'message', text: 'The college has officially closed the exit. The exit is blocked with chairs.' })
    expect(s.claims.map(c => c.tier)).toEqual(['attribution', 'observable'])
  })
})
