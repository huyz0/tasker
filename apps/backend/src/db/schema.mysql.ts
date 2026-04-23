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

export const agentRoles = mysqlTable("agent_roles", {
  id: varchar("id", { length: 256 }).primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  systemPrompt: varchar("system_prompt", { length: 4096 }).notNull(),
  capabilities: varchar("capabilities", { length: 2048 }).notNull(),
});

export const agents = mysqlTable("agents", {
  id: varchar("id", { length: 256 }).primaryKey(),
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  agentRoleId: varchar("agent_role_id", { length: 256 }).notNull().references(() => agentRoles.id),
  name: varchar("name", { length: 256 }).notNull(),
});

export const tasks = mysqlTable("tasks", {
  id: varchar("id", { length: 256 }).primaryKey(),
  projectId: varchar("project_id", { length: 256 }).notNull().references(() => projects.id),
  title: varchar("title", { length: 512 }).notNull(),
  status: varchar("status", { length: 256 }).notNull(),
  description: varchar("description", { length: 4096 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskAssignments = mysqlTable("task_assignments", {
  id: varchar("id", { length: 256 }).primaryKey(),
  taskId: varchar("task_id", { length: 256 }).notNull().references(() => tasks.id),
  agentId: varchar("agent_id", { length: 256 }).references(() => agents.id),
  userId: varchar("user_id", { length: 256 }).references(() => users.id),
});

export const taskReviewers = mysqlTable("task_reviewers", {
  id: varchar("id", { length: 256 }).primaryKey(),
  taskId: varchar("task_id", { length: 256 }).notNull().references(() => tasks.id),
  userId: varchar("user_id", { length: 256 }).notNull().references(() => users.id),
});


export const folders = mysqlTable("folders", {
  id: varchar("id", { length: 256 }).primaryKey(),
  projectId: varchar("project_id", { length: 256 }).notNull().references(() => projects.id),
  parentId: varchar("parent_id", { length: 256 }),
  name: varchar("name", { length: 256 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const artifacts = mysqlTable("artifacts", {
  id: varchar("id", { length: 256 }).primaryKey(),
  folderId: varchar("folder_id", { length: 256 }).notNull().references(() => folders.id),
  name: varchar("name", { length: 256 }).notNull(),
  description: varchar("description", { length: 1024 }),
  content: varchar("content", { length: 8192 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskArtifactLinks = mysqlTable("task_artifact_links", {
  id: varchar("id", { length: 256 }).primaryKey(),
  taskId: varchar("task_id", { length: 256 }).notNull().references(() => tasks.id),
  artifactId: varchar("artifact_id", { length: 256 }).notNull().references(() => artifacts.id),
});

export const comments = mysqlTable("comments", {
  id: varchar("id", { length: 256 }).primaryKey(),
  entityId: varchar("entity_id", { length: 256 }).notNull(),
  entityType: mysqlEnum("entity_type", ['task', 'artifact']).notNull(),
  userId: varchar("user_id", { length: 256 }).references(() => users.id),
  agentId: varchar("agent_id", { length: 256 }).references(() => agents.id),
  content: varchar("content", { length: 4096 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskNotes = mysqlTable("task_notes", {
  id: varchar("id", { length: 256 }).primaryKey(),
  taskId: varchar("task_id", { length: 256 }).notNull().references(() => tasks.id),
  agentId: varchar("agent_id", { length: 256 }).notNull().references(() => agents.id),
  content: varchar("content", { length: 8192 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const repositoryLinks = mysqlTable("repository_links", {
  id: varchar("id", { length: 256 }).primaryKey(),
  projectId: varchar("project_id", { length: 256 }).notNull().references(() => projects.id),
  provider: mysqlEnum("provider", ['github', 'bitbucket']).notNull(),
  remoteName: varchar("remote_name", { length: 256 }).notNull(),
  accessTokenEncrypted: varchar("access_token_encrypted", { length: 2048 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const remotePullRequests = mysqlTable("remote_pull_requests", {
  id: varchar("id", { length: 256 }).primaryKey(),
  repositoryLinkId: varchar("repository_link_id", { length: 256 }).notNull().references(() => repositoryLinks.id),
  taskId: varchar("task_id", { length: 256 }).references(() => tasks.id),
  remotePrId: varchar("remote_pr_id", { length: 256 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  status: mysqlEnum("status", ['open', 'closed', 'merged', 'draft']).notNull(),
  url: varchar("url", { length: 1024 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
