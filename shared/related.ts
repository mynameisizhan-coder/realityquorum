import type { Case } from './domain'

// Related reports are only ever suggested to staff. Nothing here merges or modifies a case.

export interface RelatedSuggestion { caseId: string; score: number; reasons: string[] }

const normalise = (text = '') => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const timeOf = (c: Pick<Case, 'createdAt' | 'food'>) => Date.parse(c.food?.servedAt || c.createdAt)

export function suggestRelated(target: Case, candidates: Case[], windowHours = 3): RelatedSuggestion[] {
  const suggestions: RelatedSuggestion[] = []
  for (const other of candidates) {
    if (other.id === target.id || other.locationId !== target.locationId || target.locationId === 'unknown') continue
    const sameSpot = !!normalise(target.specificLocation) && normalise(target.specificLocation) === normalise(other.specificLocation)
    const sameItem = !!target.food?.item && normalise(target.food.item) === normalise(other.food?.item)
    const gap = Math.abs(timeOf(target) - timeOf(other))
    const close = Number.isFinite(gap) && gap <= windowHours * 3_600_000
    // A shared location alone is common; require a specific match and a close time.
    if (!(sameSpot || sameItem) || !close) continue
    const reasons = ['Same campus location']
    if (sameSpot) reasons.push('Same counter or landmark')
    if (sameItem) reasons.push('Same food item')
    reasons.push(`Within ${windowHours} hours`)
    if (target.category === other.category) reasons.push('Same category')
    suggestions.push({ caseId: other.id, score: reasons.length, reasons })
  }
  return suggestions.sort((a, b) => b.score - a.score)
}
