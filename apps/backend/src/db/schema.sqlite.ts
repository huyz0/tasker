import { text, sqliteTable, primaryKey, integer, index, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * Maps `schema_migrations_test`, a table present in both dialects' migration
 * history since `0000`. Nothing imports it — and nothing did before either; it
 * was hidden from knip by `search.handler.ts`'s namespace import of this
 * module, which M07-T07 removed when the LIKE branch went.
 *
 * Kept rather than deleted: removing the definition would leave the table in
 * every existing database with no schema entry, so the next generated migration
 * would propose DROPping it. That is a schema decision, not dead-code cleanup.
 *
 * @knipignore
 */
export const testSchema = sqliteTable("schema_migrations_test", {
  id: text("id").primaryKey(),
});

// M13: email stopped being how a user is identified. It is optional (a user
// can exist with no external contact address at all) and, when present,
// still unique — SQLite treats multiple NULLs in a UNIQUE column as distinct,
// so any number of email-less accounts coexist. `username` is the new stable
// local handle. It is nullable at the database level on purpose, following
// this file's existing convention for "logically required, enforced at the
// app layer rather than the schema" columns (see `invitations.role`'s
// comment below) — every write path that creates a user (registerLocalUser,
// completeLogin) requires one via Zod; the nullable column only exists so a
// pre-M13 SQLite `users` table doesn't need the full 12-step ALTER TABLE
// rebuild twice (once to add the column, once to backfill it) — see
// `0028_users_email_optional_username.sql` and
// `0029_backfill_usernames.sql`.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  username: text("username").unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/**
 * M13-T03. One optional local password credential per user. `passwordHash` is
 * the full PHC-format string `Bun.password.hash()` returns
 * (`$argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>`) - it already carries its
 * algorithm and cost parameters, so there is no separate "params" or
 * "version" column: `Bun.password.verify()` reads them out of the stored
 * string itself, and raising the cost factor later needs no migration (see
 * ADR-0012 §4). `userId` is the primary key rather than a surrogate `id`
 * because the relationship is 1:1 by construction - a user has at most one
 * local password.
 */
export const passwordCredentials = sqliteTable("password_credentials", {
  userId: text("user_id").primaryKey().references(() => users.id),
  passwordHash: text("password_hash").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp" }),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
});

/**
 * M13-T03/T04. Generalizes "how a user proves who they are via a third
 * party" - Google is migrated onto this as the first `provider` row rather
 * than being special-cased on `users` itself (ADR-0012 §2). `providerUserId`
 * is that provider's own identifier for the person (for Google, its `sub`
 * claim - the value `users.id` held directly before this milestone). T04's
 * migration populates this table in raw SQL for every pre-existing user;
 * the `linkIdentity`/`unlinkIdentity` RPCs that read/write it as a TS symbol
 * land in T08.
 */
export const linkedIdentities = sqliteTable("linked_identities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  // Only 'google' is issued today; text (not a fixed enum) because SQLite has
  // no native enum type - same choice this file already makes for
  // `organization_members.role` and `invitations.role`, validated at the app
  // layer instead.
  provider: text("provider").notNull(),
  providerUserId: text("provider_user_id").notNull(),
  linkedAt: integer("linked_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    providerIdentityIdx: uniqueIndex("linked_identities_provider_identity_idx").on(table.provider, table.providerUserId),
    userIdIdx: index("linked_identities_user_id_idx").on(table.userId),
  };
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

// Valid values: 'owner' | 'admin' | 'member' | 'viewer' (see lib/authz.ts).
// SQLite doesn't have native enums like MySQL - membership is validated at
// the app layer (zod) instead, same as the invitations.role column below.
export const organizationMembers = sqliteTable("organization_members", {
  orgId: text("org_id").notNull().references(() => organizations.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default('member'),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.orgId, table.userId] }),
    // listOrgs filters by userId alone (inArray(members.userId, [userId])) -
    // the PK leads with orgId, so that lookup can't use it.
    userIdIdx: index("organization_members_user_id_idx").on(table.userId),
  }
});

