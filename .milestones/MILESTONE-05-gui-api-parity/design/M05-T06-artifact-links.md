---
task: M05-T06
surface: Tasks → detail, Artifacts → viewer
date: 2026-08-15
---

# Linking a task to an artifact

## What exists, and what the task needs

`linkTaskArtifact` has existed since M01 and `task_artifact_links` has rows.
Nothing can read them: there is no RPC that lists an artifact's links, in either
direction, and nothing that removes one. So both halves of this task's verify
line — "a linked artifact appears on the task" — and its stated scope ("link and
unlink from **both** the task detail and the artifact view") are unreachable
without a contract change. This is the same gap as M05-T04's: the write path was
built, the read path never was, so the feature was invisible and therefore
untested by use.

## One RPC, both directions

```
listTaskArtifactLinks({ taskId })      → links on that task
listTaskArtifactLinks({ artifactId })  → links on that artifact
```

Exactly one of the two must be set; both or neither is `invalid_argument`. The
alternative — `listTaskArtifacts` plus `listArtifactTasks` — is two RPCs, two
authorization paths and two entries in each deny-by-default sweep, for one
query against one table read from two ends. The single RPC keeps the security
surface at one place.

`TaskArtifactLink` carries `artifactName` and `taskTitle`, resolved server-side.
Same reason as `Assignee.name` and `TaskReviewer.name`: a client that has to
resolve names itself ends up fetching a catalogue, and fetching a catalogue is
what made the first assignee picker issue two thousand requests. Here it would
be worse — the artifact rows carry `content`, so resolving names client-side
would mean downloading every artifact's body to display a list of titles.

`unlinkTaskArtifact({ taskId, artifactId })` removes the exact pair and is
idempotent, matching `unassignTask`. Linking is also made idempotent: the
current handler inserts unconditionally, so clicking twice produces two rows and
the artifact appears twice on the task.

## The two surfaces

**Task detail** — an "Artifacts" section under Reviewers, listing linked
artifacts by name with a ✕ each, and a picker that searches (see below).

**Artifact viewer** — a "Tasks" section under Labels, listing the tasks this
artifact is attached to, with the same add/remove pair.

They are the same relation seen from two ends, so the same component serves
both, parameterized by which end is fixed. Unlike the reviewer/assignee pair,
here the *sets are the same set* — one table, one shape of row — so sharing is
reuse rather than a flag threaded through every line.

## States

| State | What the user sees |
|---|---|
| **No links** | "No linked artifacts" / "Not linked to any task", muted. Not an empty box. |
| **Searching** | "Searching…", so an empty list does not read as "nothing exists". |
| **No query yet** | "Type to search." — the search is organization-wide, so there is nothing bounded to list first. |
| **No matches** | "No artifact matches that." when the search found nothing, "Every matching artifact is already linked." when it found only things already on the task. |
| **Already linked** | Not offered again. The server now treats a duplicate as success, so re-offering would produce a click that appears to do nothing. |
| **Failure** | The server's message under the control; permission and a stale candidate are the realistic ones. |

## Scope of the search

Artifacts live in folders and folders belong to a project, so `listArtifacts`
takes a folder — but the task detail has no folder in hand, and walking every
folder to build a list is the enumeration M05-T04 was about. The picker uses
`universalSearch` instead: organization-scoped, bounded, and already splitting
its page evenly between tasks and artifacts, so neither type crowds the other
out (verified against the fixture — a ten-result page returned exactly five
tasks, the per-type cap).

Two consequences, both stated rather than hidden:

- **It requires a query.** There is no bounded "everything" to open onto, so the
  panel says "Type to search." rather than showing an empty list that reads as
  "nothing exists".
- **It shows no total.** `universalSearch`'s `totalCount` sums both types, so
  "Showing 3 of 150" would be counting the wrong thing. No count beats a
  misleading one.

Two files named `README.md` in different folders are still indistinguishable in
the result list. M05-T10 adds nested folder navigation, which is where a path
would come from; recorded there rather than half-solved here.

## Not in scope

- **Link types** (attachment vs. output vs. reference). The table has no such
  column, and inventing one in the GUI is the fabrication M05-T01 built a lint
  for.
- **Linking across projects.** The handler already refuses links across
  organizations; within an organization a cross-project link is legitimate and
  stays allowed.
- **Previewing the artifact inline on the task.** The artifact view exists and
  is one click away; duplicating the renderer is M06's call, not this task's.

## Accessibility

- Each remove button names its target (`Unlink notes.md`) rather than repeating
  a bare ✕ down the list.
- The list is a `<ul>`, so its length is announced.
- The search field has a visible label naming what it searches ("Search
  artifacts" / "Search tasks"), since the same control does both.
