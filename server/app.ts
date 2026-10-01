import Fastify from 'fastify'
import type { FastifyReply, FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { createReadStream, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { CATEGORIES, URGENCIES } from '../shared/domain'
import type { User } from '../shared/domain'
import { MAX_FILE_SIZE, MAX_FILES } from '../shared/validation'
import { Store } from './db'
import { MockGemini } from './gemini/mock'
import type { GeminiAdapter } from './gemini/adapter'
import * as svc from './service'
import { HttpError } from './service'
import type { Ctx, IncomingFile } from './service'
import { seed } from './seed'
import type { FetchText } from './official'

export interface AppOptions {
  dbPath: string
  uploadDir: string
  sessionSecret?: string
  gemini?: GeminiAdapter
  seedDemo?: boolean
  logger?: boolean
  /** Built frontend (vite build output). When set and present, the server serves the whole app. */
  staticDir?: string
  /** Mark cookies Secure. Turn on whenever the site is served over HTTPS. */
  secureCookies?: boolean
  /** The demo role switcher lets anyone act as any role. Disable it for anything but a demonstration. */
  allowDemoLogin?: boolean
  /** Fetches official pages to verify quotes. Tests pass a stub. */
  fetchText?: FetchText
  /** Requests per minute per client for AI-backed and write endpoints. 0 disables limiting (tests). */
  rateLimitPerMinute?: number
  trustProxy?: boolean
}

const SESSION = 'rq_session'
const KINDS = ['message_text', 'photo', 'receipt', 'observation', 'official_source', 'supervisor_record', 'isolation_record', 'authorized_inspection', 'corrective_action', 'reporter_notification', 'closure_photo', 'independent_confirmation'] as const

const NewCase = z.object({
  route: z.enum(['message', 'issue']),
  description: z.string().max(4000).default(''),
  locationId: z.string().min(1).max(60),
  specificLocation: z.string().max(160).optional(),
  category: z.enum(CATEGORIES as [string, ...string[]]).optional(),
  urgency: z.enum(URGENCIES as [string, ...string[]]).optional(),
  food: z.object({ item: z.string().max(120), servedAt: z.string().max(40), receipt: z.string().max(100), disturbed: z.string().max(60) }).optional(),
  capturedAt: z.string().max(40).optional(),
})
const Evidence = z.object({
  kind: z.enum(KINDS),
  note: z.string().max(2000).optional(),
  capturedAt: z.string().max(40).optional(),
  findings: z.array(z.object({ predicateId: z.string().max(80), effect: z.enum(['supports', 'contradicts']) })).max(10).optional(),
  challengeCode: z.string().max(20).optional(),
  issuer: z.string().max(120).optional(),
})
const Reason = z.object({ reason: z.string().max(1000) })

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new HttpError(400, 'invalid_input', 'Some details are missing or invalid.', result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })))
  return result.data
}

/** Accepts either JSON or multipart (a `data` JSON field plus files). */
async function readBody(request: FastifyRequest): Promise<{ data: unknown; files: IncomingFile[] }> {
  if (!request.isMultipart()) return { data: request.body ?? {}, files: [] }
  let data: unknown = {}
  const files: IncomingFile[] = []
  for await (const part of request.parts()) {
    if (part.type === 'file') files.push({ name: part.filename, type: part.mimetype, data: await part.toBuffer() })
    else if (part.fieldname === 'data') {
      try { data = JSON.parse(String(part.value)) } catch { throw new HttpError(400, 'invalid_input', 'The form data could not be read.') }
    }
  }
  return { data, files }
}

