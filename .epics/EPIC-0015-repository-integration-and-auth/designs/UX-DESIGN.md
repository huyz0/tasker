---
epic: EPIC-0015
title: "UX Design — Repository Integration and Auth"
status: draft
created_at: 2026-04-23
---

# UX Design — Repository Integration and Auth

## User Personas
- **Project Manager**: Needs to link the development tracking taking place in Tasker to the underlying repository logic where code is executed.
- **Developer/Agent**: Needs immediate visual feedback inside the Task detailed view to know if a related code Pull Request has passed checks or has been merged, negating the need to open external tabs.

## User Flows

### Flow 1: Linking a Repository to a Project
1. User navigates to the **Project Settings** dashboard.
2. User clicks on the **"Integrations"** tab.
3. User selects "Add Repository Link" from a dropdown (`GitHub` or `Bitbucket Cloud`).
4. User clicks "Connect". This opens an external OAuth authorization popup (e.g., GitHub App Authorization).
5. Upon successful authorization, the popup pushes the token back and closes.
6. The Tasker UI refreshes the Integration list showing the connected Provider and a dropdown of available Repositories the user has access to.
7. User selects a specific Repository (e.g., `TaskerOrg/tasker-gui`) to sync and clicks "Link".
8. The screen shows a success toast and lists the active link.

### Flow 2: Viewing Task with PR Badges
1. User navigates to the **Task Board** and selects a task (e.g., "Implement Login Screen").
2. The **Task Details Sheet** opens.
3. Inside the side panel (under "Labels" and "Assignees"), a new section is visible: **"Pull Requests"**.
4. If a PR exists for that task (i.e. PR `#125` implies `Task-125`), it displays a rich visual badge:
   - Green with check icon for `Merged`
   - Purple for `Draft`
   - Green dot for `Open`
   - Red for `Closed/Declined`
5. Clicking the badge opens the PR in the external provider in a new tab.

## Interface Mockups (Descriptions)
- **Integrations Tab**: Standard Shadcn `TabsContent`. Consists of a responsive data grid for existing repository links. A standard `Button` triggers the OAuth flow.
- **PR Badge Component**: A compact Shadcn `Badge` variant injected into the right rail of the Task Workbench. It uses Lucide React icons matching the semantic meaning of the Git status.

## Error Handling & Feedback
- If OAuth fails (user rejects authorization), a destructive toast Notification informs the user they canceled the flow.
- If the token expires or is revoked, the sync job will throw a 401. The UI will prominently display a warning icon on the Project Integrations view stating: `"Integration broken: Re-authentication required."`
