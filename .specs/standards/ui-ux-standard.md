# UI/UX Standards

This document outlines the design standard for the project, aimed at ensuring an accessible, consistent, and beautiful user experience across all interfaces.

## 1. Design Tokens & System
- **Rule**: Never use hardcoded colors or ad-hoc pixel values (e.g., `style={{ color: '#123456' }}`).
- **Action**: Strictly use the established **Tailwind CSS** utility classes mapping directly to our predefined design tokens (e.g., `text-primary`, `bg-background`, `spacing-4`).
- **Components**: Rely exclusively on our standardized UI library (e.g., **Shadcn UI**). If a component doesn't exist, create it following the library's internal composition rules.

## 2. Accessibility (a11y)
- **Minimum Target**: WCAG 2.1 AA compliance.
- **Form Controls**: Every input field must have an associated, clearly defined label (no exceptions). Use `aria-describedby` for error states.
- **Keyboard Navigation**: The entire application must be perfectly usable via a keyboard. Ensure focus rings are visible and logical tab order is maintained. Do not suppress focus outlines without providing a customized alternative (e.g., `focus-visible:ring-2`).
- **Color Contrast**: Any text against a background must have a minimum contrast ratio of 4.5:1 (or 3:1 for large text).

## 3. Responsive Design
- **Mobile-First Paradigm**: Design for the smallest screen (e.g., modern mobile device widths around `320px-375px`) before scaling up using Tailwind breakpoints (`sm:`, `md:`, `lg:`).
- **No Overflowing Content**: Ensure horizontal scrolling does not occur on constrained screen widths unless it is explicitly intended within a particular component (e.g., a data table wrapper).

## 4. Micro-interactions & Polish
- **Hover & Active States**: All interactive elements (buttons, links, row items) must have distinct `hover:`, `focus:`, and `active:` states.
- **Smooth Transitions**: Utilize Tailwind’s transition utilities (`transition-all duration-200 ease-in-out`) to avoid jarring visual jumps during state changes.
- **Loading & Error Flows**: Prevent layout shifts during loading by providing consistent Skeleton screens. Avoid blank "dead ends" on errors by always offering a recovery path (e.g., a "Retry" button).

## 5. Visual Hierarchy & Spacing
- **Typography Matrix**: Maintain a clear scaling system for typography (`h1` through `h6`, `body`, `small`) corresponding to specific classes.
- **Consistent Proximity**: Adhere to Gestalt principles. Group logically related items closer together and provide distinct padding/margins between separate sections.