export async function buildApp(options: AppOptions) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 1_000_000, trustProxy: options.trustProxy ?? false })
  const store = new Store(options.dbPath)
  const ctx: Ctx = { store, gemini: options.gemini ?? new MockGemini(), uploadDir: options.uploadDir, fetchText: options.fetchText }
  // Prepared demo cases always use the deterministic mock so they come out identical every time.
  const seedCtx: Ctx = { ...ctx, gemini: new MockGemini() }
  if (options.seedDemo !== false) await seed(seedCtx)

  await app.register(cookie, { secret: options.sessionSecret ?? randomBytes(32).toString('hex') })
  await app.register(multipart, { limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES, fields: 5 } })
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: options.secureCookies ? [] : null,
      },
    },
    // Only send HSTS when the site is actually on HTTPS.
    hsts: options.secureCookies ? undefined : false,
  })
  const perMinute = options.rateLimitPerMinute ?? 60
  if (perMinute > 0) await app.register(rateLimit, { global: false })
  // Applied to routes that call Gemini or write data, so one client cannot run up costs or flood the ledger.
  const limited = perMinute > 0 ? { config: { rateLimit: { max: perMinute, timeWindow: '1 minute' } } } : {}
  app.addHook('onClose', async () => store.close())

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _request, reply) => {
    if (error instanceof HttpError) return reply.status(error.status).send({ error: error.message, code: error.code, details: error.details })
    if (error.code === 'FST_REQ_FILE_TOO_LARGE') return reply.status(413).send({ error: 'Each file must be 10 MB or smaller.', code: 'file_too_large' })
    if (error.code === 'FST_FILES_LIMIT') return reply.status(413).send({ error: 'You can add up to 5 files at a time.', code: 'too_many_files' })
    if (error.statusCode === 429) return reply.status(429).send({ error: 'Too many requests. Please wait a minute and try again.', code: 'rate_limited' })
    if (error.statusCode && error.statusCode < 500) return reply.status(error.statusCode).send({ error: error.message, code: error.code ?? 'bad_request' })
    app.log.error(error)
    return reply.status(500).send({ error: 'Something went wrong on our side. Nothing was published.', code: 'server_error' })
  })

  const currentUser = (request: FastifyRequest): User | null => {
    const raw = request.cookies[SESSION]
    if (!raw) return null
    const unsigned = request.unsignCookie(raw)
    return unsigned.valid && unsigned.value ? svc.getUser(ctx, unsigned.value) ?? null : null
  }
  const requireUser = (request: FastifyRequest): User => {
    const user = currentUser(request)
    if (!user) throw new HttpError(401, 'unauthenticated', 'Choose a demo account to continue.')
    return user
  }
  const id = (request: FastifyRequest) => (request.params as { id: string }).id

  // ----- auth -----
  app.get('/api/health', async () => ({ ok: true, gemini: ctx.gemini.name, demoLogin: options.allowDemoLogin !== false }))
  app.get('/api/auth/users', async () => store.all<User>('users'))
  app.get('/api/auth/me', async request => currentUser(request))
  app.post('/api/auth/demo-login', async (request, reply) => {
    if (options.allowDemoLogin === false) throw new HttpError(403, 'demo_login_disabled', 'Demo sign-in is turned off on this server.')
    const { userId } = parse(z.object({ userId: z.string() }), request.body)
    const user = svc.getUser(ctx, userId)
    if (!user) throw new HttpError(404, 'user_not_found', 'This demo account does not exist.')
    reply.setCookie(SESSION, user.id, { signed: true, httpOnly: true, sameSite: 'lax', secure: options.secureCookies ?? false, path: '/', maxAge: 60 * 60 * 12 })
    return user
  })
  app.post('/api/auth/logout', async (_request, reply) => { reply.clearCookie(SESSION, { path: '/' }); return { ok: true } })

  // ----- intake and cases -----
  app.post('/api/intake/suggest', limited, async request => {
    requireUser(request)
    const input = parse(z.object({ route: z.enum(['message', 'issue']), text: z.string().max(4000), locationId: z.string().max(60).default('unknown') }), request.body)
    return svc.suggest(ctx, input)
  })
  app.post('/api/cases', limited, async (request, reply) => {
    const user = requireUser(request)
    const { data, files } = await readBody(request)
    reply.status(201)
    return svc.createCase(ctx, user, parse(NewCase, data) as svc.NewCaseInput, files)
  })
  app.get('/api/cases', async request => svc.listCases(ctx, requireUser(request)))
  app.get('/api/cases/:id', async request => svc.getCase(ctx, requireUser(request), id(request)))
  app.get('/api/cases/:id/related', async request => svc.related(ctx, requireUser(request), id(request)))
  app.post('/api/cases/:id/evidence', limited, async request => {
    const user = requireUser(request)
    const { data, files } = await readBody(request)
    return svc.addEvidence(ctx, user, id(request), parse(Evidence, data), files)
  })
  app.get('/api/cases/:id/files/:fileId', async (request, reply: FastifyReply) => {
    const user = requireUser(request)
    const file = svc.fileFor(ctx, user, id(request), (request.params as { fileId: string }).fileId)
    if (!existsSync(file.path)) throw new HttpError(404, 'file_missing', 'This file is no longer stored on the server. Ask the reporter to add it again.')
    // ?download=1 saves the file; otherwise it opens in the browser. filename* keeps non-English names intact.
    const disposition = (request.query as { download?: string }).download ? 'attachment' : 'inline'
    const ascii = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    reply.header('Content-Type', file.type).header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`)
    return reply.send(createReadStream(file.path))
  })

  // ----- missions -----
  app.get('/api/missions', async request => svc.listMissions(ctx, requireUser(request)))
  app.post('/api/missions/:id/accept', async request => svc.acceptMission(ctx, requireUser(request), id(request)))
  app.post('/api/missions/:id/submit', limited, async request => {
    const user = requireUser(request)
    const { data, files } = await readBody(request)
    return svc.submitMission(ctx, user, id(request), parse(Evidence, data), files)
  })

  // ----- campus action and closure -----
  app.post('/api/cases/:id/workorders', async request => {
    const body = parse(z.object({ basis: z.enum(['verified', 'precautionary']).default('verified'), actions: z.array(z.string().max(200)).max(10).optional() }), request.body ?? {})
    return svc.approveWorkOrder(ctx, requireUser(request), id(request), body.basis, body.actions)
  })
  app.patch('/api/workorders/:id', async request => {
    const body = parse(z.object({ status: z.enum(['Open', 'In progress', 'Marked resolved']), note: z.string().max(1000).default('') }), request.body)
    return svc.updateWorkOrder(ctx, requireUser(request), id(request), body.status, body.note)
  })
  app.post('/api/cases/:id/close', async request => svc.closeCase(ctx, requireUser(request), id(request)))
  app.post('/api/cases/:id/official-check', limited, async request => svc.recheckOfficialSources(ctx, requireUser(request), id(request)))
  app.post('/api/cases/:id/reopen', async request => svc.requestReopen(ctx, requireUser(request), id(request), parse(Reason, request.body).reason))
  app.post('/api/cases/:id/reopen/review', async request => svc.reviewReopen(ctx, requireUser(request), id(request), parse(z.object({ accept: z.boolean() }), request.body).accept))

  // ----- public updates -----
  app.post('/api/cases/:id/public-update', async request => svc.draftUpdate(ctx, requireUser(request), id(request)))
  app.post('/api/public-updates/:id/publish', async request => svc.publishUpdate(ctx, requireUser(request), id(request), parse(z.object({ text: z.string().max(2000).optional() }), request.body ?? {}).text))
  app.get('/api/public/updates', async () => svc.publicUpdates(ctx))

  // ----- trust and abuse -----
  app.post('/api/cases/:id/reveal-identity', async request => svc.revealIdentity(ctx, requireUser(request), id(request), parse(Reason, request.body).reason))
  app.post('/api/cases/:id/abuse-flag', async request => svc.flagAbuse(ctx, requireUser(request), id(request), parse(Reason, request.body).reason))
  app.get('/api/abuse-queue', async request => svc.abuseQueue(ctx, requireUser(request)))
  app.get('/api/audit', async request => {
    const user = requireUser(request)
    if (user.role !== 'trust_officer') throw new HttpError(403, 'forbidden', 'Only a trust officer can read the audit log.')
    return store.auditLog()
  })

  // ----- demo -----
  app.post('/api/demo/reset', async request => {
    const user = requireUser(request)
    if (user.role !== 'operator') throw new HttpError(403, 'forbidden', 'Only an operator can reset demonstration data.')
    store.reset()
    await seed(seedCtx, true)
    store.audit(user.id, 'demo.reset', null, 'Demonstration data restored')
    return { ok: true }
  })

  // ----- frontend (production) -----
  if (options.staticDir && existsSync(options.staticDir)) {
    await app.register(fastifyStatic, {
      root: options.staticDir,
      wildcard: false,
      // Hashed build assets can be cached for a year; index.html must always be revalidated.
      setHeaders: (reply, path) => reply.header('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache'),
    })
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.method !== 'GET') return reply.status(404).send({ error: 'Not found.', code: 'not_found' })
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html')
    })
  } else {
    app.setNotFoundHandler((_request, reply) => reply.status(404).send({ error: 'Not found.', code: 'not_found' }))
  }

  return { app, ctx }
}
