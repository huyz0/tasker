---
id: ADR-0050
status: accepted
date: 2026-11-22
milestone: M59
---

# Report sections use URL fragments and native navigation links

## Context

Reports already owns project/window query settings. Its view updater and
saved-view location adapter preserve fragments, while client route guards
recognize /reports exactly. Sections need shareable locations, native links
and Back/Forward without changing the saved-view wire definition.

## Options

1. Keep one long page with jump anchors: preserves all visible data but does
   not reduce the reading surface or distinguish decision contexts.
2. Add pathname sections: valid navigation, but expands App/intent route
   allowlists and existing scope/story fixtures for no backend benefit.
3. Use Radix tabs backed by URL state: supplies tab keyboard behavior, but
   changes interaction semantics and still needs explicit history/location
   handling. It is a valid alternative, not prohibited by async reads.
4. Use native links and validated fragments to select one visible section:
   reuses current URL preservation and browser link semantics.

## Decision

Use native fragment links for Exceptions, Trends and Spend, preserving query
scope and existing saved-view definitions.

## Consequences

Existing /reports links remain valid. No backend route or authorization
change. Use a named nav and one current-location link, not tab roles.
Maintain hidden mounted panels to preserve query isolation/local chart
state; do not claim request reduction. Handle direct/unknown fragments and
focus transitions explicitly and verify them in real browser journeys.
