---
task: M04-T10
surface: AI Agents → per-agent token panel
date: 2026-08-15
---

# Issuing and revoking an agent's tokens

## Where this sits

There is no agent *detail* view — the Agents screen is a flat list of instances,
each row carrying Edit and Delete. The task says "the agent detail view"; the
honest options were to build one or to hang tokens off the row that exists.

The panel expands under the selected agent's row, in place. Building a detail
route to hold one panel would be inventing navigation this milestone does not
otherwise need, and M05 owns GUI/API parity and route structure — it should
decide whether agents get a detail route, not M04 as a side effect.

```
│ ● Reviewer Bot        Reviewer    WORKING    Tokens  Edit  Delete │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ Tokens                                        [ New token ] │   │
│ │                                                             │   │
│ │ tskr_a1b2…  CI worker   active   expires in 88 days      ✕  │   │
│ │ tskr_c3d4…  Old runner  revoked  —                          │   │
│ └─────────────────────────────────────────────────────────────┘   │
```

## The copy-once problem

This is the only screen in the product that shows something the server cannot
show again. Everything about the created state is built around that.

- The secret appears in a bordered block with a **Copy** button, not as a line
  of body text among others.
- The block is accompanied by "This is the only time this token will be shown",
  as a statement, not a tooltip.
- **The block does not disappear on its own.** No auto-dismiss, no timeout, no
  closing when the form is submitted again. It is dismissed by an explicit
  "I've saved it" button, because a timer that expires while someone is
  switching to their password manager destroys the only copy.
- Copy failing is handled: `navigator.clipboard` is unavailable over plain HTTP
  on some browsers, and a Copy button that silently does nothing on the one
  screen where the value is unrecoverable is worse than no button. On failure
  the block says so and the text stays selectable.

## States

| State | What the user sees |
|---|---|
| **Panel closed** | A "Tokens" button on the agent's row. No count — that would need a query per agent on every render of the list. |
| **Loading** | "Loading tokens…" inside the opened panel. The panel opens immediately; only its contents wait. |
| **No tokens** | "No tokens for this agent." plus the New token button. An agent with no credential is the normal state before anyone issues one, not an error. |
| **Not an admin** | The panel is absent, and so is the Tokens button. `listAgentTokens` is admin-gated, so a member would open it into a permission error. Same reasoning as M03-T13's invitations section, and the same deliberate exception to M03-T08's "leave the control and let the server refuse". |
| **Creating** | Name field, scope checkboxes, optional expiry. The submit button reads "Creating…" and is disabled. |
| **Created** | The copy-once block, described above. The list refreshes behind it. |
| **Create failed** | Destructive text under the form, carrying the server's message. The form keeps what was typed — the realistic failures are permission and validation, and clearing the field makes someone retype a name they just chose. |
| **Revoking** | That row's ✕ is disabled; other rows stay usable. Confirmation first, matching Remove-member and Revoke-invitation. |
| **Revoke failed** | Destructive text under the list. The row stays, because the token still exists. |

## Scopes in the form

Eight checkboxes, grouped read/write, with the scope string shown verbatim
(`tasks:read`) rather than prettified. The string is what appears in the CLI,
in `ADR-0008`, and in the error an agent gets when it lacks one — inventing a
friendlier label here would mean the UI and the error message disagree about
what the thing is called.

Nothing is pre-checked. A default set would be the set most tokens get, which is
how a credential ends up with more authority than the person issuing it thought
about.

## Expiry

An optional number of days, placeholder "90". Left blank it defaults to 90 on
the server; the field's help text says so rather than pre-filling, so the form
does not imply the user chose 90 when they did not.

## Accessibility

- The Tokens button carries an accessible name naming the agent
  (`Tokens for Reviewer Bot`), not a bare "Tokens" repeated down the list.
- The revoke button likewise names the token (`Revoke token CI worker`).
- The copy-once block is a `role="status"` region, so a screen-reader user is
  told the token appeared rather than having to go looking for it.
- Scope checkboxes are a real `<fieldset>` with a `<legend>`, so the group is
  announced as a group.

## Not in scope

Rotation as a single action (issue new + revoke old atomically). It is the
obvious next thing, and doing it well means deciding what happens to in-flight
requests on the old token — a question M04 has not answered. Two explicit steps
are honest in the meantime.