/**
 * M10-T02 (ADR-0013). The fixed, code-defined permission vocabulary
 * (`<family>:<verb>`, e.g. `task:write`) as a real lookup table rather than
 * a bare validated string, so `role_permissions` gets a real foreign key
 * and an admin-facing "list every permission" query needs no hardcoded
 * array kept in sync with the ADR by hand.
 *
 * Consumed starting T11: `roles.handler.ts`'s `listPermissions`/
 * `createRole`/`updateRole` all read it directly.
 */
export const permissions = sqliteTable("permissions", {
  // The key itself is the id - `task:write`, not a surrogate. It's the
  // value every handler checks against, so making it opaque would just
  // add an indirection every caller has to resolve first.
  key: text("key").primaryKey(),
  description: text("description").notNull(),
});

/**
 * A role is a named set of permissions. `orgId` NULL means a system role
 * (owner/admin/member/viewer, seeded once, shared by every organization,
 * immutable - see ADR-0013 Option 5); non-NULL scopes a custom role to the
 * organization that created it. System roles being global rows rather than
 * duplicated per-org is what lets `viewer-denial.test.ts`-style sweeps
 * reason about "the viewer role" as one thing.
 *
 * Consumed starting T04: `policy.test.ts` seeds custom roles directly to
 * exercise `can()` beyond the four system ones.
 */
export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  orgId: text("org_id").references(() => organizations.id),
  name: text("name").notNull(),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    orgIdIdx: index("roles_org_id_idx").on(table.orgId),
  };
});

/** Consumed starting T04: `policy.ts` reads it to resolve a grant's permissions. */
export const rolePermissions = sqliteTable("role_permissions", {
  roleId: text("role_id").notNull().references(() => roles.id),
  permissionKey: text("permission_key").notNull().references(() => permissions.key),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.roleId, table.permissionKey] }),
  };
});

/**
 * Teams group people below the organization (M10's own stated goal).
 * Deliberately flat - no team-of-teams - matching what ADR-0013 and the
 * milestone's exit criteria actually ask for; nesting can be added later
 * without a breaking change if a real need shows up.
 *
 * Consumed starting T04: `policy.test.ts` seeds teams directly to exercise
 * `can()`'s team-derived-grant resolution. Real team CRUD is still T07.
 */
export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
}, (table) => {
  return {
    orgIdIdx: index("teams_org_id_idx").on(table.orgId),
  };
});

/** Consumed starting T04: `policy.ts` reads it to resolve team-derived grants. */
export const teamMembers = sqliteTable("team_members", {
  teamId: text("team_id").notNull().references(() => teams.id),
  userId: text("user_id").notNull().references(() => users.id),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.teamId, table.userId] }),
    // Mirrors organization_members' userIdIdx: "which teams is this user
    // in" is the query a team-derived grant resolution runs on every
    // permission check (ADR-0013's step 2), and the composite PK leading
    // with teamId can't serve a lookup keyed on userId alone.
    userIdIdx: index("team_members_user_id_idx").on(table.userId),
  };
});

/**
 * The one table can() (T04) will actually read for authorization decisions.
 * Binds a subject (a user or a team) to a role at a scope (an organization,
 * a team, or a project) - see ADR-0013's resolution algorithm. `scopeId` is
 * a plain text column rather than three separate nullable FKs (orgId/
 * teamId/projectId) because the column it references depends on
 * `scopeType`, which SQLite/MySQL can't express as a single declarative
 * foreign key; `can()` validates the referenced row exists as part of
 * resolution instead.
 *
 * Has a real TS-level consumer starting T03: `scripts/migrate-roles.ts`
 * reads and writes it directly to reconcile against `organization_members`,
 * so no knip exemption is needed here (unlike its five siblings above).
 */
