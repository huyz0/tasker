# Layout Manifest

This document specifies the standard macro-layouts for the application to prevent layout drift among new pages and features.

## 1. Application Shell Layout (`AppShell`)

The default authenticated or primary application interface.

- **Location**: `apps/gui/src/App.tsx` (Top-level router wrapping).
- **Structure**:
  - **Sidebar (Left)**: Fixed width (`w-sidebar`), sticky at viewport height on desktop (`md:sticky md:top-0 md:h-dvh`) so navigation and the account footer never scroll away with a long page. Collapsible on mobile via a Hamburger menu. The theme toggle lives in its footer at every width.
  - **Header (Top - Mobile Only)**: Fixed `h-14` header replacing the sidebar on mobile (`< md`), containing logo and toggle.
  - **Main Content Area**: The `<main id="main">` tag, target of the skip link. Fluid width taking up the remainder of the screen.
  - **Master–detail views** use a breakpoint based on the remaining content width after the application sidebar. Automation lists and editors split at `lg`; below it the collection or selected detail owns the full width. A genuinely empty collection has one introduction and creation action, not a second choose-detail prompt. Selected read-only views provide an All workflows/schedules link; edit/create views retain their explicit Cancel action.

### Layout Padding and Containers

- The `main` area should have padding: `p-4 md:p-8 lg:p-12`.
- Content inside `main` does NOT need to be strictly centered with `max-w` unless it is a reading-heavy or form-focused flow. Data tables should expand full-width inside the `main` container.

## 2. Setting Up New Views

When creating a new route/view (e.g., `apps/gui/src/pages/NewFeature.tsx`):

1. Assume the view is mounted *inside* the AppShell's `main` content area.
2. The root of the View should be a `div` containing a Header/Title block and the main interactive content.
3. Example View Skeleton:

```tsx
export function ExampleRoute() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Feature title"
        description="What this screen is for, in one plain sentence."
        actions={<Button>Create thing</Button>}
      />

      {/* Feature Content */}
      <div className="p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
         Content goes here…
      </div>
    </div>
  )
}
```

## 3. Responsive Breakpoints Focus

- Always design for `md:` (768px - Tablet) and `lg:` (1024px - Desktop).
- The default state (`className="..."`) without prefixes applies to mobile (`< 768px`). Ensure mobile involves stacked layouts (`flex-col`) instead of side-by-side (`flex-row`).

## 4. Workbench headers and automation states

PageHeader primary actions sit with the title; growing filters and view controls use its separate `toolbar` slot. The toolbar wraps independently at intermediate widths, so the title never collapses to make room for controls.

Automation screens use ListState's `emptyTitle`, description and creation action for an empty collection. Loading and failed/denied reads keep their own state and Retry action instead of pretending that the collection is empty. Existing selected-item routes remain addressable, and collection items are links supporting normal browser navigation. Creation forms avoid a second narrow list column below `lg`.

Automation screen stories use their own MemoryRouter and deterministic public query-cache fixtures through `parameters.router: false`. The default Storybook decorator still supplies routing for existing primitive stories. Fixture scopes are synthetic, and no credentials or backend writes are required to render empty, loading, denied, populated and create states.
