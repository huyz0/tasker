/** Finish every owned teardown and restore ambient test state even after failures. */
export async function settleOwnedCleanup(steps: ReadonlyArray<() => void | Promise<void>>, restore: () => void): Promise<unknown[]> {
  const failures: unknown[] = [];
  try {
    for (const step of steps) {
      try { await step(); } catch (error) { failures.push(error); }
    }
  } finally {
    try { restore(); } catch (error) { failures.push(error); }
  }
  return failures;
}
