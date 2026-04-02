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
  } catch (error) {
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
