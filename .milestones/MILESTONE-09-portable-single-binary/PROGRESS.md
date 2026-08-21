# M09 — Progress

Delivered 2026-08-22 in three commits. Every claim below was checked by
building the binary, copying it to a temporary directory and running it with a
scrubbed environment — not by reading the code.

## Done

### M09-T01 — migrations travel with the binary

drizzle's migrator takes a `migrationsFolder` and reads it from the working
directory at runtime, which a binary somewhere else does not have.
`db/embeddedMigrations.ts` does the same work against migrations the bundler
carried in, with bookkeeping byte-compatible with drizzle's: the same
`__drizzle_migrations` table, the same sha256-of-the-file hash, the same
`created_at` from the journal's `when`. An existing `.data/local.sqlite` opens
without re-applying 45 migrations, and one the binary created stays usable by
`moon run dev`. Both verified against real files.

The generated module imports each `.sql` with `{ type: 'file' }`. `{ type:
'text' }` looks equivalent and is not — only the *bundler* inlines it, so run
from source the import yields the path and every migration becomes a one-line
syntax error.

**The find of the milestone.** Running the statements bare rather than inside a
transaction broke twelve unrelated tests with foreign-key errors. Two
migrations bracket a table rebuild with `PRAGMA foreign_keys=OFF` / `=ON`, and
SQLite ignores that pragma inside a transaction — which drizzle's migrator
opens, so the `ON` half had never taken effect in the life of this repository.
Run bare it does, and stays on for the connection's life, which is every
fixture that inserts a child before its parent.

### M09-T02/T03 — the GUI travels too, and is served properly

`scripts/bundle-gui.ts` packs `apps/gui/dist` into a path → base64 manifest. A
static import must resolve at typecheck time, so the manifest lives at a
committed path — but Vite fingerprints every asset name, so a checked-in
manifest is stale the moment anyone rebuilds. The committed copy is therefore
empty, the build fills it in immediately before `--compile` and empties it
again after, and a test asserts the committed one is still empty so a
two-megabyte accident cannot be committed quietly.

`lib/staticServer.ts` serves it: fixed content-type table (unknown extensions
get `application/octet-stream`, which browsers download rather than execute),
fingerprinted assets immutable for a year, `index.html` `no-cache` because its
job is to name the current fingerprints. Deep links fall back to `index.html`;
a miss *under* `/assets/` is a real 404, since answering with HTML makes a
script tag fail on a syntax error rather than a status code.

The placeholder HTML at `/` is gone.

### M09-T04 — the in-process transport question, answered

**ADR-0019**: declined, not deferred. `localInProcessTransportRouter` is
deleted and `architecture.md`'s two references to it are replaced.

The GUI is a browser application, so its RPCs cross a real socket whatever the
server does internally — an in-process transport could only serve code running
*inside* the binary, of which there is none. Against a saving of tens of
microseconds it would add a second entry point into every handler, and the part
of the interceptor chain most easily skipped by a second path is
authentication.

### M09-T05 — flags

`--port`, `--db`, `--open`, `--seed`, `--help`, `--version`, layered flag over
environment over default. Unknown options are refused rather than ignored: a
typo'd `--prot 9000` that silently starts on 8080 is worse than an error,
because the person has evidence they set the port and the server has evidence
they did not. Validation is Zod's and its message is what the person sees, so
`--port abc` says what is wrong with the port instead of producing a stack
trace from `listen()` several steps later.

`--open` is best-effort by construction: a headless server or a container is
not a reason to fail a start that already succeeded.

### M09-T06 — a usable session with no Google credentials

Password sign-in already existed (M13), so the account half was in place. Two
real gaps were not.

`/api/auth/providers` reports what this deployment actually has, and the
sign-in screen renders only that. A "Continue with Google" button on a binary
with no credentials redirects with an empty `client_id` and strands the person
on a Google error page; the redirect route now refuses with 501 rather than
building that URL at all.

`--seed` gives the *first* account an organization and a project, so a freshly
downloaded binary is somewhere to work rather than an empty shell. First
account only, and only when asked for — an organization appearing under
everyone who registers is a surprise at best. It never fails a registration:
the account is what the person asked for, the starter project is a convenience.

Deliberately **not** `scripts/seed.ts`, which generates fifty-thousand-row dev
fixtures for a different person entirely.

### M09-T07 — the smoke test

`scripts/smoke-standalone.sh` copies the binary to a temporary directory and
runs it under `env -i`, so nothing it needs can come from the checkout it was
built in — no `drizzle-sqlite/` to read, no `apps/gui/dist/` to serve, no
`.env`. It asserts the real SPA at `/`, a deep link falling back to it, a
fingerprinted asset the index actually references, `sqlite+fts5-ok` from the
health RPC, and a database created from nothing.

Verified to fail for the right reason: compiled against the empty manifest, it
reports "GET / did not return the SPA — the asset bundle is missing" and exits
1, which is the milestone's own verify line.

Runs as its own CI job on every pull request.

### M09-T08 — release artifacts

Tag-driven `release.yml` producing linux-x64, macos-arm64 and windows-x64.
Cross-compiled by Bun from one runner rather than three, so all three come from
one toolchain and one GUI build instead of three that could quietly differ —
verified locally that `--target bun-windows-x64` and `bun-darwin-arm64` both
produce binaries. The linux artifact is smoke-tested in the release job itself;
the other two cannot be executed on a Linux runner and are not pretended
otherwise.

### M09-T09 — the quickstart

`docs/standalone.md`, linked from the top of the README ahead of the developer
setup — someone who wants to *run* Tasker should not have to read about
Moonrepo first. It states plainly what standalone includes (GUI, migrations,
FTS5), what it does not (a broker: the audit trail and live feed stay quiet
without NATS), and what upgrading and backing up mean when the database is one
file.

## Exit criteria

All seven met. The binary builds, runs from an empty directory on a machine
with no toolchain, creates and migrates its own database, answers with FTS5
working, reads configuration from flags and the environment, has no placeholder
HTML left, and the in-process transport question is decided in ADR-0019.

## Remaining

Nothing.
