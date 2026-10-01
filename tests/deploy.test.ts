import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../server/app'
import type { AppOptions } from '../server/app'

type App = Awaited<ReturnType<typeof buildApp>>['app']
const dirs: string[] = []
const apps: App[] = []

async function start(options: Partial<AppOptions> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rq-deploy-'))
  dirs.push(dir)
  const { app } = await buildApp({ dbPath: ':memory:', uploadDir: join(dir, 'uploads'), sessionSecret: 'test-secret', ...options })
  apps.push(app)
  return { app, dir }
}
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function cookieFor(app: App, userId: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/demo-login', payload: { userId } })
  return { res, cookie: `${res.cookies[0]?.name}=${res.cookies[0]?.value}` }
}

function multipart(data: object, file: { name: string; type: string; content: Buffer }) {
  const boundary = '----rqdeploy'
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${JSON.stringify(data)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`),
    file.content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
}

describe('deployment safeguards', () => {
  it('rejects a file whose bytes do not match its declared type', async () => {
    const { app } = await start()
    const { cookie } = await cookieFor(app, 'u-student')
    const html = Buffer.from('<html><script>alert(1)</script></html>')
    const report = { route: 'issue', description: 'A blocked corridor near the library.', locationId: 'unknown' }
    const { payload, headers } = multipart(report, { name: 'photo.png', type: 'image/png', content: html })
    const res = await app.inject({ method: 'POST', url: '/api/cases', payload, headers: { ...headers, cookie } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/not a valid PNG/)
  })

  it('sends security headers', async () => {
    const { app } = await start()
    const res = await app.inject({ url: '/api/health' })
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBeDefined()
    expect(res.headers['strict-transport-security']).toBeUndefined()
  })

  it('marks cookies Secure and sends HSTS when serving over HTTPS', async () => {
    const { app } = await start({ secureCookies: true })
    const { res } = await cookieFor(app, 'u-student')
    expect(res.cookies[0].secure).toBe(true)
    expect(res.cookies[0].httpOnly).toBe(true)
    expect((await app.inject({ url: '/api/health' })).headers['strict-transport-security']).toBeDefined()
  })

  it('can turn the demo role switcher off', async () => {
    const { app } = await start({ allowDemoLogin: false })
    const { res } = await cookieFor(app, 'u-operator')
    expect(res.statusCode).toBe(403)
    expect(res.cookies).toHaveLength(0)
  })

  it('rate-limits AI-backed endpoints', async () => {
    const { app } = await start({ rateLimitPerMinute: 2 })
    const { cookie } = await cookieFor(app, 'u-student')
    const call = () => app.inject({ method: 'POST', url: '/api/intake/suggest', payload: { route: 'issue', text: 'Broken light in corridor', locationId: 'unknown' }, headers: { cookie } })
    expect((await call()).statusCode).toBe(200)
    expect((await call()).statusCode).toBe(200)
    const limited = await call()
    expect(limited.statusCode).toBe(429)
    expect(limited.json().code).toBe('rate_limited')
  })

  it('rejects a forged session cookie', async () => {
    const { app } = await start()
    const res = await app.inject({ url: '/api/cases', headers: { cookie: 'rq_session=u-operator' } })
    expect(res.statusCode).toBe(401)
  })

  it('serves the built app, falls back to index.html for client routes, and keeps API 404s as JSON', async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'rq-dist-'))
    dirs.push(staticDir)
    mkdirSync(join(staticDir, 'assets'))
    writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>RQ</title>')
    writeFileSync(join(staticDir, 'assets', 'app-abc123.js'), 'console.log(1)')
    const { app } = await start({ staticDir })
    const index = await app.inject({ url: '/' })
    expect(index.statusCode).toBe(200)
    expect(index.body).toContain('<title>RQ</title>')
    expect(index.headers['cache-control']).toBe('no-cache')
    const asset = await app.inject({ url: '/assets/app-abc123.js' })
    expect(asset.headers['cache-control']).toContain('immutable')
    expect((await app.inject({ url: '/cases/RQ-1' })).body).toContain('<title>RQ</title>')
    const api404 = await app.inject({ url: '/api/nope' })
    expect(api404.statusCode).toBe(404)
    expect(api404.json().code).toBe('not_found')
  })
})
