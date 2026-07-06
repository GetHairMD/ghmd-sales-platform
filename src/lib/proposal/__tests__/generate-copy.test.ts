import { describe, expect, it } from 'vitest'
import {
  buildOutreachCopy,
  buildProposalSlug,
  salutationFor,
  slugifyName,
} from '../generate-copy'

describe('slugifyName', () => {
  it('lowercases, hyphenates, and strips punctuation', () => {
    expect(slugifyName('Petrov Aesthetic Group')).toBe('petrov-aesthetic-group')
    expect(slugifyName('  Dr. Amélia K. Hausauer, MD  ')).toBe('dr-amelia-k-hausauer-md')
    expect(slugifyName('!!!')).toBe('')
  })
})

describe('buildProposalSlug', () => {
  it('appends the random suffix to the name stem', () => {
    expect(buildProposalSlug('Petrov Aesthetic Group', 'a1b2c3')).toBe('petrov-aesthetic-group-a1b2c3')
  })
  it('falls back to "proposal" when the name has no slug characters', () => {
    expect(buildProposalSlug('###', 'deadbe')).toBe('proposal-deadbe')
  })
})

describe('salutationFor', () => {
  it('keeps the Dr. prefix with the surname', () => {
    expect(salutationFor('Dr. Elena Petrov')).toBe('Dr. Petrov')
    expect(salutationFor('Dr Amelia Hausauer')).toBe('Dr. Hausauer')
  })
  it('uses the first name when there is no title', () => {
    expect(salutationFor('Elena Petrov')).toBe('Elena')
  })
  it('falls back to "there" for empty input', () => {
    expect(salutationFor('   ')).toBe('there')
  })
})

describe('buildOutreachCopy', () => {
  const copy = buildOutreachCopy({
    salutation: 'Dr. Petrov',
    practiceName: 'Petrov Aesthetic Group',
    territoryName: 'Austin – Westlake',
    url: 'https://ghmdsalesplatform.netlify.app/p/petrov-a1b2',
    accessCode: 'GHMD-7KQ4',
  })

  it('includes the link, access code, and territory in the email + sms', () => {
    expect(copy.emailSubject).toContain('Austin – Westlake')
    expect(copy.emailBody).toContain('https://ghmdsalesplatform.netlify.app/p/petrov-a1b2')
    expect(copy.emailBody).toContain('GHMD-7KQ4')
    expect(copy.emailBody).toContain('Dr. Petrov')
    expect(copy.sms).toContain('https://ghmdsalesplatform.netlify.app/p/petrov-a1b2')
    expect(copy.sms).toContain('GHMD-7KQ4')
  })

  it('carries no numeric territory/revenue outputs (outputs-only, Hard Rule 1)', () => {
    // No standalone multi-digit numbers (addressable totals, revenue) in the copy.
    // The only digits allowed are inside the access code / URL slug tokens.
    const withoutTokens = `${copy.emailSubject} ${copy.emailBody} ${copy.sms}`
      .replace(/GHMD-7KQ4/g, '')
      .replace(/https:\/\/\S+/g, '')
    expect(withoutTokens).not.toMatch(/\d{3,}/) // no 3+ digit figures
    expect(withoutTokens).not.toMatch(/\$\d/) // no dollar figures
  })

  it('degrades gracefully when territory/practice are null', () => {
    const c = buildOutreachCopy({
      salutation: 'there',
      practiceName: null,
      territoryName: null,
      url: 'https://x/p/y',
      accessCode: 'GHMD-0000',
    })
    expect(c.emailSubject).toContain('your territory')
    expect(c.emailBody).not.toContain('for null')
  })
})
