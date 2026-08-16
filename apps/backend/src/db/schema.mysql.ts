import { varchar, timestamp, mysqlTable, mysqlEnum, primaryKey, index, uniqueIndex, int, boolean, mediumtext, type AnyMySqlColumn } from "drizzle-orm/mysql-core";

export const testSchema = mysqlTable("schema_migrations_test", {
  id: varchar("id", { length: 256 }).primaryKey(),
});

// M13: see the matching comment in schema.sqlite.ts — email is now optional
// (unique when present; MySQL also treats multiple NULLs in a UNIQUE index as
// distinct) and `username` is the new stable local handle, nullable at the
// database level and required at the app layer for every user-creating path.
export const users = mysqlTable("users", {
  id: varchar("id", { length: 256 }).primaryKey(),
  email: varchar("email", { length: 256 }).unique(),
  username: varchar("username", { length: 256 }).unique(),
  name: varchar("name", { length: 256 }),
  avatarUrl: varchar("avatar_url", { length: 512 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// M13-T03. See the SQLite counterpart for the full reasoning: passwordHash
// is the whole PHC-format `Bun.password.hash()` string, so no separate
// params/version column exists, and userId is the primary key because the
// relationship is 1:1.
export const passwordCredentials = mysqlTable("password_credentials", {
  userId: varchar("user_id", { length: 256 }).primaryKey().references(() => users.id),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  failedAttempts: int("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
});

// M13-T03/T04. See the SQLite counterpart for the full reasoning.
export const linkedIdentities = mysqlTable("linked_identities", {
  id: varchar("id", { length: 256 }).primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull().references(() => users.id),
  provider: mysqlEnum("provider", ['google']).notNull(),
  providerUserId: varchar("provider_user_id", { length: 256 }).notNull(),
  linkedAt: timestamp("linked_at").defaultNow().notNull(),
}, (table) => {
  return {
    providerIdentityIdx: uniqueIndex("linked_identities_provider_identity_idx").on(table.provider, table.providerUserId),
    userIdIdx: index("linked_identities_user_id_idx").on(table.userId),
  };
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
  role: mysqlEnum("role", ['owner', 'admin', 'member', 'viewer']).notNull().default('member'),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.orgId, table.userId] }),
    userIdIdx: index("organization_members_user_id_idx").on(table.userId),
  }
});

export const taskTypes = mysqlTable("task_types", {
  id: varchar("id", { length: 256 }).primaryKey(),
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  projectId: varchar("project_id", { length: 256 }),
  parentId: varchar("parent_id", { length: 256 }).references((): AnyMySqlColumn => taskTypes.id),
  name: varchar("name", { length: 256 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    orgIdIdx: index("task_types_org_id_idx").on(table.orgId),
    projectIdIdx: index("task_types_project_id_idx").on(table.projectId),
    parentIdIdx: index("task_types_parent_id_idx").on(table.parentId),
  };
});

export const taskStatuses = mysqlTable("task_statuses", {
  id: varchar("id", { length: 256 }).primaryKey(),
  taskTypeId: varchar("task_type_id", { length: 256 }).notNull().references(() => taskTypes.id),
  name: varchar("name", { length: 256 }).notNull(),
  // Statuses are a pipeline, not a set: a board that renders its columns in
  // whatever order the database returns is not a board (M05-T09).
  position: int("position").notNull().default(0),
}, (table) => {
  return {
    taskTypeIdIdx: index("task_statuses_task_type_id_idx").on(table.taskTypeId),
  };
});

export const taskStatusTransitions = mysqlTable("task_status_transitions", {
  id: varchar("id", { length: 256 }).primaryKey(),
  taskTypeId: varchar("task_type_id", { length: 256 }).notNull().references(() => taskTypes.id),
  fromStatusId: varchar("from_status_id", { length: 256 }).notNull().references(() => taskStatuses.id),
  toStatusId: varchar("to_status_id", { length: 256 }).notNull().references(() => taskStatuses.id),
}, (table) => {
  return {
    taskTypeIdIdx: index("task_status_transitions_task_type_id_idx").on(table.taskTypeId),
  };
});

export const invitations = mysqlTable("invitations", {
  id: varchar("id", { length: 256 }).primaryKey(),
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  email: varchar("email", { length: 256 }).notNull(),
  invitedBy: varchar("invited_by", { length: 256 }).notNull().references(() => users.id),
  // The role the invitee gets on accept - never 'owner': ownership isn't
  // handed out through an email invite.
  role: mysqlEnum("role", ['admin', 'member', 'viewer']).notNull().default('member'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // An invitation that never expires is a standing key to the organization.
  // Nullable so rows predating M03-T11 remain valid rather than being silently
  // treated as expired.
  expiresAt: timestamp("expires_at"),
}, (table) => {
  return {
    orgIdIdx: index("invitations_org_id_idx").on(table.orgId),
  };
});

export const projectTemplates = mysqlTable("project_templates", {
  id: varchar("id", { length: 256 }).primaryKey(),
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  name: varchar("name", { length: 256 }).notNull(),
  description: varchar("description", { length: 1024 }),
  rootTaskTypeId: varchar("root_task_type_id", { length: 256 }).references(() => taskTypes.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    orgIdIdx: index("project_templates_org_id_idx").on(table.orgId),
  };
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
    templateIdIdx: index("projects_template_id_idx").on(table.templateId),
    ownerIdIdx: index("projects_owner_id_idx").on(table.ownerId),
  };
});

export const agentRoles = mysqlTable("agent_roles", {
  id: varchar("id", { length: 256 }).primaryKey(),
  // A role belongs to exactly one organization (ADR-0007). This table used to
  // be a global catalogue every tenant shared, so an admin of any org could
  // rewrite a persona another org's agents run on.
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
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
}, (table) => {
  return {
    orgIdIdx: index("agents_org_id_idx").on(table.orgId),
    agentRoleIdIdx: index("agents_agent_role_id_idx").on(table.agentRoleId),
  };
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
}, (table) => {
  return {
    projectIdIdx: index("tasks_project_id_idx").on(table.projectId),
    taskTypeIdIdx: index("tasks_task_type_id_idx").on(table.taskTypeId),
  };
});

export const taskAssignments = mysqlTable("task_assignments", {
  id: varchar("id", { length: 256 }).primaryKey(),
  taskId: varchar("task_id", { length: 256 }).notNull().references(() => tasks.id),
  agentId: varchar("agent_id", { length: 256 }).references(() => agents.id),
  userId: varchar("user_id", { length: 256 }).references(() => users.id),
}, (table) => {
  return {
    taskIdIdx: index("task_assignments_task_id_idx").on(table.taskId),
    agentIdIdx: index("task_assignments_agent_id_idx").on(table.agentId),
    userIdIdx: index("task_assignments_user_id_idx").on(table.userId),
  };
});

export const taskReviewers = mysqlTable("task_reviewers", {
  id: varchar("id", { length: 256 }).primaryKey(),
  taskId: varchar("task_id", { length: 256 }).notNull().references(() => tasks.id),
  userId: varchar("user_id", { length: 256 }).notNull().references(() => users.id),
}, (table) => {
  return {
    taskIdIdx: index("task_reviewers_task_id_idx").on(table.taskId),
    userIdIdx: index("task_reviewers_user_id_idx").on(table.userId),
  };
});


export const folders = mysqlTable("folders", {
  id: varchar("id", { length: 256 }).primaryKey(),
  projectId: varchar("project_id", { length: 256 }).notNull().references(() => projects.id),
  parentId: varchar("parent_id", { length: 256 }),
  name: varchar("name", { length: 256 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => {
  return {
    projectIdIdx: index("folders_project_id_idx").on(table.projectId),
  };
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
}, (table) => {
  return {
    folderIdIdx: index("artifacts_folder_id_idx").on(table.folderId),
  };
});

export const taskArtifactLinks = mysqlTable("task_artifact_links", {
  id: varchar("id", { length: 256 }).primaryKey(),
  taskId: varchar("task_id", { length: 256 }).notNull().references(() => tasks.id),
  artifactId: varchar("artifact_id", { length: 256 }).notNull().references(() => artifacts.id),
}, (table) => {
  return {
    taskIdIdx: index("task_artifact_links_task_id_idx").on(table.taskId),
    artifactIdIdx: index("task_artifact_links_artifact_id_idx").on(table.artifactId),
  };
});

export const comments = mysqlTable("comments", {
  id: varchar("id", { length: 256 }).primaryKey(),
  entityId: varchar("entity_id", { length: 256 }).notNull(),
  entityType: mysqlEnum("entity_type", ['task', 'artifact']).notNull(),
  userId: varchar("user_id", { length: 256 }).references(() => users.id),
  agentId: varchar("agent_id", { length: 256 }).references(() => agents.id),
  content: varchar("content", { length: 4096 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    entityIdx: index("comments_entity_id_entity_type_idx").on(table.entityId, table.entityType),
  };
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
    labelIdIdx: index("entity_labels_label_id_idx").on(table.labelId),
  };
});

export const taskNotes = mysqlTable("task_notes", {
  id: varchar("id", { length: 256 }).primaryKey(),
  taskId: varchar("task_id", { length: 256 }).notNull().references(() => tasks.id),
  agentId: varchar("agent_id", { length: 256 }).notNull().references(() => agents.id),
  content: varchar("content", { length: 8192 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    taskIdIdx: index("task_notes_task_id_idx").on(table.taskId),
  };
});

export const repositoryLinks = mysqlTable("repository_links", {
  id: varchar("id", { length: 256 }).primaryKey(),
  projectId: varchar("project_id", { length: 256 }).notNull().references(() => projects.id),
  provider: mysqlEnum("provider", ['github', 'bitbucket']).notNull(),
  remoteName: varchar("remote_name", { length: 256 }).notNull(),
  accessTokenEncrypted: varchar("access_token_encrypted", { length: 2048 }).notNull(),
  authEmail: varchar("auth_email", { length: 256 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    projectIdIdx: index("repository_links_project_id_idx").on(table.projectId),
  };
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
    taskIdIdx: index("remote_pull_requests_task_id_idx").on(table.taskId),
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

// Agent credentials (ADR-0008). A token is an opaque 256-bit random secret;
// only its SHA-256 hash is ever stored, so a database dump does not yield a
// usable credential and the plaintext cannot be re-shown after creation.
export const apiTokens = mysqlTable("api_tokens", {
  id: varchar("id", { length: 256 }).primaryKey(),
  // Both, not just agentId: the interceptor authorizes against orgId on every
  // request, and reading it from the token row rather than joining through the
  // agent keeps a re-homed agent from silently widening an existing credential.
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  agentId: varchar("agent_id", { length: 256 }).notNull().references(() => agents.id),
  name: varchar("name", { length: 256 }).notNull(),
  // First few characters of the plaintext, kept so the list view can identify a
  // token ("tskr_a1b2...") without the secret. Not a credential on its own.
  tokenPrefix: varchar("token_prefix", { length: 32 }).notNull(),
  // 64 hex characters of SHA-256, fixed width.
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  // JSON array from ADR-0008's fixed vocabulary. Stored as text because both
  // dialects have to agree and the set is small enough to read whole.
  scopes: mediumtext("scopes").notNull(),
  createdBy: varchar("created_by", { length: 256 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // NOT NULL by decision, not by oversight: a credential with no expiry is one
  // nobody ever rotates. Changing this means superseding ADR-0008.
  expiresAt: timestamp("expires_at").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
}, (table) => {
  return {
    // Unique because authentication looks a token up *by* this value - two rows
    // sharing one would authenticate as whichever the index returned first.
    tokenHashIdx: uniqueIndex("api_tokens_token_hash_idx").on(table.tokenHash),
    agentIdIdx: index("api_tokens_agent_id_idx").on(table.agentId),
    orgIdIdx: index("api_tokens_org_id_idx").on(table.orgId),
  };
});
