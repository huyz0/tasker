# UX Design: Authentication & Organization Management (EPIC-0004)

## Core Flows

### Flow 1: New User Seed Registration
1. User lands on `https://tasker.local/login`.
2. Screen: Minimal centered login card with Tasker logo and a "Continue with Google" button.
3. User clicks and authenticates via Google.
4. User returns to `/verify` which seamlessly checks DB status.
5. If no Organizations exist (Seed Admin flow), the user is redirected to `/setup-organization`.
   - Form: "Name your Workspace" (e.g. "Acme Corp").
6. Submitting creates the Org, assigns Admin role, and redirects to `/dashboard`.

### Flow 2: Invited User Login
1. User clicks an email invite link to `https://tasker.local/invite?code=1234`.
2. Caching the invite code in memory, the user clicks "Continue with Google".
3. After Google Auth, backend consumes the invite code.
4. User is added to the Organization with `role: member` and redirected to `/dashboard`.

### Flow 3: Organization Context Switcher
1. Once logged in, the user sees a "Workspace Switcher" dropdown in the top-left navigation rail (standard Shadcn pattern).
2. The dropdown lists all orgs the user is a member of.
3. Clicking an org changes the global React `<OrganizationContext>` and re-fetches data using standard TanStack Query mechanisms, re-rendering the layout.

## Wireframes / ASCII

```
[ Login Screen ]
+--------------------------------------------------+
|                                                  |
|                   [ Tasker ]                     |
|                                                  |
|         Welcome to autonomous tasking            |
|                                                  |
|       +----------------------------------+       |
|       |  (G) Continue with Google        |       |
|       +----------------------------------+       |
|                                                  |
+--------------------------------------------------+

[ Setup Org Screen ]
+--------------------------------------------------+
|                                                  |
|             Create your Workspace                |
|                                                  |
|   Workspace Name                                 |
|   [ Acme Corp .............................. ]   |
|                                                  |
|   [ Create Workspace ]                           |
+--------------------------------------------------+
```

## CLI Agent UX (Go)

```bash
$ tasker login
Please open this URL to authenticate:
https://accounts.google.com/o/oauth2/v2/auth?...
Waiting for callback on localhost:3952... ⏳
Success! Logged in as: user@example.com (Org: Acme Corp)
```

## Styling
- Will use standard Shadcn UI components: `Button`, `Card`, `Input`, `DropdownMenu` (for workspace switcher).
- Light/Dark mode reactive.

## Frontend Engineering Standard Adherence
- Enforces React composition (`<Layout><Nav /><Main /></Layout>`).
- Utilizes `<Suspense>` and `useTransition()` for loading states during org switching to avoid heavy third-party animation libraries.