export const grants = sqliteTable("grants", {
  id: text("id").primaryKey(),
  subjectType: text("subject_type").notNull(), // 'user' | 'team'
  subjectId: text("subject_id").notNull(),
  scopeType: text("scope_type").notNull(), // 'organization' | 'team' | 'project'
  scopeId: text("scope_id").notNull(),
  roleId: text("role_id").notNull().references(() => roles.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    // can()'s hot path: "every grant for this subject" (step 1/2 of
    // resolution), then narrowed by scope in the query itself.
    subjectIdx: index("grants_subject_idx").on(table.subjectType, table.subjectId),
    // The permission-matrix UI's hot path: "every grant at this scope",
    // e.g. listing who has access to one project.
    scopeIdx: index("grants_scope_idx").on(table.scopeType, table.scopeId),
  };
});

export const taskTypes = sqliteTable("task_types", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  projectId: text("project_id"),
  parentId: text("parent_id").references((): AnySQLiteColumn => taskTypes.id),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    orgIdIdx: index("task_types_org_id_idx").on(table.orgId),
    projectIdIdx: index("task_types_project_id_idx").on(table.projectId),
    parentIdIdx: index("task_types_parent_id_idx").on(table.parentId),
  };
});

export const taskStatuses = sqliteTable("task_statuses", {
  id: text("id").primaryKey(),
  taskTypeId: text("task_type_id").notNull().references(() => taskTypes.id),
  name: text("name").notNull(),
  // Statuses are a pipeline, not a set: a board that renders its columns in
  // whatever order the database returns is not a board (M05-T09).
  position: integer("position").notNull().default(0),
}, (table) => {
  return {
    taskTypeIdIdx: index("task_statuses_task_type_id_idx").on(table.taskTypeId),
    // M19-T03: createTaskStatus already select-then-inserts to reject a
    // duplicate name up front, but that check has a race window - two
    // concurrent calls can both pass the check before either commits. This
    // index closes it at the DB level, same pattern as M18-T03's folder/
    // artifact name uniqueness.
    taskTypeIdNameIdx: uniqueIndex("task_statuses_task_type_id_name_idx").on(table.taskTypeId, table.name),
  };
});

export const taskStatusTransitions = sqliteTable("task_status_transitions", {
  id: text("id").primaryKey(),
  taskTypeId: text("task_type_id").notNull().references(() => taskTypes.id),
  fromStatusId: text("from_status_id").notNull().references(() => taskStatuses.id),
  toStatusId: text("to_status_id").notNull().references(() => taskStatuses.id),
}, (table) => {
  return {
    taskTypeIdIdx: index("task_status_transitions_task_type_id_idx").on(table.taskTypeId),
  };
});

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  // M13-T09: exactly one of email/username is set at the app layer - an
  // invitation targets an address or a bare local handle, never both.
  // `email` therefore drops NOT NULL here; the app-level XOR is what keeps
  // a row from having neither, the same "logically required, DB-nullable"
  // convention `users.username` already uses.
  email: text("email"),
  username: text("username"),
  invitedBy: text("invited_by").notNull().references(() => users.id),
  // The role the invitee gets on accept - 'admin' | 'member' | 'viewer'
  // (never 'owner': ownership isn't handed out through an email invite).
  role: text("role").notNull().default('member'),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // An invitation that never expires is a standing key to the organization: an
  // address invited once could be redeemed at any point afterwards, long after
  // whoever sent it had left. Nullable so rows predating M03-T11 remain valid
  // rather than being silently treated as expired.
  expiresAt: integer("expires_at", { mode: "timestamp" }),
}, (table) => {
  return {
    orgIdIdx: index("invitations_org_id_idx").on(table.orgId),
  };
});

