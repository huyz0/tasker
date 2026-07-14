import { varchar, timestamp, mysqlTable, mysqlEnum, primaryKey, index, uniqueIndex, int, mediumtext, type AnyMySqlColumn } from "drizzle-orm/mysql-core";

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
  parentOrgId: varchar("parent_org_id", { length: 256 }).references((): AnyMySqlColumn => organizations.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  binRetentionDays: int("bin_retention_days"),
}, (table) => {
  return {
    parentOrgIdx: index("organizations_parent_org_id_idx").on(table.parentOrgId),
  }
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
  parentId: varchar("parent_id", { length: 256 }).references((): AnyMySqlColumn => taskTypes.id),
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
  rootTaskTypeId: varchar("root_task_type_id", { length: 256 }).references(() => taskTypes.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = mysqlTable("projects", {
  id: varchar("id", { length: 256 }).primaryKey(),
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  templateId: varchar("template_id", { length: 256 }).notNull().references(() => projectTemplates.id),
  name: varchar("name", { length: 256 }).notNull(),
  key: varchar("key_code", { length: 32 }).notNull().default(""),
  nextTaskNumber: int("next_task_number").notNull().default(1),
  ownerId: varchar("owner_id", { length: 256 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => {
  return {
    // Enforces key uniqueness within an org at the DB level, closing the
    // check-then-insert race generateUniqueProjectKey's SELECT alone can't
    // prevent under concurrent requests.
    orgKeyIdx: uniqueIndex("projects_org_id_key_idx").on(table.orgId, table.key),
  };
});

export const agentRoles = mysqlTable("agent_roles", {
  id: varchar("id", { length: 256 }).primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  systemPrompt: varchar("system_prompt", { length: 4096 }).notNull(),
  capabilities: varchar("capabilities", { length: 2048 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agents = mysqlTable("agents", {
  id: varchar("id", { length: 256 }).primaryKey(),
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  agentRoleId: varchar("agent_role_id", { length: 256 }).notNull().references(() => agentRoles.id),
  name: varchar("name", { length: 256 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const tasks = mysqlTable("tasks", {
  id: varchar("id", { length: 256 }).primaryKey(),
  projectId: varchar("project_id", { length: 256 }).notNull().references(() => projects.id),
  displayId: varchar("display_id", { length: 64 }).notNull().default(""),
  taskTypeId: varchar("task_type_id", { length: 256 }).references(() => taskTypes.id),
  createdBy: varchar("created_by", { length: 256 }).references(() => users.id),
  title: varchar("title", { length: 512 }).notNull(),
  status: varchar("status", { length: 256 }).notNull(),
  description: varchar("description", { length: 4096 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
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
  deletedAt: timestamp("deleted_at"),
});

export const artifacts = mysqlTable("artifacts", {
  id: varchar("id", { length: 256 }).primaryKey(),
  folderId: varchar("folder_id", { length: 256 }).notNull().references(() => folders.id),
  name: varchar("name", { length: 256 }).notNull(),
  description: varchar("description", { length: 1024 }),
  content: mediumtext("content"),
  contentType: varchar("content_type", { length: 128 }).notNull().default("text/markdown"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
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

export const labels = mysqlTable("labels", {
  id: varchar("id", { length: 256 }).primaryKey(),
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  name: varchar("name", { length: 256 }).notNull(),
  color: varchar("color", { length: 32 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    // Prevents duplicate label names within an org.
    orgNameIdx: uniqueIndex("labels_org_id_name_idx").on(table.orgId, table.name),
  };
});

export const entityLabels = mysqlTable("entity_labels", {
  id: varchar("id", { length: 256 }).primaryKey(),
  entityId: varchar("entity_id", { length: 256 }).notNull(),
  entityType: mysqlEnum("entity_type", ['task', 'artifact']).notNull(),
  labelId: varchar("label_id", { length: 256 }).notNull().references(() => labels.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    // Prevents a concurrent attachLabel race from creating duplicate
    // (entity, label) links.
    entityLabelIdx: uniqueIndex("entity_labels_entity_label_idx").on(table.entityId, table.entityType, table.labelId),
  };
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
  authEmail: varchar("auth_email", { length: 256 }),
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
}, (table) => {
  return {
    // Prevents a concurrent syncPullRequests race from creating duplicate
    // rows for the same remote PR on the same repository link.
    repoRemotePrIdx: uniqueIndex("remote_pull_requests_repo_remote_pr_idx").on(table.repositoryLinkId, table.remotePrId),
  };
});

export const revokedSessions = mysqlTable("revoked_sessions", {
  // The session token's jti claim - revoking a session means recording its
  // jti here, so any copy of that token (browser cookie or a bearer header
  // used directly) stops verifying immediately instead of staying valid
  // until its 7-day exp.
  jti: varchar("jti", { length: 256 }).primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull().references(() => users.id),
  revokedAt: timestamp("revoked_at").notNull(),
});
