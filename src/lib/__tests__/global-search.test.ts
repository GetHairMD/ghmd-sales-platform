import { describe, expect, it } from 'vitest'
import { normalizeSearchTerm, escapeIlike, ilikeContains } from '../global-search'

describe('normalizeSearchTerm', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeSearchTerm('  westlake  ')).toBe('westlake')
  })

  it('returns null for terms shorter than 2 characters (avoids scanning the whole table)', () => {
    expect(normalizeSearchTerm('a')).toBeNull()
    expect(normalizeSearchTerm('   ')).toBeNull()
    expect(normalizeSearchTerm('')).toBeNull()
  })

  it('keeps a valid 2+ char term', () => {
    expect(normalizeSearchTerm('Dr')).toBe('Dr')
  })
})

describe('escapeIlike', () => {
  it('escapes ilike wildcards so user % and _ are treated literally', () => {
    expect(escapeIlike('50%_off')).toBe('50\\%\\_off')
  })

  it('escapes backslashes', () => {
    expect(escapeIlike('a\\b')).toBe('a\\\\b')
  })

  it('leaves ordinary text untouched', () => {
    expect(escapeIlike('Westlake')).toBe('Westlake')
  })
})

describe('ilikeContains', () => {
  it('wraps the escaped term in contains wildcards', () => {
    expect(ilikeContains('Austin')).toBe('%Austin%')
  })

  it('escapes before wrapping', () => {
    expect(ilikeContains('a%b')).toBe('%a\\%b%')
  })
})
