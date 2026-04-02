# Code Review Standards Index

When analyzing code for a review, evaluate the target files and use `view_file` to branch into the specific references below based on the codebase stack and the types of changes being reviewed. Do not load everything at once; use progressive disclosure to read ONLY the specific standard domains that are relevant.

## 1. Agentic Review Principles (Universal)
Based on the review focus (or automatically based on the complexity of the diff), use `view_file` to load the relevant evaluation principles:
- **Security Context:** `.agents/skills/code-review-auto/references/code-review-principles/security-review.md`
- **Logic & Execution Context:** `.agents/skills/code-review-auto/references/code-review-principles/logic-and-edge-cases.md`
- **Performance Context:** `.agents/skills/code-review-auto/references/code-review-principles/performance-and-scale.md`
- **Quality & Communication (Always Load):** `.agents/skills/code-review-auto/references/code-review-principles/agentic-quality.md`

## 2. Tech-Stack Specific References

### Frontend (React / Next.js)
If the modified code involves UI components, frontend hooks, or React rendering:
- Use `view_file` to read `.agents/skills/code-review-auto/references/react/INDEX.md`.

### Backend (TypeScript / Node.js / Drizzle ORM)
If the modified code involves API services, routing, database ORM logic, or server-side background processors:
- Use `view_file` to read `.agents/skills/code-review-auto/references/backend-typescript/INDEX.md`.

### Backend (Golang)
If the modified code involves Go services, goroutines, or backend Go logic:
- Use `view_file` to read `.agents/skills/code-review-auto/references/golang/INDEX.md`.
