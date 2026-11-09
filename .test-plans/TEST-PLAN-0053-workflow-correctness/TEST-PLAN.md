# M53 executable acceptance plan

Status: accepted for implementation; implementation tests must fail before correction. Pure design
artifacts have no runtime TDD. Existing behavior/authorization is the baseline;
no queue-dialog masking defect is presumed.

## TC-001 — Canonical task navigation (T02/T07, exit1)

Given an authorized B task and origin A with view/filter parameters, when opened
from queue/search/direct links with missing or conflicting org/project, then
one push plus replace resolves B while keeping its detail, labels/actions/feed
agree, and Back/Forward/reload recover the right origin/destination. Repeat cold,
warm, cross-org and slower obsolete resolution; the old response cannot move the
new route. A deliberate selector change closes incompatible detail once.
Verify actual browser plus scoped component/RPC tests; a removed normalization
or mistaken scope-switch close must fail the observable route/content assertions.

## TC-002 — Artifact and optional metadata (T02/T07, exit1)

Given artifact B outside loaded A folders, when GetArtifact succeeds, then
optional org/project response metadata resolves B with bounded reads, no body
SELECT and no project/folder scan. GetTask orgId uses fresh field 3; GetArtifact
orgId2/projectId3 survive TS/Go wire round trips and old-client unknown fields.
Absent metadata never causes guessed ownership; denied/not-found exposes no
owner metadata. Test both SQLite/MySQL authorized/foreign reads and GUI errors.

## TC-003 — Memory tiers (T02/T07, exit1)

Given project, organization and team beliefs reachable by ID, when opened with
wrong/no scope, then current authorized ownership determines URL/detail tier.
Org/team have no project-ownership breadcrumb or project-scoped Record action;
team is an honest detail-only tier, Return reaches organization Memory and Back
reaches origin. Direct read precedes list guards; belief-owned mutations retain
their actual org/tier. Denied/stale resolution cannot disclose metadata or redirect. With projects
available, settle switcher queries/effects and repeat cold reload/Back/Forward:
org/team URLs remain projectless and detail stays open without loops or extra
history. Explicit project selection closes detail into that project's tier;
explicit org selection cannot be undone by an obsolete belief response.

## TC-004 — Complete current search (T03/T07, exits1/2)

Given all six supported result types and comments on each supported parent, when
searching/clicking/arrows/Enter, then all matches remain visible/actionable and
keyboard order matches display order. When initial/subsequent queries fail,
then error/Retry replaces false-empty/stale-current results; real zero is distinct.
A late earlier query/org cannot overwrite current results or Enter selection.
Run GUI/browser and actual SQLite/MySQL requested-type search cases.

## TC-005 — Old pending work is never history-capped (T04/T07, exit3)

Given an open question behind more than 20 closed questions and a pending approval
behind more than 10 decisions, when a task opens, then both remain actionable
before History opens. More than one pending/history page remains reachable in
each task; organization fixtures exceed 50 pending across projects. Verify SQL
closed predicates/counts/cursor separation on both dialects and actual browser.
Existing status defaults/values remain unchanged; unknown selectors still fail.
MCP publishes and forwards closed in both list tools. Cross-status/task/org/order
bound cursors cannot apply their old position or count; unbound legacy cursors
restart the current authorized first page. Unrelated lists retain old behavior.

## TC-006 — Paging failures and changing source (T04/T07, exit3)

Given loaded pending/history pages, when the next read fails, then earlier rows
and typed forms remain, local Retry resumes the correct cursor, and counts label
loaded versus total. Initial error/denial is not empty success. New rows, resolving
the final loaded row, or another person answering/deciding first leave no duplicate
closed record, hidden pending page or fabricated success. Task/scope changes reset
pages. Exercise stale DecideTransitionApproval through the actual mutation
interceptor/wire: its closed-as-stale error must not roll persistence back to
pending. Preserve current error code and atomic normal decisions. Deliberately
removing cursor handling or closed filtering must fail.

## TC-007 — Every SPA summary exit (T05/T07, exit4)

Given a dirty A summary, when Escape/backdrop/close, breadcrumbs/sidebar,
project/org switch, Back/Forward or opening B occurs, then A's draft is retained
and restored with Unsaved indication on return. B never shows A text/error.
Explicit Cancel discards; Clear is a deliberate server call. Test each actual
exit plus component registry scope; no automatic write occurs on restoration.

## TC-008 — Summary read/save races (T05/T07, exit4)

Given an editor with typed text, when background read fails/recovers or summary
updates, then text survives. When Save(text1) is pending and text2 is typed,
then success does not erase text2; a failed save retains latest text. Leaving
A/opening B or changing account before response cannot clear B/new-identity
state. Navigation away/back cannot start a second per-task save before completion.
A fault clearing every successful save must fail the newer-text regression.
Canonical server normalization advances only the baseline. Failed logout and
account switches cannot bypass pending admission for the same shared task; other
accounts see generic waiting copy and cannot derive dirty state from private
submitted text. Same-account later-generation receipts retain current entry/text.

## TC-009 — Native exit and identity lifetime (T05/T07, exit4)

Given any retained dirty summary, even with its panel closed, when native
reload/tab exit is attempted, then a beforeunload warning protects it. Choosing
stay preserves the draft; choosing leave may discard this session-memory state.
Clean/saved/cancelled state removes the listener; opening unchanged content or
typing and reverting is clean. Logout/account switch clears
all drafts; an old callback cannot repopulate another identity's state.
Exercise actual password login/registration before a held/failed session refresh:
verified returned identity must replace stale account/read caches while pending
mutation fences remain. Temporary/malformed lookups are unknown, not logout.
Native listeners attach only for dirty intent and remove the same handler when
clean; StrictMode and closed/public-route panels do not clear retained drafts. Do not
claim persistence after a process kill or mobile unload without a warning.

## TC-010 — MCP and workflow truth (T06/T07, exits4/5)

Given set_task_summary with explicit empty text, when invoked, then exactly one
existing RPC receives empty text and clears the summary. Missing/null/non-string
text, empty task ID or oversized text remain invalid. Other tools' required strings remain nonempty. Document workflow template
org/project visibility and ordinary parent claimability; no example promises a
project-wide claim-next deterministically selects one ready step.

## TC-011 — Accessible operational states (T02–T07, exit5)

Given long realistic content and every loading/empty/denied/error/page-error/draft
state, when rendered at 375/768/1280 in both themes and used by keyboard, then
content/actions/focus remain reachable, no document clipping/overflow occurs,
and WCAG A/AA contrast/status semantics pass. M47's error-token misuse is a
representative deliberate contrast fault. Do not revive the disproved masking
claim or introduce a new palette/font family.

## Completion

Affected full GUI coverage/backend/MCP/wire tests, relevant actual SQL/browser
proofs, unchanged coverage gates, moon check --all and independent four-lens
review must pass. Keep exact evidence and public docs current. Publish final PR
head only after actual required CI succeeds; no unexecuted scenario is a pass.

## TC-012 — Rendered catalogue truth and semantic ink (T07, exit5)

Given every story and its actual provider/router context, when the catalogue is
rendered in both themes and desktop/mobile widths, then the UI renders rather
than a framework error, portal contents are audited, intentional absent states
remain absent and error/action ink meets AA on its surface. Solid/highlighted
destructive foreground/fill pairs retain their meaning. Given a mobile report
table, when keyboard focus reaches its named scroller and ArrowRight is pressed,
then its content can scroll. Given the read-only editor, when it renders, then
disabled off-screen formatting controls do not create an unreachable scroll area.
A deliberate unnamed control outside the Storybook root must fail the gate.
