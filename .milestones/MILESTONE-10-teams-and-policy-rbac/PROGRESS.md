# M10 — Teams & Policy-Based RBAC — Progress Journal

## M10-T01 — ADR for the policy-based RBAC model

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `.specs/adr/ADR-0013-rbac-model.md`
- **Verified**: The ADR's Option 2 table enumerates all 32 permission keys
  across 14 resource families, each traced to the specific current
  `assertOrg*` gate it's derived from (a full RPC-by-RPC audit — 98
  methods — was run first via a dedicated Explore pass and is summarized
  in the ADR rather than re-derived by whoever reads it next).
- **Notes**:
  - Divergence from the plan: the task's originally named file,
    `ADR-0011-rbac-model.md`, was taken by M06's Radix-adoption ADR
    (landed after this milestone was planned, ids are first-come and never
    reused) — next free id was `ADR-0013`; `MILESTONE.md` updated to match.
  - **Agent tokens stay a separate system from `grants`**, deliberately —
    `can()` governs the human path only; `authorizePrincipal` keeps
    branching to ADR-0008's closed scope vocabulary for agents. Explicit
    decision (Option 4), not an oversight: unifying them would either
    weaken ADR-0008's categorical exclusions (org admin, `AuthService`,
    token issuance refused to every agent regardless of scope) or require
    re-deriving those exclusions as rules layered on top of `grants` — the
    two-systems problem in a different shape.
  - **Three findings from the audit are named but deliberately not fixed
    here**, since this migration's own exit criterion is "behaves
    identically": `TaskNoteService.updateTaskNote`/`deleteTaskNote` have
    no author check (unlike `CommentService`'s equivalents);
    `createTaskNote` refuses every human categorically regardless of
    permission (a principal-kind check `can()` doesn't model); and a fixed
    cluster of RPCs (`assignTask`, `attachLabel`, agent-token management,
    etc.) are closed to agents independent of scope. All three are
    preserved exactly as today's behavior and flagged in the ADR's closing
    section for whoever next touches those handlers.
  - `comment`, `label`, `search`, `dashboard`, and `team`/`role` all get
    their own real permissions rather than continuing to borrow a
    neighboring family's scope the way `AGENT_RPC_SCOPES` does today
    (`comments:write` borrowing `tasks:read` for reads, etc.) — that
    borrowing was ADR-0008's choice to keep the *agent* vocabulary small,
    not a constraint a general permission system checked by humans too
    should inherit.
- **Next**: M10-T02 — `roles`/`permissions`/`role_permissions`/`teams`/
  `team_members`/`grants` schema, both dialects.
