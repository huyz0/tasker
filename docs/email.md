# Email

Tasker sends one kind of message today: the organization invitation. This is how
to make it go somewhere.

**It is off unless configured.** With no `SMTP_HOST`, no transport is
constructed, nothing is sent, and every send reports `skipped`. That is the same
rule the OTLP exporter follows, and for the same reason — the standalone binary
must not try to reach a service that is not there.

An invitation still works with mail switched off. The invitation *row* is what
grants membership; the email only tells someone it exists. Without it, an admin
sends the person the link themselves.

## Locally: a test server that catches everything

The fastest way to see a real message is to send it to a server that never
delivers anything:

```bash
docker compose --profile mail up -d mailpit
```

```bash
cd apps/backend
SMTP_HOST=localhost SMTP_PORT=1025 SMTP_FROM=tasker@localhost \
APP_URL=http://localhost:5173 \
STANDALONE=true bun run src/index.ts
```

Invite someone from **Organizations → Invitations**, then read what was sent at
<http://localhost:8025>.

Mailpit accepts any credentials and any address, so nothing you type there can
reach a real inbox. `docker compose --profile full up` starts it too, with the
backend already pointed at it.

## Gmail

Gmail is the default because it is the account most people already have, and its
SMTP endpoint works from a laptop with no domain, no DNS records and no sending
reputation to warm up.

You need an **app password**, not your account password — Google has not
accepted the latter over SMTP for years. Turn on 2-Step Verification, then
create one at <https://myaccount.google.com/apppasswords>.

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=abcd efgh ijkl mnop   # the app password, spaces and all
SMTP_FROM=you@gmail.com             # Gmail rejects a From that is not the account
APP_URL=https://tasker.example.com
```

Gmail's limits are a few hundred recipients a day for a personal account, which
is plenty for invitations and not enough for anything else. For a deployment
that sends more, point `SMTP_HOST` at a transactional provider — nothing else
changes, because underneath this is plain SMTP.

## Every setting

| Variable | Default | Meaning |
| --- | --- | --- |
| `SMTP_HOST` | *(unset — mail disabled)* | The mail server |
| `SMTP_PORT` | `587` | 587 for STARTTLS, 465 for implicit TLS, 1025 for Mailpit |
| `SMTP_USER` | *(unset)* | Omitted entirely when unset, so a local server is not asked to authenticate |
| `SMTP_PASSWORD` | *(unset)* | An app password for Gmail |
| `SMTP_FROM` | `SMTP_USER`, else `tasker@localhost` | The From address |
| `APP_URL` | `http://localhost:5173` | Where the message tells people to go |

TLS is derived from the port rather than configured: 465 is implicit TLS and
everything else is STARTTLS. Setting that by hand and getting it backwards
produces a connection that hangs rather than an error, which is a miserable
thing to debug.

## What the invitation says, and what it deliberately does not

It names who invited them, which organization, which role, which address to sign
in with, and when it expires. Then it says that ignoring it is safe, because it
is.

**It carries no accept link.** Acceptance in Tasker is not a bearer token:
`consumePendingInvitations` redeems every pending invitation matching the
identity a person *proves* at sign-in. So a forwarded invitation grants nobody
anything — the recipient has to sign in as the invited address before it
applies. A link that granted membership to whoever clicked it would be a real
escalation path, and there is none to leak.

## When something does not arrive

Every attempt is logged, whichever way it goes:

```
mailer.disabled                             no SMTP_HOST — nothing was attempted
invite.email  { to, orgId, outcome: sent }   handed to the server
invite.email  { to, orgId, outcome: failed } the server refused or was unreachable
mailer.send_failed { err, to }               why
```

A failure never fails the invitation. If `invite.email` says `failed`, the
invitation still exists and the person can still be told about it by other
means; check `mailer.send_failed`'s error, and check Mailpit or your provider's
own log before assuming the message was lost.
