import type { PolicyPack, Predicate } from './domain'

// Public updates are built only from the pack's approved wording for settled predicates.

export function draftPublicUpdate(pack: PolicyPack, predicates: Predicate[], closureComplete: boolean): string {
  const sentences: string[] = []
  for (const predicate of predicates) {
    const template = pack.predicates.find(t => t.id === predicate.id)
    if (!template || predicate.tier === 'responsibility') continue
    if (predicate.state === 'Supported' && template.publicSupported) sentences.push(template.publicSupported)
    if (predicate.state === 'Contradicted' && template.publicContradicted) sentences.push(template.publicContradicted)
  }
  if (closureComplete) sentences.push(pack.publicCorrectiveSummary)
  return sentences.length ? sentences.join(' ') : 'This case is under review. No finding has been made.'
}

const ACCUSATIONS: [RegExp, string][] = [
  [/\bnegligen\w*/i, 'alleges negligence'],
  [/\b(deliberate(ly)?|intentional(ly)?|knowingly|on purpose)\b/i, 'alleges intention'],
  [/\b(fault|blame\w*|guilty|culprit)\b/i, 'assigns blame'],
  [/\bresponsib(le|ility)\b/i, 'assigns responsibility'],
  [/\bcaused by\b/i, 'asserts a cause'],
  [/\bserv(es|ed|ing)? contaminated\b/i, 'generalises contamination'],
  [/\b(entire|whole|all of the) (canteen|kitchen|menu)\b/i, 'generalises beyond the evidence'],
  [/\bunsafe (canteen|kitchen|food)\b/i, 'certifies a whole facility as unsafe'],
]

const PERSONAL: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/, 'contains an email address'],
  [/(\+?\d[\d\s-]{8,}\d)/, 'contains a phone number'],
  [/\b\d[a-z]{2}\d{2}[a-z]{2,3}\d{3}\b/i, 'contains a university seat number'],
]

/** Returns the reasons a public text cannot be published. Empty means it passes. */
export function guardPublicText(text: string, identities: string[]): string[] {
  const problems: string[] = []
  for (const identity of identities) if (identity && text.toLowerCase().includes(identity.toLowerCase())) problems.push('identifies a person involved in the case')
  for (const [pattern, reason] of [...PERSONAL, ...ACCUSATIONS]) if (pattern.test(text)) problems.push(reason)
  return [...new Set(problems)]
}
