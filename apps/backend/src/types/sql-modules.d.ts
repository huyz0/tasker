/**
 * `*.sql` imported with Bun's `{ type: 'file' }` attribute (M26-T05).
 *
 * `src/db/embeddedMigrations.generated.ts` imports every migration this way —
 * the attribute makes Bun hand back the file's *path* rather than inlining it,
 * which is what lets the same code read migrations from disk when run from
 * source and from `/$bunfs/` inside the compiled binary (M09-T01 found that
 * `{ type: 'text' }` looks equivalent and is not).
 *
 * `tsc` knows nothing about that attribute, so without this declaration each
 * of those imports is a `TS2307: Cannot find module`. That was 83 of the 130
 * errors standing between this project and a backend typecheck gate — not
 * type debt at all, just a Bun-ism the compiler cannot see.
 */
declare module '*.sql' {
  /** The resolved path, as `Bun.file` accepts it. */
  const path: string;
  export default path;
}
