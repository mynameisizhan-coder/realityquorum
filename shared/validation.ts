import type { Route } from './domain'

export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const MAX_FILES = 5
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export function validateFiles(files: { size: number; type: string }[]): string | null {
  if (files.length > MAX_FILES) return 'You can add up to 5 files at a time.'
  if (files.some(file => file.size > MAX_FILE_SIZE)) return 'Each file must be 10 MB or smaller.'
  if (files.some(file => !ALLOWED_TYPES.includes(file.type))) return 'Choose JPG, PNG, WebP, or PDF files.'
  return null
}

export function validateSubmission(route: Route, description: string, locationId: string, files: { size: number; type: string }[]): string | null {
  if (!locationId) return 'Choose the location, or select “Location not known”.'
  if (route === 'issue' && description.trim().length < 10) return 'Describe what you observed in at least 10 characters.'
  if (route === 'message' && description.trim().length < 10 && files.length === 0) return 'Paste the message (at least 10 characters) or attach a screenshot.'
  return validateFiles(files)
}
