# Test plan — M51

## Responsive workbench

- Given a real seeded task at 375px, when its detail opens, then its title and description have usable visible space, content can scroll to the comment composer, and status/priority/relations remain reachable without clipping.
- Given Tasks at 768px and 1024px, when all filters render, then the heading retains a readable width and the entire filter group remains within the content area.
- Given a scoped task link, when closed and followed by browser Back, then scope persists and the task reopens.

## Navigation

- Given a daily-work route, when navigation renders, then daily activity groups precede administration and all routes remain accessible through links or a clearly named settings disclosure.
- Given a settings deep link, when loaded, then settings navigation is expanded and the destination has the active indication.
- Given a mobile scoped screen, when the drawer is closed, then the current project remains visible; opening the drawer, following a scoped link and pressing Escape preserve existing dismissal/focus behavior.

## Visual semantics

- Given default and custom task states, when shown in table/board, then state text remains visible and default state roles are consistent; unknown custom states use a neutral fallback.
- Given representative pages in light and dark themes, when captured, then shared type hierarchy and distinct surfaces render with no contrast-gate findings or console errors.

## Empty and populated screens

- Given no workflows or schedules, when opened, then one coherent empty introduction and one primary creation action render, without an empty detail placeholder beside it.
- Given a loading or failed list, when opened, then loading and error/retry remain distinct from a true empty state.
- Given a selected schedule at 375px, when its detail renders, then title/description retain usable width and actions remain reachable below them.
- Given an optional task section with no data, when expanded, then its existing empty guidance and actions are reachable; populated sections remain exposed by default.
- Given more report exceptions than the preview limit, when initially rendered, then only the preview is shown and a count-bearing expansion exposes all rows; collapse restores the preview.
- Given empty dashboard summaries alongside populated activity, when rendered, then empty summaries use less space without hiding their labels or actions.

- Given a signed-in account at a narrow width, when the visible account name is hidden, then assistive technology can identify the account through a valid named group.

## Regression and review

- Given the completed UI changes, when GUI coverage, typecheck, design lint, browser journeys and local workspace gates run, then all required checks pass; service-dependent skips and cached tasks are reported accurately.
