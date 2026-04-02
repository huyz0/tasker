import { text, sqliteTable, primaryKey, integer } from "drizzle-orm/sqlite-core";

export const testSchema = sqliteTable("schema_migrations_test", {
  id: text("id").primaryKey(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const organizationMembers = sqliteTable("organization_members", {
  orgId: text("org_id").notNull().references(() => organizations.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default('member'), // SQLite doesn't have native enums like MySQL
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.orgId, table.userId] }),
  }
});

export const taskTypes = sqliteTable("task_types", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  projectId: text("project_id"),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const taskStatuses = sqliteTable("task_statuses", {
  id: text("id").primaryKey(),
  taskTypeId: text("task_type_id").notNull().references(() => taskTypes.id),
  name: text("name").notNull(),
});

export const taskStatusTransitions = sqliteTable("task_status_transitions", {
  id: text("id").primaryKey(),
  taskTypeId: text("task_type_id").notNull().references(() => taskTypes.id),
  fromStatusId: text("from_status_id").notNull().references(() => taskStatuses.id),
  toStatusId: text("to_status_id").notNull().references(() => taskStatuses.id),
});

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  email: text("email").notNull(),
  invitedBy: text("invited_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
