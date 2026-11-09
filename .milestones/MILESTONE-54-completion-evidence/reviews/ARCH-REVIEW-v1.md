---
timestamp: 2026-11-09T19:59:00Z
decision: rejected
---

# M54-T01 initial boundary review

Independent agent/reliability review identifies a source-policy mismatch and a
paged metadata data-flow gap before implementation. Clarify legacy size units
and archive policy as well. No runtime change has been made.

```yaml
findings:
  - file: .specs/adr/ADR-0042-completion-evidence.md
    line: 35
    severity: medium
    comment: Existing CreateFolder accepts agents; say no MCP adapter is added and preserve RPC authorization. Only unlink is human-only.
  - file: .specs/adr/ADR-0042-completion-evidence.md
    line: 49
    severity: medium
    comment: Digest's20-entry cap cannot supply metadata for later GUI pages. Define bounded metadata on every paged link response with exact stored size and availability, without body reads.
  - file: .specs/adr/ADR-0042-completion-evidence.md
    line: 81
    severity: medium
    comment: Specify coarse legacy sizeBytes on explicit bounded reads and preserve existing archived artifact/folder read policy without full-body length computation.
```
