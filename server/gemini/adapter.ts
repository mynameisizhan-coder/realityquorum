import { z } from 'zod'
import { CATEGORIES, URGENCIES } from '../../shared/domain'
import type { EvidenceKind, Route } from '../../shared/domain'

// Gemini is an assistant, not a judge: it suggests categories, separates claims, describes images and
// reads official pages. Every response is schema-checked before use, and decisions stay deterministic.

export interface SuggestInput { route: Route; text: string; locationId: string }
export interface ObserveImage { type: string; data: Buffer }
/** `questions` are the case's observable conditions; Gemini says whether each is visible in the photo. */
export interface ObserveInput { kind: EvidenceKind; note: string; fileNames: string[]; packId: string; images: ObserveImage[]; questions: { id: string; text: string }[] }
export interface OfficialCheckInput { message: string; claims: string[]; sources: string[]; checkedAt: string }

export interface GeminiAdapter {
  readonly name: string
  suggest(input: SuggestInput): Promise<unknown>
  observe(input: ObserveInput): Promise<unknown>
  /** Reads the official college pages. Adapters without web access leave this out. */
  checkOfficial?(input: OfficialCheckInput): Promise<unknown>
}

export const SuggestionSchema = z.object({
  category: z.enum(CATEGORIES as [string, ...string[]]),
  urgency: z.enum(URGENCIES as [string, ...string[]]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(400),
  claims: z.array(z.object({ text: z.string().max(600), tier: z.enum(['attribution', 'observable', 'origin', 'responsibility']) })).max(10),
})
export type Suggestion = z.infer<typeof SuggestionSchema>

export const AnswerStatus = z.enum(['visible', 'not_visible', 'unclear'])
const Notes = z.array(z.string().max(300)).max(8)
/** Older adapters return notes only; newer ones also answer each observable question. */
export const ObservationSchema = z.union([
  Notes,
  z.object({ observations: Notes, answers: z.array(z.object({ id: z.string().max(80), status: AnswerStatus })).max(12) }),
])
export interface Observation { observations: string[]; answers: { id: string; status: z.infer<typeof AnswerStatus> }[] }
export function normaliseObservation(value: z.infer<typeof ObservationSchema>): Observation {
  return Array.isArray(value) ? { observations: value, answers: [] } : value
}

export const OfficialCheckSchema = z.object({
  verdict: z.enum(['confirmed', 'contradicted', 'not_found']),
  summary: z.string().max(600),
  quotes: z.array(z.object({ url: z.string().max(500), text: z.string().max(600) })).max(5),
  /** Pages the model actually retrieved (from the API's URL metadata, not the model's own words). */
  retrieved: z.array(z.string().max(500)).max(10).default([]),
})
export type OfficialCheck = z.infer<typeof OfficialCheckSchema>
