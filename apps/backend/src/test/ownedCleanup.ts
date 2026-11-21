// Test-first scaffold: the observable cleanup regressions must fail before implementation.
export async function settleOwnedCleanup(_steps: ReadonlyArray<() => void | Promise<void>>, _restore: () => void): Promise<unknown[]> {
  return [];
}
