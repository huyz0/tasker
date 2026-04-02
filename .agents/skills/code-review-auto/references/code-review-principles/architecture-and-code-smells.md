# Architecture and Code Smells

When reviewing code, look beyond syntax and correctness to evaluate structural integrity and design health. Identify and flag code and architecture smells that increase technical debt and reduce maintainability.

## 1. Architectural Smells
These affect component interaction and system-wide design.

- **Circular Dependencies:** Flag instances where Component A depends on Component B, and Component B (directly or indirectly) depends on Component A. This creates tight coupling and makes isolated testing or reuse impossible. Recommend utilizing Dependency Inversion (interfaces) or extracting shared logic to break the cycle.
- **God Components / God Classes:** Identify modules, classes, or files that have accumulated too many responsibilities, violating the Single Responsibility Principle (SRP). These are often excessively long, interact with too many distinct domains, and are focal points for frequent merge conflicts. Recommend fragmenting them into smaller, cohesive units.
- **Leaky Abstractions:** Watch for encapsulation boundaries being broken, such as internal database concepts (e.g. ORM specific methods) leaking into external API response layers or UI components. 

## 2. Code Smells
These are implementation-level design flaws.

- **Long Methods/Functions:** Flag excessively long functions that try to accomplish multiple tasks. Suggest extracting logical blocks into smaller, clearly named helper functions.
- **Magic Numbers & Strings:** Hardcoded literal values scattered throughout the code should be flagged. Suggest moving them to named constants or configuration objects.
- **Deep Nesting:** Flag code with numerous nested `if/for/while` statements (Arrow Anti-Pattern). Suggest early returns, guard clauses, or extracting deeper loops into separate functions to improve cyclomatic complexity.

## 3. Code Duplication (DRY Violations)
Duplicated code is one of the highest-impact smells because it multiplies the cost of every future bug fix and change. Check for all four forms:

- **Exact Copies:** Identical or near-identical blocks of logic (≥5 lines) that appear in more than one file or function. Flag and recommend extracting them into a shared utility, helper, or service function.
- **Structural Clones:** Functions that differ only in a variable name, a type, or a minor constant but share the same algorithmic skeleton. Flag and recommend parameterization (function arguments, generics/type parameters) to unify the logic.
- **Copy-Paste Constants / Config:** The same magic string, numeric threshold, or configuration value repeated in multiple places instead of being defined once in a shared constants file or environment config. Flag and recommend a single source of truth.
- **Cross-Layer Duplication:** Validation, transformation, or mapping logic that is implemented independently in both the API layer and the service/domain layer (or in both frontend and backend). Flag and recommend pushing the logic to the authoritative layer and sharing it.

### Detection Heuristics
When scanning for duplication, apply these checks:
1. Search for repeated function bodies or expression patterns across files within the same module boundary.
2. Look for multiple functions whose names differ only by entity type (e.g. `mapUserToDto`, `mapProjectToDto`) where the body is structurally identical — a generic mapper or a higher-order function is usually appropriate.
3. Identify repeated `try/catch` patterns wrapping the same error-handling logic; extract into a shared error handler or decorator.
4. Flag test files that copy the same setup/teardown or assertion logic across describe blocks instead of using shared fixtures or helper factories.

## Evaluation Guidelines
When flagging a smell, always prioritize assessing its severity based on:
1. Does it hinder immediate testability?
2. Will it trap future developers into making cascading changes?
3. Is it in a highly active/churned area of the codebase?

Provide actionable refactoring advice (e.g. suggesting specific design patterns like Facade, Strategy, or Dependency Injection) rather than just pointing out the smell.
