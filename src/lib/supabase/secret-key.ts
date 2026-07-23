/**
 * Supabase secret-key resolver — the ONE place in this repo that reads the Supabase
 * service credential from the environment (decision #199).
 *
 * WHY THIS EXISTS
 * Supabase's modern `sb_secret_` keys are not JWTs. The legacy `service_role` credential has been
 * removed from all currently inventoried consumer stores and application read paths; provider-level
 * deactivation of the legacy key remains pending under decision #199. Routing every consumer through
 * one resolver made that removal a pure VALUE swap in the credential stores; this resolver reads the
 * modern key ONLY; provider-level deactivation of the legacy key remains a separate pending step
 * under decision #199. The
 * legacy variable is no longer read as an operational credential — its name survives here solely as
 * a permanently-refused, denylisted identifier (see `assertNotCredentialVarName` below), so a future
 * reintroduction fails loudly rather than silently re-opening a second credential path.
 *
 * ⚠ Environment changes still require a DEPLOY. Environment variables are captured PER DEPLOY, and
 * service clients are process-cached, so no existing deploy — in any context — ever adopts an env
 * change on its own. Production and each preview/branch context are separate deployment boundaries.
 * Any env change must be followed by a FRESH DEPLOY IN EVERY AFFECTED CONTEXT, confirmed `ready`
 * with its `commit_ref` matched to the intended SHA before it is verified against.
 *
 * CONTRACT (exact) — preferred-only:
 *   • unset / empty / whitespace-only -> THROW (fail closed);
 *   • non-blank but padded with leading or trailing whitespace -> THROW (malformed).
 *       A padded value is an operator paste error. Trimming it would silently authenticate with a
 *       credential nobody intended — worse than failing loudly at startup.
 *   • clean non-blank -> return VERBATIM (no trimming, no normalisation).
 *
 * ⚠ NEVER include any part of a resolved value — not a prefix, suffix, or length — in a thrown
 * message, a comment, or a log line. This module deliberately performs no logging.
 *
 * ⚠ The `process.env.<NAME>` read below is a literal dot access on purpose. Bundlers
 * (Next.js/webpack) can only statically substitute environment reads written that way; a dynamic
 * `process.env[name]` lookup would silently resolve to undefined wherever such substitution is in
 * effect. The variable NAME is kept as a separate constant purely so the error message can name it
 * without a second literal.
 *
 * Imported by server-side app code AND by `tsx`-run scripts, so it must stay dependency-free and
 * must not be marked `server-only`.
 */

/**
 * The variable NAMES are module-PRIVATE, and that is load-bearing.
 *
 * ⚠ They were briefly exported so tests could name them without writing literals. Review showed an
 * export is a READ PRIMITIVE: any module can `import { PREFERRED_VAR }` — or re-export it through an
 * intermediary, so the eventual consumer neither spells the identifier nor imports this path — and
 * then `process.env[thatConstant]`, creating a second read site no text scan can see. Not exporting
 * the names removes the primitive, and the whole class with it.
 *
 * What IS exported is `assertNotCredentialVarName` — a predicate. It can refuse a name; it cannot
 * hand one out, so it is useless as a read primitive.
 *
 * ⚠ LEGACY_VAR is retained even though the resolver no longer reads it. It is the retired
 * `service_role` variable name, kept here ONLY so `assertNotCredentialVarName` continues to refuse
 * it — permanent defence-in-depth against a reintroduced read. It must never be reinstated as an
 * environment read or fallback path.
 *
 * Tests that must set the preferred variable spell the literal directly, allowlisted by exact path
 * AND exact declaration line.
 */
const PREFERRED_VAR = 'SUPABASE_SECRET_KEY'
const LEGACY_VAR = 'SUPABASE_SERVICE_ROLE_KEY'

/**
 * Throws if `name` is either the current OR the retired credential variable. For generic,
 * dynamically-named env readers — the one syntax that could otherwise fetch a credential without
 * its name ever appearing as text — so they refuse at RUNTIME, where name construction does not
 * help. Refusing the retired name too permanently blocks a reintroduced legacy read.
 *
 * Reveals nothing: it takes a candidate name and either returns or throws.
 */
export function assertNotCredentialVarName(name: string): void {
  if (name === PREFERRED_VAR || name === LEGACY_VAR) {
    throw new Error(
      `${name} must not be read through a generic env accessor. ` +
        'Call getSupabaseSecretKey() from src/lib/supabase/secret-key.ts — it is the single read site.',
    )
  }
}

/**
 * Applies the absent/malformed/clean rule to one raw environment value.
 * @returns the clean value, or `null` when the variable is absent for our purposes.
 * @throws when the value is non-blank but padded. The message names the VARIABLE, never the value.
 */
function classify(name: string, raw: string | undefined): string | null {
  if (raw === undefined) return null
  if (raw.trim() === '') return null
  if (raw.trim() !== raw) {
    throw new Error(
      `${name} is set but has leading or trailing whitespace. Re-set it with no surrounding ` +
        'whitespace — it is not trimmed automatically, because silently authenticating with an ' +
        'unintended credential is worse than failing to start.',
    )
  }
  return raw
}

/**
 * Resolves the Supabase service credential.
 *
 * @throws if the configured value is malformed, or if no credential is configured at all.
 *         Callers do not catch this: a server process without a service credential must
 *         fail loudly rather than degrade to unauthenticated reads.
 */
export function getSupabaseSecretKey(): string {
  const preferred = classify(PREFERRED_VAR, process.env.SUPABASE_SECRET_KEY)
  if (preferred !== null) return preferred

  throw new Error(
    `No Supabase service credential is configured. Set ${PREFERRED_VAR} in this environment.`,
  )
}
