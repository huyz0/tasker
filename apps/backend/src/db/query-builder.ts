import { SQL, and, lt, gt, or, eq, desc, asc, isNull, sql } from "drizzle-orm";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";

export type SortDirection = "asc" | "desc";

/**
 * value is the cursor's position in whichever column it's sorting by - a
 * timestamp (ms) for date columns, or the raw value for text columns like
 * name. field records which column that is, so a cursor from one sort can't
 * be silently misapplied to a request sorting by a different column.
 *
 * totalCount carries the filtered-set count computed on an earlier page
 * forward into the next page's cursor, so executePaginatedQuery can skip
 * re-running COUNT(*) on every page of the same list - only the first page
 * (or an older cursor minted before this field existed) needs to compute it
 * fresh. Optional so older in-flight cursors without it still decode fine
 * and just fall back to recomputing, same as before this existed.
 *
 * filter is stored alongside it so a cached totalCount is only reused when
 * the caller's filter hasn't changed since that count was computed -
 * otherwise a client that changes --filter mid-pagination while reusing an
 * old cursor would see a stale count for a completely different filtered set.
 */
export interface CursorData {
  value: number | string;
  id: string;
  field: string;
  totalCount?: number;
  filter?: string;
}

export function encodeCursor(value: number | string, id: string, field: string = "createdAt", totalCount?: number, filter?: string): string {
  if (value === undefined || value === null || value === "" || !id) return "";
  const data: CursorData = {
    value, id, field,
    ...(totalCount !== undefined ? { totalCount } : {}),
    ...(filter ? { filter } : {}),
  };
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

export function decodeCursor(cursor?: string): CursorData | null {
  if (!cursor) return null;
  try {
    const jsonStr = Buffer.from(cursor, "base64").toString("utf-8");
    const data = JSON.parse(jsonStr) as any;
    // Back-compat with the older {createdAt, id} cursor shape (pre-sort support).
    if (typeof data.createdAt === "number" && typeof data.id === "string") {
      return { value: data.createdAt, id: data.id, field: "createdAt" };
    }
    if ((typeof data.value === "number" || typeof data.value === "string") && typeof data.id === "string" && typeof data.field === "string") {
      return {
        value: data.value,
        id: data.id,
        field: data.field,
        ...(typeof data.totalCount === "number" ? { totalCount: data.totalCount } : {}),
        ...(typeof data.filter === "string" ? { filter: data.filter } : {}),
      };
    }
  } catch {
    // Ignore invalid cursors
  }
  return null;
}

/**
 * Builds the "give me everything after this cursor" WHERE clause for a
 * column sorted in the given direction, breaking ties on id in the same
 * direction. A cursor whose field doesn't match sortField is treated as
 * absent - it belongs to a different sort and can't be reused (e.g. the
 * caller changed --sort between page requests).
 */
function buildCursorPaginationWhere(
  cursor: CursorData | null,
  sortCol: SQLiteColumn,
  idCol: SQLiteColumn,
  sortField: string = "createdAt",
  direction: SortDirection = "desc",
): SQL | undefined {
  if (!cursor || cursor.field !== sortField) return undefined;
  const op = direction === "desc" ? lt : gt;
  const value = typeof cursor.value === "number" ? new Date(cursor.value) : cursor.value;
  return or(
    op(sortCol, value as any),
    and(
      eq(sortCol, value as any),
      op(idCol, cursor.id),
    ),
  );
}

function buildPaginationOrderBy(
  sortCol: SQLiteColumn,
  idCol: SQLiteColumn,
  direction: SortDirection = "desc",
) {
  return direction === "desc" ? [desc(sortCol), desc(idCol)] : [asc(sortCol), asc(idCol)];
}

export function notDeleted(table: any): SQL {
  return isNull(table.deletedAt);
}

export async function softDeleteById(db: any, table: any, id: string): Promise<void> {
  await db.update(table).set({ deletedAt: new Date() }).where(eq(table.id, id));
}

export async function restoreById(db: any, table: any, id: string): Promise<void> {
  await db.update(table).set({ deletedAt: null }).where(eq(table.id, id));
}

export async function insertRecord(
  db: any,
  table: any,
  payload: Record<string, unknown>,
  isStandalone: boolean,
  withTimestamp: boolean | string = true
) {
  if (isStandalone && withTimestamp) {
    const field = typeof withTimestamp === 'string' ? withTimestamp : 'createdAt';
    await db.insert(table).values({ ...payload, [field]: new Date() });
  } else {
    await db.insert(table).values(payload);
  }
}

// Escapes LIKE's special characters (\, %, _) in caller-supplied filter text
// so a filter for e.g. "100%" or "foo_bar" matches those literal characters
// instead of "%"/"_" acting as SQL wildcards and matching unrelated rows.
function escapeLikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Applies pageOpts.filter as a case-sensitive substring match against
 * filterColumn, combining it with an existing base condition. filterColumn is
 * optional because not every entity has an obvious free-text column to filter
 * on, and may be an array - the member list searches name OR email, and a
 * person looking for a colleague does not know or care which one they typed.
 */
function applyFilter(baseCondition: SQL | undefined, filterColumn: any, filterValue: string | undefined): SQL | undefined {
  if (!filterValue || !filterColumn) return baseCondition;
  const columns = Array.isArray(filterColumn) ? filterColumn : [filterColumn];
  if (columns.length === 0) return baseCondition;
  const pattern = `%${escapeLikePattern(filterValue)}%`;
  const clauses = columns.map((column) => sql`${column} LIKE ${pattern} ESCAPE '\\'`);
  const filterClause = clauses.length === 1 ? clauses[0]! : or(...clauses)!;
  return baseCondition ? and(baseCondition, filterClause) : filterClause;
}

export interface ParsedSort {
  field: string;
  column: any;
  direction: SortDirection;
}

/**
 * Parses a "field" or "field:asc"/"field:desc" sort string against a whitelist
 * of sortable columns (field name -> column). Returns null when sortValue is
 * empty or doesn't match a whitelisted field, so callers can fall back to the
 * default createdAt/id ordering.
 */
function parseSort(sortableColumns: Record<string, any> | undefined, sortValue: string | undefined): ParsedSort | null {
  if (!sortValue || !sortableColumns) return null;
  const [field, direction] = sortValue.split(":");
  const column = field ? sortableColumns[field] : undefined;
  if (!column || !field) return null;
  return { field, column, direction: direction === "desc" ? "desc" : "asc" };
}

/**
 * Reads a cursor's sort-column value back off a result row for re-encoding
 * into the next page's cursor. Dates are stored as epoch ms; everything else
 * (e.g. a name column) is used as-is.
 */
function extractCursorValue(row: any, field: string): number | string {
  const raw = row[field];
  return raw instanceof Date ? raw.getTime() : raw;
}

/**
 * Shape options for endpoints whose rows are not simply `SELECT * FROM table`.
 *
 * These exist so a joined list can still use this function rather than growing
 * its own cursor implementation. Two cursor encoders that drift apart produce
 * cursors that decode to the wrong page, which is the kind of bug nobody sees
 * until a user reports skipped rows.
 */
export interface PaginatedQueryOptions {
  /** Free-text filter target. A single column, or several OR'd together. */
  filterColumn?: any;
  /** Whitelist of `field -> column` the caller's `sort` may name. */
  sortableColumns?: Record<string, any>;
  /**
   * The columns this list returns. **Required**, and required on purpose.
   *
   * When this was optional, omitting it meant `SELECT *`, and `SELECT *` on
   * `artifacts` returns the base64 `content` of every row: listing a folder of
   * 50 images transferred **2,008 KB** to render 50 file names (M07-T01). The
   * defect is not that someone chose the wrong columns — it is that choosing
   * was optional, so the default grew as the table grew.
   *
   * Making it a required property means a new list handler does not compile
   * until it names its columns, and a large column added to an existing table
   * cannot leak into a response that never asked for it.
   */
  select: Record<string, any>;
  /** A single inner join applied to both the page query and the count. */
  join?: { table: any; on: SQL };
  /** Tiebreak column, when the table has no `id` (e.g. a composite key). */
  idColumn?: any;
  /** Key on the result row holding that id, when `select` renames it. */
  idField?: string;
  /**
   * Default ordering when the caller sends no sort. Needed for any table
   * without a `createdAt` - `organization_members` records `joinedAt`, and
   * defaulting to a column that does not exist produced "no such column: desc"
   * as drizzle interpolated an undefined column into the ORDER BY.
   */
  defaultSort?: { field: string; column: any };
}

export async function executePaginatedQuery(
  db: any,
  table: any,
  baseCondition: SQL | undefined,
  pageOpts: any,
  opts: PaginatedQueryOptions,
) {
  const { filterColumn, sortableColumns, select, join, defaultSort } = opts;
  const limit = Math.min(Math.max(pageOpts?.limit || 50, 1), 100);
  const condition = applyFilter(baseCondition, filterColumn, pageOpts?.filter);

  const sort = parseSort(sortableColumns, pageOpts?.sort);
  const sortField = sort?.field ?? defaultSort?.field ?? "createdAt";
  const sortCol = sort?.column ?? defaultSort?.column ?? table.createdAt;
  const direction: SortDirection = sort?.direction ?? "desc";

  const idColumn = opts.idColumn ?? table.id;
  const idField = opts.idField ?? "id";

  const cursorData = decodeCursor(pageOpts?.cursor);
  const whereClause = buildCursorPaginationWhere(cursorData, sortCol, idColumn, sortField, direction);
  const finalWhere = whereClause ? (condition ? and(condition, whereClause) : whereClause) : condition;

  // totalCount reflects the filtered set (base condition + filter), not the
  // current page - it must ignore the cursor's WHERE clause, since "how many
  // results total" shouldn't change as the caller pages through them.
  //
  // A COUNT(*) on every page of the same list doubles the DB work of every
  // list call for no reason once page 1's count is known - reuse the count
  // carried forward in the cursor instead of recomputing it, as long as the
  // filter hasn't changed since that count was computed (an older cursor
  // minted before this existed, or one whose filter doesn't match the
  // current request, still recomputes fresh, same as before this existed).
  const currentFilter = pageOpts?.filter || undefined;
  const canReuseCursorCount = cursorData?.totalCount !== undefined && cursorData.filter === currentFilter;

  // The join is applied to the count as well as the page. It has to be: the
  // filter may reference a joined column, and counting without the join would
  // report a total the caller can never page to.
  const withJoin = (q: any) => (join ? q.innerJoin(join.table, join.on) : q);

  const [result, totalCount] = await Promise.all([
    withJoin(db.select(select).from(table))
      .where(finalWhere)
      .limit(limit)
      .orderBy(...buildPaginationOrderBy(sortCol, idColumn, direction)),
    canReuseCursorCount
      ? Promise.resolve(cursorData!.totalCount!)
      : withJoin(db.select({ count: sql<number>`count(*)` }).from(table))
          .where(condition)
          .then((rows: any[]) => Number(rows[0]?.count ?? 0)),
  ]);

  const lastItem = result[result.length - 1];
  const nextCursor = lastItem && result.length === limit
    ? encodeCursor(extractCursorValue(lastItem, sortField), lastItem[idField], sortField, totalCount, currentFilter)
    : undefined;

  return { items: result, nextCursor, totalCount };
}
