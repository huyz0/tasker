# UX Design Review Heuristics (Pro Max)

When reviewing UX designs autonomously, you MUST check the mockups and design flows against these strict heuristics. Do not approve designs that fail these checks.

## 1. Accessibility (WCAG 2.1 AA) Check
*   **Contrast Ratio**: Does normal text meet a minimum 4.5:1 contrast against its background? Ensure large text meets 3:1.
*   **Use of Color (AccessLint)**: Are there any links, errors, or states denoted *solely* by color? If so, this is a failure. There must be an independent visual indicator (e.g., underline for links, icon for errors).
*   **Keyboard Focus**: Are focus states explicitly designed and visible in the States specs?

## 2. Agentic Trust & Transparency
*   **Clear Thought Logs**: If an AI agent feature is present, does the design show *how* the AI's reasoning is displayed to the user?
*   **Manual Overrides / Failsafes**: Is there a clear path for the user to manually edit, reject, or undo the AI's action?
*   **Feedback Loops**: Can the user provide explicit feedback (e.g., thumbs up/down, correct text) on AI-generated outputs?

## 3. UI Implementation readiness (Vercel Guidelines)
*   **No Boolean Prop Proliferation**: Does the design implicitly require components to take 10+ boolean props? Flag this and demand Compound Component structures (e.g., `Select.Trigger`).
*   **Performance via Pagination/Suspense**: Do long lists account for pagination, infinite scroll logic, or skeletons to `Eliminate Waterfalls`?

## 4. Visual Execution
*   **Eliminate "AI Slop"**: Does the design look generic (standard purple gradient, bare formatting)? Enforce bold, distinctive aesthetic choices appropriate to the industry.
*   **Consistent Motion Planning**: Are interaction timings defined (e.g., <100ms for immediate feedback)?

Review the `UX-DESIGN.md` against these points and list all passes, violations, and mandatory remediation steps.
