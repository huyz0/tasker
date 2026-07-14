// RFC 7807 ("Problem Details for HTTP APIs") response helper for the
// backend's plain HTTP routes (auth.ts, telemetry.ts) - NOT for ConnectRPC
// endpoints, which already have their own standardized error envelope
// (ConnectError/Code) that every generated client understands; replacing
// that wire format here would break every RPC client, not standardize it.
// Only applies to routes meant to be consumed programmatically (fetch/JS),
// not the OAuth browser-navigation endpoints, which intentionally return
// human-readable text since a browser renders the body directly on error.
export function problemDetails(status: number, title: string, detail?: string): Response {
  return new Response(
    JSON.stringify({ type: 'about:blank', title, status, ...(detail ? { detail } : {}) }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}
