import { SQL, and, lt, or, eq, desc, asc, isNull, like } from "drizzle-orm";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

export interface CursorData {
  createdAt: number;
  id: string;
}

export function encodeCursor(createdAt: number, id: string): string {
  if (!createdAt || !id) return "";
  const data: CursorData = { createdAt, id };
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

export function decodeCursor(cursor?: string): CursorData | null {
  if (!cursor) return null;
  try {
    const jsonStr = Buffer.from(cursor, "base64").toString("utf-8");
    const data = JSON.parse(jsonStr) as CursorData;
    if (typeof data.createdAt === "number" && typeof data.id === "string") {
      return data;
    }
  } catch {
    // Ignore invalid cursors
  }
  return null;
}

export function buildCursorPaginationWhere(
  cursor: CursorData | null,
  createdAtCol: SQLiteColumn,
  idCol: SQLiteColumn,
): SQL | undefined {
  if (!cursor) return undefined;
  // For descending order, we want items strictly older (less than),
  // OR same time but alphabetically lower ID (breaking ties)
  return or(
    lt(createdAtCol, new Date(cursor.createdAt)),
    and(
      eq(createdAtCol, new Date(cursor.createdAt)),
      lt(idCol, cursor.id),
    ),
  );
}

export function buildPaginationOrderBy(
  createdAtCol: SQLiteColumn,
  idCol: SQLiteColumn,
) {
  return [desc(createdAtCol), desc(idCol)];
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

/**
 * Applies pageOpts.filter as a case-sensitive substring match against filterColumn,
 * combining it with an existing base condition. filterColumn is optional because
 * not every entity has an obvious free-text column to filter on.
 */
export function applyFilter(baseCondition: SQL | undefined, filterColumn: any, filterValue: string | undefined): SQL | undefined {
  if (!filterValue || !filterColumn) return baseCondition;
  const filterClause = like(filterColumn, `%${filterValue}%`);
  return baseCondition ? and(baseCondition, filterClause) : filterClause;
}

/**
 * Parses a "field" or "field:asc"/"field:desc" sort string against a whitelist
 * of sortable columns (field name -> column). Returns null when sortValue is
 * empty or doesn't match a whitelisted field, so callers can fall back to the
 * default createdAt/id ordering.
 */
export function parseSort(sortableColumns: Record<string, any> | undefined, sortValue: string | undefined): SQL | null {
  if (!sortValue || !sortableColumns) return null;
  const [field, direction] = sortValue.split(":");
  const column = field ? sortableColumns[field] : undefined;
  if (!column) return null;
  return direction === "desc" ? desc(column) : asc(column);
}

export async function executePaginatedQuery(
  db: any,
  table: any,
  baseCondition: SQL | undefined,
  pageOpts: any,
  filterColumn?: any,
  sortableColumns?: Record<string, any>
) {
  const limit = Math.min(pageOpts?.limit || 50, 100);
  const condition = applyFilter(baseCondition, filterColumn, pageOpts?.filter);

  // A whitelisted sort takes over ordering entirely. Cursor pagination is keyed
  // to createdAt+id, so it can't compose with an arbitrary sort column without
  // encoding that column into the cursor too - out of scope for now, so a
  // sorted request always returns a single page (no nextCursor).
  const sortOrderBy = parseSort(sortableColumns, pageOpts?.sort);
  if (sortOrderBy) {
    let sortedQuery = db.select().from(table);
    if (condition) sortedQuery = sortedQuery.where(condition);
    const result = await sortedQuery.orderBy(sortOrderBy, asc(table.id)).limit(limit);
    return { items: result, nextCursor: undefined };
  }

  const cursorData = decodeCursor(pageOpts?.cursor);

  let query = db.select().from(table);
  if (condition) {
    query = query.where(condition);
  }
  query = query.limit(limit) as any;

  query = query.orderBy(...buildPaginationOrderBy(table.createdAt, table.id));
  const whereClause = buildCursorPaginationWhere(cursorData, table.createdAt, table.id);

  if (whereClause) {
    const finalWhere = condition ? and(condition, whereClause) : whereClause;
    query = db.select().from(table).where(finalWhere).limit(limit).orderBy(...buildPaginationOrderBy(table.createdAt, table.id)) as any;
  }

  const result = await query;
  const lastItem = result[result.length - 1];
  const nextCursor = lastItem && result.length === limit ? encodeCursor((lastItem.createdAt instanceof Date ? lastItem.createdAt : new Date(lastItem.createdAt)).getTime(), lastItem.id) : undefined;

  return { items: result, nextCursor };
}
