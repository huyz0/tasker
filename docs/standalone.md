# Running Tasker as a single binary

Tasker ships as one executable. It carries its own web interface, its own
database schema, and its own full-text search. There is nothing to install
alongside it — no Node, no Docker, no MySQL, no separate frontend build.

## Quickstart

Download the binary for your platform from the
[latest release](https://github.com/huyz0/tasker/releases/latest):

| Platform | File |
| --- | --- |
| Linux (x64) | `tasker-linux-x64` |
| macOS (Apple silicon) | `tasker-macos-arm64` |
| Windows (x64) | `tasker-windows-x64.exe` |

Then, from any directory you can write to:

```bash
chmod +x tasker-linux-x64
./tasker-linux-x64 --open --seed
```

It creates `.data/local.sqlite`, applies its schema, listens on
<http://localhost:8080>, and opens your browser. Register an account on the
sign-in screen; because you passed `--seed`, that first account gets an
organization and a project to start from.

On macOS the first run may be blocked as an unidentified developer. The
binaries are not code-signed — that is out of scope for now — so allow it
explicitly:

```bash
xattr -d com.apple.quarantine ./tasker-macos-arm64
```

## Options

```
--port <n>     Port to listen on (default 8080, or $PORT)
--db <path>    SQLite database file (default ./.data/local.sqlite, or $DB_PATH)
--open         Open a browser once the server is listening
--seed         On first run only, create a starter organization and project
-h, --help     Show this message
-v, --version  Show the version
```

Flags win over environment variables, which win over defaults. So this:

```bash
PORT=3000 ./tasker --port 9000
```

listens on 9000 — the number you typed, not the one in your shell.

Configuration beyond these flags is read from the environment, including from a
`.env` file beside the binary. `JWT_SECRET` and `APP_ENCRYPTION_SECRET` are the
two worth setting for anything beyond a local trial; the defaults are
development values, and the server refuses to start with them when
`NODE_ENV=production`.

## What "standalone" does and does not mean

**Included.** The web interface, every database migration, and full-text search
(SQLite's FTS5, compiled in). Starting in an empty directory is the supported
path and is tested that way on every pull request — the binary is copied to a
temporary directory and run with a scrubbed environment, so nothing it needs
can leak in from the machine that built it.

**Not included, and not needed.** A message broker. Without `NATS_URL`,
standalone mode stores domain events and projects the audit trail locally;
webhook delivery also uses the database and needs no broker. The live event
feed needs NATS, with browser polling as its fallback. To enable the feed, start
a broker and set `NATS_URL`. With that explicit configuration, also run the
audit consumer against the same SQLite database: its `DB_PATH` must match the
API's `--db` path. See [event recovery and retention](webhooks.md#recovery-and-operations).

**Sign-in.** Username and password work with no configuration. "Continue with
Google" appears only when `GOOGLE_CLIENT_ID` and `GOOGLE_REDIRECT_URI` are both
set — a standalone binary has neither, so the sign-in screen shows only the
form that works.

**Not a transport shortcut.** The browser talks to the server over
`http://localhost:<port>` exactly as it would to a remote deployment. There is
no in-process transport, deliberately; see
[ADR-0019](../.specs/adr/ADR-0019-no-in-process-transport-in-the-standalone-binary.md).

## Upgrading

Replace the file. The database is separate, and the new binary applies whatever
migrations it carries that the database has not seen. Migration bookkeeping is
the same table `drizzle-kit` writes, so a database created by `moon run dev`
can be opened by the binary and the other way round.

Back up `.data/local.sqlite` first for anything you care about. It is one file;
copying it while the server is stopped is a complete backup.

When upgrading to durable domain events, stop every old API, audit consumer and
webhook worker first. The new audit identity and webhook lease fence require
compatible workers; see the [upgrade and rollback notes](webhooks.md#recovery-and-operations).

For recoverable schedules (ADR-0041), stop **all old schedule/API workers**
before applying the SQLite 0063 or MySQL 0051 migration. Mixed old and new
workers are unsupported: an old binary does not understand pending occurrences
or lease fencing. Back up the stopped database, migrate with the new version,
then start only compatible workers. Do not roll back to an old worker against
the upgraded database; restoring a backup also restores its earlier work state
and requires reconciliation of work created since that backup.

Previously recorded run IDs and history remain readable. Recovery guarantees
apply to newly admitted occurrences; legacy history cannot recover work that
an old worker lost before recording it. Pending occurrences retain frozen
creation inputs until they terminate. Terminal receipts clear those bodies and
retain outcome, actor/target metadata and created task IDs. Deleting a schedule
retains its tombstone and receipts until project purge; do not manually prune
these rows as routine cleanup. Inspect Recent runs or `tasker schedules runs`
for interrupted creation and current authorization failures. See
[schedule behavior and controls](agent-integration.md#18-recurring-work-schedules).

## Building it yourself

```bash
moon run backend:build-standalone
```

The output is `apps/backend/dist/tasker-standalone`. The task builds the GUI
first and packs it into the binary; a build that skipped that step would
produce something that serves a blank page, so it fails rather than compiling
one.

To check a build the way CI does:

```bash
./scripts/smoke-standalone.sh
```
