# M32 — Progress Journal

## M32-T01 — Task-note events refresh the open task's notes

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/gui/src/lib/eventQueryKeys.ts`, `eventQueryKeys.test.ts`
- **Verified**: `bunx vitest run src/lib/eventQueryKeys.test.ts` — green; the
  new test failed first.
- **Notes**: The `tasknote` entity invalidated `['handoffNotes','task',
  'reports']`; the notes panel and handoff summary in an open task read
  `['taskNotes', id]`. React Query matches prefixes by whole key element, so
  `'task'` never matched `'taskNotes'` — the panel a supervisor watches an
  agent through refreshed only on window refocus. The new test asserts the
  real panel key is matched, not just that a string is in a list.
- **Next**: M32-T02
