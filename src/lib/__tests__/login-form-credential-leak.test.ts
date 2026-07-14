import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regression guard — the login form must never be able to submit via GET.
 *
 * FOUND FOR REAL during E-2 deploy-preview QA (PR #130), not theorised: an automated
 * sign-in clicked submit before React had hydrated. With no `method` on the <form>, the
 * HTML default is GET, so the browser performed a native GET submit and serialized the
 * fields into the URL — landing the user's PASSWORD in the query string:
 *
 *     /login?email=…%40…&password=…
 *
 * A URL is the worst possible place for a credential: it is written to browser history, sent
 * in the Referer header to any third party the next page contacts, and recorded verbatim in
 * Netlify/CDN access logs. The exposure window is small but real — any user on a slow
 * connection or cold cache who presses Enter before hydration completes hits it.
 *
 * `method="post"` closes it. It is inert after hydration (handleSubmit calls preventDefault,
 * so the native submit never runs), and it is the ONLY thing standing between a
 * pre-hydration submit and a password in the URL.
 */

const LOGIN_PAGE = 'src/app/login/page.tsx'

const src = readFileSync(join(process.cwd(), LOGIN_PAGE), 'utf8')

/** Strip comments so the assertions can't be satisfied by the explanatory prose above. */
const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('login form — cannot leak credentials into the URL via a pre-hydration GET submit', () => {
  it('declares method="post" on the form', () => {
    expect(codeOnly).toMatch(/<form[^>]*\bmethod=["']post["']/i)
  })

  it('never declares method="get" (which would put the password in the query string)', () => {
    expect(codeOnly).not.toMatch(/<form[^>]*\bmethod=["']get["']/i)
  })

  it('still prevents the native submit once hydrated', () => {
    expect(codeOnly).toMatch(/e\.preventDefault\(\)/)
    expect(codeOnly).toMatch(/<form[^>]*onSubmit=\{handleSubmit\}/)
  })

  it('the password input is type=password and is not bound to a URL-carrying default', () => {
    expect(codeOnly).toMatch(/type=["']password["']/)
  })
})