export const projectTemplates = sqliteTable("project_templates", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description"),
  rootTaskTypeId: text("root_task_type_id").references(() => taskTypes.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    orgIdIdx: index("project_templates_org_id_idx").on(table.orgId),
    // M20-T04: two identically-named templates in one org were silently
    // allowed - same class as M17's agent_roles, M18's folders/artifacts,
    // and M19's task_statuses/task_reviewers unique constraints.
    orgIdNameIdx: uniqueIndex("project_templates_org_id_name_idx").on(table.orgId, table.name),
  };
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
  // M16-T01. Nullable: no description existed on a project at all before
  // this, unlike its template, which always had one.
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
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

export const agentRoles = sqliteTable("agent_roles", {
  id: text("id").primaryKey(),
  // A role belongs to exactly one organization (ADR-0007). This table used to
  // be a global catalogue every tenant shared, so an admin of any org could
  // rewrite a persona another org's agents run on.
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  capabilities: text("capabilities").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
}, (table) => {
  return {
    // M17-T02: two roles with the same name in the same org is never
    // intentional - it is a picker where "Reviewer" and "Reviewer" are
    // indistinguishable to whoever is choosing one for an agent.
    orgNameIdx: uniqueIndex("agent_roles_org_id_name_idx").on(table.orgId, table.name),
  };
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  agentRoleId: text("agent_role_id").notNull().references(() => agentRoles.id),
  name: text("name").notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }),
}, (table) => {
  return {
    orgIdIdx: index("agents_org_id_idx").on(table.orgId),
    agentRoleIdIdx: index("agents_agent_role_id_idx").on(table.agentRoleId),
  };
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  // Human-readable ID derived from the project's key + a per-project sequence
  // number (e.g. "ENG-42"), assigned once at creation - never recomputed, so
  // it stays stable even if the project is later renamed.
  displayId: text("display_id").notNull().default(""),
  // Optional: when set and the type has statuses/transitions configured,
  // updateTaskStatus enforces that state machine instead of the default
  // fixed todo/in-progress/done enum.
  taskTypeId: text("task_type_id").references(() => taskTypes.id),
  // The authenticated caller at creation time, not client-supplied - same
  // attribution pattern used by comments, to prevent impersonation.
  createdBy: text("created_by").references(() => users.id),
  title: text("title").notNull(),
  status: text("status").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
}, (table) => {
  return {
    projectIdIdx: index("tasks_project_id_idx").on(table.projectId),
    taskTypeIdIdx: index("tasks_task_type_id_idx").on(table.taskTypeId),
  };
});

export const taskAssignments = sqliteTable("task_assignments", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  agentId: text("agent_id").references(() => agents.id),
  userId: text("user_id").references(() => users.id),
}, (table) => {
  return {
    taskIdIdx: index("task_assignments_task_id_idx").on(table.taskId),
    agentIdIdx: index("task_assignments_agent_id_idx").on(table.agentId),
    userIdIdx: index("task_assignments_user_id_idx").on(table.userId),
  };
});

export const taskReviewers = sqliteTable("task_reviewers", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  userId: text("user_id").notNull().references(() => users.id),
}, (table) => {
  return {
    taskIdIdx: index("task_reviewers_task_id_idx").on(table.taskId),
    userIdIdx: index("task_reviewers_user_id_idx").on(table.userId),
    // M19-T03: same check-then-insert race as task_statuses above -
    // addTaskReviewer's own duplicate check has a window two concurrent
    // calls can both pass.
    taskIdUserIdIdx: uniqueIndex("task_reviewers_task_id_user_id_idx").on(table.taskId, table.userId),
  };
});


export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
}, (table) => {
  return {
    projectIdIdx: index("folders_project_id_idx").on(table.projectId),
    // M18-T03: two folders with the same name in the same parent were never
    // rejected. NULL parentId (root-level folders) is not covered - SQLite
    // and MySQL both treat NULL as distinct from every other value,
    // including another NULL, in a unique index - so this catches siblings
    // under a real parent folder but not two root folders in the same
    // project; the application-level pre-check in createFolder covers that
    // gap.
    projectParentNameIdx: uniqueIndex("folders_project_id_parent_id_name_idx").on(table.projectId, table.parentId, table.name),
  };
});

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  folderId: text("folder_id").notNull().references(() => folders.id),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content"),
  // MIME type of `content` - "text/markdown" for text artifacts, "image/png"
  // etc for images (stored as base64 in `content`).
  contentType: text("content_type").notNull().default("text/markdown"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
}, (table) => {
  return {
    folderIdIdx: index("artifacts_folder_id_idx").on(table.folderId),
    // M18-T03: same reasoning as folders above.
    folderNameIdx: uniqueIndex("artifacts_folder_id_name_idx").on(table.folderId, table.name),
  };
});

