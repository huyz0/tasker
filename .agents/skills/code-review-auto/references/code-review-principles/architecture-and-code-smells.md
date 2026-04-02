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
- **Duplicated Code:** Flag exact or near-identical blocks of logic copied across multiple files. Recommend abstracting them into a shared utility or service.
- **Deep Nesting:** Flag code with numerous nested `if/for/while` statements (Arrow Anti-Pattern). Suggest early returns, guard clauses, or extracting deeper loops into separate functions to improve cyclomatic complexity.

## Evaluation Guidelines
When flagging a smell, always prioritize assessing its severity based on:
1. Does it hinder immediate testability?
2. Will it trap future developers into making cascading changes?
3. Is it in a highly active/churned area of the codebase?

Provide actionable refactoring advice (e.g. suggesting specific design patterns like Facade, Strategy, or Dependency Injection) rather than just pointing out the smell.
