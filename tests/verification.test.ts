import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../server/app'
import type { GeminiAdapter, ObserveInput, OfficialCheckInput } from '../server/gemini/adapter'
import { MockGemini } from '../server/gemini/mock'
import type { CaseView, MissionView } from '../shared/api'

// Photos only prove what the photo check sees in them; circulating notices are checked against
// NMAMIT's official website, and only quotes found on the real page count.

type App = Awaited<ReturnType<typeof buildApp>>['app']
let app: App
let dir: string
const ANNOUNCEMENTS = 'https://nitte.edu.in/nmamit/announcement.php'
const PAGE = '<html><body><h3>Latest Announcement</h3><p>The institute will remain closed on 2 October 2026 on account of Gandhi Jayanti.</p></body></html>'

async function start(gemini: GeminiAdapter, fetchText = async (url: string) => (url === ANNOUNCEMENTS ? PAGE : '')) {
  dir = mkdtempSync(join(tmpdir(), 'rq-ver-'))
  app = (await buildApp({ dbPath: ':memory:', uploadDir: dir, sessionSecret: 's', gemini, fetchText, rateLimitPerMinute: 0 })).app
}
afterEach(async () => {
  await app.close()
  rmSync(dir, { recursive: true, force: true })
})

async function cookie(userId: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/demo-login', payload: { userId } })
  return `${res.cookies[0].name}=${res.cookies[0].value}`
}
async function json<T>(userId: string, method: 'GET' | 'POST', url: string, payload?: object, expected = 200): Promise<T> {
  const res = await app.inject({ method, url, payload, headers: { cookie: await cookie(userId) } })
  if (res.statusCode !== expected) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`)
  return res.json() as T
}
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])
async function withPhoto(userId: string, url: string, data: object) {
  const b = '----rqver'
  const payload = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${JSON.stringify(data)}\r\n--${b}\r\nContent-Disposition: form-data; name="files"; filename="p.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    JPEG,
    Buffer.from(`\r\n--${b}--\r\n`),
  ])
  const res = await app.inject({ method: 'POST', url, payload, headers: { cookie: await cookie(userId), 'content-type': `multipart/form-data; boundary=${b}` } })
  if (res.statusCode >= 400) throw new Error(`${url} → ${res.statusCode} ${res.body}`)
  return res.json() as CaseView
}
const state = (c: CaseView, id: string) => c.predicates.find(p => p.id === id)?.state

/** A Gemini stand-in that answers the photo questions with a fixed status. */
const seeing = (status: 'visible' | 'not_visible' | 'unclear', official?: (i: OfficialCheckInput) => Promise<unknown>): GeminiAdapter => ({
  name: `fake-${status}`,
  suggest: i => new MockGemini().suggest(i),
  observe: async ({ questions }: ObserveInput) => ({ observations: [`Photo looked at (${status}).`], answers: questions.map(q => ({ id: q.id, status })) }),
  ...(official ? { checkOfficial: official } : {}),
})
const foodReport = { route: 'issue', description: 'Insect-like object in my lunch plate at counter B.', locationId: 'canteen', category: 'Food & canteen', food: { item: 'Lunch', servedAt: '', receipt: '', disturbed: 'Not moved' } }

describe('photos prove only what they show', () => {
  it('a photo that shows the condition supports it', async () => {
    await start(seeing('visible'))
    const c = await withPhoto('u-student', '/api/cases', foodReport)
    expect(state(c, 'food.object_visible')).toBe('Supported')
    expect(c.outcome).toBe('Confirmed observable condition')
    expect(state(c, 'food.origin_at_serving')).toBe('Unresolved')
  })

  it('an unrelated photo is kept for review and proves nothing', async () => {
    await start(seeing('not_visible'))
    const c = await withPhoto('u-student', '/api/cases', foodReport)
    expect(state(c, 'food.object_visible')).toBe('Unresolved')
    expect(c.outcome).toBe('Insufficient evidence')
    expect(c.timeline.map(t => t.title)).toContain('Photo kept for review')
    expect(c.evidence[0].files).toHaveLength(1)
  })

  it('a volunteer’s "yes" stands, but a photo that does not show it is flagged for review', async () => {
    await start(seeing('not_visible'))
    const c = await json<CaseView>('u-student', 'POST', '/api/cases', foodReport, 201)
    const m = (await json<MissionView[]>('u-volunteer', 'GET', '/api/missions')).find(x => x.caseSummary.id === c.id && x.templateId === 'food.volunteer_public_view')!
    const accepted = await json<MissionView>('u-volunteer', 'POST', `/api/missions/${m.id}/accept`, {})
    const after = await withPhoto('u-volunteer', `/api/missions/${m.id}/submit`, { kind: 'photo', challengeCode: accepted.challengeCode, findings: [{ predicateId: 'food.counter_identified', effect: 'supports' }] })
    const staff = await json<CaseView>('u-operator', 'GET', `/api/cases/${after.id}`)
    const item = staff.evidence.find(e => e.missionId === m.id)!
    expect(item.findings).toHaveLength(1)
    expect(item.observations.some(o => o.startsWith('Automated photo check'))).toBe(true)
  })
})

describe('circulating notices are checked against the official website', () => {
  const closure = { route: 'message', description: 'As per the Principal, NMAMIT will remain closed on 2 October 2026. Forward to all.', locationId: 'unknown', category: 'Campus notice' }
  const reply = (verdict: string, quotes: { url: string; text: string }[], retrieved = [ANNOUNCEMENTS]) => async () => ({ verdict, summary: `Gemini says ${verdict}.`, quotes, retrieved })

  it('confirms the notice when the quote is really on the official page', async () => {
    await start(seeing('unclear', reply('confirmed', [{ url: ANNOUNCEMENTS, text: 'The institute will remain closed on 2 October 2026' }])))
    const c = await json<CaseView>('u-student', 'POST', '/api/cases', closure, 201)
    expect(c.officialCheck?.status).toBe('confirmed')
    expect(state(c, 'notice.official')).toBe('Supported')
    const item = (await json<CaseView>('u-operator', 'GET', `/api/cases/${c.id}`)).evidence.find(e => e.kind === 'official_source')!
    expect(item.sourceAlias).toBe('Official website check (automated)')
    expect(item.note).toContain(ANNOUNCEMENTS)
  })

  it('refuses a confirmation whose quote is not on the page (no hallucinated notices)', async () => {
    await start(seeing('unclear', reply('confirmed', [{ url: ANNOUNCEMENTS, text: 'Holiday declared tomorrow due to heavy rain' }])))
    const c = await json<CaseView>('u-student', 'POST', '/api/cases', closure, 201)
    expect(c.officialCheck?.status).toBe('unverified')
    expect(state(c, 'notice.official')).toBe('Unresolved')
  })

  it('records "not found" without calling the message false', async () => {
    await start(seeing('unclear', reply('not_found', [])))
    const c = await json<CaseView>('u-student', 'POST', '/api/cases', closure, 201)
    expect(c.officialCheck?.status).toBe('not_found')
    expect(state(c, 'notice.official')).toBe('Unresolved')
    expect(c.timeline.map(t => t.title)).toContain('No matching notice on the official website')
  })

  it('reports when the check could not run, and an operator can retry it', async () => {
    let calls = 0
    await start(seeing('unclear', async () => {
      calls++
      if (calls === 1) throw new Error('quota')
      return { verdict: 'contradicted', summary: 'The institute says classes continue.', quotes: [{ url: ANNOUNCEMENTS, text: 'remain closed on 2 October 2026 on account of Gandhi Jayanti' }], retrieved: [ANNOUNCEMENTS] }
    }))
    const c = await json<CaseView>('u-student', 'POST', '/api/cases', { ...closure, description: 'NMAMIT is open on 2 October 2026, attendance compulsory - Principal' }, 201)
    expect(c.officialCheck?.status).toBe('unavailable')
    await json('u-student', 'POST', `/api/cases/${c.id}/official-check`, {}, 403)
    const retried = await json<CaseView>('u-operator', 'POST', `/api/cases/${c.id}/official-check`, {})
    expect(retried.officialCheck?.status).toBe('contradicted')
    expect(state(retried, 'notice.official')).toBe('Contradicted')
  })

  it('does not run for direct reports or without web access', async () => {
    await start(new MockGemini())
    const c = await json<CaseView>('u-student', 'POST', '/api/cases', closure, 201)
    expect(c.officialCheck).toBeUndefined()
    await start(seeing('unclear', reply('confirmed', [])))
    const issue = await json<CaseView>('u-student', 'POST', '/api/cases', foodReport, 201)
    expect(issue.officialCheck).toBeUndefined()
    expect(issue.permissions.officialCheck).toBe(false)
  })
})
