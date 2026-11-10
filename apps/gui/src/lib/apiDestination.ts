/** One trusted deployment destination for RPC, sessions, diagnostics and workers. */
export function resolveBackendUrl(configured: string | undefined, development: boolean, documentOrigin: string): string {
  const value = configured ?? (development ? 'http://localhost:8080' : documentOrigin);
  try {
    if (!/^https?:\/\//i.test(value) || value.includes('?') || value.includes('#')) throw new Error();
    const url = new URL(value);
    if (url.username || url.password || !url.hostname) throw new Error();
    return url.href.replace(/\/+$/, '');
  } catch {
    // Never reflect deployment credentials or query parameters into diagnostics.
    throw new Error('Invalid Tasker API configuration.');
  }
}
