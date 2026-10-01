import { afterEach, describe, expect, it, vi } from 'vitest'
import { FallbackGemini, RealGemini } from '../server/gemini/real'
import type { GeminiAdapter, ObserveInput } from '../server/gemini/adapter'
import { isOfficialUrl, pageText, verifyOfficialCheck } from '../server/official'

const ok = (value: unknown, retrieved: string[] = []) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] }, urlContextMetadata: { urlMetadata: retrieved.map(u => ({ retrievedUrl: u, urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS' })) } }] }), { status: 200 })
const status = (code: number, body = '{"error":{}}') => new Response(body, { status: code })
const suggestion = { category: 'Safety & access', urgency: 'Urgent', confidence: 0.8, rationale: 'Exit wording.', claims: [{ text: 'The exit is blocked.', tier: 'observable' }] }
const input = { route: 'message' as const, text: 'The exit is blocked.', locationId: 'ramanujan' }
const observeInput = (over: Partial<ObserveInput> = {}): ObserveInput => ({ kind: 'photo', note: '', fileNames: ['a.png'], packId: 'exit-access', images: [], questions: [], ...over })

afterEach(() => vi.unstubAllGlobals())

describe('real Gemini adapter', () => {
  it('moves to the next model when one is overloaded, and sends the key as a header', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(status(503)).mockResolvedValueOnce(ok(suggestion))
    vi.stubGlobal('fetch', fetchMock)
    expect(await new RealGemini('test-key', ['model-a', 'model-b']).suggest(input)).toEqual(suggestion)
    expect(fetchMock.mock.calls.map(c => String(c[0]))).toEqual([expect.stringContaining('model-a'), expect.stringContaining('model-b')])
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('test-key')
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-key')
  })

  it('remembers a model whose daily quota is used up and skips it next time', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(status(429, '{"error":{"details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}'))
      .mockImplementation(async () => ok(suggestion))
    vi.stubGlobal('fetch', fetchMock)
    const g = new RealGemini('k', ['tired', 'fresh'])
    await g.suggest(input)
    await g.suggest(input)
    expect(fetchMock.mock.calls.map(c => String(c[0]).match(/models\/(\w+)/)![1])).toEqual(['tired', 'fresh', 'fresh'])
  })

  it('does not retry a request Google rejects as invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(status(400))
    vi.stubGlobal('fetch', fetchMock)
    await expect(new RealGemini('k', ['a', 'b']).suggest(input)).rejects.toThrow(/400/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('skips image analysis when there are no images', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await new RealGemini('k').observe(observeInput({ kind: 'receipt', fileNames: ['r.pdf'] }))).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads the official pages with the URL tool and reports which pages it retrieved', async () => {
    const page = 'https://nitte.edu.in/nmamit/announcement.php'
    const fetchMock = vi.fn().mockResolvedValue(ok({ verdict: 'not_found', summary: 'Nothing about a closure.', quotes: [] }, [page]))
    vi.stubGlobal('fetch', fetchMock)
    const result = await new RealGemini('k', ['web-model']).checkOfficial({ message: 'College closed tomorrow', claims: ['The Principal closed the college'], sources: [page], checkedAt: '2026-10-01T10:00:00Z' })
    expect(result).toMatchObject({ verdict: 'not_found', retrieved: [page] })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).tools).toEqual([{ url_context: {} }])
  })
})

describe('fallback to the offline mock', () => {
  const silent = () => {}
  it('uses the mock when Gemini fails, and reports the website check as not possible', async () => {
    const broken: GeminiAdapter = { name: 'x', suggest: () => Promise.reject(new Error('down')), observe: () => Promise.reject(new Error('down')), checkOfficial: () => Promise.reject(new Error('down')) }
    const g = new FallbackGemini(broken, silent)
    expect(await g.suggest({ ...input, text: 'The emergency exit is blocked.' })).toMatchObject({ category: 'Safety & access' })
    expect(await g.checkOfficial({ message: 'x', claims: [], sources: [], checkedAt: '' })).toBeNull()
  })

  it('uses the mock when Gemini returns the wrong shape', async () => {
    const odd: GeminiAdapter = { name: 'x', suggest: async () => ({ category: 'Made up' }), observe: async () => 'not a list' }
    const g = new FallbackGemini(odd, silent)
    expect(await g.suggest(input)).toMatchObject({ confidence: expect.any(Number) })
    expect(Array.isArray(await g.observe(observeInput()))).toBe(true)
  })

  it('passes valid Gemini output through unchanged', async () => {
    const good: GeminiAdapter = { name: 'x', suggest: async () => suggestion, observe: async () => ['A passage is visible.'] }
    expect(await new FallbackGemini(good, silent).suggest(input)).toEqual(suggestion)
  })
})

describe('official website check', () => {
  const page = 'https://nitte.edu.in/nmamit/announcement.php'
  const html = '<html><script>var x="closed"</script><p>Notice:&nbsp;The college will <b>remain closed</b> on 2 October 2026 on account of Gandhi Jayanti.</p></html>'
  const fetchText = async (url: string) => (url === page ? html : '')

  it('only accepts official NMAMIT pages over HTTPS', () => {
    expect(isOfficialUrl(page)).toBe(true)
    expect(isOfficialUrl('http://nitte.edu.in/nmamit/x.php')).toBe(false)
    expect(isOfficialUrl('https://nitte.edu.in.evil.com/nmamit')).toBe(false)
    expect(isOfficialUrl('https://example.com/nmamit')).toBe(false)
  })

  it('extracts visible text, ignoring scripts and decoding entities', () => {
    expect(pageText(html)).toBe('notice: the college will remain closed on 2 october 2026 on account of gandhi jayanti.')
  })

  it('accepts a verdict whose quote really is on the page', async () => {
    const r = await verifyOfficialCheck({ verdict: 'confirmed', summary: 'Closed for Gandhi Jayanti.', quotes: [{ url: page, text: 'The college will remain closed on 2 October 2026' }], retrieved: [page] }, fetchText, 'now')
    expect(r.status).toBe('confirmed')
    expect(r.quotes).toHaveLength(1)
  })

  it('rejects an invented quote, a quote from another site, and a too-short quote', async () => {
    for (const quote of [
      { url: page, text: 'All classes cancelled due to heavy rain on 2 October' },
      { url: 'https://example.com/fake', text: 'The college will remain closed on 2 October 2026' },
      { url: page, text: 'closed' },
    ]) {
      const r = await verifyOfficialCheck({ verdict: 'confirmed', summary: 's', quotes: [quote], retrieved: [page] }, fetchText, 'now')
      expect(r.status).toBe('unverified')
    }
  })

  it('treats "not found" as meaningful only if the official pages were actually read', async () => {
    expect((await verifyOfficialCheck({ verdict: 'not_found', summary: 's', quotes: [], retrieved: [page] }, fetchText, 'now')).status).toBe('not_found')
    expect((await verifyOfficialCheck({ verdict: 'not_found', summary: 's', quotes: [], retrieved: [] }, fetchText, 'now')).status).toBe('unavailable')
  })
})
