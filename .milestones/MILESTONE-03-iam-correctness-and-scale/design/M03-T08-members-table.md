---
task: M03-T08
surface: Organizations → Roles & Permissions
date: 2026-08-15
---

# Members table at 100,000 rows

## The problem this screen has

Until M03-T06 the endpoint returned every member in one response. M03-T07 made
the client page through them all, which is correct and still wrong at scale: an
organization of 100,000 members is 100,000 rows in browser memory and 100,000
DOM nodes, and finding one colleague means scrolling.

The screen needs to hold a page, not an organization.

## Shape

Three controls above the table, then a windowed list.

```
┌─────────────────────────────────────────────────────────┐
│  Roles & Permissions                                    │
│  Members of Root Co and the role each one holds.        │
│                                                          │
│  [ Search name or email…        ]  [ All roles ▾ ]      │
│  Showing 50 of 100,001                                  │
├─────────────────────────────────────────────────────────┤
│  USER                    │ ROLE       │       ACTIONS   │
├─────────────────────────────────────────────────────────┤
│  ▓ windowed rows — only what fits is in the DOM ▓       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Search** is server-side and debounced at 300 ms. It matches name *or* email,
because a person hunting for a colleague does not know which field they are
typing. Typing resets to page 1 — a cursor from the unfiltered set means nothing
against a filtered one.

**Role facet** is server-side too. Filtering the loaded window client-side would
show "3 admins" when the organization has 200, which is worse than no facet:
it looks like an answer.

**The count line** is the honest part. `totalCount` is the filtered total, so
"Showing 50 of 100,001" becomes "Showing 12 of 12" once a search narrows it. It
is what tells a user their search worked rather than broke.

## States

Every one of these is reachable and none may be a blank pane.

| State | What the user sees |
|---|---|
| **Loading (first page)** | "Loading members…" in the table body. The controls render immediately — a search box that appears late gets typed into and loses the keystrokes. |
| **Loading (next page)** | The list stays put; a "Loading more…" row appears at the end. The window must not jump. |
| **Empty (no members)** | "No members found." Only truly reachable for an org of one, since the caller is a member. |
| **Empty (search matched nothing)** | "No members match *"foo"*." — naming the query, so the user can see it was their search and not the system. A "Clear search" action returns to the full list. |
| **Error** | The existing destructive-text line, carrying the server's message. Already used by the remove and role mutations. |
| **Permission denied** | Not reachable here: `listOrgMembers` requires membership and the caller is viewing their own org. A viewer *does* reach the table — they may read it — but the role `<select>` and Remove are the server's to refuse, and M03-T01 makes it refuse. |

Note the last row. A viewer sees controls they cannot use. Disabling them by
role in the client would be a second copy of the authorization rules, drifting
from `lib/authz.ts`; leaving them active means a viewer gets an error toast on
click. **M06 owns the permission-aware control state** — recorded here rather
than half-solved.

## Accessibility

- The search input has a visible label (`ui-ux-standard.md` §2), not a
  placeholder standing in for one.
- The role `<select>` keeps its per-row `aria-label`, which the existing tests
  query by.
- A virtualized list is a screen-reader hazard: only the windowed rows exist in
  the DOM, so the count is not discoverable by tabbing. The container carries
  `aria-rowcount` with the true total.
- Focus must survive a window recycle. Rows are keyed on `userId`, never index.

## Not in scope

Sorting by column header (the server supports `sort`, the UI does not expose
it), bulk selection, and invitation rows — **M03-T13** brings invitations into
this view.
