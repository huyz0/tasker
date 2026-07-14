// Single source of truth for the backend's base URL, imported by
// connectTransport.ts, authSession.ts, and errorReporter.ts - kept in its
// own module (rather than living in connectTransport.ts) so errorReporter.ts
// can import it without creating a circular dependency
// (connectTransport -> errorReporter -> connectTransport).
export const BACKEND_URL = "http://localhost:8080";
