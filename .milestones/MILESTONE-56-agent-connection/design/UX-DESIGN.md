# M56 — Register an agent and connect its external worker

## Judgement and sources

Keep the existing system sans UI font, monospace data role, semantic surface/ink
pairs, violet primary action and spacing scale. This work corrects flow and meaning;
a new font or palette would add visual variation without helping connection.
Use the existing page/section/body/caption hierarchy, one primary action per
current form, and wrapping controls at375/768/1280 in light/dark.

External references read2026-11-10 inform independent judgement:

- [GitHub token management](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens): treat tokens as passwords, constrain permissions and expiration, and keep secrets outside shared code. Tasker's existing scoped/expiring token model remains authoritative.
- [Carbon progress indicators](https://carbondesignsystem.com/components/progress-indicator/usage/): progress describes observable linear stages. Copying configuration cannot prove installation, so use concise instructions and explicit credential verification rather than a completion percentage or a worker-running badge.
- [MDN request credentials](https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials): omit prevents browser cookie inclusion/response-cookie adoption. Exact bearer verification uses its own transport, explicit identity checks and redirect rejection.
- [WCAG focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html): keep labels, errors, code controls and current focus visible inside the existing page/row layout.

## Navigation and registration

Retain Agents navigation and its existing role/agent sections. Call the identity
list **Registered agents**, the primary action **Register agent**, the submit
**Register**, progress **Registering…**, and errors **Could not register agent**.
Describe agents as identities for external workers. Explain that Tasker does not
start or host the worker. Avoid deployed/running-instance claims for this action.
Activity information keeps its recorded last-use/task meaning.

A selected organization is required. Initial loading, empty list, failed read
with Retry and denied administration remain distinct. Existing list membership
and server authorization continue to determine available results/actions.
The registration form has Agent name and Role. Explain that a role describes
instructions/capabilities; token scopes control API access. Preserve the current
server's required role and existing role creation/editing rules.

With no roles, explain **Create a role before registering an agent** and provide
**Create a role** near that explanation, leading to the existing role form.
Keep a typed agent name while creating a role or canceling/reopening registration
in the same confirmed account/organization. Successfully creating a role can
select that new role for the still-current registration intent. It must not
reopen a canceled form or overwrite a later deliberate role choice.

Registration success identifies the returned created agent and opens one shared
**Connect an external worker** section below the page header, outside the
virtualized agent rows. Existing Tokens actions select that same section. This
keeps a newly registered identity reachable even when its row is beyond the
loaded list page, and avoids multiple one-time credential panels. The section
uses the existing AgentTokens controls with a clear agent heading and Close.
Opening deliberately focuses its heading once; closing returns to the originating
Tokens control when present, otherwise Registered agents heading. Scope changes
retire pending focus intent. Creation does not imply a token or running worker.

Registration drafts and mutation callbacks are bound to confirmed account/org.
Switching scope retires pending UI intent and prevents old success/error from
changing the new scope's form or selection. Invalidation still targets the scope
that actually received the write. No secret is part of a registration draft.

## Issue a scoped token

Keep name, explicit scope checkboxes and existing expiration validation. Begin
with no scopes selected, preserving the current server requirement to choose at
least one; explain **Choose only what this worker needs**. Read-only task access
needs tasks:read; work/reporting needs the additional scopes the operator chooses.
Do not silently grant all scopes. Keep the90-day default/365-day maximum copy.

Loading/denied token-list reads must never briefly render an authorized issuance
form. A non-administrator receives useful current read/unavailable guidance;
server denial must not be disguised as an empty token list. Failed creation
retains the non-secret form. A pending creation is protected from duplicate submit.
Canceling, leaving or switching scope while issuance is pending retires the reveal
intent; an eventual server-created token is managed through its original list.

## One-time credential panel

The panel belongs to one account, organization, agent and issuance revision.
Show its heading **Save this token** and the existing selectable secret once,
with **Copy token** and **I've saved it**. Explain that leaving/dismissing loses
this copy and that a lost token must be revoked and replaced. No automatic copy,
download, persistence or recovery field is added.

Announce readiness/copy outcomes in a concise status message outside the secret
code block. Do not put the secret inside a live region that announces it without
request. Use text labels, visible focus and existing neutral surfaces for the
credential. The token wraps; large structured snippets have an explicit code
scroller rather than widening the page.

Below it, **Configure your worker** provides Shell and MCP stdio examples using
existing CLI/MCP support. Show the actual configured API URL, organization and
optional selected project, with a token placeholder in the visible preview.
**Copy configuration** explicitly includes the newly issued secret; label that
fact next to the action. JSON uses JSON.stringify, shell values use robust quoting,
and no executable command is built from unescaped display names or IDs. No
configuration is copied until the operator asks. Clipboard failure keeps manual
selectable token access and a useful Retry action.

The endpoint is the same trusted deployment API used by Tasker. Instructions say
that the worker runs externally, needs the CLI/MCP client as appropriate, and
must be able to reach that API. The UI does not let the secret be probed against
an arbitrary destination or claim it has configured the external machine.

## Verify this credential

**Verify token** makes a real GetIdentity request carrying only the current newly
issued bearer secret. While pending, show **Verifying…**, disable duplicate verify
and keep copy/dismiss controls usable. A short status explains that this tests
API authentication, not whether the external worker is running.

Success displays **Token verified at [local date/time]** with the actual agent,
organization and returned scopes. Require exact agent/org/token/scopes match and
an agent identity; a human administrator response is a failure. A successful
request updates ordinary token last-use metadata, so this signal is not evidence
that the worker itself made that request.

Failure clears current verification success, retains the one-time token for
explicit Retry/save/revoke, and distinguishes invalid/revoked/expired credentials
from unavailable/offline or unexpected identity. Error text is sanitized and
must not echo the secret or a raw request/Authorization header. No verification
fact is inferred from token issuance, copy, admin-session success or cached data.

Dismiss, a replacement token, account/org/agent change or confirmed logout aborts
in-flight verification and retires its result lifetime. A late old success or
failure cannot reveal a token, alter a later credential's status or move focus.
Retiring the panel clears its plaintext and issuance-response cache. Verification may use non-secret mutation state, with revision
variables and metadata-only results/errors; its secret stays in the one-time
local holder rather than cache variables. Metadata
rows remain; existing Revoke continues to work. A known revocation of the active
one-time token clears its verified result and explains that a new token is needed.

## States, accessibility and evidence

Required deterministic previews: populated/empty/loading/error agents and roles,
no roles, registration pending/denied, new-token form/failed issue, token ready,
copy failure, configuration, verification pending/success/refusal/offline/unexpected
identity, dismissed/lost-secret guidance and metadata-only revoked/expired rows.
Previews must use fake credentials and actual serialized transport fixtures.

Use native labeled controls and fieldsets, readable semantic status pairs and
visible focus. Preserve existing confirmation behavior for archive/revoke. No
secret is captured in real-token screenshots, trace, video, logs or test failure
messages. Actual proof revokes each minted test token in finally. Both theme/
mobile rendered gates, independent source/UX review and real exact-token CLI/MCP
journeys bind T02–T04 under TEST-PLAN-0056.
