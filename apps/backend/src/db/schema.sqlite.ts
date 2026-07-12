import { text, sqliteTable, primaryKey, integer, index, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

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
  parentOrgId: text("parent_org_id").references((): AnySQLiteColumn => organizations.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  binRetentionDays: integer("bin_retention_days"),
}, (table) => {
  return {
    parentOrgIdx: index("organizations_parent_org_id_idx").on(table.parentOrgId),
  }
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
  // Short, human-typeable prefix for this project's task display IDs (e.g.
  // "ENG-42"), unique within the org. Auto-derived from name at creation.
  key: text("key").notNull().default(""),
  // Next sequence number to hand out for a task's display ID within this
  // project; incremented atomically on each task creation.
  nextTaskNumber: integer("next_task_number").notNull().default(1),
  ownerId: text("owner_id").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
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
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  // Human-readable ID derived from the project's key + a per-project sequence
  // number (e.g. "ENG-42"), assigned once at creation - never recomputed, so
  // it stays stable even if the project is later renamed.
  displayId: text("display_id").notNull().default(""),
  title: text("title").notNull(),
  status: text("status").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
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
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  folderId: text("folder_id").notNull().references(() => folders.id),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
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

export const labels = sqliteTable("labels", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  color: text("color"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const entityLabels = sqliteTable("entity_labels", {
  id: text("id").primaryKey(),
  entityId: text("entity_id").notNull(),
  entityType: text("entity_type").notNull(),
  labelId: text("label_id").notNull().references(() => labels.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const taskNotes = sqliteTable("task_notes", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  agentId: text("agent_id").notNull().references(() => agents.id),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const repositoryLinks = sqliteTable("repository_links", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  provider: text("provider").notNull(), // 'github' | 'bitbucket'
  remoteName: text("remote_name").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const remotePullRequests = sqliteTable("remote_pull_requests", {
  id: text("id").primaryKey(),
  repositoryLinkId: text("repository_link_id").notNull().references(() => repositoryLinks.id),
  taskId: text("task_id").references(() => tasks.id),
  remotePrId: text("remote_pr_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(), // 'open' | 'closed' | 'merged' | 'draft'
  url: text("url").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
