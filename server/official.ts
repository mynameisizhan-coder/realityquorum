import type { OfficialCheckResult } from '../shared/domain'
import type { OfficialCheck } from './gemini/adapter'

// Checking a circulating message against NMAMIT's own website. Gemini reads the pages; this module
// independently confirms that every quote Gemini relies on really appears on an official page.

/** Official pages where NMAMIT publishes announcements and news. */
export const OFFICIAL_SOURCES = ['https://nitte.edu.in/nmamit/announcement.php', 'https://nitte.edu.in/nmamit/news-all.php']
const OFFICIAL_HOSTS = new Set(['nitte.edu.in', 'www.nitte.edu.in'])

export type FetchText = (url: string) => Promise<string>

export const defaultFetchText: FetchText = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'RealityQuorum official-source check' } })
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return response.text()
}

export function isOfficialUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && OFFICIAL_HOSTS.has(u.hostname) && u.pathname.startsWith('/nmamit')
  } catch {
    return false
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
/** Visible text of an HTML page, normalised for comparison. */
export function pageText(html: string): string {
  return normalise(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m),
  )
}
export const normalise = (text: string) => text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim()

export type OfficialResult = OfficialCheckResult

/**
 * Accepts Gemini's verdict only if each quote it relies on comes from an official page and is found,
 * word for word, on that page as fetched by this server. Otherwise the verdict is downgraded.
 */
export async function verifyOfficialCheck(check: OfficialCheck, fetchText: FetchText, checkedAt: string): Promise<OfficialResult> {
  const base = { checkedAt, sources: OFFICIAL_SOURCES }
  if (check.verdict === 'not_found') {
    // "Nothing found" only means something if the official pages were actually read.
    if (!check.retrieved.some(isOfficialUrl)) return { ...base, status: 'unavailable', quotes: [], summary: 'The official pages could not be read, so the message could not be checked against them.' }
    return { ...base, status: 'not_found', summary: check.summary, quotes: [] }
  }

  const pages = new Map<string, string>()
  const verified: { url: string; text: string }[] = []
  for (const quote of check.quotes) {
    if (!isOfficialUrl(quote.url) || normalise(quote.text).length < 15) continue
    if (!pages.has(quote.url)) pages.set(quote.url, await fetchText(quote.url).then(pageText, () => ''))
    if (pages.get(quote.url)!.includes(normalise(quote.text))) verified.push(quote)
  }
  if (!verified.length) {
    return { ...base, status: 'unverified', quotes: [], summary: `The automated check reported “${check.verdict}”, but the quoted text could not be found on an official page, so it was not accepted. ${check.summary}` }
  }
  return { ...base, status: check.verdict, summary: check.summary, quotes: verified }
}
