# Protocol: Work Ledger Resolution

Every SDD artifact — epic, test plan, architecture, review, milestone — has its
storage location declared in `.specs/product/work-ledger.yml`, never hardcoded.
The ledger also decides whether an artifact lives in git or in an external
tracker (Jira, Linear, Confluence).

## Rules

- MUST read `.specs/product/work-ledger.yml` before reading or writing any artifact.
- MUST exit immediately with `Please define workflow: Run /work-ledger-define`
  if that file is missing. Do not guess a path.
- MUST resolve the path from the ledger's `<type>.config.project_files.path` and
  `name_template`, substituting `{epic_id}`, `{4_digit_id}`, `{kebab_title}`.
- For versioned artifacts (`...-v{N}.md`), MUST scan the target directory for the
  highest existing `N` and write `N+1`. Never overwrite a review.
- If `<type>.type` is not `project_files`, MUST use the configured external
  system instead of writing a file, and report which system was used.

## Types currently declared

`milestones`, `epics`, `test_plan`, `architecture_design`, `ux_design`, `reviews`.

`reviews` carries a `name_templates` map keyed by review kind: `architecture`,
`ux`, `qa_plan`, `qa_implement`, `architecture_code`, `security`, `code`.
