import { afterEach, describe, expect, it, vi } from 'vitest'
import { FallbackGemini, RealGemini } from '../server/gemini/real'
import type { GeminiAdapter } from '../server/gemini/adapter'
import { getPack } from '../shared/policy'

const ok = (value: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 })
const status = (code: number) => new Response('{"error":{}}', { status: code })
const suggestion = { category: 'Safety & access', urgency: 'Urgent', confidence: 0.8, rationale: 'Exit wording.', claims: [{ text: 'The exit is blocked.', tier: 'observable' }] }
const input = { route: 'message' as const, text: 'The exit is blocked.', locationId: 'ramanujan' }

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

  it('does not retry a request Google rejects as invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(status(400))
    vi.stubGlobal('fetch', fetchMock)
    await expect(new RealGemini('k', ['a', 'b']).suggest(input)).rejects.toThrow(/400/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('skips image analysis when there are no images', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await new RealGemini('k').observe({ kind: 'receipt', note: '', fileNames: ['r.pdf'], packId: 'food-safety', images: [] })).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('fallback to the offline mock', () => {
  const silent = () => {}
  it('uses the mock when Gemini fails', async () => {
    const broken: GeminiAdapter = { name: 'x', suggest: () => Promise.reject(new Error('down')), observe: () => Promise.reject(new Error('down')), selectMissions: () => Promise.reject(new Error('down')) }
    const g = new FallbackGemini(broken, silent)
    expect(await g.suggest({ ...input, text: 'The emergency exit is blocked.' })).toMatchObject({ category: 'Safety & access' })
    expect(await g.selectMissions(getPack('exit-access'), { route: 'message', description: 'x', category: 'Safety & access' })).not.toHaveLength(0)
  })

  it('uses the mock when Gemini returns the wrong shape', async () => {
    const odd: GeminiAdapter = { name: 'x', suggest: async () => ({ category: 'Made up' }), observe: async () => 'not a list', selectMissions: async () => ({}) }
    const g = new FallbackGemini(odd, silent)
    expect(await g.suggest(input)).toMatchObject({ confidence: expect.any(Number) })
    expect(Array.isArray(await g.observe({ kind: 'photo', note: '', fileNames: ['a.png'], packId: 'exit-access', images: [] }))).toBe(true)
  })

  it('passes valid Gemini output through unchanged', async () => {
    const good: GeminiAdapter = { name: 'x', suggest: async () => suggestion, observe: async () => ['A passage is visible.'], selectMissions: async () => [] }
    expect(await new FallbackGemini(good, silent).suggest(input)).toEqual(suggestion)
  })
})