export const taskArtifactLinks = sqliteTable("task_artifact_links", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  artifactId: text("artifact_id").notNull().references(() => artifacts.id),
}, (table) => {
  return {
    taskIdIdx: index("task_artifact_links_task_id_idx").on(table.taskId),
    artifactIdIdx: index("task_artifact_links_artifact_id_idx").on(table.artifactId),
  };
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  entityId: text("entity_id").notNull(),
  entityType: text("entity_type").notNull(),
  userId: text("user_id").references(() => users.id),
  agentId: text("agent_id").references(() => agents.id),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    entityIdx: index("comments_entity_id_entity_type_idx").on(table.entityId, table.entityType),
  };
});

export const labels = sqliteTable("labels", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  color: text("color"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    // Prevents duplicate label names within an org.
    orgNameIdx: uniqueIndex("labels_org_id_name_idx").on(table.orgId, table.name),
  };
});

export const entityLabels = sqliteTable("entity_labels", {
  id: text("id").primaryKey(),
  entityId: text("entity_id").notNull(),
  entityType: text("entity_type").notNull(),
  labelId: text("label_id").notNull().references(() => labels.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    // Prevents a concurrent attachLabel race from creating duplicate
    // (entity, label) links.
    entityLabelIdx: uniqueIndex("entity_labels_entity_label_idx").on(table.entityId, table.entityType, table.labelId),
  };
});

export const taskNotes = sqliteTable("task_notes", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  agentId: text("agent_id").notNull().references(() => agents.id),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // M22-T03 (ADR-0017): a handoff note is a TaskNote with noteType: 'handoff'
  // - same table, same author restriction, distinguished only by this
  // column. SQLite has no enum type - "comment" | "handoff" is enforced in
  // Zod only, same as every other enum-like column in this file.
  noteType: text("note_type").notNull().default("comment"),
}, (table) => {
  return {
    taskIdIdx: index("task_notes_task_id_idx").on(table.taskId),
    // M22-T03: listHandoffNotes filters to noteType = 'handoff' then groups
    // by taskId for the latest-per-task query - this composite index covers
    // both.
    noteTypeTaskIdIdx: index("task_notes_note_type_task_id_idx").on(table.noteType, table.taskId),
  };
});

export const repositoryLinks = sqliteTable("repository_links", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  provider: text("provider").notNull(), // 'github' | 'bitbucket'
  remoteName: text("remote_name").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  // Set only for Bitbucket links created with a direct Atlassian API token
  // (Basic auth, email:token) rather than the OAuth2 authorization-code flow
  // (Bearer token) - null means "use Bearer".
  authEmail: text("auth_email"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    projectIdIdx: index("repository_links_project_id_idx").on(table.projectId),
  };
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
}, (table) => {
  return {
    // Prevents a concurrent syncPullRequests race from creating duplicate
    // rows for the same remote PR on the same repository link.
    repoRemotePrIdx: uniqueIndex("remote_pull_requests_repo_remote_pr_idx").on(table.repositoryLinkId, table.remotePrId),
    // How the task detail view and the dashboard's "done, but the PR is
    // open" panel find a task's pull requests. Without it that was a full
    // table scan (M07-T09).
    taskIdIdx: index("remote_pull_requests_task_id_idx").on(table.taskId),
  };
});

export const revokedSessions = sqliteTable("revoked_sessions", {
  // The session token's jti claim - revoking a session means recording its
  // jti here, so any copy of that token (browser cookie or a bearer header
  // used directly) stops verifying immediately instead of staying valid
  // until its 7-day exp.
  jti: text("jti").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  revokedAt: integer("revoked_at", { mode: "timestamp" }).notNull(),
});

