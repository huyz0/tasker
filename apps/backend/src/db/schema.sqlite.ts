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

export const projectTemplates = sqliteTable("project_templates", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  templateId: text("template_id").notNull().references(() => projectTemplates.id),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const agentRoles = sqliteTable("agent_roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  capabilities: text("capabilities").notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  agentRoleId: text("agent_role_id").notNull().references(() => agentRoles.id),
  name: text("name").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  status: text("status").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const taskAssignments = sqliteTable("task_assignments", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  agentId: text("agent_id").references(() => agents.id),
  userId: text("user_id").references(() => users.id),
});

export const taskReviewers = sqliteTable("task_reviewers", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  userId: text("user_id").notNull().references(() => users.id),
});


export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  folderId: text("folder_id").notNull().references(() => folders.id),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const taskArtifactLinks = sqliteTable("task_artifact_links", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  artifactId: text("artifact_id").notNull().references(() => artifacts.id),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  entityId: text("entity_id").notNull(),
  entityType: text("entity_type").notNull(),
  userId: text("user_id").references(() => users.id),
  agentId: text("agent_id").references(() => agents.id),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
