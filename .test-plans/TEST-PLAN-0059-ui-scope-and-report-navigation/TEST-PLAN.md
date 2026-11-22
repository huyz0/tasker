# UI scope and report navigation acceptance

## T01 canonical automation context

- Given projectA is selected and an authorized organization schedule belongs
  to projectB, when the collection renders, then its row names projectB
  rather than implying it belongs to projectA.
- Given an organization workflow collection, when a template is opened and
  started, then the start form retains its canonical permitted project and
  the screen identifies organization-wide collection scope.
- Given no organization, loading, empty, denied or failed collection data,
  when the screen renders, then its existing distinct state remains usable.

## T02 location-owned report sections

- Given a scoped /reports URL, when Exceptions/Trends/Spend is activated,
  then exactly that section is visible and its link is current; project,
  organization and window query values remain.
- Given a direct valid fragment, when the page loads/reloads, then its named
  section appears. Given an unknown/malformed fragment, then recovery is
  visible without discarding scope or echoing the fragment.
- Given section/window transitions, when Back/Forward runs, then location,
  selection and controls restore together.
- Given a named report view is applied while in Spend or Trends, then its
  window/project apply with the current section preserved.
- Given keyboard activation of a section link, then focus reaches the current
  page heading. Given initial load or a window-only change, then focus is
  not stolen from the current control.
- Given one report read is loading/denied/failed, when another section is
  selected, then independent content and navigation remain available.
- Given a CFD task-type choice, when leaving and returning to Trends in the
  current screen, then the local choice remains.

## T03 observable presentation and data alternatives

- Given a375px viewport, when report controls render, then navigation, time
  window and saved-view targets measure at least44 by44 CSS pixels.
- Given320/375/768/1280px, both themes and200% text size, then titles and
  controls do not overlap, page overflow is absent and any wide table is
  intentionally contained with its values reachable.
- Given daily spend data, then assistive technology can read a table of each
  day's costs/tokens/report counts as well as the chart's period name.
- Given loading/empty/failed/denied/populated sections, then their stories
  visibly render before accessibility/geometry assertions run.
- Given retained synthetic captures, then the final review compares baseline
  and implementation and states limits. No participant success is inferred.

## Verification order

Run new behavioral regressions on baseline and retain actual red output,
then minimal fixes and affected suites. Existing-behavior tests that pass
first need an actual deliberate-break check. Pure role/prose/token config
uses the TDD exception rather than class-name assertions.

Run GUI coverage/types/design/Storybook, real browser journeys and the
repository gate. Record commands, counts, skips and unresolved concerns.
Final source and published tree must agree; no local result is inferred
from an unavailable executor.

## Rendered review regressions and publication

- Given375px and200% text, when Churning's action is visible, then actual title text ranges and the action rectangle do not intersect. Measure text ranges rather than only the heading's shrinkable layout box.
- Given enlarged report text, when the shared mobile shell renders, then branding/scope and utility groups wrap without losing actions or causing document overflow.
- Given a real newly created project and a hidden mobile scope caption with the same name, then the core journey confirms the project's heading inside main rather than the first matching text node.
- Given automatic approval rejection of repository screenshot copies, then retain the written source-run review and its existing limited-retention artifact reference; final code contains no new screenshot/base64 export mechanism and keeps every geometry assertion.
- Given this final three-task candidate, then its own combined-head checks must pass before merge; source07e4dbc evidence does not replace the candidate's verification.

- Given a new report window is already committed to browser history while the section link still belongs to the preceding router render, when the section is activated immediately, then the live window, scope and unrelated parameters survive. The deterministic history-gap unit case and existing rapid real-browser90-day activation must both pass without adding a wait that hides the race.
