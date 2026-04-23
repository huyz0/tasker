import { SQL, and, lt, or, eq, desc } from "drizzle-orm";
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

export async function executePaginatedQuery(
  db: any,
  table: any,
  baseCondition: SQL | undefined,
  pageOpts: any
) {
  const limit = Math.min(pageOpts?.limit || 50, 100);
  const cursorData = decodeCursor(pageOpts?.cursor);

  let query = db.select().from(table);
  if (baseCondition) {
    query = query.where(baseCondition);
  }
  query = query.limit(limit) as any;

  query = query.orderBy(...buildPaginationOrderBy(table.createdAt, table.id));
  const whereClause = buildCursorPaginationWhere(cursorData, table.createdAt, table.id);
  
  if (whereClause) {
    const finalWhere = baseCondition ? and(baseCondition, whereClause) : whereClause;
    query = db.select().from(table).where(finalWhere).limit(limit).orderBy(...buildPaginationOrderBy(table.createdAt, table.id)) as any;
  }

  const result = await query;
  const lastItem = result[result.length - 1];
  const nextCursor = lastItem && result.length === limit ? encodeCursor((lastItem.createdAt instanceof Date ? lastItem.createdAt : new Date(lastItem.createdAt)).getTime(), lastItem.id) : undefined;
  
  return { items: result, nextCursor };
}
