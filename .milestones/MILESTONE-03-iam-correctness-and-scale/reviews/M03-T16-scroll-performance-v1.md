---
task: M03-T16
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M03-T16 Hold 60 fps while scrolling the members table

## Correctness

The verify line is a measurement, so the review is mostly about whether the
measurement means anything.

| | p50 | p95 | p99 | max | dropped (>25 ms) |
|---|---|---|---|---|---|
| Before | 16.70 ms | 35.40 ms | — | 51.70 ms | **14.6%** |
| After `measureElement` removed | 16.80 ms | 25.00 ms | 31.90 ms | 34.90 ms | 4.6% |
| After memoised row | 16.60 ms | 19.30 ms | 21.60 ms | 23.50 ms | **0.0%** |
| Empty-page control | 16.70 ms | 16.80 ms | — | 17.00 ms | 0.0% |

239 frames sampled, 100,001 members, headless Chromium at 1280×900, scrolling
100 px per frame. Under the verify line of 2%.

Two things make these numbers readable rather than decorative:

```yaml
- file: apps/gui/src/features/Organizations/index.tsx
  line: 0
  severity: high
  comment: >
    The first reading of this data was wrong and nearly produced a wrong fix. A
    requestAnimationFrame delta of 16.7 ms IS 60 fps - it is the vsync cadence,
    not a budget violation - so the initial "p50 16.70 ms fails the 16 ms
    budget" was measuring the display, not the app. A frame is dropped when the
    delta spans two vsyncs, which puts the threshold that means anything at
    ~25 ms. Every figure above uses that threshold. Exit criterion 2's literal
    wording ("without exceeding 16 ms frame budget") cannot be satisfied by any
    page, including a blank one, and is recorded as such in PROGRESS.md.

- file: apps/gui/src/features/Organizations/index.tsx
  line: 0
  severity: medium
  comment: >
    The empty-page control is what separates the component's cost from the
    environment's. This runs on WSL2 with no GPU, where it would be easy to
    accept a bad number as "the machine". The control runs the identical scroll
    loop in the same browser and drops 0% of frames, so 14.6% was the members
    table and nothing else. Anyone re-running this must re-run the control too,
    which is why the verify line names it.
```

## The two fixes, and why the first was not enough

`measureElement` was the prime suspect and it was a real cost: it forces a
layout read per rendered row per frame to re-learn a height that is a constant.
Removing it moved p95 from 35.4 ms to 25.0 ms. But 4.6% dropped is still four
times the target, so the suspect was not the whole story.

The rest was React. The virtualizer re-renders this screen on nearly every
scroll frame — at 100 px/frame over 57 px rows the visible range shifts
continuously — and all ~17 rows re-rendered each time, each rebuilding a
`<select>` and its three `<option>`s, for the sake of the one or two rows that
actually entered the window. `MemberRow` is now `memo`'d, which requires its
props to be stable: `handleMemberRoleChange` and `handleMemberRemove` are
`useCallback`s over react-query's stable `mutate`, and the confirmation string's
org name is lifted to a value.

```yaml
- file: apps/gui/src/features/Organizations/index.tsx
  line: 0
  severity: medium
  comment: >
    memo on a row is load-bearing but silently reversible - an inline arrow
    passed as onRoleChange would restore the old behaviour with no test failing
    and no lint error, because the component still renders correctly, just 17x
    per frame. The comment above MemberRow says this explicitly rather than
    leaving the next reader to infer why the callbacks are hoisted. A render
    -count assertion would make it structural; that belongs with M12, which owns
    test depth, not here.
```

## Test coverage

No new unit tests. The existing suite covers what the row renders and does —
role change, removal, confirmation, cancel — and it kept passing unchanged
across both fixes, which is the assertion that mattered: an extraction that
alters behaviour fails those tests.

What is not covered by any unit test is the thing this task is about. Frame
timing needs a real browser, a real 100k fixture and a real scroll; jsdom has no
layout and no compositor, so a "performance test" there would assert nothing.
The measurement lives in a script run against the dev stack and its numbers are
recorded above and in PROGRESS.md. That is weaker than a gate, and it is
recorded as such: a regression here will not fail CI.

## Architectural drift

`MEMBER_ROW_HEIGHT` is now referenced from two places — the virtualizer's
`estimateSize` and the row's own `style.height` — and they must agree or rows
overlap. Both carry a comment pointing at the other. A single constant read
twice is the mildest form of this coupling available without measuring.

## Security

None. No data, request, or authorization path changed — this is rendering only.

## Verdict

**Approved.** 14.6% → 0.0% dropped frames against a 0.0% control, with the
measurement method corrected mid-task. One high finding (the misread rAF
threshold, corrected before it drove a fix) and two mediums, both recorded
rather than left implicit.
