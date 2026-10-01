import type { Attachment, CaseRecord, Category, Urgency } from '../types'

export const categories: Category[] = ['Safety & access', 'Food & canteen', 'Facilities', 'Campus notice', 'Other']
export const urgencies: Urgency[] = ['Routine', 'Needs attention', 'Urgent']
// Validation rules are shared with the server so both sides enforce the same limits.
export { MAX_FILE_SIZE, MAX_FILES, validateFiles, validateSubmission } from '../../shared/validation'
export function toAttachments(files: File[]): Attachment[] {
  return files.map(file => ({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, blob: file }))
}
export function ownerFor(category: Category) {
  if (category === 'Food & canteen') return 'Canteen supervisor'
  if (category === 'Safety & access' || category === 'Facilities') return 'Campus facilities'
  return 'Campus trust desk'
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('realityquorum-ui-preview', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('cases', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Local storage could not be opened. Your report has not been saved.'))
  })
}
export async function loadCases(): Promise<CaseRecord[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cases', 'readonly')
    const request = tx.objectStore('cases').getAll()
    tx.oncomplete = () => { db.close(); resolve((request.result as CaseRecord[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt))) }
    tx.onerror = () => { db.close(); reject(new Error('Saved preview cases could not be loaded.')) }
  })
}
export async function saveCase(record: CaseRecord): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cases', 'readwrite')
    tx.objectStore('cases').put(record)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(new Error('Your browser could not save the case. Check available storage and try again.')) }
    tx.onabort = () => { db.close(); reject(new Error('Saving was interrupted. Please try again.')) }
  })
}
export async function clearCases(): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cases', 'readwrite')
    tx.objectStore('cases').clear()
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(new Error('Preview data could not be cleared.')) }
  })
}
