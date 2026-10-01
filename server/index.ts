import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { buildApp } from './app'
import { MockGemini } from './gemini/mock'
import { DEFAULT_MODELS, FallbackGemini, RealGemini } from './gemini/real'

// Load .env when present (Node 24 built-in). Real environment variables take precedence.
try { process.loadEnvFile(join(import.meta.dirname, '..', '.env')) } catch { /* no .env file */ }

const env = process.env
const production = env.NODE_ENV === 'production'
const flag = (name: string, fallback: boolean) => (env[name] === undefined || env[name] === '' ? fallback : ['1', 'true', 'yes'].includes(env[name]!.toLowerCase()))

const dataDir = env.RQ_DATA_DIR ?? join(import.meta.dirname, 'data')
const port = Number(env.PORT ?? 8791)
// In production the server listens on all interfaces (containers, hosts); in development only on this machine.
const host = env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1')

/**
 * Uses SESSION_SECRET when set. Otherwise generates a random 256-bit secret once and keeps it in the
 * private data folder, so the app starts with no configuration and sessions survive restarts.
 */
function sessionSecret(): string {
  if (env.SESSION_SECRET) {
    if (production && env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters in production.')
    return env.SESSION_SECRET
  }
  const file = join(dataDir, '.session-secret')
  if (!existsSync(file)) { mkdirSync(dataDir, { recursive: true }); writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 }) }
  return readFileSync(file, 'utf8').trim()
}

const key = env.GEMINI_API_KEY?.trim()
// GEMINI_MODEL (comma-separated, tried in order) overrides both the text and the photo models.
const override = env.GEMINI_MODEL?.split(',').map(m => m.trim()).filter(Boolean)
const models = override?.length ? { text: override, vision: override } : DEFAULT_MODELS
const gemini = key ? new FallbackGemini(new RealGemini(key, models)) : new MockGemini()

const allowDemoLogin = flag('ALLOW_DEMO_LOGIN', true)
const secureCookies = flag('COOKIE_SECURE', production)

const { app } = await buildApp({
  dbPath: join(dataDir, 'realityquorum.db'),
  uploadDir: join(dataDir, 'uploads'),
  sessionSecret: sessionSecret(),
  gemini,
  logger: true,
  staticDir: env.STATIC_DIR ?? join(import.meta.dirname, '..', 'dist'),
  secureCookies,
  allowDemoLogin,
  rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? 60),
  trustProxy: flag('TRUST_PROXY', production),
})

app.log.info(key ? `Gemini text: ${models.text.join(' → ')} · photos: ${models.vision.join(' → ')} · then offline mock` : 'Gemini: GEMINI_API_KEY not set, using the offline mock.')
if (!env.SESSION_SECRET) app.log.info(`SESSION_SECRET not set; using the generated secret stored in ${join(dataDir, '.session-secret')}. Keep the data folder on persistent storage.`)
if (allowDemoLogin && production) app.log.warn('ALLOW_DEMO_LOGIN is on: anyone can sign in as any role, including operator and trust officer. Use only for demonstrations.')
if (production && !secureCookies) app.log.warn('COOKIE_SECURE is off in production. Turn it on when serving over HTTPS.')

// Finish in-flight requests and close the database cleanly when the host stops the process.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info(`${signal} received, shutting down`)
    app.close().then(() => process.exit(0), () => process.exit(1))
    setTimeout(() => process.exit(1), 10_000).unref()
  })
}

await app.listen({ host, port })
