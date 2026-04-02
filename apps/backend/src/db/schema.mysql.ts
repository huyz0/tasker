import { varchar, timestamp, mysqlTable, mysqlEnum, primaryKey } from "drizzle-orm/mysql-core";

export const testSchema = mysqlTable("schema_migrations_test", {
  id: varchar("id", { length: 256 }).primaryKey(),
});

export const users = mysqlTable("users", {
  id: varchar("id", { length: 256 }).primaryKey(),
  email: varchar("email", { length: 256 }).notNull().unique(),
  name: varchar("name", { length: 256 }),
  avatarUrl: varchar("avatar_url", { length: 512 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const organizations = mysqlTable("organizations", {
  id: varchar("id", { length: 256 }).primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  slug: varchar("slug", { length: 256 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const organizationMembers = mysqlTable("organization_members", {
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  userId: varchar("user_id", { length: 256 }).notNull().references(() => users.id),
  role: mysqlEnum("role", ['admin', 'member']).notNull().default('member'),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.orgId, table.userId] }),
  }
});

export const taskTypes = mysqlTable("task_types", {
  id: varchar("id", { length: 256 }).primaryKey(),
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  projectId: varchar("project_id", { length: 256 }),
  name: varchar("name", { length: 256 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskStatuses = mysqlTable("task_statuses", {
  id: varchar("id", { length: 256 }).primaryKey(),
  taskTypeId: varchar("task_type_id", { length: 256 }).notNull().references(() => taskTypes.id),
  name: varchar("name", { length: 256 }).notNull(),
});

export const taskStatusTransitions = mysqlTable("task_status_transitions", {
  id: varchar("id", { length: 256 }).primaryKey(),
  taskTypeId: varchar("task_type_id", { length: 256 }).notNull().references(() => taskTypes.id),
  fromStatusId: varchar("from_status_id", { length: 256 }).notNull().references(() => taskStatuses.id),
  toStatusId: varchar("to_status_id", { length: 256 }).notNull().references(() => taskStatuses.id),
});

export const invitations = mysqlTable("invitations", {
  id: varchar("id", { length: 256 }).primaryKey(),
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  email: varchar("email", { length: 256 }).notNull(),
  invitedBy: varchar("invited_by", { length: 256 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectTemplates = mysqlTable("project_templates", {
  id: varchar("id", { length: 256 }).primaryKey(),
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  name: varchar("name", { length: 256 }).notNull(),
  description: varchar("description", { length: 1024 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = mysqlTable("projects", {
  id: varchar("id", { length: 256 }).primaryKey(),
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  templateId: varchar("template_id", { length: 256 }).notNull().references(() => projectTemplates.id),
  name: varchar("name", { length: 256 }).notNull(),
  ownerId: varchar("owner_id", { length: 256 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
