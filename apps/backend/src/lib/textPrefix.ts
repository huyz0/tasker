import { sql, type SQLWrapper } from 'drizzle-orm';

/** Binary substring preserves embedded NUL and bounds bytes before decoding. */
export function contentPrefixSql(column: SQLWrapper, standalone: boolean, maximum: number) {
  const bytes = 4 * (maximum + 1);
  return standalone
    ? sql<Uint8Array>`substr(cast(coalesce(${column}, '') as blob), 1, ${bytes})`
    : sql<Uint8Array>`substring(cast(coalesce(${column}, '') as binary), 1, ${bytes})`;
}

export function decodeContentPrefix(prefix: Uint8Array | null, maximum: number) {
  // stream:true omits an incomplete trailing point. The SQL budget contains
  // enough bytes for maximum+1 complete points whenever that many exist.
  const decoded = new TextDecoder('utf-8', { ignoreBOM: true }).decode(prefix ?? new Uint8Array(), { stream: true });
  return Array.from(decoded).slice(0, maximum).join('');
}