// Agent credentials (ADR-0008). A token is an opaque 256-bit random secret;
// only its SHA-256 hash is ever stored, so a database dump does not yield a
// usable credential and the plaintext cannot be re-shown after creation.
export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey(),
  // Both, not just agentId: the interceptor authorizes against orgId on every
  // request, and reading it from the token row rather than joining through the
  // agent keeps a re-homed agent from silently widening an existing credential.
  orgId: text("org_id").notNull().references(() => organizations.id),
  agentId: text("agent_id").notNull().references(() => agents.id),
  name: text("name").notNull(),
  // First few characters of the plaintext, kept so the list view can identify a
  // token ("tskr_a1b2...") without the secret. Not a credential on its own.
  tokenPrefix: text("token_prefix").notNull(),
  tokenHash: text("token_hash").notNull(),
  // JSON array from ADR-0008's fixed vocabulary. Stored as text because both
  // dialects have to agree and the set is small enough to read whole.
  scopes: text("scopes").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // NOT NULL by decision, not by oversight: a credential with no expiry is one
  // nobody ever rotates. Changing this means superseding ADR-0008.
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
}, (table) => {
  return {
    // Unique because authentication looks a token up *by* this value - two rows
    // sharing one would authenticate as whichever the index returned first.
    tokenHashIdx: uniqueIndex("api_tokens_token_hash_idx").on(table.tokenHash),
    agentIdIdx: index("api_tokens_agent_id_idx").on(table.agentId),
    orgIdIdx: index("api_tokens_org_id_idx").on(table.orgId),
  };
});

// Retry-safety for mutating RPCs (M14-T07). Scoped to (principal, method,
// key): the same key string from two different callers, or reused across
// two different RPCs, must not collide. No TTL/cleanup sweep exists yet -
// this table grows unbounded until one is added; flagged for whichever
// milestone next touches scheduled maintenance (retentionSweep.ts already
// owns bin-retention cleanup and is the natural place for it).
export const idempotencyKeys = sqliteTable("idempotency_keys", {
  id: text("id").primaryKey(),
  // "user:<id>" or "agent:<id>" - a plain foreign key can't express either,
  // so this is intentionally not a references().
  principalKey: text("principal_key").notNull(),
  method: text("method").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    // Looked up by this exact triple on every request carrying a key, and
    // enforces the invariant directly: a caller can never end up with two
    // stored responses for what it considers the same request.
    principalMethodKeyIdx: uniqueIndex("idempotency_keys_principal_method_key_idx")
      .on(table.principalKey, table.method, table.idempotencyKey),
  };
});

/**
 * M21 (ADR-0014/0015/0016). scopeType/scopeId reuse ADR-0013's existing
 * 'organization' | 'team' | 'project' enum unchanged - no fourth,
 * narrower tier. Exactly one of sourceAgentId/sourceUserId is set,
 * matching Task's assignee pattern; sourceTaskId/sourceCommentId/
 * sourceTaskNoteId/sourceArtifactId are secondary, optional evidence
 * links, matching the polymorphic-link precedent from task-artifact
 * linking. embedding is a JSON-serialized float array, stored as text
 * for the same reason apiTokens.scopes is - both dialects need to agree
 * on the shape and the array is small enough to read whole - and is
 * caller-supplied, unindexed, and unused by v1's LexicalBeliefRetriever
 * (ADR-0016); captured now so nothing needs backfilling later.
 */
export const beliefs = sqliteTable("beliefs", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  scopeType: text("scope_type").notNull(),
  scopeId: text("scope_id").notNull(),
  statement: text("statement").notNull(),
  confidence: text("confidence").notNull().default("medium"),
  status: text("status").notNull().default("active"),
  supersedesBeliefId: text("supersedes_belief_id").references((): AnySQLiteColumn => beliefs.id),
  sourceKind: text("source_kind").notNull(),
  sourceAgentId: text("source_agent_id").references(() => agents.id),
  sourceUserId: text("source_user_id").references(() => users.id),
  sourceTaskId: text("source_task_id").references(() => tasks.id),
  sourceCommentId: text("source_comment_id").references(() => comments.id),
  sourceTaskNoteId: text("source_task_note_id").references(() => taskNotes.id),
  sourceArtifactId: text("source_artifact_id").references(() => artifacts.id),
  // Denormalized "latest hop" for cheap display - the full history is
  // beliefPromotions, reached via listBeliefPromotions.
  promotedFromScopeType: text("promoted_from_scope_type"),
  promotedFromScopeId: text("promoted_from_scope_id"),
  promotedBy: text("promoted_by").references(() => users.id),
  promotedAt: integer("promoted_at", { mode: "timestamp" }),
  embedding: text("embedding"),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    scopeIdx: index("beliefs_scope_idx").on(table.scopeType, table.scopeId),
    orgIdIdx: index("beliefs_org_id_idx").on(table.orgId),
    statusIdx: index("beliefs_status_idx").on(table.status),
  };
});

