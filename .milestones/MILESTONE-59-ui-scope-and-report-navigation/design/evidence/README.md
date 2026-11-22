# M59 verification and visual observations

Checked source:07e4dbcaeffa7a5bfa9cfab48172e26cd1a94dcb.

- [Source CI run44996008555](https://github.com/huyz0/tasker/actions/runs/44996008555)
- [Existing source-run browser artifact](https://github.com/huyz0/tasker/actions/runs/44996008555/artifacts/14744271124), normal seven-day retention.
- [M58 mobile light baseline](../../../MILESTONE-58-operational-views/design/evidence/reports-url-375-light.png)
- [M58 desktop dark baseline](../../../MILESTONE-58-operational-views/design/evidence/reports-url-1280-dark.png)

The relative baseline links above refer to existing repository images; no new screenshot bytes or base64 are embedded here. Automatic approval review rejected copying the inspected captures into git due to possible application-data disclosure. Final CI removes the temporary review capture/export mechanism and keeps all rendered assertions. The existing source-run artifact is evidence already produced before that rejection, with limited retention.

## Observed changes

Reports previously put spend and trends below all exception cards. The inspected light375px Trends capture exposes its group immediately through a current-location link; desktop Exceptions retains urgency order. Shared view controls wrap in the toolbar with legible14px labels and measured44px minimum targets.

The light375px/200% capture confirms a wrapping shell header and separate Churning title/purpose/action groups. The first version overlapped at x65..217.77 and x106.72..310; the real text-range regression fails there before the flexible header fix, then passes across the complete matrix. Fleet grouping wraps with its panel.

The dark375px synthetic-spend capture shows the retained metric emphasis, a validated chart-series fill and long agent labels that wrap instead of driving one long table cell. The final candidate adds static numeric-cell gutters so adjacent values remain distinct. The table is deliberately horizontally contained and keyboard-scrollable; all financial/token/report values remain reachable. Its daily text alternative includes each UTC day, cost, input/output tokens and report count, including zero values.

## Actual checks and limits

Source run:1770 GUI cases,95.39% branches;401 stories×2themes×2widths, zero axe violations;401×2themes375px overflow checks;37 repository tasks (7 cached),5m52.303s. The focused two-case Reports journey passes. Broad browser execution reports104 first-attempt passes, one core-project selector retry and three existing skips. The trace matches a hidden mobile caption; the final candidate scopes that assertion to main's project heading and requires its own CI pass.

Real Chromium DOM assertions cover320/375/768/1280px, light/dark and100/200% root text size. They wait for the active heading, region and loaded chart/control before measuring targets, page overflow, keyboard table scrolling and title-text/action overlap. Root text resizing is not an actual browser-zoom measurement.

The spend data is explicitly synthetic for presentation. Scoped/history/named-view journeys separately drive the real seeded backend. Live-feed indicators reflect that fixture's observed polling state. Baseline and source captures use different owned synthetic datasets; this is a structural visual comparison, not a pixel golden test.

Manual screen-reader use, other engines, production performance and participant usability remain unmeasured. The Cloud runtime stayed unavailable; no local execution or clean-tree result is inferred.
