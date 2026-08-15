---
task: M03-T13
surface: Organizations → Roles & Permissions
date: 2026-08-15
---

# Inviting and revoking

## Where this sits

Under the members table, not above it. The common reason to open Roles &
Permissions is to look at who is already here; inviting is the occasional
action, and putting a form above the thing people came for makes them scroll
past it every time.

```
│  ── Members table (M03-T08) ──                          │
│                                                          │
│  Invite someone                                          │
│  [ email@example.com    ] [ Member ▾ ] [ Send invite ]  │
│                                                          │
│  Pending invitations (2)                                 │
│  ┌────────────────────────────────────────────────────┐ │
│  │ ada@example.com     Member   expires in 12 days  ✕ │ │
│  │ old@example.com     Viewer   EXPIRED             ✕ │ │
│  └────────────────────────────────────────────────────┘ │
```

## Why expiry is shown as state, not as a date

The server sends both `expiresAt` and a computed `expired` boolean (M03-T12).
The list renders the boolean as a badge and the date as relative text. An
administrator scanning this list is asking "is this one still live?" — a
timestamp makes them do date arithmetic to answer it, and the answer differs by
timezone if the client computes it.

## States

| State | What the user sees |
|---|---|
| **No invitations** | The section header and nothing else. Not an error, not an empty-state illustration — an organization with nobody pending is the normal case. |
| **Loading** | The section is absent until the server answers. Rendering it optimistically and removing it when a denial arrives is worse than never showing it. |
| **Sending** | The button reads "Sending…" and is disabled. The email field stays filled until success, so a failure does not lose what was typed. |
| **Send succeeded** | The field clears and the invitation appears in the list. No toast: the row appearing *is* the confirmation. |
| **Send failed** | Destructive text under the form carrying the server's message — a duplicate invitation is a success, so the realistic failures here are permission and validation. |
| **Revoking** | That row's ✕ is disabled. Other rows stay usable. |
| **Revoke failed** | Destructive text under the list. The row stays, because it still exists. |
| **Not an admin** | The whole section is absent. `listInvitations` is admin-gated, so a member would see a permission error where a section header used to be — better to not offer what cannot be used. This is the one place a client-side role check is right, because the alternative is showing an error as a resting state. |

The last row is a deliberate exception to the position taken in
[M03-T08's note](./M03-T08-members-table.md), which left the members table's
controls active for a viewer rather than duplicating authorization into the
client. The distinction: there, the control is one the user might legitimately
try and the server's refusal is informative. Here, an entire section would
render as a permanent error for anyone who is not an admin.

## Accessibility

- Email input and role select both carry visible labels.
- The revoke button has an accessible name naming the invitee
  (`Revoke invitation for ada@example.com`), not a bare ✕ — a screen-reader
  user hearing "button" eleven times cannot tell which is which.
- Revoking asks for confirmation, matching the existing Remove-member flow.

## Not in scope

Actually sending email — **M11** owns delivery. This milestone records the
invitation and lets an admin manage it; nothing is dispatched.
