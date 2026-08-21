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

**Not included, and not needed.** A message broker. Standalone mode runs
without NATS: domain events are still counted and the application works
normally, but the audit trail and the live-updates feed both need a broker and
stay quiet without one. Start one, and point `NATS_URL` at it, if you want
them.

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
