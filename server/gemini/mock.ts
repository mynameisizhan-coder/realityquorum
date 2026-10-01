import type { Category, ScopeTier, Urgency } from '../../shared/domain'
import type { GeminiAdapter, MissionSelection, Suggestion } from './adapter'

// Deterministic stand-in for Gemini. Keyword rules are intentionally simple so tests and the live demo
// are reproducible, including the case where the suggestion is wrong and the student corrects it.

const RULES: { category: Category; urgency: Urgency; words: RegExp }[] = [
  { category: 'Safety & access', urgency: 'Urgent', words: /\b(emergency exit|exit|fire|blocked|stair(case)?s?|evacuat\w*|smoke)\b/i },
  { category: 'Food & canteen', urgency: 'Needs attention', words: /\b(food|canteen|cockroach|insect|meal|plate|hair|lunch|counter|stale)\b/i },
  { category: 'Campus notice', urgency: 'Routine', words: /\b(notice|circular|announce\w*|holiday|exam|postponed|cancelled)\b/i },
  { category: 'Facilities', urgency: 'Routine', words: /\b(leak\w*|light|fan|broken|wifi|toilet|water|projector|lift)\b/i },
]
const ATTRIBUTION = /\b(official(ly)?|college|principal|management|registrar|notice|circular|announced|administration|hod)\b/i

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 3)
}

export class MockGemini implements GeminiAdapter {
  readonly name = 'mock-gemini'

  async suggest({ route, text }: { route: 'message' | 'issue'; text: string }): Promise<Suggestion> {
    const rule = RULES.find(r => r.words.test(text))
    const claims = route === 'message'
      ? splitSentences(text).map(sentence => ({ text: sentence, tier: (ATTRIBUTION.test(sentence) ? 'attribution' : 'observable') as ScopeTier }))
      : [{ text: text.trim(), tier: 'observable' as ScopeTier }]
    return {
      category: rule?.category ?? (route === 'message' ? 'Campus notice' : 'Other'),
      urgency: rule?.urgency ?? 'Routine',
      confidence: rule ? 0.72 : 0.35,
      rationale: rule ? `Matched wording associated with ${rule.category.toLowerCase()}. The reporter can change this.` : 'No clear signal; please choose the category.',
      claims: claims.slice(0, 10),
    }
  }

  async observe({ kind, fileNames, packId }: { kind: string; fileNames: string[]; packId: string }): Promise<string[]> {
    if (!fileNames.length) return []
    const notes = [`${fileNames.length} file(s) received. Mock adapter: no image analysis was performed.`]
    if (packId === 'food-safety' && kind === 'photo') notes.push('An insect-like object may be visible; confirm against the plate boundary.', 'The images alone do not establish when the object entered the food.')
    if (packId === 'exit-access' && (kind === 'photo' || kind === 'closure_photo')) notes.push('Check whether the passage width is clear and the exit sign is visible.')
    return notes
  }

  async selectMissions(pack: Parameters<GeminiAdapter['selectMissions']>[0], record: Parameters<GeminiAdapter['selectMissions']>[1]): Promise<MissionSelection> {
    const attributionIds = new Set(pack.predicates.filter(p => p.appliesTo === 'message').map(p => p.id))
    return pack.missions
      .filter(m => (m.phase ?? 'evidence') === 'evidence')
      // Official-source checks only make sense when there is a message to attribute.
      .filter(m => record.route === 'message' || !m.targets.every(t => attributionIds.has(t)))
      .map(m => ({ templateId: m.id }))
  }
}
