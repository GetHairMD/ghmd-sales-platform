# Platform Gotchas — Netlify, Supabase, PostgreSQL

> Durable technical learnings that cost a full gate cycle (or several) to discover.
> They exist here because none of them are inferable from the code, and every one of
> them produced a **silent** wrong result — something that looked like success while
> nothing had actually happened.

Origin: the PR-0a.1 arc (PR #151, sizing-function shared-secret auth) and PR-0b
(Sprint 0.1 containment wave). Recorded so they survive independent of any single
Coder session's local memory.

**The unifying theme.** Every entry below is a case where the obvious success signal
— an HTTP 200/202, an absent exception, a green migration, a populated `data` field —
is *not* evidence that the thing happened. Each one needs a different oracle than the
one that presents itself first. When verifying security-relevant behaviour, the
question is never "did it return without complaining?" but "what independent surface
would show me the state actually changed?"

---

## 1. Netlify Background Functions acknowledge before executing, and discard the handler's Response

A Netlify Background Function (the `-background` filename suffix) returns **202 to the
caller immediately**, before the handler body runs, and **throws away whatever Response
the handler returns**.

Consequences:

- An HTTP status from invoking one can **never** evidence auth outcome, execution
  outcome, or success. A 202 means only "the platform accepted the invocation."
- Returning `401` from inside the handler is still correct and worth doing — it just
  cannot be observed by the caller. Do not conclude auth is broken because you
  can't see the 401, and do not conclude it works because you saw a 202.
- `curl` is the wrong instrument for verifying these functions. **The database is the
  only oracle**: assert on the row the function was supposed to write (status
  transition, error payload, timestamps).

In this repo the honesty is pinned in a constant so it cannot regress —
`TRIGGER_ACCEPTED_DETAIL` in `src/lib/territory-sizing-jobs.ts`:
`'invocation accepted (202); execution and auth not confirmed by the response'`.

## 2. `process.env.NETLIFY` is build-time metadata only — absent at edge/serve runtime

`NETLIFY=true` is set during the **build**. It is **not present** in Netlify's
edge/serve runtime. Any runtime "am I running on Netlify?" check written against it
evaluates falsy in production and the guard silently never fires.

Empirically, the marker set that *is* present at serve runtime: **`SITE_ID`,
`SITE_NAME`, `URL`**. Runtime hosted-context detection must test those.

## 3. `process.env.NODE_ENV` is ALSO absent in Netlify's edge runtime

The instinctive fallback for the above — "just use `NODE_ENV === 'production'`" —
**fails identically**, for the same reason. Both variables are build-time-only in this
environment. Reaching for `NODE_ENV` after `NETLIFY` fails is a fix that appears
reasonable, passes review, and does nothing. Use the `SITE_ID`/`SITE_NAME`/`URL` set.

## 4. `supabase-js` reports errors in a non-throwing `{ error }` field, never as an exception

API errors, RLS denials, constraint violations, and database errors all come back as a
resolved promise with a populated `error` property. **Nothing throws.**

So `try { await supabase.from(t).update(...) } catch { … }` catches nothing, and code
that destructures only `{ data }` cannot distinguish "the write succeeded and returned
no rows" from "the write was rejected." The characteristic failure is misclassifying a
**persistent write failure as "nothing happened"** — a job that never advances, a
watchdog that never fires, an audit row that never appears, with no error anywhere.

**Always destructure `{ data, error }` and branch on `error` explicitly**, including on
writes whose return value you don't otherwise need.

## 5. RLS enabled with zero policies silently denies writes for non-service clients

`ALTER TABLE … ENABLE ROW LEVEL SECURITY` with no policies attached is **default-deny**
for every non-owner, non-bypass role — `anon` and `authenticated` get nothing. This is
usually the intended state for a service-role-only table, and it is a legitimate
security posture.

The trap is how the denial surfaces: through the **non-throwing `error` field of
gotcha #4**, not as an exception. The two compound. Code that ignores `error` sees a
totally silent, permanent no-op and will typically be debugged as a logic bug
somewhere else entirely.

Corollary for defense-in-depth: RLS being the only thing blocking those roles is
fragile if wide table grants remain underneath it. One carelessly-added policy converts
a dormant grant into live exposure — and `TRUNCATE` bypasses RLS entirely regardless of
policies. Revoke the grants too, so denial holds at two independent layers. (This is
exactly what PR-0b did to `territory_sizing_jobs`.)

## 6. `REVOKE` is not fail-loud — a non-owner revoke warns and changes nothing

In PostgreSQL, a `REVOKE` issued by a role that is **neither the original grantor nor a
holder of grant option** raises a **WARNING, not an ERROR**. The statement reports
success and the privileges are left exactly as they were.

Why this is dangerous in a migration: the migration passes CI, is recorded in
`supabase_migrations` as applied, and produces a permanent record claiming a
vulnerability was remediated — while the grant is untouched. It is the
`merged ≠ applied ≠ working` failure class in its most deceptive form, because even
*applied* is true here; only *working* is false.

Concretely (PR-0b, `public.spatial_ref_sys`): the table is owned by `supabase_admin`,
all its grants were issued by `supabase_admin`, and
`pg_has_role('postgres','supabase_admin','MEMBER')` is `false`. Migrations run as
`postgres`, so the revoke is inert. **The Supabase console SQL editor is not a
workaround — it also runs as `postgres` and no-ops identically.** Extension-owned
objects in `public` (the PostGIS tables in particular) are the common case; the durable
fix is relocating the extension out of `public`, not revoking.

## 7. Diagnostic: read `relacl`, not `information_schema.role_table_grants`

`information_schema.role_table_grants` tells you *who holds* a privilege. It does **not**
tell you *who granted it*, which is what determines whether you can take it back.

`pg_class.relacl` encodes both, as `grantee=privs/GRANTOR`:

```sql
select c.relname, pg_get_userbyid(c.relowner) as owner, c.relacl::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = '<table>';
```

Two things to read out of it that the information_schema view hides completely:

- **The `/grantor` suffix** — if it isn't a role you are or belong to, your `REVOKE`
  is inert (gotcha #6).
- **A bare `=r/...` entry** — that is a grant to **`PUBLIC`**. Revoking from `anon` and
  `authenticated` leaves it fully intact, so a revoke that looks complete may not be.
  `spatial_ref_sys` carries exactly this: `=r/supabase_admin`, i.e. SELECT to PUBLIC.

## 8. Rehearse privilege changes in `BEGIN … ROLLBACK`, with a positive control

Because #6 fails silently, the only reliable way to know whether a grant change will
work is to **perform it and re-read the grants inside the same transaction**, then roll
back:

```sql
begin;
revoke all on public.<table> from anon, authenticated;
select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='<table>' and grantee in ('anon','authenticated');
rollback;
```

**Include a positive control** — run the identical rehearsal against a table you *do*
own. Without it, "grants unchanged" is ambiguous between "the revoke silently failed"
and "my verification query is wrong." In PR-0b, `territory_sizing_jobs` (owner
`postgres`, revoke succeeded → empty result) was the control that made
`spatial_ref_sys` (unchanged → inert) unambiguous.

---

## Related

- `docs/AGENTS.md` — Locked Technical Facts, verification discipline, gate rules.
- `docs/RLS-BYPASS-WRITE-GUARD-SCOPING.md` — where service-role writes bypass RLS and
  which of them are guarded DB-side.
- `CLAUDE.md` — standing rules, including "every serverless function has error
  logging — no silent failures" (rule 7), which several of the above are the
  mechanics behind.