/**
 * "Map them together" - a lightweight edge table rather than a graph
 * database (ADR-0014's shape section).
 */
export const beliefRelations = sqliteTable("belief_relations", {
  id: text("id").primaryKey(),
  beliefAId: text("belief_a_id").notNull().references(() => beliefs.id),
  beliefBId: text("belief_b_id").notNull().references(() => beliefs.id),
  relationType: text("relation_type").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    beliefAIdx: index("belief_relations_belief_a_id_idx").on(table.beliefAId),
    beliefBIdx: index("belief_relations_belief_b_id_idx").on(table.beliefBId),
  };
});

/**
 * Append-only audit log - the authoritative "who promoted what, when"
 * trail. Belief's own promotedBy/promotedAt/promotedFrom* columns are
 * just the latest hop, denormalized for cheap display.
 */
export const beliefPromotions = sqliteTable("belief_promotions", {
  id: text("id").primaryKey(),
  beliefId: text("belief_id").notNull().references(() => beliefs.id),
  fromScopeType: text("from_scope_type").notNull(),
  fromScopeId: text("from_scope_id").notNull(),
  toScopeType: text("to_scope_type").notNull(),
  toScopeId: text("to_scope_id").notNull(),
  promotedBy: text("promoted_by").notNull().references(() => users.id),
  promotedAt: integer("promoted_at", { mode: "timestamp" }).notNull(),
  note: text("note"),
}, (table) => {
  return {
    beliefIdIdx: index("belief_promotions_belief_id_idx").on(table.beliefId),
  };
});

/**
 * The durable record of every `domain.*` event (M08-T03).
 *
 * Written only by the consumer's projector, never by a request handler: the
 * point of routing through JetStream is that the trail survives an API crash
 * mid-request, which an inline write in the same transaction would not.
 *
 * `payload` is the event's JSON verbatim rather than a set of typed columns.
 * Over twenty subjects across every module publish here and their shapes
 * differ; a column per field would mean a migration every time any handler
 * added one, and the trail would silently lose whatever it had no column for.
 * Queryability comes from the indexed columns beside it.
 *
 * `actorId` is nullable because not every event has a human behind it — a
 * retention sweep or an agent-token action has no user. `actorType` says
 * which kind it was rather than leaving null ambiguous between "system" and
 * "we failed to record it".
 */
export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  // Which org's trail this belongs to. Nullable: a few events (a user
  // registering) precede any org membership, and dropping them would put a
  // gap in the trail exactly where an account takeover would show.
  orgId: text("org_id").references(() => organizations.id),
  // The NATS subject, e.g. "domain.agent.token_created". Indexed because
  // "show me every token creation" is the query an administrator actually
  // runs.
  subject: text("subject").notNull(),
  actorType: text("actor_type").notNull().default("system"),
  actorId: text("actor_id"),
  // Ties a row back to the HTTP request that caused it, via the id
  // withRequestCorrelation stamps onto every payload.
  requestId: text("request_id"),
  payload: text("payload").notNull(),
  // JetStream's sequence for this event. The projector is at-least-once, so
  // a redelivery after a crash would otherwise write the same event twice;
  // this is unique, which makes the write idempotent.
  streamSeq: integer("stream_seq").notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    orgIdx: index("audit_log_org_idx").on(table.orgId, table.occurredAt),
    subjectIdx: index("audit_log_subject_idx").on(table.subject),
    actorIdx: index("audit_log_actor_idx").on(table.actorId),
    streamSeqUnique: uniqueIndex("audit_log_stream_seq_unique").on(table.streamSeq),
  };
});

