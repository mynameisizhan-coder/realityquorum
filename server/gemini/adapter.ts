import { z } from 'zod'
import { CATEGORIES, URGENCIES } from '../../shared/domain'
import type { Case, EvidenceKind, PolicyPack, Route } from '../../shared/domain'

// Gemini is an assistant, not a judge: it suggests categories, separates claims, describes images
// and picks missions from the pack. Every response is schema-checked before use.

export interface SuggestInput { route: Route; text: string; locationId: string }
export interface ObserveImage { type: string; data: Buffer }
export interface ObserveInput { kind: EvidenceKind; note: string; fileNames: string[]; packId: string; images: ObserveImage[] }

export interface GeminiAdapter {
  readonly name: string
  suggest(input: SuggestInput): Promise<unknown>
  observe(input: ObserveInput): Promise<unknown>
  selectMissions(pack: PolicyPack, record: Pick<Case, 'route' | 'description' | 'category'>): Promise<unknown>
}

export const SuggestionSchema = z.object({
  category: z.enum(CATEGORIES as [string, ...string[]]),
  urgency: z.enum(URGENCIES as [string, ...string[]]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(400),
  claims: z.array(z.object({ text: z.string().max(600), tier: z.enum(['attribution', 'observable', 'origin', 'responsibility']) })).max(10),
})
export type Suggestion = z.infer<typeof SuggestionSchema>

export const ObservationSchema = z.array(z.string().max(300)).max(8)

export const MissionSelectionSchema = z.array(z.object({ templateId: z.string(), title: z.string().max(120).optional() })).max(10)
export type MissionSelection = z.infer<typeof MissionSelectionSchema>
