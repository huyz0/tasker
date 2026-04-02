# Architecture
- **Repository/Service Pattern**: Logic for database interaction should reside in dedicated services, data access layers, or handler scopes. Business logic should not be indiscriminately intermingled with raw low-level ORM calls if possible.
- **Side effects**: Make sure operations like publishing Domain Events via NATS only happen *after* successful database commits to avoid phantom events being fired.
- **Mock Interfaces**: Interfaces must not rely on returning hardcoded mock data for primary business logic unless explicitly labeled as a dev mock strategy.