/**
 * Task history, written synchronously by the same handlers that perform each
 * mutation (M24-T03, ADR-0020) — the substrate for the Reports screen, chosen
 * over deriving from `audit_log` because that table has no project scoping,
 * stamps the projector's clock rather than the event's, and does not exist at
 * all in the STANDALONE deployment.
 *
 * `kind` is app-enforced (like `tasks.status`): 'created' | 'status_changed' |
 * 'claimed' | 'assigned' | 'unassigned' | 'archived' | 'restored' | 'note' |
 * 'comment' | 'handoff'. `archived` carries only `fromStatus`, `restored`
 * only `toStatus` — the CFD's +1-to/−1-from algebra.
 *
 * Terminality is stamped at write time (max `position` of the type's
 * statuses; 'done' for untyped tasks) so reordering a status list cannot
 * rewrite last quarter's completion counts. `assigneeAgentId`/`assigneeUserId`
 * denormalize the holder at event time (XOR, like `task_assignments`) because
 * assignment history is reconstructible from nothing else. `actorId` and the
 * assignee columns carry no FK — the `audit_log` precedent: a purged agent
 * leaves dangling text and readers render "(deleted agent)".
 */
export const taskActivity = sqliteTable("task_activity", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  projectId: text("project_id").notNull().references(() => projects.id),
  kind: text("kind").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  fromIsTerminal: integer("from_is_terminal", { mode: "boolean" }).notNull().default(false),
  toIsTerminal: integer("to_is_terminal", { mode: "boolean" }).notNull().default(false),
  actorType: text("actor_type").notNull().default("system"),
  actorId: text("actor_id"),
  assigneeAgentId: text("assignee_agent_id"),
  assigneeUserId: text("assignee_user_id"),
  occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    // Every report query filters by kind before bucketing over time.
    projectKindOccurredIdx: index("task_activity_project_kind_occurred_idx").on(table.projectId, table.kind, table.occurredAt),
    // Per-task last-signal (stalled claims) and the task history timeline.
    taskOccurredIdx: index("task_activity_task_occurred_idx").on(table.taskId, table.occurredAt),
  };
});

/**
 * Dedup ledger for the stalled-claim alert sweep (M25-T02, ADR-0022
 * Decision 3). One row per digest email a task was actually itemized in -
 * writing it is what stops the next sweep from re-alerting the same claim.
 *
 * `anchorAt` is `maxDate(claimed, assigned) ?? task.createdAt` - the
 * claimed/assigned anchor, never the detector's wider `silentSince` chain
 * (which also incorporates the most recent signal and would move on every
 * new signal, re-alerting a still-genuinely-stalled claim). It is NOT NULL
 * on purpose, and that is load-bearing, not incidental: SQLite and MySQL
 * both treat NULLs in a UNIQUE index as mutually distinct from every other
 * NULL, so a nullable anchor would let every claim predating activity
 * collection (the exact case the `?? task.createdAt` fallback exists for)
 * bypass the unique index entirely and re-email on every sweep forever -
 * this codebase has already hit that identical gotcha once, on
 * `folders_project_id_parent_id_name_idx`. Falling back to `createdAt`
 * keeps the column always populated, which is what lets the unique index
 * below actually do its job.
 */
export const stalledClaimAlerts = sqliteTable("stalled_claim_alerts", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  anchorAt: integer("anchor_at", { mode: "timestamp" }).notNull(),
  alertedAt: integer("alerted_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    // The whole point of the table: one alert per (task, claim anchor) pair.
    // A fresh claim (a new anchorAt) is eligible again once it stalls.
    taskAnchorIdx: uniqueIndex("stalled_claim_alerts_task_id_anchor_at_idx").on(table.taskId, table.anchorAt),
  };
});
