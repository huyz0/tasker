// Several list views need every page of a cursor-paginated RPC, not just the
// first - looping until the server reports no more pages. This was
// copy-pasted per-feature; centralize it here so the loop (and its error
// behavior) is defined once.
export async function fetchAllPages<TItem>(
  fetchPage: (cursor: string | undefined) => Promise<{ items: TItem[]; nextCursor: string | undefined }>
): Promise<TItem[]> {
  const all: TItem[] = [];
  let cursor: string | undefined;
  do {
    // Intentionally not caught: a rejected page fetch should propagate to
    // the caller (e.g. react-query's onError), not spin forever.
    const { items, nextCursor } = await fetchPage(cursor);
    all.push(...items);
    cursor = nextCursor;
  } while (cursor);
  return all;
}
