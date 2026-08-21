/**
 * Serving the GUI out of the binary (M09-T02, M09-T03).
 *
 * The bundle is a path → base64 manifest produced by `scripts/bundle-gui.ts`
 * and carried in by `bun build --compile`. Decoded once at startup: the whole
 * GUI is under two megabytes, and paying it per request to save that would be
 * a strange trade.
 *
 * Everything here is a pure function of the manifest so the routing rules —
 * which are the part that goes wrong — are testable without a socket, a build,
 * or a browser.
 */

export interface StaticAsset {
  body: Uint8Array;
  contentType: string;
  cacheControl: string;
}

/**
 * Extension → content type.
 *
 * Deliberately a fixed table rather than a lookup library: this serves exactly
 * one bundle, produced by one build, and the set of things Vite emits is
 * known. An unknown extension gets `application/octet-stream`, which a browser
 * downloads rather than executes — the safe direction for something we did not
 * expect to be serving.
 */
const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  wasm: 'application/wasm',
};

export function contentTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Vite fingerprints everything under `/assets/`, so those URLs are immutable
 * by construction — a changed file gets a new name. `index.html` is the
 * opposite: its whole job is to name the current fingerprints, and a cached
 * copy pointing at a previous deploy's chunks is a blank screen.
 */
export function cacheControlFor(path: string): string {
  if (path.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  return 'no-cache';
}

/** Paths the SPA must never swallow — they belong to the server. */
const SERVER_PREFIXES = ['/tasker.', '/api/', '/healthz', '/readyz', '/metrics'];

export function isServerPath(pathname: string): boolean {
  return SERVER_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export class StaticSite {
  private readonly files: Map<string, Uint8Array>;

  constructor(manifest: Record<string, string>) {
    this.files = new Map(
      Object.entries(manifest).map(([path, base64]) => [path, Uint8Array.from(Buffer.from(base64, 'base64'))]),
    );
  }

  /** Whether a bundle was embedded at all. Empty in dev, where Vite serves the GUI. */
  get isEmpty(): boolean {
    return this.files.size === 0;
  }

  get fileCount(): number {
    return this.files.size;
  }

  /**
   * Resolves a request path to something to send, or null if the server should
   * handle it.
   *
   * The SPA fallback is the rule worth stating plainly: any GET that is not a
   * server path and does not name a real file gets `index.html`, because the
   * router in the browser owns those URLs. Without it, `/tasks/abc` typed into
   * the address bar is a 404 from a server that has never heard of that task,
   * even though the app renders it perfectly once loaded.
   *
   * A missing file *under* `/assets/` is a real 404 rather than a fallback:
   * those names are fingerprints, so a miss means a stale index or a broken
   * build, and answering with HTML would make a script tag fail on a syntax
   * error instead of a status code.
   */
  resolve(pathname: string): StaticAsset | null {
    if (this.isEmpty) return null;
    if (isServerPath(pathname)) return null;

    const direct = this.files.get(pathname === '/' ? '/index.html' : pathname);
    if (direct) {
      return {
        body: direct,
        contentType: contentTypeFor(pathname === '/' ? '/index.html' : pathname),
        cacheControl: cacheControlFor(pathname),
      };
    }

    if (pathname.startsWith('/assets/')) return null;

    const index = this.files.get('/index.html');
    if (!index) return null;
    return { body: index, contentType: CONTENT_TYPES.html!, cacheControl: 'no-cache' };
  }
}
