import { afterEach, describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  CALENDLY_SIGNING_KEY_ENV,
  isCalendlyWebhookConfigured,
  parseCalendlySignatureHeader,
  parseInviteeCreated,
  verifyCalendlySignature,
  withProspectTracking,
} from '../calendly'

const KEY = 'test-signing-key'

function sign(body: string, t: string, key = KEY): string {
  const v1 = createHmac('sha256', key).update(`${t}.${body}`).digest('hex')
  return `t=${t},v1=${v1}`
}

afterEach(() => {
  delete process.env[CALENDLY_SIGNING_KEY_ENV]
})

describe('calendly webhook — configuration guard (blocked-pending-provisioning)', () => {
  it('is not configured when the signing key env is unset', () => {
    delete process.env[CALENDLY_SIGNING_KEY_ENV]
    expect(isCalendlyWebhookConfigured()).toBe(false)
  })

  it('is configured once the signing key is present', () => {
    process.env[CALENDLY_SIGNING_KEY_ENV] = KEY
    expect(isCalendlyWebhookConfigured()).toBe(true)
  })
})

describe('calendly webhook — signature verification', () => {
  const body = JSON.stringify({ event: 'invitee.created', payload: {} })

  it('accepts a correctly signed body', () => {
    expect(verifyCalendlySignature(body, sign(body, '1700000000'), KEY)).toBe(true)
  })

  it('rejects a tampered body', () => {
    const header = sign(body, '1700000000')
    expect(verifyCalendlySignature(body + 'x', header, KEY)).toBe(false)
  })

  it('rejects a wrong key', () => {
    expect(verifyCalendlySignature(body, sign(body, '1700000000', 'other'), KEY)).toBe(false)
  })

  it('rejects missing/malformed headers and empty keys', () => {
    expect(verifyCalendlySignature(body, null, KEY)).toBe(false)
    expect(verifyCalendlySignature(body, 'garbage', KEY)).toBe(false)
    expect(verifyCalendlySignature(body, sign(body, '1700000000'), '')).toBe(false)
  })

  it('parses a t=..,v1=.. header', () => {
    expect(parseCalendlySignatureHeader('t=123,v1=abc')).toEqual({ t: '123', v1: 'abc' })
    expect(parseCalendlySignatureHeader('v1=abc')).toBeNull()
    expect(parseCalendlySignatureHeader(null)).toBeNull()
  })
})

describe('calendly — prospect attribution', () => {
  it('round-trips prospect id through utm_content', () => {
    const url = withProspectTracking('https://calendly.com/ghmd/intro', 'prospect-123')
    expect(url).toContain('utm_content=prospect-123')
    const url2 = withProspectTracking('https://calendly.com/ghmd/intro?x=1', 'p 2')
    expect(url2).toContain('&utm_content=p%202')
  })

  it('extracts prospect id + event refs from invitee.created', () => {
    const parsed = parseInviteeCreated({
      event: 'invitee.created',
      payload: {
        uri: 'https://api.calendly.com/invitees/abc',
        scheduled_event: { uri: 'https://api.calendly.com/scheduled_events/xyz' },
        tracking: { utm_content: 'prospect-123' },
      },
    })
    expect(parsed.prospectId).toBe('prospect-123')
    expect(parsed.inviteeUri).toBe('https://api.calendly.com/invitees/abc')
    expect(parsed.scheduledEventUri).toBe('https://api.calendly.com/scheduled_events/xyz')
  })

  it('returns null prospectId when utm_content is absent', () => {
    expect(parseInviteeCreated({ payload: { tracking: {} } }).prospectId).toBeNull()
    expect(parseInviteeCreated({}).prospectId).toBeNull()
  })
})
