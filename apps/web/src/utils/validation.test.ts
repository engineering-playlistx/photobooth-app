import { describe, expect, it } from 'vitest'
import {
  sanitizeName,
  standardizePhone,
  validateEmail,
  validatePhone,
} from './validation'

// ---------------------------------------------------------------------------
// sanitizeName (VAL-07, VAL-08)
// ---------------------------------------------------------------------------

describe('sanitizeName', () => {
  // VAL-08
  it('returns normal strings unchanged (trimmed)', () => {
    expect(sanitizeName('Alice')).toBe('Alice')
    expect(sanitizeName('  Bob  ')).toBe('Bob')
  })

  // VAL-07
  it('strips both < and > characters', () => {
    // All < and > removed — not just the opening tag
    expect(sanitizeName('<script>alert(1)</script>')).toBe(
      'scriptalert(1)/script',
    )
    expect(sanitizeName('Alice <Wonderland>')).toBe('Alice Wonderland')
  })

  it('strips control characters (U+0000–U+001F, U+007F)', () => {
    expect(sanitizeName('Alice\u0000Bob')).toBe('AliceBob')
    expect(sanitizeName('Alice\u001fBob')).toBe('AliceBob')
    expect(sanitizeName('Alice\u007fBob')).toBe('AliceBob')
  })

  it('truncates to 100 characters', () => {
    const longName = 'A'.repeat(150)
    expect(sanitizeName(longName)).toHaveLength(100)
  })

  it('returns empty string for names that are only < > or whitespace', () => {
    expect(sanitizeName('<>')).toBe('')
    expect(sanitizeName('   ')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// validateEmail (VAL-01, VAL-02)
// ---------------------------------------------------------------------------

describe('validateEmail', () => {
  // VAL-01
  it('accepts valid email formats', () => {
    expect(validateEmail('user@domain.com')).toBe(true)
    expect(validateEmail('user+tag@sub.domain.org')).toBe(true)
    expect(validateEmail('user.name@example.co.id')).toBe(true)
    expect(validateEmail('user123@example-domain.com')).toBe(true)
  })

  // VAL-02
  it('rejects email without @ symbol', () => {
    expect(validateEmail('userdomain.com')).toBe(false)
  })

  it('rejects email without domain', () => {
    expect(validateEmail('user@')).toBe(false)
  })

  it('rejects email without TLD', () => {
    expect(validateEmail('user@domain')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(validateEmail('')).toBe(false)
  })

  it('rejects email with spaces', () => {
    expect(validateEmail('user @domain.com')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// validatePhone (VAL-06)
// ---------------------------------------------------------------------------

describe('validatePhone', () => {
  it('accepts Indonesian mobile starting with 08xx', () => {
    expect(validatePhone('081234567890')).toBe(true)
  })

  it('accepts phone starting with +62', () => {
    expect(validatePhone('+6281234567890')).toBe(true)
  })

  it('accepts phone starting with 62 (no plus)', () => {
    expect(validatePhone('6281234567890')).toBe(true)
  })

  it('accepts phone with spaces (stripped before check)', () => {
    expect(validatePhone('0812 3456 7890')).toBe(true)
  })

  it('accepts phone with dashes', () => {
    expect(validatePhone('0812-3456-7890')).toBe(true)
  })

  // VAL-06
  it('rejects completely invalid formats', () => {
    expect(validatePhone('123')).toBe(false) // too short
    expect(validatePhone('abc')).toBe(false) // letters
    expect(validatePhone('')).toBe(false) // empty
    expect(validatePhone('+44123456789')).toBe(false) // UK number
  })
})

// ---------------------------------------------------------------------------
// standardizePhone (VAL-03, VAL-04, VAL-05)
// ---------------------------------------------------------------------------

describe('standardizePhone', () => {
  // VAL-03
  it('normalizes 08xx to +628xx', () => {
    expect(standardizePhone('081234567890')).toBe('+6281234567890')
  })

  // VAL-05
  it('normalizes 628xx to +628xx', () => {
    expect(standardizePhone('6281234567890')).toBe('+6281234567890')
  })

  // VAL-04
  it('passes through +62xxx unchanged', () => {
    expect(standardizePhone('+6281234567890')).toBe('+6281234567890')
  })

  it('strips spaces before normalizing', () => {
    expect(standardizePhone('0812 3456 7890')).toBe('+6281234567890')
  })

  it('strips dashes before normalizing', () => {
    expect(standardizePhone('0812-3456-7890')).toBe('+6281234567890')
  })
})
