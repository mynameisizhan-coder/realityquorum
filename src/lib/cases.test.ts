import { describe, expect, it } from 'vitest'
import { MAX_FILE_SIZE, validateFiles, validateSubmission } from './cases'

describe('dual intake UI requirements', () => {
  it('accepts a direct canteen observation without a photo', () => {
    expect(
      validateSubmission('issue', 'I noticed an object in my serving.', 'canteen', []),
    ).toBeNull()
  })
  it('requires an observation for direct reports, even when files exist', () => {
    expect(
      validateSubmission('issue', '', 'canteen', [
        new File(['sample'], 'receipt.pdf', { type: 'application/pdf' }),
      ]),
    ).toContain('Describe')
  })
  it('accepts a screenshot-only message without requiring a WhatsApp integration', () => {
    expect(
      validateSubmission('message', '', 'unknown', [
        new File(['sample'], 'notice.png', { type: 'image/png' }),
      ]),
    ).toBeNull()
  })
  it('rejects an empty message and an unselected location', () => {
    expect(validateSubmission('message', '', 'ramanujan', [])).not.toBeNull()
    expect(
      validateSubmission('issue', 'A condition to check near the counter.', '', []),
    ).not.toBeNull()
  })
  it('allows a photo with a PDF receipt and rejects oversized or executable attachments', () => {
    expect(
      validateFiles([
        { type: 'image/jpeg', size: 1500 },
        { type: 'application/pdf', size: 500 },
      ]),
    ).toBeNull()
    expect(validateFiles([{ type: 'image/jpeg', size: MAX_FILE_SIZE + 1 }])).toContain('10 MB')
    expect(validateFiles([{ type: 'text/html', size: 100 }])).toContain('Choose')
  })
  it('limits batch attachments to five files', () => {
    expect(
      validateFiles(Array.from({ length: 6 }, () => ({ type: 'image/png', size: 100 }))),
    ).toContain('5 files')
  })
})
