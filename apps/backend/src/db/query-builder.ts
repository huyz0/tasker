import { SQL, and, lt, gt, or, eq, desc, asc, isNull, sql } from "drizzle-orm";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

export type SortDirection = "asc" | "desc";

/**
 * value is the cursor's position in whichever column it's sorting by - a
 * timestamp (ms) for date columns, or the raw value for text columns like
 * name. field records which column that is, so a cursor from one sort can't
 * be silently misapplied to a request sorting by a different column.
 */
export interface CursorData {
  value: number | string;
  id: string;
  field: string;
}

export function encodeCursor(value: number | string, id: string, field: string = "createdAt"): string {
  if (value === undefined || value === null || value === "" || !id) return "";
  const data: CursorData = { value, id, field };
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
      return data;
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
export function buildCursorPaginationWhere(
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

export function buildPaginationOrderBy(
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
 * Applies pageOpts.filter as a case-sensitive substring match against filterColumn,
 * combining it with an existing base condition. filterColumn is optional because
 * not every entity has an obvious free-text column to filter on.
 */
export function applyFilter(baseCondition: SQL | undefined, filterColumn: any, filterValue: string | undefined): SQL | undefined {
  if (!filterValue || !filterColumn) return baseCondition;
  const filterClause = sql`${filterColumn} LIKE ${`%${escapeLikePattern(filterValue)}%`} ESCAPE '\\'`;
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
export function parseSort(sortableColumns: Record<string, any> | undefined, sortValue: string | undefined): ParsedSort | null {
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

export async function executePaginatedQuery(
  db: any,
  table: any,
  baseCondition: SQL | undefined,
  pageOpts: any,
  filterColumn?: any,
  sortableColumns?: Record<string, any>
) {
  const limit = Math.min(Math.max(pageOpts?.limit || 50, 1), 100);
  const condition = applyFilter(baseCondition, filterColumn, pageOpts?.filter);

  const sort = parseSort(sortableColumns, pageOpts?.sort);
  const sortField = sort?.field ?? "createdAt";
  const sortCol = sort?.column ?? table.createdAt;
  const direction: SortDirection = sort?.direction ?? "desc";

  const cursorData = decodeCursor(pageOpts?.cursor);
  const whereClause = buildCursorPaginationWhere(cursorData, sortCol, table.id, sortField, direction);
  const finalWhere = whereClause ? (condition ? and(condition, whereClause) : whereClause) : condition;

  // totalCount reflects the filtered set (base condition + filter), not the
  // current page - it must ignore the cursor's WHERE clause, since "how many
  // results total" shouldn't change as the caller pages through them.
  const [result, countRows] = await Promise.all([
    db
      .select()
      .from(table)
      .where(finalWhere)
      .limit(limit)
      .orderBy(...buildPaginationOrderBy(sortCol, table.id, direction)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(condition),
  ]);

  const lastItem = result[result.length - 1];
  const nextCursor = lastItem && result.length === limit
    ? encodeCursor(extractCursorValue(lastItem, sortField), lastItem.id, sortField)
    : undefined;

  const totalCount = Number(countRows[0]?.count ?? 0);

  return { items: result, nextCursor, totalCount };
}
