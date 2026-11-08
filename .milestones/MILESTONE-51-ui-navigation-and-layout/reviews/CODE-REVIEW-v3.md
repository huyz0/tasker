---
timestamp: 2026-11-08T22:26:00Z
decision: approved
---

# Activity navigation review — M51-T03

## Correctness

All seventeen destinations retain their URLs and scoped links. Work, Agents, Knowledge, Automation and Insights precede a named settings disclosure; deep links automatically expose their settings destination. Current links have aria-current. Three navigation assertions failed before implementation and pass afterwards. An additional failing assertion caught spaces in the settings group's aria-labelledby target; the IDs are now valid and the group is named. Source review established that `/settings` contains account controls as well as health, so its link reads Account & system.

## Coverage

The focused App/AppShell suite passes 39 tests. Two new real-browser scenarios verify mobile project context, scoped route changes, drawer dismissal and settings deep-link reload. Eight existing addressable/audit/webhook journeys pass through the new disclosure. Existing dashboard/navigation/layout journeys pass nineteen scenarios. Component routing fixtures now follow the explicit disclosure, and lazy route assertions retain bounded waits under coverage. Project-name RPC fixtures are registered; broker status is isolated in routing/focus tests because its lifecycle has separate coverage. Full workspace verification is recorded in the journal before closure.

## Architecture

Navigation groups are data; existing React Router links and useScopeLabels provide routing and cached human-readable project context. No new store, browser persistence or route alias is introduced. Settings expansion remains transient. Storybook describes the revised shell.

## Security

Grouping only changes discovery. The server remains authoritative for permission checks, and the interface does not invent a visibility rule that might imply authorization. No tenant identifiers are replaced or dropped. No external messages, accounts or services were modified.

```yaml
findings: []
```
