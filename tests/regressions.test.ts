import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../server/app'
import type { GeminiAdapter } from '../server/gemini/adapter'
import { MockGemini } from '../server/gemini/mock'
import type { CaseView, MissionView } from '../shared/api'

// Bugs reported on the live site, 1 Oct 2026: operators unable to download student photos, and
// volunteers / supervisors not receiving tasks for new reports.

type App = Awaited<ReturnType<typeof buildApp>>['app']
let app: App
let uploadDir: string

async function start(gemini?: GeminiAdapter) {
  uploadDir = mkdtempSync(join(tmpdir(), 'rq-reg-'))
  app = (await buildApp({ dbPath: ':memory:', uploadDir, sessionSecret: 'test-secret', gemini, rateLimitPerMinute: 0 })).app
}
afterEach(async () => {
  await app.close()
  rmSync(uploadDir, { recursive: true, force: true })
})

async function cookie(userId: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/demo-login', payload: { userId } })
  return `${res.cookies[0].name}=${res.cookies[0].value}`
}
async function json<T>(userId: string, method: 'GET' | 'POST', url: string, payload?: object): Promise<T> {
  const res = await app.inject({ method, url, payload, headers: { cookie: await cookie(userId) } })
  if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`)
  return res.json() as T
}
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])
async function reportWithPhoto(userId: string, data: object, fileName: string) {
  const boundary = '----rqreg'
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${JSON.stringify(data)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${fileName}"\r\nContent-Type: image/jpeg\r\n\r\n`),
    JPEG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const res = await app.inject({ method: 'POST', url: '/api/cases', payload, headers: { cookie: await cookie(userId), 'content-type': `multipart/form-data; boundary=${boundary}` } })
  expect(res.statusCode).toBe(201)
  return res.json() as CaseView
}
const facilitiesReport = { route: 'issue', description: 'The desktop PC in the lab is broken and sparking.', locationId: 'unknown', category: 'Facilities' }
const foodReport = { route: 'issue', description: 'Insect-like object in my lunch plate at counter B.', locationId: 'canteen', category: 'Food & canteen', food: { item: 'Lunch', servedAt: '', receipt: '', disturbed: 'Not moved' } }

describe('operator can view and download a student photo', () => {
  it('serves the exact bytes inline and as a download, with a correct non-English file name', async () => {
    await start()
    const name = 'WhatsApp Image 2026-10-01 at 3.29.39 PM – ಕನ್ನಡ.jpeg'
    const c = await reportWithPhoto('u-student', facilitiesReport, name)
    const url = `/api/cases/${c.id}/files/${c.files[0].id}`
    const headers = { cookie: await cookie('u-operator') }
    const view = await app.inject({ url, headers })
    expect(view.statusCode).toBe(200)
    expect(view.rawPayload.equals(JPEG)).toBe(true)
    expect(view.headers['content-disposition']).toMatch(/^inline;/)
    const download = await app.inject({ url: `${url}?download=1`, headers })
    expect(download.headers['content-disposition']).toMatch(/^attachment;/)
    expect(download.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`)
    expect(String(download.headers['content-disposition'])).not.toMatch(/[^\x20-\x7e]/)
  })

  it('explains a file missing from storage instead of crashing', async () => {
    await start()
    const c = await reportWithPhoto('u-student', facilitiesReport, 'photo.jpg')
    for (const f of readdirSync(uploadDir)) unlinkSync(join(uploadDir, f))
    const res = await app.inject({ url: `/api/cases/${c.id}/files/${c.files[0].id}`, headers: { cookie: await cookie('u-operator') } })
    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('file_missing')
  })
})

describe('every role receives tasks for a new report', () => {
  // Real Gemini sometimes returned only the reporter's mission.
  const minimal: GeminiAdapter = { ...new MockGemini(), name: 'minimal', suggest: (i) => new MockGemini().suggest(i), observe: async () => [] }

  it('food report: reporter, verified volunteer and trained supervisor each get a task', async () => {
    await start(minimal)
    const c = await json<CaseView>('u-student', 'POST', '/api/cases', foodReport)
    const forCase = (list: MissionView[]) => list.filter((m) => m.caseSummary.id === c.id)
    expect(forCase(await json<MissionView[]>('u-student', 'GET', '/api/missions')).some((m) => m.eligibility.ok)).toBe(true)
    expect(forCase(await json<MissionView[]>('u-volunteer', 'GET', '/api/missions')).some((m) => m.eligibility.ok)).toBe(true)
    expect(forCase(await json<MissionView[]>('u-canteen', 'GET', '/api/missions')).some((m) => m.eligibility.ok)).toBe(true)
    // Still locked, with a reason, for the unverified volunteer and the untrained supervisor.
    expect(forCase(await json<MissionView[]>('u-volunteer-untrained', 'GET', '/api/missions')).every((m) => !m.eligibility.ok)).toBe(true)
    expect(forCase(await json<MissionView[]>('u-canteen-trainee', 'GET', '/api/missions')).every((m) => !m.eligibility.ok)).toBe(true)
  })

  it('facilities report: the volunteer gets the public-area check', async () => {
    await start(minimal)
    const c = await json<CaseView>('u-student', 'POST', '/api/cases', facilitiesReport)
    const mine = (await json<MissionView[]>('u-volunteer', 'GET', '/api/missions')).filter((m) => m.caseSummary.id === c.id)
    expect(mine.map((m) => m.templateId)).toContain('general.volunteer_check')
  })

  it('direct reports never get an issuer check; messages do', async () => {
    await start()
    const issue = await json<CaseView>('u-student', 'POST', '/api/cases', { route: 'issue', description: 'The ground-floor emergency exit is blocked by chairs.', locationId: 'ramanujan', category: 'Safety & access' })
    expect(issue.missions.length).toBeGreaterThan(0)
    const staff = await json<CaseView>('u-operator', 'GET', `/api/cases/${issue.id}`)
    expect(staff.missions.map((m) => m.templateId)).not.toContain('exit.official_source_check')
    const message = await json<CaseView>('u-student', 'POST', '/api/cases', { route: 'message', description: 'The college has officially closed the emergency exit.', locationId: 'ramanujan', category: 'Safety & access' })
    expect((await json<CaseView>('u-operator', 'GET', `/api/cases/${message.id}`)).missions.map((m) => m.templateId)).toContain('exit.official_source_check')
  })

  it('a mission taken by one volunteer disappears for the others, and students never see volunteer-only tasks', async () => {
    await start()
    const c = await json<CaseView>('u-student', 'POST', '/api/cases', foodReport)
    const view = (await json<MissionView[]>('u-volunteer', 'GET', '/api/missions')).find((m) => m.caseSummary.id === c.id && m.templateId === 'food.volunteer_public_view')!
    await json('u-volunteer', 'POST', `/api/missions/${view.id}/accept`, {})
    expect((await json<MissionView[]>('u-volunteer2', 'GET', '/api/missions')).some((m) => m.id === view.id)).toBe(false)
    expect((await json<MissionView[]>('u-volunteer', 'GET', '/api/missions')).find((m) => m.id === view.id)?.assignedToMe).toBe(true)
    expect((await json<MissionView[]>('u-operator', 'GET', '/api/missions')).some((m) => m.id === view.id)).toBe(true)
    expect((await json<MissionView[]>('u-student', 'GET', '/api/missions')).every((m) => m.allowedRoles.includes('student'))).toBe(true)
  })
})
