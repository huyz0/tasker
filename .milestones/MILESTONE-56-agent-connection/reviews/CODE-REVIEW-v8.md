---
timestamp: 2026-11-10T11:43:22Z
decision: approved
---

# M56-T04 deployment build-cache amendment review

Independent review of immutable d86e962 resolves CODE-v7's cache integration
blocker. The GUI build now declares VITE_BACKEND_URL, NODE_ENV and GIT_SHA as
environment inputs, plus explicit optional .env/.env.local/.env.production/
.env.production.local files. Read-only moon task gui:build --json confirms those
three inputEnv entries and all four optional inputFiles in the expanded task.

The reported behavioral evidence first reproduced an environment-only B build
incorrectly reusing A, then proved distinct environment-only A/B outputs after
the correction. Ignored .env.production.local-only changes also rebuilt the
current endpoint. An invalid setting after a cached build reran validation and
failed with sanitized diagnostics and no credential-bearing emitted value.
These real build/output checks address the defect rather than merely asserting
YAML strings. Owned configuration files were removed and default output restored.

No remaining source blocker was identified. Source beyond these declared build
inputs retains CODE-v7/ARCH-v3's otherwise approved privacy, optional-client,
focus and documentation boundaries. Reported128 affected/type/knip/mobile CLI+
MCP and baseline305-preview results were not independently rerun here. Latest
affected39/full36/production-worker and applicable final-head gates remain
pending. No implementation files or services were changed by this reviewer;
CODE-v7 and every prior review are preserved.

```yaml
findings: []
```
