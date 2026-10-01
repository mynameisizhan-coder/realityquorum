import type { CaseOutcome, ClosureRequirement, EvidenceItem, PolicyPack, Predicate, PredicateState, PredicateTemplate, Route } from './domain'

// Deterministic decisions. Gemini observations never enter this file; only recorded evidence findings do.

const STAFF_ROLES = new Set(['canteen_supervisor', 'facilities', 'operator', 'trust_officer'])

export function isFresh(item: Pick<EvidenceItem, 'capturedAt' | 'recordedAt'>, freshnessHours: number): boolean {
  const gap = Date.parse(item.recordedAt) - Date.parse(item.capturedAt)
  return Number.isFinite(gap) && gap >= 0 && gap <= freshnessHours * 3_600_000
}

function sources(items: EvidenceItem[]): Set<string> {
  return new Set(items.map(item => item.sourceKey))
}

export function evaluatePredicate(template: PredicateTemplate, evidence: EvidenceItem[], freshnessHours: number): Predicate {
  const base = { id: template.id, text: template.text, tier: template.tier }
  const relevant = evidence.filter(item => template.acceptedKinds.includes(item.kind) && item.findings.some(f => f.predicateId === template.id))
  const usable = template.requiresFresh ? relevant.filter(item => isFresh(item, freshnessHours)) : relevant
  const stale = relevant.length - usable.length
  const staleNote = stale ? ` ${stale} item(s) were not fresh enough to count.` : ''
  const effectOf = (item: EvidenceItem) => item.findings.find(f => f.predicateId === template.id)!.effect
  const supporting = usable.filter(item => effectOf(item) === 'supports')
  const contradicting = usable.filter(item => effectOf(item) === 'contradicts')
  const result = (state: PredicateState, explanation: string): Predicate => ({ ...base, state, explanation: explanation + staleNote })

  if (template.decisiveKinds) {
    const decisive = (items: EvidenceItem[]) => items.filter(item => template.decisiveKinds!.includes(item.kind))
    const yes = decisive(supporting), no = decisive(contradicting)
    if (yes.length && no.length) return result('Disputed', 'Authoritative sources disagree. An operator must review them.')
    if (no.length) return result('Contradicted', 'An authorised source explicitly denies this. Absence from a registry alone would not establish it.')
    if (yes.length) return result('Supported', 'An authorised source explicitly confirms this.')
  }

  // Responsibility is never established by photos, reports or Gemini; only by an authorised inspection.
  const countedSupport = template.tier === 'responsibility' ? supporting.filter(item => item.kind === 'authorized_inspection') : supporting
  const supportSources = sources(countedSupport), contradictSources = sources(contradicting)

  if (supportSources.size && contradictSources.size) return result('Disputed', `${supportSources.size} source(s) support and ${contradictSources.size} source(s) contradict this. It stays disputed until reviewed.`)

  if (supportSources.size >= template.minIndependent) {
    if (template.tier === 'origin' && !countedSupport.some(item => STAFF_ROLES.has(item.sourceRole)))
      return result('Unresolved', 'The reporter’s evidence alone cannot establish origin. An authorised record is needed.')
    return result('Supported', `${supportSources.size} independent source(s) support this.`)
  }
  if (contradictSources.size >= template.minIndependent) return result('Contradicted', `${contradictSources.size} independent source(s) contradict this.`)

  if (template.tier === 'responsibility') return result('Unresolved', 'No conclusion about intention, negligence or responsibility is supported.')
  if (template.tier === 'origin') return result('Unresolved', 'The available evidence does not establish when or how this happened.')
  const have = Math.max(supportSources.size, contradictSources.size)
  return result('Unresolved', have ? `${have} of ${template.minIndependent} required independent source(s) so far.` : 'No qualifying evidence yet.')
}

export interface CaseDecision { predicates: Predicate[]; outcome: CaseOutcome; summary: string }

export function predicatesFor(pack: PolicyPack, route: Route): PredicateTemplate[] {
  return pack.predicates.filter(p => p.appliesTo === 'both' || p.appliesTo === route)
}

export function evaluateCase(pack: PolicyPack, route: Route, evidence: EvidenceItem[]): CaseDecision {
  const templates = predicatesFor(pack, route)
  const predicates = templates.map(t => evaluatePredicate(t, evidence, pack.freshnessHours))
  const outer = predicates.filter(p => p.tier === 'observable' || p.tier === 'attribution')
  const hasEvidenceFor = (id: string) => evidence.some(item => item.findings.some(f => f.predicateId === id))

  let outcome: CaseOutcome
  if (outer.some(p => p.state === 'Disputed')) outcome = 'Disputed evidence'
  else if (predicates.some(p => p.tier === 'observable' && p.state === 'Supported')) outcome = 'Confirmed observable condition'
  else if (predicates.some(p => p.tier === 'attribution' && p.state !== 'Unresolved')) outcome = 'Attribution checked'
  else if (templates.some(t => t.requiresProfessional && hasEvidenceFor(t.id))) outcome = 'Professional inspection required'
  else outcome = 'Insufficient evidence'

  return { predicates, outcome, summary: summarise(outcome, predicates, templates) }
}

function summarise(outcome: CaseOutcome, predicates: Predicate[], templates: PredicateTemplate[]): string {
  const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1).replace(/\.$/, '')
  const parts = [`${outcome}.`]
  const confirmed = predicates.filter(p => p.state === 'Supported').map(p => p.text)
  const contradicted = predicates.filter(p => p.state === 'Contradicted').map(p => `Not supported: ${lower(p.text)}.`)
  if (confirmed.length) parts.push(confirmed.join(' '))
  parts.push(...contradicted)
  const open = predicates.filter(p => p.state === 'Unresolved' && (p.tier === 'origin' || p.tier === 'responsibility'))
  if (open.length) parts.push(`The available evidence does not establish ${open.map(p => `whether ${lower(p.text)}`).join(', or ')}.`)
  if (open.some(p => templates.find(t => t.id === p.id)?.requiresProfessional)) parts.push('An authorised inspection is required for those questions.')
  return parts.join(' ')
}

export interface ClosureStatus { met: ClosureRequirement[]; missing: ClosureRequirement[]; conditionConfirmed: boolean; complete: boolean }

/** A department marking work "resolved" is not enough: every closure item must exist and the closure predicate must hold. */
export function closureStatus(pack: PolicyPack, evidence: EvidenceItem[], predicates: Predicate[] = []): ClosureStatus {
  const kinds = new Set(evidence.map(item => item.kind))
  const met = pack.closure.filter(req => kinds.has(req.kind))
  const missing = pack.closure.filter(req => !kinds.has(req.kind))
  const conditionConfirmed = !pack.closurePredicate || predicates.some(p => p.id === pack.closurePredicate && p.state === 'Supported')
  return { met, missing, conditionConfirmed, complete: missing.length === 0 && conditionConfirmed }
}
