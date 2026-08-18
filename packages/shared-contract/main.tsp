import "@typespec/protobuf";

using TypeSpec.Protobuf;

@package({
  name: "tasker.health.v1",
})
@TypeSpec.service(#{ title: "Health Service" })
namespace Tasker.Health.V1;

model PingRequest {}

model PingResponse {
  @field(1) message: string;
  @field(2) dbStatus: string;
  @field(3) natsStatus: string;
  @field(4) version: string;
  @field(5) uptimeSeconds: int32;
  @field(6) dbLatencyMs?: int32;
  @field(7) natsLatencyMs?: int32;
}

interface HealthService {
  ping(request: PingRequest): PingResponse;
}

// ==== Common Pagination Models ====
model PageRequest {
  @field(1) limit?: int32;
  @field(2) cursor?: string;
  @field(3) filter?: string;
  @field(4) sort?: string;
}

model PageResponse {
  @field(1) nextCursor?: string;
  @field(2) totalCount?: int32;
}

// ==== IAM Models ====

model User {
  @field(1) id: string;
  @field(2) email: string;
  @field(3) name: string;
  @field(4) avatarUrl: string;
  @field(5) createdAt: string;

  // M13: the stable local handle. Always present for a user created after
  // M13 (registerLocalUser or a Google login both set one); a proto3 empty
  // string reads the same as an absent value, the same convention already
  // used for `email`/`name` on this message.
  @field(6) username: string;
}

model Organization {
  @field(1) id: string;
  @field(2) name: string;
  @field(3) slug: string;
  @field(4) role: string; // The user's role in this org
  @field(5) parentOrgId?: string;
  @field(6) deletedAt?: string;
  @field(7) binRetentionDays?: int32;
}

// ==== IAM Services ====

model GetIdentityRequest {}
model GetIdentityResponse {
  @field(1) user: User;
}

// M13-T06. `currentPassword` is required when the caller already has a
// password credential (verified before it is replaced) and ignored when
// they don't (a Google-only account setting a password for the first time
// has nothing to prove yet). ADR-0012 §5's last-sign-in-method invariant
// does not apply here - setPassword only ever adds or replaces a credential,
// never removes the only one.
model SetPasswordRequest {
  @field(1) currentPassword?: string;
  @field(2) newPassword: string;
}
model SetPasswordResponse {
  @field(1) success: boolean;
}

// M13-T08. Linking itself isn't an RPC: proving ownership of a Google
// account needs the OAuth redirect dance, so `GET /api/auth/google/link`
// and its callback (plain HTTP routes, like the login flow) do the actual
// linking. These two RPCs are the read/remove half - listing what's linked
// and removing one - which don't need a redirect.
model LinkedIdentity {
  @field(1) provider: string;
  @field(2) linkedAt: string;
}
model ListLinkedIdentitiesRequest {}
model ListLinkedIdentitiesResponse {
  @field(1) identities: LinkedIdentity[];

  // M13-T12. The GUI's last-sign-in-method guard (ADR-0012 §5) needs to
  // disable an "unlink" control *before* it's clicked, not only catch the
  // server's refusal after - which needs knowing whether a password
  // exists, not just how many identities are linked. Exposed here rather
  // than on `User` since it's specifically this screen's concern.
  @field(2) hasPassword: boolean;
}

// ADR-0012 §5: refused if this would leave the caller with no working
// sign-in method at all.
model UnlinkIdentityRequest {
  @field(1) provider: string;
}
model UnlinkIdentityResponse {
  @field(1) success: boolean;
}

// M13-T10. For a member with no recovery email (or whose email is simply
// unreachable), an org admin can force a fresh credential rather than the
// member being permanently locked out. `orgId` makes this an org-admin
// action, not an account-owner one - `assertOrgAdmin` gates it, and the
// handler checks `userId` is actually a member of `orgId` so an admin of
// org A cannot reset a stranger's password by naming any user id. The
// temporary password is returned exactly once, here, never stored or
// logged in plaintext (same rule as an agent token's plaintext, ADR-0008) -
// the admin is responsible for relaying it out of band.
model AdminResetPasswordRequest {
  @field(1) orgId: string;
  @field(2) userId: string;
}
model AdminResetPasswordResponse {
  @field(1) success: boolean;
  @field(2) temporaryPassword: string;
}

interface AuthService {
  getIdentity(request: GetIdentityRequest): GetIdentityResponse;
  setPassword(request: SetPasswordRequest): SetPasswordResponse;
  listLinkedIdentities(
    request: ListLinkedIdentitiesRequest,
  ): ListLinkedIdentitiesResponse;
  unlinkIdentity(request: UnlinkIdentityRequest): UnlinkIdentityResponse;
  adminResetPassword(
    request: AdminResetPasswordRequest,
  ): AdminResetPasswordResponse;
}

model ListOrgsRequest {
  @field(1) page?: PageRequest;
  @field(2) onlyDeleted?: boolean;
}
model ListOrgsResponse {
  @field(1) organizations: Organization[];
  @field(2) page?: PageResponse;

  // Parents of organizations on this page that did not fit on it. The client
  // nests by parentOrgId, so without them a child whose parent sits on a later
  // page has nothing to hang off and vanishes from the tree (M03-T09).
  // Restricted to organizations the caller is already a member of - this fixes
  // a pagination defect, it does not widen what anyone can see.
  @field(3) ancestors: Organization[];
}

model SeedOrgRequest {
  @field(1) name: string;
  @field(2) slug: string;
  @field(3) parentOrgId?: string;
}
model SeedOrgResponse {
  @field(1) organization: Organization;
}

model ArchiveOrgRequest {
  @field(1) orgId: string;
}
model ArchiveOrgResponse {
  @field(1) success: boolean;
}

model RestoreOrgRequest {
  @field(1) orgId: string;
}
model RestoreOrgResponse {
  @field(1) success: boolean;
}

model PurgeOrgRequest {
  @field(1) orgId: string;
}
model PurgeOrgResponse {
  @field(1) success: boolean;
}

model SetOrgRetentionDaysRequest {
  @field(1) orgId: string;
  @field(2) binRetentionDays: int32;
}
model SetOrgRetentionDaysResponse {
  @field(1) success: boolean;
}

model UpdateOrgRequest {
  @field(1) orgId: string;
  @field(2) name?: string;
  @field(3) slug?: string;
}
model UpdateOrgResponse {
  @field(1) organization: Organization;
}

model OrgMember {
  @field(1) userId: string;
  @field(2) email: string;
  @field(3) name: string;
  @field(4) role: string;
}

// An outstanding invitation. `expiresAt` is what makes the list actionable:
// an admin needs to see that an invite lapsed unredeemed, not just that it
// exists (M03-T11, M03-T12).
model Invitation {
  @field(1) id: string;
  @field(2) orgId: string;
  @field(3) email: string;
  @field(4) role: string;
  @field(5) invitedBy: string;
  @field(6) createdAt: string;
  @field(7) expiresAt?: string;
  @field(8) expired: boolean;

  // M13-T09. Exactly one of email/username is ever set - an invitation
  // targets an address (accepted on Google login or local registration with
  // a matching email) or a bare local handle (accepted on local
  // registration with a matching username), never both. Plain string, same
  // convention as User.username: empty means absent.
  @field(9) username: string;
}

model ListInvitationsRequest {
  @field(1) orgId: string;
  @field(2) page?: PageRequest;
}

model ListInvitationsResponse {
  @field(1) invitations: Invitation[];
  @field(2) page?: PageResponse;
}

model RevokeInvitationRequest {
  @field(1) invitationId: string;
}

model RevokeInvitationResponse {
  @field(1) success: boolean;
}

model ListOrgMembersRequest {
  @field(1) orgId: string;
  @field(2) page?: PageRequest;

  // Server-side role facet. Filtering the loaded window client-side would
  // report "3 admins" for an org with 200 of them, which reads as an answer.
  @field(3) role?: string;
}
model ListOrgMembersResponse {
  @field(1) members: OrgMember[];
  @field(2) page?: PageResponse;
}

model RemoveOrgMemberRequest {
  @field(1) orgId: string;
  @field(2) userId: string;
}
model RemoveOrgMemberResponse {
  @field(1) success: boolean;
}

model UpdateOrgMemberRoleRequest {
  @field(1) orgId: string;
  @field(2) userId: string;
  @field(3) role: string;
}
model UpdateOrgMemberRoleResponse {
  @field(1) member: OrgMember;
}

interface OrgService {
  listOrgs(request: ListOrgsRequest): ListOrgsResponse;
  seedOrg(request: SeedOrgRequest): SeedOrgResponse;
  updateOrg(request: UpdateOrgRequest): UpdateOrgResponse;
  archiveOrg(request: ArchiveOrgRequest): ArchiveOrgResponse;
  restoreOrg(request: RestoreOrgRequest): RestoreOrgResponse;
  purgeOrg(request: PurgeOrgRequest): PurgeOrgResponse;
  setOrgRetentionDays(
    request: SetOrgRetentionDaysRequest,
  ): SetOrgRetentionDaysResponse;

  inviteUser(request: InviteUserRequest): InviteUserResponse;
  listInvitations(request: ListInvitationsRequest): ListInvitationsResponse;
  revokeInvitation(request: RevokeInvitationRequest): RevokeInvitationResponse;
  listOrgMembers(request: ListOrgMembersRequest): ListOrgMembersResponse;
  removeOrgMember(request: RemoveOrgMemberRequest): RemoveOrgMemberResponse;
  updateOrgMemberRole(
    request: UpdateOrgMemberRoleRequest,
  ): UpdateOrgMemberRoleResponse;
}

model InviteUserRequest {
  @field(1) orgId: string;

  // Exactly one of email/username is required (M13-T09) - an admin invites
  // either an address or a bare local handle, never both at once.
  @field(2) email?: string;

  @field(4) username?: string;

  // Role the invitee gets on accept - "admin" | "member" | "viewer"
  // (never "owner"). Defaults to "member" server-side if omitted.
  @field(3) role?: string;
}

model InviteUserResponse {
  @field(1) success: boolean;
}

// ==== Task Types Models ====

model TaskType {
  @field(1) id: string;
  @field(2) orgId: string;
  @field(3) projectId: string;
  @field(4) name: string;
  @field(5) createdAt: string;
  @field(6) parentId?: string;
}

model TaskStatus {
  @field(1) id: string;
  @field(2) taskTypeId: string;
  @field(3) name: string;

  // Statuses are a pipeline, not a set. Without this the order is whatever the
  // database returns, which puts "done" wherever it likes (M05-T09).
  @field(4) position: int32;
}

model TaskStatusTransition {
  @field(1) id: string;
  @field(2) taskTypeId: string;
  @field(3) fromStatusId: string;
  @field(4) toStatusId: string;
}

// ==== Task Types Services ====

model GetTaskTypeRequest {
  @field(1) id: string;
}
model GetTaskTypeResponse {
  @field(1) taskType: TaskType;
  @field(2) statuses: TaskStatus[];
  @field(3) transitions: TaskStatusTransition[];
}

model CreateTaskTypeRequest {
  @field(1) orgId: string;
  @field(2) projectId: string;
  @field(3) name: string;
  @field(4) parentId?: string;
}
model CreateTaskTypeResponse {
  @field(1) taskType: TaskType;
}

model ListTaskTypesRequest {
  @field(1) orgId: string;
  @field(2) page?: PageRequest;
}

model ListTaskTypesResponse {
  @field(1) taskTypes: TaskType[];
  @field(2) page?: PageResponse;
}

model CreateTaskStatusRequest {
  @field(1) taskTypeId: string;
  @field(2) name: string;
}
model CreateTaskStatusResponse {
  @field(1) status: TaskStatus;
}

model CreateTaskStatusTransitionRequest {
  @field(1) taskTypeId: string;
  @field(2) fromStatusId: string;
  @field(3) toStatusId: string;
}
model CreateTaskStatusTransitionResponse {
  @field(1) transition: TaskStatusTransition;
}

// The complete list, in the new order. A partial list is rejected: leaving the
// unnamed statuses at their old positions is how two of them end up sharing
// one.
model ReorderTaskStatusesRequest {
  @field(1) taskTypeId: string;
  @field(2) statusIds: string[];
}
model ReorderTaskStatusesResponse {
  @field(1) statuses: TaskStatus[];
}

// The type is named as well as the edge so the request can be authorized even
// when the edge is already gone. Looking the edge up first and returning early
// would hand back success for any id at all, without an authorization check.
model DeleteTaskStatusTransitionRequest {
  @field(1) transitionId: string;
  @field(2) taskTypeId: string;
}
model DeleteTaskStatusTransitionResponse {
  @field(1) success: boolean;
}

model UpdateTaskTypeRequest {
  @field(1) id: string;
  @field(2) name?: string;
  @field(3) parentId?: string;
}
model UpdateTaskTypeResponse {
  @field(1) taskType: TaskType;
}

interface TaskTypeService {
  getTaskType(request: GetTaskTypeRequest): GetTaskTypeResponse;
  createTaskType(request: CreateTaskTypeRequest): CreateTaskTypeResponse;
  updateTaskType(request: UpdateTaskTypeRequest): UpdateTaskTypeResponse;
  listTaskTypes(request: ListTaskTypesRequest): ListTaskTypesResponse;
  createTaskStatus(request: CreateTaskStatusRequest): CreateTaskStatusResponse;
  createTaskStatusTransition(
    request: CreateTaskStatusTransitionRequest,
  ): CreateTaskStatusTransitionResponse;
  deleteTaskStatusTransition(
    request: DeleteTaskStatusTransitionRequest,
  ): DeleteTaskStatusTransitionResponse;
  reorderTaskStatuses(
    request: ReorderTaskStatusesRequest,
  ): ReorderTaskStatusesResponse;
}

// ==== Project Models ====

model ProjectTemplate {
  @field(1) id: string;
  @field(2) orgId: string;
  @field(3) name: string;
  @field(4) description: string;
  @field(5) rootTaskTypeId?: string;

  // M20-T02: added after the fact - new field number so existing clients
  // are unaffected. The handler already computed and formatted this for
  // listTemplates; it was never on the wire model, so the value was
  // silently dropped everywhere else (getTemplate/createTemplate/
  // updateTemplate), the same "computed, then silently dropped" pattern
  // already fixed for AgentRole (M17-T02), Folder/Artifact (M18-T02), and
  // Task/TaskNote (M19-T02).
  @field(6) createdAt: string;
}

model Project {
  @field(1) id: string;
  @field(2) orgId: string;
  @field(3) templateId: string;
  @field(4) name: string;
  @field(5) ownerId: string;
  @field(6) deletedAt?: string;
  @field(7) key: string;

  // M16-T01: no description field existed anywhere on a project - unlike
  // its template, which always had one. Nullable at the wire level so
  // "never set" and "explicitly cleared" both read back as absent/empty
  // the same way `updateProject` treats them (see UpdateProjectRequest).
  @field(8) description?: string;

  // M20-T02: same "computed, then silently dropped" fix as
  // ProjectTemplate.createdAt above - listProjects already formatted it,
  // getProject/createProject/updateProject never had anywhere to put it.
  @field(9) createdAt: string;
}

// ==== Project Services ====

model GetProjectTemplateRequest {
  @field(1) id: string;
}
model GetProjectTemplateResponse {
  @field(1) template: ProjectTemplate;
}
model CreateProjectTemplateRequest {
  @field(1) orgId: string;
  @field(2) name: string;
  @field(3) description: string;
  @field(4) rootTaskTypeId?: string;
}
model CreateProjectTemplateResponse {
  @field(1) template: ProjectTemplate;
}

model ListProjectTemplatesRequest {
  @field(1) orgId: string;
  @field(2) page?: PageRequest;
}

model ListProjectTemplatesResponse {
  @field(1) templates: ProjectTemplate[];
  @field(2) page?: PageResponse;
}

model UpdateProjectTemplateRequest {
  @field(1) id: string;
  @field(2) name?: string;
  @field(3) description?: string;
  @field(4) rootTaskTypeId?: string;
}
model UpdateProjectTemplateResponse {
  @field(1) template: ProjectTemplate;
}

interface ProjectTemplateService {
  getTemplate(request: GetProjectTemplateRequest): GetProjectTemplateResponse;
  createTemplate(
    request: CreateProjectTemplateRequest,
  ): CreateProjectTemplateResponse;
  updateTemplate(
    request: UpdateProjectTemplateRequest,
  ): UpdateProjectTemplateResponse;
  listTemplates(
    request: ListProjectTemplatesRequest,
  ): ListProjectTemplatesResponse;
}

model GetProjectRequest {
  @field(1) id: string;
}
model GetProjectResponse {
  @field(1) project: Project;
}
model CreateProjectRequest {
  @field(1) orgId: string;
  @field(2) templateId: string;
  @field(3) name: string;
  @field(4) ownerId: string;
  @field(5) description?: string;
}
model CreateProjectResponse {
  @field(1) project: Project;
}

model ListProjectsRequest {
  @field(1) orgId: string;
  @field(2) page?: PageRequest;
  @field(3) onlyDeleted?: boolean;
}

model ListProjectsResponse {
  @field(1) projects: Project[];
  @field(2) page?: PageResponse;
}

model ArchiveProjectRequest {
  @field(1) projectId: string;
}
model ArchiveProjectResponse {
  @field(1) success: boolean;
}

model RestoreProjectRequest {
  @field(1) projectId: string;
}
model RestoreProjectResponse {
  @field(1) success: boolean;
}

model PurgeProjectRequest {
  @field(1) projectId: string;
}
model PurgeProjectResponse {
  @field(1) success: boolean;
}

model UpdateProjectRequest {
  @field(1) projectId: string;
  @field(2) name: string;

  // Real proto3 presence, not the "" -> unset squash UpdateTaskRequest used
  // to do (M14-T01) - unset means "don't touch the description", and an
  // explicit empty string means "clear it", and the two must stay
  // distinguishable end to end.
  @field(3) description?: string;
}
model UpdateProjectResponse {
  @field(1) project: Project;
}

interface ProjectService {
  getProject(request: GetProjectRequest): GetProjectResponse;
  createProject(request: CreateProjectRequest): CreateProjectResponse;
  updateProject(request: UpdateProjectRequest): UpdateProjectResponse;
  listProjects(request: ListProjectsRequest): ListProjectsResponse;
  archiveProject(request: ArchiveProjectRequest): ArchiveProjectResponse;
  restoreProject(request: RestoreProjectRequest): RestoreProjectResponse;
  purgeProject(request: PurgeProjectRequest): PurgeProjectResponse;
}

// ==== Agent Models ====

model AgentRole {
  @field(1) id: string;
  @field(2) name: string;
  @field(3) systemPrompt: string;
  @field(4) capabilities: string; // JSON string

  // A role belongs to exactly one organization (ADR-0007). New field number,
  // so existing clients are unaffected.
  @field(5) orgId: string;

  // M17-T02: added after the fact, same as orgId above - new field number so
  // existing clients are unaffected. The handler used to compute this and
  // then silently drop it before returning, because it built the DB payload
  // and the response from the same object reference without the field ever
  // being added to it.
  @field(6) createdAt: string;
}

model Agent {
  @field(1) id: string;
  @field(2) orgId: string;
  @field(3) agentRoleId: string;
  @field(4) name: string;
  @field(5) deletedAt?: string;

  // M17-T02: see AgentRole.createdAt above - same field, same bug, same fix.
  @field(6) createdAt: string;
}

// ==== Agent Services ====

model CreateAgentRoleRequest {
  @field(1) name: string;
  @field(2) systemPrompt: string;
  @field(3) capabilities: string;
  @field(4) orgId: string;
}

model CreateAgentRoleResponse {
  @field(1) role: AgentRole;
}

model ListAgentRolesRequest {
  @field(1) page?: PageRequest;
  @field(2) orgId: string;
}
model ListAgentRolesResponse {
  @field(1) roles: AgentRole[];
  @field(2) page?: PageResponse;
}

model UpdateAgentRoleRequest {
  @field(1) id: string;
  @field(2) name?: string;
  @field(3) systemPrompt?: string;
  @field(4) capabilities?: string;
}
model UpdateAgentRoleResponse {
  @field(1) role: AgentRole;
}

model CreateAgentRequest {
  @field(1) orgId: string;
  @field(2) agentRoleId: string;
  @field(3) name: string;
}

model CreateAgentResponse {
  @field(1) agent: Agent;
}

model UpdateAgentRequest {
  @field(1) agentId: string;
  @field(2) name?: string;
  @field(3) agentRoleId?: string;
}
model UpdateAgentResponse {
  @field(1) agent: Agent;
}

model ListAgentsRequest {
  @field(1) orgId: string;
  @field(2) onlyDeleted?: boolean;
  @field(3) page?: PageRequest;
}

model ListAgentsResponse {
  @field(1) agents: Agent[];
  @field(2) page?: PageResponse;
}

model ArchiveAgentRequest {
  @field(1) agentId: string;
}

model ArchiveAgentResponse {
  @field(1) success: boolean;
}

model RestoreAgentRequest {
  @field(1) agentId: string;
}

model RestoreAgentResponse {
  @field(1) success: boolean;
}

model PurgeAgentRequest {
  @field(1) agentId: string;
}
model PurgeAgentResponse {
  @field(1) success: boolean;
}

// ==== Agent Token Models (ADR-0008) ====

// Never carries the secret. The plaintext exists only in CreateAgentTokenResponse.
model AgentToken {
  @field(1) id: string;
  @field(2) agentId: string;
  @field(3) orgId: string;
  @field(4) name: string;

  // First characters of the plaintext ("tskr_a1b2"), enough to match a token
  // against a leaked string without being usable as one.
  @field(5) tokenPrefix: string;

  @field(6) scopes: string[];
  @field(7) createdAt: string;
  @field(8) expiresAt: string;
  @field(9) lastUsedAt?: string;
  @field(10) revokedAt?: string;

  // Computed server-side rather than left to each client's clock and timezone.
  @field(11) expired: boolean;
}

model CreateAgentTokenRequest {
  @field(1) agentId: string;
  @field(2) name: string;
  @field(3) scopes: string[];
  @field(4) expiresInDays?: int32;
}

model CreateAgentTokenResponse {
  @field(1) token: AgentToken;

  // The only time the secret is ever returned. It is not stored and cannot be
  // shown again.
  @field(2) plaintext: string;
}

model ListAgentTokensRequest {
  @field(1) agentId: string;
}

model ListAgentTokensResponse {
  @field(1) tokens: AgentToken[];
}

model RevokeAgentTokenRequest {
  @field(1) tokenId: string;
}

model RevokeAgentTokenResponse {
  @field(1) success: boolean;
}

interface AgentService {
  createAgentRole(request: CreateAgentRoleRequest): CreateAgentRoleResponse;
  updateAgentRole(request: UpdateAgentRoleRequest): UpdateAgentRoleResponse;
  listAgentRoles(request: ListAgentRolesRequest): ListAgentRolesResponse;
  createAgent(request: CreateAgentRequest): CreateAgentResponse;
  updateAgent(request: UpdateAgentRequest): UpdateAgentResponse;
  listAgents(request: ListAgentsRequest): ListAgentsResponse;
  archiveAgent(request: ArchiveAgentRequest): ArchiveAgentResponse;
  restoreAgent(request: RestoreAgentRequest): RestoreAgentResponse;
  purgeAgent(request: PurgeAgentRequest): PurgeAgentResponse;
  createAgentToken(request: CreateAgentTokenRequest): CreateAgentTokenResponse;
  listAgentTokens(request: ListAgentTokensRequest): ListAgentTokensResponse;
  revokeAgentToken(request: RevokeAgentTokenRequest): RevokeAgentTokenResponse;
}

// ==== Task Models ====

// Who a task is assigned to. Exactly one of userId/agentId is set; the display
// name is resolved server-side so a client does not need the member and agent
// catalogues to render a task list (M05-T04).
model Assignee {
  @field(1) userId: string;
  @field(2) agentId: string;
  @field(3) name: string;
}

model UnassignTaskRequest {
  @field(1) taskId: string;
  @field(2) agentId?: string;
  @field(3) userId?: string;
}

model UnassignTaskResponse {
  @field(1) success: boolean;
}

model Task {
  @field(1) id: string;
  @field(2) projectId: string;
  @field(3) title: string;
  @field(4) status: string;
  @field(5) description: string;
  @field(6) deletedAt?: string;
  @field(7) displayId: string;
  @field(8) taskTypeId?: string;
  @field(9) createdBy?: string;

  // task_assignments has stored these since M01 and nothing could read them,
  // so the GUI showed a hardcoded avatar instead (M05-T02).
  @field(10) assignees: Assignee[];

  // M19-T02: added after the fact - new field number so existing clients are
  // unaffected. getTask/listTasks already computed and formatted this; it
  // was never on the wire model, so the value was silently dropped before
  // the response left the handler (listTasks even sorts by it).
  @field(11) createdAt: string;
}

// ==== Task Services ====

model CreateTaskRequest {
  @field(1) projectId: string;
  @field(2) title: string;
  @field(3) status: string;
  @field(4) description: string;
  @field(5) taskTypeId?: string;

  // Retry-safety (M14-T07): replaying the same key from the same principal
  // returns the original response instead of creating a second task. Scoped
  // per-caller, so two different principals may reuse the same key string
  // with no collision. Unset behaves exactly as before this field existed -
  // every call creates a new task.
  @field(6) idempotencyKey?: string;
}

model CreateTaskResponse {
  @field(1) task: Task;
}

model AssignTaskRequest {
  @field(1) taskId: string;

  // Exactly one of agentId/userId is required (enforced by the handler) -
  // marked optional, like UnassignTaskRequest's equivalent fields, so proto3
  // gives each real field presence instead of collapsing "omitted" into the
  // same empty string as "explicitly assign to nobody" (M19-T03).
  @field(2) agentId?: string;

  @field(3) userId?: string;
}

model AssignTaskResponse {
  @field(1) success: boolean;
}

// Agent self-service (M14-T06): claims the task for the *calling* principal
// only, atomically - there is no field to name a different assignee, unlike
// AssignTaskRequest. Succeeds only if the task currently has no assignee at
// all; a second caller racing the same task gets FailedPrecondition rather
// than a second, silent assignment.
model ClaimTaskRequest {
  @field(1) taskId: string;

  // Retry-safety (M14-T07), same contract as CreateTaskRequest.idempotencyKey.
  @field(2) idempotencyKey?: string;
}

model ClaimTaskResponse {
  @field(1) task: Task;
}

model TaskReviewer {
  @field(1) id: string;
  @field(2) taskId: string;
  @field(3) userId: string;

  // Resolved server-side, for the same reason Assignee.name is: otherwise a
  // client must hold the member catalogue to render a name, and fetching that
  // catalogue is what made the first assignee picker issue 2,000 requests
  // (M05-T04).
  @field(4) name: string;
}

model AddTaskReviewerRequest {
  @field(1) taskId: string;
  @field(2) userId: string;
}
model AddTaskReviewerResponse {
  @field(1) success: boolean;
}

model RemoveTaskReviewerRequest {
  @field(1) taskId: string;
  @field(2) userId: string;
}
model RemoveTaskReviewerResponse {
  @field(1) success: boolean;
}

model ListTaskReviewersRequest {
  @field(1) taskId: string;
}
model ListTaskReviewersResponse {
  @field(1) reviewers: TaskReviewer[];
}

// One task, with the fields the list deliberately leaves out.
//
// `listTasks` projects `description` away: it is unbounded free text and a list
// renders only titles (M07-T01). The detail view needs it, so it asks for the
// one task it is showing rather than every task carrying a body nobody reads.
model GetTaskRequest {
  @field(1) taskId: string;
}

model GetTaskResponse {
  @field(1) task: Task;
}

model ListTasksRequest {
  @field(1) projectId: string;
  @field(2) page?: PageRequest;
  @field(3) onlyDeleted?: boolean;

  // One board column's worth of tasks.
  //
  // The Kanban board used to fetch the *whole project* and group in the
  // browser, because a column's contents and its count are not derivable from a
  // page of mixed statuses. At 50,000 tasks that is 500 sequential round trips
  // before the first column paints. With this facet each column is its own
  // paginated list and `page.totalCount` is that column's real count, computed
  // by the database (M07-T03).
  @field(4) status?: string;

  // Agent self-service (M14-T05): "unassigned" returns tasks with no
  // assignee at all - the query an agent runs to find claimable work.
  // "me" returns tasks assigned to the calling principal (human or agent),
  // resolved server-side from the credential rather than trusting a passed
  // id. Unset returns every task regardless of assignment, same as before
  // this field existed.
  @field(5) assigneeFilter?: string;
}

model ListTasksResponse {
  @field(1) tasks: Task[];
  @field(2) page?: PageResponse;
}

model UpdateTaskStatusRequest {
  @field(1) taskId: string;
  @field(2) status: string;
}

model UpdateTaskStatusResponse {
  @field(1) task: Task;
}

model UpdateTaskRequest {
  @field(1) taskId: string;
  @field(2) title?: string;
  @field(3) description?: string;
  @field(4) taskTypeId?: string;
}

model UpdateTaskResponse {
  @field(1) task: Task;
}

model DeleteTaskRequest {
  @field(1) taskId: string;
}

model DeleteTaskResponse {
  @field(1) success: boolean;
}

model RestoreTaskRequest {
  @field(1) taskId: string;
}

model RestoreTaskResponse {
  @field(1) success: boolean;
}

model PurgeTaskRequest {
  @field(1) taskId: string;
}

model PurgeTaskResponse {
  @field(1) success: boolean;
}

interface TaskService {
  createTask(request: CreateTaskRequest): CreateTaskResponse;
  assignTask(request: AssignTaskRequest): AssignTaskResponse;
  unassignTask(request: UnassignTaskRequest): UnassignTaskResponse;
  claimTask(request: ClaimTaskRequest): ClaimTaskResponse;
  getTask(request: GetTaskRequest): GetTaskResponse;
  listTasks(request: ListTasksRequest): ListTasksResponse;
  updateTask(request: UpdateTaskRequest): UpdateTaskResponse;
  updateTaskStatus(request: UpdateTaskStatusRequest): UpdateTaskStatusResponse;
  deleteTask(request: DeleteTaskRequest): DeleteTaskResponse;
  restoreTask(request: RestoreTaskRequest): RestoreTaskResponse;
  purgeTask(request: PurgeTaskRequest): PurgeTaskResponse;
  addTaskReviewer(request: AddTaskReviewerRequest): AddTaskReviewerResponse;
  removeTaskReviewer(
    request: RemoveTaskReviewerRequest,
  ): RemoveTaskReviewerResponse;
  listTaskReviewers(
    request: ListTaskReviewersRequest,
  ): ListTaskReviewersResponse;
}

// ==== Artifacts ====

model Folder {
  @field(1) id: string;
  @field(2) projectId: string;
  @field(3) parentId: string;
  @field(4) name: string;
  @field(5) deletedAt?: string;

  // M18-T02: added after the fact - new field number so existing clients are
  // unaffected. The handler already computed and sorted by this; it was
  // never on the wire model, so the value was silently dropped before the
  // response left the function.
  @field(6) createdAt: string;
}

model Artifact {
  @field(1) id: string;
  @field(2) folderId: string;
  @field(3) name: string;
  @field(4) description: string;

  // Empty on `listArtifacts`, populated by `getArtifactContent`.
  //
  // The body is base64 and can reach ~15 MB, so returning it per row made a
  // folder listing proportional to the size of its files rather than to the
  // number of them: 50 images cost 2,008 KB to render 50 names. The list
  // carries `sizeBytes` so a client can show how big a file is without
  // transferring it (M07-T02).
  @field(5) content: string;

  @field(6) deletedAt?: string;
  @field(7) contentType: string;

  // Length of the stored body, so a client can tell how big an artifact is
  // without transferring it.
  //
  // Deliberately the *stored* length rather than a decoded one: uploads are
  // base64 and text written in the editor is not, and the content type does not
  // reliably say which — an uploaded `.md` is base64 with a text content type.
  // A decoded figure would therefore be wrong for a whole class of artifacts,
  // and being wrong quietly is worse than being coarse honestly.
  @field(8) sizeBytes?: int64;

  // M18-T02: see Folder.createdAt above - same field, same bug, same fix.
  @field(9) createdAt: string;
}

// A deep link carries an artifact id and nothing else. Without this, the GUI
// located the artifact by walking every folder in the project and every page of
// each — O(folders x pages) requests to find one row (M07-T12).
model GetArtifactRequest {
  @field(1) artifactId: string;
}

model GetArtifactResponse {
  @field(1) artifact: Artifact;
}

model GetArtifactContentRequest {
  @field(1) artifactId: string;
}

model GetArtifactContentResponse {
  @field(1) content: string;
  @field(2) contentType: string;
  @field(3) sizeBytes: int64;
}

model TaskArtifactLink {
  @field(1) id: string;
  @field(2) taskId: string;
  @field(3) artifactId: string;

  // Both names are resolved server-side, for the same reason Assignee.name and
  // TaskReviewer.name are. Here the argument is stronger: artifact rows carry
  // their whole `content`, so a client resolving names itself would download
  // every artifact body just to render a list of titles.
  @field(4) artifactName: string;

  @field(5) taskTitle: string;
}

model CreateFolderRequest {
  @field(1) projectId: string;
  @field(2) parentId: string;
  @field(3) name: string;
}
model CreateFolderResponse {
  @field(1) folder: Folder;
}

model UpdateFolderRequest {
  @field(1) folderId: string;
  @field(2) name: string;
}
model UpdateFolderResponse {
  @field(1) folder: Folder;
}

model CreateArtifactRequest {
  @field(1) folderId: string;
  @field(2) name: string;
  @field(3) description: string;
  @field(4) content: string;
  @field(5) contentType: string;
}
model CreateArtifactResponse {
  @field(1) artifact: Artifact;
}

model UpdateArtifactContentRequest {
  @field(1) artifactId: string;
  @field(2) content: string;
  @field(3) contentType?: string;
}
model UpdateArtifactContentResponse {
  @field(1) artifact: Artifact;
}

model LinkTaskArtifactRequest {
  @field(1) taskId: string;
  @field(2) artifactId: string;
}
model LinkTaskArtifactResponse {
  @field(1) link: TaskArtifactLink;
}

model UnlinkTaskArtifactRequest {
  @field(1) taskId: string;
  @field(2) artifactId: string;
}
model UnlinkTaskArtifactResponse {
  @field(1) success: boolean;
}

// One relation read from either end. Exactly one of the two ids must be set;
// two RPCs for one table would mean two authorization paths and two entries in
// each deny-by-default sweep.
model ListTaskArtifactLinksRequest {
  @field(1) taskId?: string;
  @field(2) artifactId?: string;
}
model ListTaskArtifactLinksResponse {
  @field(1) links: TaskArtifactLink[];
}

model ListArtifactsRequest {
  // One of `folderId` or `projectId`. The folder is the browsing case; the
  // project is the Bin, which wants every deleted artifact regardless of where
  // it lived. Without it the Bin listed *every folder in the project* and then
  // every deleted artifact in each — a fan-out proportional to the folder tree,
  // to render one small list (M07-T04).
  @field(1) folderId?: string;

  @field(2) page?: PageRequest;
  @field(3) onlyDeleted?: boolean;
  @field(4) projectId?: string;
}

model ListArtifactsResponse {
  @field(1) artifacts: Artifact[];
  @field(2) page?: PageResponse;
}

model ListFoldersRequest {
  @field(1) projectId: string;
  @field(2) page?: PageRequest;
  @field(3) onlyDeleted?: boolean;
}

model ListFoldersResponse {
  @field(1) folders: Folder[];
  @field(2) page?: PageResponse;
}

model ArchiveArtifactRequest {
  @field(1) artifactId: string;
}
model ArchiveArtifactResponse {
  @field(1) success: boolean;
}

model RestoreArtifactRequest {
  @field(1) artifactId: string;
}
model RestoreArtifactResponse {
  @field(1) success: boolean;
}

model ArchiveFolderRequest {
  @field(1) folderId: string;
}
model ArchiveFolderResponse {
  @field(1) success: boolean;
}

model RestoreFolderRequest {
  @field(1) folderId: string;
}
model RestoreFolderResponse {
  @field(1) success: boolean;
}

model PurgeArtifactRequest {
  @field(1) artifactId: string;
}
model PurgeArtifactResponse {
  @field(1) success: boolean;
}

model PurgeFolderRequest {
  @field(1) folderId: string;
}
model PurgeFolderResponse {
  @field(1) success: boolean;
}

interface ArtifactService {
  createFolder(request: CreateFolderRequest): CreateFolderResponse;
  updateFolder(request: UpdateFolderRequest): UpdateFolderResponse;
  createArtifact(request: CreateArtifactRequest): CreateArtifactResponse;
  updateArtifactContent(
    request: UpdateArtifactContentRequest,
  ): UpdateArtifactContentResponse;
  linkTaskArtifact(request: LinkTaskArtifactRequest): LinkTaskArtifactResponse;
  unlinkTaskArtifact(
    request: UnlinkTaskArtifactRequest,
  ): UnlinkTaskArtifactResponse;
  listTaskArtifactLinks(
    request: ListTaskArtifactLinksRequest,
  ): ListTaskArtifactLinksResponse;
  listArtifacts(request: ListArtifactsRequest): ListArtifactsResponse;

  // One artifact's body, fetched only when something is about to render it.
  getArtifact(request: GetArtifactRequest): GetArtifactResponse;

  getArtifactContent(
    request: GetArtifactContentRequest,
  ): GetArtifactContentResponse;

  listFolders(request: ListFoldersRequest): ListFoldersResponse;
  archiveArtifact(request: ArchiveArtifactRequest): ArchiveArtifactResponse;
  restoreArtifact(request: RestoreArtifactRequest): RestoreArtifactResponse;
  archiveFolder(request: ArchiveFolderRequest): ArchiveFolderResponse;
  restoreFolder(request: RestoreFolderRequest): RestoreFolderResponse;
  purgeArtifact(request: PurgeArtifactRequest): PurgeArtifactResponse;
  purgeFolder(request: PurgeFolderRequest): PurgeFolderResponse;
}

// ==== Comments ====

model Comment {
  @field(1) id: string;
  @field(2) entityId: string;
  @field(3) entityType: string;
  @field(4) userId: string;
  @field(5) agentId: string;
  @field(6) content: string;
  @field(7) createdAt: string;

  // Resolved display name of the user/agent that authored this comment - null
  // if the author record was since deleted. Never trust userId/agentId alone
  // for display; they're internal ids.
  @field(8) authorName?: string;
}

// Field numbers 3 (userId) and 4 (agentId) were removed in M04-T06 and are
// reserved in the .proto: attribution comes from the authenticated principal.
model CreateCommentRequest {
  @field(1) entityId: string;
  @field(2) entityType: string;
  @field(5) content: string;
}
model CreateCommentResponse {
  @field(1) comment: Comment;
}

model ListCommentsRequest {
  @field(1) entityId: string;
  @field(2) entityType: string;
  @field(3) page?: PageRequest;
}

model ListCommentsResponse {
  @field(1) comments: Comment[];
  @field(2) page?: PageResponse;
}

// Authorship is checked against the authenticated principal (M04-T06), so the
// caller no longer names an author. Field numbers 3 and 4 are reserved.
model UpdateCommentRequest {
  @field(1) commentId: string;
  @field(2) content: string;
}
model UpdateCommentResponse {
  @field(1) comment: Comment;
}

model DeleteCommentRequest {
  @field(1) commentId: string;
}
model DeleteCommentResponse {
  @field(1) success: boolean;
}

interface CommentService {
  createComment(request: CreateCommentRequest): CreateCommentResponse;
  updateComment(request: UpdateCommentRequest): UpdateCommentResponse;
  deleteComment(request: DeleteCommentRequest): DeleteCommentResponse;
  listComments(request: ListCommentsRequest): ListCommentsResponse;
}

// ==== Task Notes ====

model TaskNote {
  @field(1) id: string;
  @field(2) taskId: string;
  @field(3) agentId: string;
  @field(4) content: string;

  // M19-T02: see Task.createdAt above - same field, same bug, same fix.
  @field(5) createdAt: string;
}

model CreateTaskNoteRequest {
  @field(1) taskId: string;
  @field(3) content: string;
}

model CreateTaskNoteResponse {
  @field(1) taskNote: TaskNote;
}

model ListTaskNotesRequest {
  @field(1) taskId: string;
  @field(2) page?: PageRequest;
}

model ListTaskNotesResponse {
  @field(1) taskNotes: TaskNote[];
  @field(2) page?: PageResponse;
}

model UpdateTaskNoteRequest {
  @field(1) taskNoteId: string;
  @field(2) content: string;
}
model UpdateTaskNoteResponse {
  @field(1) taskNote: TaskNote;
}

model DeleteTaskNoteRequest {
  @field(1) taskNoteId: string;
}
model DeleteTaskNoteResponse {
  @field(1) success: boolean;
}

interface TaskNoteService {
  createTaskNote(request: CreateTaskNoteRequest): CreateTaskNoteResponse;
  updateTaskNote(request: UpdateTaskNoteRequest): UpdateTaskNoteResponse;
  deleteTaskNote(request: DeleteTaskNoteRequest): DeleteTaskNoteResponse;
  listTaskNotes(request: ListTaskNotesRequest): ListTaskNotesResponse;
}

// ==== Labels ====

model Label {
  @field(1) id: string;
  @field(2) orgId: string;
  @field(3) name: string;
  @field(4) color: string;
}

model CreateLabelRequest {
  @field(1) orgId: string;
  @field(2) name: string;
  @field(3) color: string; // Optional
}
model CreateLabelResponse {
  @field(1) label: Label;
}

model ListLabelsRequest {
  @field(1) orgId: string;
  @field(2) page?: PageRequest;
}
model ListLabelsResponse {
  @field(1) labels: Label[];
  @field(2) page?: PageResponse;
}

model AttachLabelRequest {
  @field(1) entityId: string;
  @field(2) entityType: string;
  @field(3) labelId: string;
}
model AttachLabelResponse {
  @field(1) success: boolean;
}

model DetachLabelRequest {
  @field(1) entityId: string;
  @field(2) entityType: string;
  @field(3) labelId: string;
}
model DetachLabelResponse {
  @field(1) success: boolean;
}

model ListEntityLabelsRequest {
  @field(1) entityId: string;
  @field(2) entityType: string;
}
model ListEntityLabelsResponse {
  @field(1) labels: Label[];
}

model UpdateLabelRequest {
  @field(1) labelId: string;
  @field(2) name?: string;
  @field(3) color?: string;
}
model UpdateLabelResponse {
  @field(1) label: Label;
}

interface LabelService {
  createLabel(request: CreateLabelRequest): CreateLabelResponse;
  updateLabel(request: UpdateLabelRequest): UpdateLabelResponse;
  listLabels(request: ListLabelsRequest): ListLabelsResponse;
  attachLabel(request: AttachLabelRequest): AttachLabelResponse;
  detachLabel(request: DetachLabelRequest): DetachLabelResponse;
  listEntityLabels(request: ListEntityLabelsRequest): ListEntityLabelsResponse;
}

// ==== Repositories ====

model RepositoryLink {
  @field(1) id: string;
  @field(2) projectId: string;
  @field(3) provider: string; // 'github' | 'bitbucket'
  @field(4) remoteName: string;
  @field(5) createdAt: string;
  @field(6) authEmail?: string;
}

model RemotePullRequest {
  @field(1) id: string;
  @field(2) repositoryLinkId: string;
  @field(3) taskId: string;
  @field(4) remotePrId: string;
  @field(5) title: string;
  @field(6) status: string;
  @field(7) url: string;
  @field(8) updatedAt: string;
}

model AddRepositoryLinkRequest {
  @field(1) projectId: string;
  @field(2) provider: string;
  @field(3) remoteName: string;
  @field(4) oauthCode?: string; // OAuth2 flow: exchanged for a Bearer access token
  @field(5) apiToken?: string; // Direct-token flow (Bitbucket only): used as-is with Basic auth
  @field(6) email?: string; // Required alongside apiToken for Bitbucket's Basic auth scheme
}
model AddRepositoryLinkResponse {
  @field(1) link: RepositoryLink;
}

model RemoveRepositoryLinkRequest {
  @field(1) repositoryLinkId: string;
}
model RemoveRepositoryLinkResponse {
  @field(1) success: boolean;
}

model ListRepositoryLinksRequest {
  @field(1) projectId: string;
  @field(2) page?: PageRequest;
}
model ListRepositoryLinksResponse {
  @field(1) links: RepositoryLink[];
  @field(2) page?: PageResponse;
}

model SyncPullRequestsRequest {
  @field(1) projectId: string;
}
model SyncPullRequestsResponse {
  @field(1) success: boolean;
}

model ListPullRequestsRequest {
  @field(1) projectId: string;
}
model ListPullRequestsResponse {
  @field(1) pullRequests: RemotePullRequest[];
}

model Build {
  @field(1) id: string;
  @field(2) repositoryLinkId: string;
  @field(3) status: string;
  @field(4) commitSha: string;
  @field(5) createdAt: string;
}

model Deployment {
  @field(1) id: string;
  @field(2) buildId: string;
  @field(3) environment: string;
  @field(4) status: string;
  @field(5) createdAt: string;
}

model ListBuildsRequest {
  @field(1) repositoryLinkId: string;
  @field(2) page?: PageRequest;
}

model ListBuildsResponse {
  @field(1) builds: Build[];
  @field(2) page?: PageResponse;
}

model ListDeploymentsRequest {
  @field(1) buildId: string;
  @field(2) repositoryLinkId: string;
  @field(3) commitSha: string;
}

model ListDeploymentsResponse {
  @field(1) deployments: Deployment[];
}

interface RepositoryService {
  addRepositoryLink(
    request: AddRepositoryLinkRequest,
  ): AddRepositoryLinkResponse;
  listRepositoryLinks(
    request: ListRepositoryLinksRequest,
  ): ListRepositoryLinksResponse;
  removeRepositoryLink(
    request: RemoveRepositoryLinkRequest,
  ): RemoveRepositoryLinkResponse;
  syncPullRequests(request: SyncPullRequestsRequest): SyncPullRequestsResponse;
  listPullRequests(request: ListPullRequestsRequest): ListPullRequestsResponse;
  listBuilds(request: ListBuildsRequest): ListBuildsResponse;
  listDeployments(request: ListDeploymentsRequest): ListDeploymentsResponse;
}

// ==== Search ====

// Where the query's words fall inside `snippet`, as offsets rather than markup.
//
// The server could have wrapped the matches in tags and saved the client the
// work, but then the snippet is markup the client must trust and render as
// HTML — an injection hole opened for a visual nicety. Offsets keep the
// snippet plain text.
model SnippetMatch {
  @field(1) start: int32;
  @field(2) length: int32;
}

model SearchResult {
  @field(1) id: string;
  @field(2) type: string; // "task" | "artifact" | "project" | "agent" | "comment"
  @field(3) title: string;
  @field(4) snippet: string;

  // Where to go when the result is not itself a destination. A comment has no
  // screen of its own, so it carries the task or artifact it hangs off; every
  // other type leaves these empty and routes by its own id.
  @field(5) parentType: string;

  @field(6) parentId: string;
  @field(7) snippetMatches: SnippetMatch[];
}

model UniversalSearchRequest {
  @field(1) query: string;
  @field(2) page?: PageRequest;
  @field(3) orgId: string;
}

model UniversalSearchResponse {
  @field(1) results: SearchResult[];
  @field(2) page?: PageResponse;
}

interface SearchService {
  universalSearch(request: UniversalSearchRequest): UniversalSearchResponse;
}

// ── Dashboard ───────────────────────────────────────────────────────────────
//
// The home screen used to show four entity counts and the database's latency.
// Counts of things that exist only ever climb, and none of them answered a
// question anyone had — the standard test being "what will you do differently
// because of this number?".
//
// What a supervisor of agent work actually needs is closer to an on-call
// console than to a personal task list: what is waiting on my judgement, where
// does the record disagree with reality, and which agents have gone quiet.
// One RPC rather than four, because the alternative is a client issuing four
// round trips and doing the joins itself — the shape M05 spent a milestone
// removing.
//
// Every list here is deliberately short. This is a place to notice something,
// not to work through it; the counts say how much is behind each one.
model DashboardTask {
  @field(1) id: string;
  @field(2) displayId: string;
  @field(3) title: string;
  @field(4) status: string;
  @field(5) projectId: string;
}

// A task whose recorded status is contradicted by its pull request — "done"
// with the PR still open. Nothing else in the product notices this, and it is
// the most common way agent work looks finished without being finished.
model DashboardDisagreement {
  @field(1) task: DashboardTask;
  @field(2) pullRequestId: string;
  @field(3) pullRequestTitle: string;
  @field(4) pullRequestStatus: string;
  @field(5) pullRequestUrl: string;
}

model DashboardAgent {
  @field(1) id: string;
  @field(2) name: string;

  // The most recent time any of this agent's tokens was used. Already stored
  // on `api_tokens` and, until now, displayed nowhere — so "Agents: 5" was on
  // the home screen while "one of them has been silent for nine days" was not.
  @field(3) lastUsedAt?: string;

  // Assigned and not done. An agent holding work while silent is the shape
  // worth noticing.
  @field(4) openTaskCount: int64;
}

// Derived from task notes and agent comments, which is what the system already
// records. When M08 lands an event log this should be re-pointed at it — the
// panel is the same, the source is better.
model DashboardActivity {
  @field(1) taskId: string;
  @field(2) taskDisplayId: string;
  @field(3) taskTitle: string;
  @field(4) agentId: string;
  @field(5) agentName: string;
  @field(6) kind: string;
  @field(7) excerpt: string;
  @field(8) createdAt: string;
}

model GetDashboardRequest {
  @field(1) orgId: string;

  // Optional. Without it the answer spans the organization; with it, the
  // review queue and disagreements narrow to one project.
  @field(2) projectId?: string;
}

model GetDashboardResponse {
  // Tasks the caller is a reviewer on that are not yet done. Reviews carry no
  // outcome of their own yet, so "not done" is the drain condition — a real
  // queue that empties, but one that cannot distinguish "reviewed and approved"
  // from "not looked at". Giving `task_reviewers` an outcome is the follow-up.
  @field(1) awaitingReview: DashboardTask[];

  @field(2) awaitingReviewCount: int64;
  @field(3) disagreements: DashboardDisagreement[];
  @field(4) disagreementCount: int64;
  @field(5) agents: DashboardAgent[];
  @field(6) recentActivity: DashboardActivity[];
}

interface DashboardService {
  getDashboard(request: GetDashboardRequest): GetDashboardResponse;
}

// ==== Teams (M10-T07, ADR-0013) ====

model Team {
  @field(1) id: string;
  @field(2) orgId: string;
  @field(3) name: string;
  @field(4) createdAt: string;
  @field(5) deletedAt?: string;
}

// Mirrors OrgMember's shape - a team's roster is a member list the same way
// an organization's is, minus `role`: team membership itself carries no
// role (ADR-0013 §3 - what a member *can do* comes from whatever role is
// granted to the team as a subject, a separate concept team_members does
// not encode).
model TeamMember {
  @field(1) userId: string;
  @field(2) email: string;
  @field(3) name: string;
  @field(4) joinedAt: string;
}

model CreateTeamRequest {
  @field(1) orgId: string;
  @field(2) name: string;
}
model CreateTeamResponse {
  @field(1) team: Team;
}

model UpdateTeamRequest {
  @field(1) teamId: string;
  @field(2) name: string;
}
model UpdateTeamResponse {
  @field(1) team: Team;
}

model ArchiveTeamRequest {
  @field(1) teamId: string;
}
model ArchiveTeamResponse {
  @field(1) success: boolean;
}

model RestoreTeamRequest {
  @field(1) teamId: string;
}
model RestoreTeamResponse {
  @field(1) success: boolean;
}

model ListTeamsRequest {
  @field(1) orgId: string;
  @field(2) page?: PageRequest;
  @field(3) onlyDeleted?: boolean;
}
model ListTeamsResponse {
  @field(1) teams: Team[];
  @field(2) page?: PageResponse;
}

model AddTeamMemberRequest {
  @field(1) teamId: string;
  @field(2) userId: string;
}
model AddTeamMemberResponse {
  @field(1) success: boolean;
}

model RemoveTeamMemberRequest {
  @field(1) teamId: string;
  @field(2) userId: string;
}
model RemoveTeamMemberResponse {
  @field(1) success: boolean;
}

model ListTeamMembersRequest {
  @field(1) teamId: string;
  @field(2) page?: PageRequest;
}
model ListTeamMembersResponse {
  @field(1) members: TeamMember[];
  @field(2) page?: PageResponse;
}

interface TeamService {
  createTeam(request: CreateTeamRequest): CreateTeamResponse;
  updateTeam(request: UpdateTeamRequest): UpdateTeamResponse;
  archiveTeam(request: ArchiveTeamRequest): ArchiveTeamResponse;
  restoreTeam(request: RestoreTeamRequest): RestoreTeamResponse;
  listTeams(request: ListTeamsRequest): ListTeamsResponse;
  addTeamMember(request: AddTeamMemberRequest): AddTeamMemberResponse;
  removeTeamMember(request: RemoveTeamMemberRequest): RemoveTeamMemberResponse;
  listTeamMembers(request: ListTeamMembersRequest): ListTeamMembersResponse;
}

// ==== Roles, permissions and grants (M10-T11, ADR-0013) ====

model Permission {
  @field(1) key: string;
  @field(2) description: string;
}

model Role {
  @field(1) id: string;

  // Empty string for a system role (owner/admin/member/viewer) - it has no
  // owning organization, the same convention `deletedAt`/`username` etc.
  // already use for "this field does not apply here".
  @field(2) orgId: string;

  @field(3) name: string;
  @field(4) isSystem: boolean;
  @field(5) permissionKeys: string[];
  @field(6) createdAt: string;
}

model Grant {
  @field(1) id: string;
  @field(2) subjectType: string; // 'user' | 'team'
  @field(3) subjectId: string;
  @field(4) scopeType: string; // 'organization' | 'team' | 'project'
  @field(5) scopeId: string;
  @field(6) roleId: string;
  @field(7) roleName: string;
  @field(8) createdAt: string;
}

model ListPermissionsRequest {
  @field(1) orgId: string;
}
model ListPermissionsResponse {
  @field(1) permissions: Permission[];
}

model ListRolesRequest {
  @field(1) orgId: string;
  @field(2) page?: PageRequest;
}
model ListRolesResponse {
  @field(1) roles: Role[];
  @field(2) page?: PageResponse;
}

model CreateRoleRequest {
  @field(1) orgId: string;
  @field(2) name: string;
  @field(3) permissionKeys: string[];
}
model CreateRoleResponse {
  @field(1) role: Role;
}

model UpdateRoleRequest {
  @field(1) roleId: string;
  @field(2) name?: string;

  // Replaces the role's entire permission set when present - the GUI's
  // matrix always sends the full set it renders, never a delta.
  @field(3) permissionKeys?: string[];
}
model UpdateRoleResponse {
  @field(1) role: Role;
}

model DeleteRoleRequest {
  @field(1) roleId: string;
}
model DeleteRoleResponse {
  @field(1) success: boolean;
}

model GrantRoleRequest {
  @field(1) subjectType: string;
  @field(2) subjectId: string;
  @field(3) scopeType: string;
  @field(4) scopeId: string;
  @field(5) roleId: string;
}
model GrantRoleResponse {
  @field(1) grant: Grant;
}

model RevokeGrantRequest {
  @field(1) grantId: string;
}
model RevokeGrantResponse {
  @field(1) success: boolean;
}

model ListGrantsRequest {
  @field(1) scopeType: string;
  @field(2) scopeId: string;
  @field(3) page?: PageRequest;
}
model ListGrantsResponse {
  @field(1) grants: Grant[];
  @field(2) page?: PageResponse;
}

interface RoleService {
  listPermissions(request: ListPermissionsRequest): ListPermissionsResponse;
  listRoles(request: ListRolesRequest): ListRolesResponse;
  createRole(request: CreateRoleRequest): CreateRoleResponse;
  updateRole(request: UpdateRoleRequest): UpdateRoleResponse;
  deleteRole(request: DeleteRoleRequest): DeleteRoleResponse;
  grantRole(request: GrantRoleRequest): GrantRoleResponse;
  revokeGrant(request: RevokeGrantRequest): RevokeGrantResponse;
  listGrants(request: ListGrantsRequest): ListGrantsResponse;
}

// ==== Shared memory & beliefs (M21, ADR-0014/0015/0016) ====
//
// Belief.scopeType/scopeId reuses ADR-0013's existing 'organization' |
// 'team' | 'project' scope enum unchanged - no fourth, narrower tier
// (ADR-0014). searchBeliefs, not listBeliefs/getBelief, is the primary
// read path used by both an agent's capture-belief skill and the GUI's
// search-first Memory screen. `embedding`/`queryEmbedding` are optional,
// caller-supplied floats - unindexed and unused by v1's lexical-only
// retriever, captured so nothing needs backfilling if/when a pluggable
// VectorBeliefRetriever ships (ADR-0016).

model Belief {
  @field(1) id: string;
  @field(2) orgId: string;
  @field(3) scopeType: string; // 'organization' | 'team' | 'project'
  @field(4) scopeId: string;
  @field(5) statement: string;
  @field(6) confidence: string; // 'low' | 'medium' | 'high'
  @field(7) status: string; // 'active' | 'superseded' | 'retracted'
  @field(8) supersedesBeliefId?: string;
  @field(9) sourceKind: string; // 'agent' | 'user'
  @field(10) sourceAgentId?: string;
  @field(11) sourceUserId?: string;
  @field(12) sourceTaskId?: string;
  @field(13) sourceCommentId?: string;
  @field(14) sourceTaskNoteId?: string;
  @field(15) sourceArtifactId?: string;

  // Denormalized "latest hop" for cheap display - the full promotion
  // history is BeliefPromotion, reached via listBeliefPromotions.
  @field(16) promotedFromScopeType?: string;

  @field(17) promotedFromScopeId?: string;
  @field(18) promotedBy?: string;
  @field(19) promotedAt?: string;
  @field(20) deletedAt?: string;
  @field(21) createdAt: string;
  @field(22) embedding?: float32[];
}

model BeliefRelation {
  @field(1) id: string;
  @field(2) beliefAId: string;
  @field(3) beliefBId: string;
  @field(4) relationType: string; // 'relates_to' | 'supports' | 'contradicts' | 'duplicates'
  @field(5) createdBy: string;
  @field(6) createdAt: string;
}

model BeliefPromotion {
  @field(1) id: string;
  @field(2) beliefId: string;
  @field(3) fromScopeType: string;
  @field(4) fromScopeId: string;
  @field(5) toScopeType: string;
  @field(6) toScopeId: string;
  @field(7) promotedBy: string;
  @field(8) promotedAt: string;
  @field(9) note?: string;
}

model RecordBeliefRequest {
  @field(1) orgId: string;
  @field(2) scopeType: string;
  @field(3) scopeId: string;
  @field(4) statement: string;
  @field(5) confidence?: string; // server defaults to 'medium' when omitted
  @field(6) sourceTaskId?: string;
  @field(7) sourceCommentId?: string;
  @field(8) sourceTaskNoteId?: string;
  @field(9) sourceArtifactId?: string;
  @field(10) embedding?: float32[];
}
model RecordBeliefResponse {
  @field(1) belief: Belief;
}

model GetBeliefRequest {
  @field(1) id: string;
}
model GetBeliefResponse {
  @field(1) belief: Belief;
}

model ListBeliefsRequest {
  @field(1) scopeType: string;
  @field(2) scopeId: string;
  @field(3) page?: PageRequest;
  @field(4) status?: string;
  @field(5) confidence?: string;
}
model ListBeliefsResponse {
  @field(1) beliefs: Belief[];
  @field(2) page?: PageResponse;
}

model SearchBeliefsRequest {
  @field(1) scopeType: string;
  @field(2) scopeId: string;
  @field(3) query: string;
  @field(4) taskId?: string;
  @field(5) status?: string;
  @field(6) confidence?: string;
  @field(7) queryEmbedding?: float32[];
  @field(8) limit?: int32;
}
model SearchBeliefsResponse {
  @field(1) beliefs: Belief[];
}

model UpdateBeliefRequest {
  @field(1) id: string;

  // Real proto3 presence, matching UpdateProjectRequest.description
  // (M20-T03's lesson) - unset means "don't touch", explicit empty is
  // rejected by the handler (a blank statement is not a meaningful
  // clear, same reasoning UpdateProjectTemplateRequest.name uses).
  @field(2) statement?: string;

  @field(3) confidence?: string;
}
model UpdateBeliefResponse {
  @field(1) belief: Belief;
}

model SupersedeBeliefRequest {
  @field(1) id: string;
  @field(2) statement: string;
  @field(3) confidence?: string;
  @field(4) sourceTaskId?: string;
  @field(5) sourceCommentId?: string;
  @field(6) sourceTaskNoteId?: string;
  @field(7) sourceArtifactId?: string;
  @field(8) embedding?: float32[];
}
model SupersedeBeliefResponse {
  @field(1) belief: Belief; // the new belief; the superseded one is unchanged except status
}

model PromoteBeliefRequest {
  @field(1) id: string;
  @field(2) toScopeType: string;
  @field(3) toScopeId: string;
  @field(4) note?: string;
}
model PromoteBeliefResponse {
  @field(1) belief: Belief;
  @field(2) promotion: BeliefPromotion;
}

model RelateBeliefsRequest {
  @field(1) beliefAId: string;
  @field(2) beliefBId: string;
  @field(3) relationType: string;
}
model RelateBeliefsResponse {
  @field(1) relation: BeliefRelation;
}

model UnrelateBeliefsRequest {
  @field(1) relationId: string;
}
model UnrelateBeliefsResponse {
  @field(1) success: boolean;
}

model ListBeliefRelationsRequest {
  @field(1) beliefId: string;
}
model ListBeliefRelationsResponse {
  @field(1) relations: BeliefRelation[];
}

model ListBeliefPromotionsRequest {
  @field(1) beliefId: string;
}
model ListBeliefPromotionsResponse {
  @field(1) promotions: BeliefPromotion[];
}

model ArchiveBeliefRequest {
  @field(1) id: string;
}
model ArchiveBeliefResponse {
  @field(1) success: boolean;
}

model RestoreBeliefRequest {
  @field(1) id: string;
}
model RestoreBeliefResponse {
  @field(1) success: boolean;
}

model PurgeBeliefRequest {
  @field(1) id: string;
}
model PurgeBeliefResponse {
  @field(1) success: boolean;
}

interface MemoryService {
  recordBelief(request: RecordBeliefRequest): RecordBeliefResponse;
  getBelief(request: GetBeliefRequest): GetBeliefResponse;
  listBeliefs(request: ListBeliefsRequest): ListBeliefsResponse;
  searchBeliefs(request: SearchBeliefsRequest): SearchBeliefsResponse;
  updateBelief(request: UpdateBeliefRequest): UpdateBeliefResponse;
  supersedeBelief(request: SupersedeBeliefRequest): SupersedeBeliefResponse;
  promoteBelief(request: PromoteBeliefRequest): PromoteBeliefResponse;
  relateBeliefs(request: RelateBeliefsRequest): RelateBeliefsResponse;
  unrelateBeliefs(request: UnrelateBeliefsRequest): UnrelateBeliefsResponse;
  listBeliefRelations(
    request: ListBeliefRelationsRequest,
  ): ListBeliefRelationsResponse;
  listBeliefPromotions(
    request: ListBeliefPromotionsRequest,
  ): ListBeliefPromotionsResponse;
  archiveBelief(request: ArchiveBeliefRequest): ArchiveBeliefResponse;
  restoreBelief(request: RestoreBeliefRequest): RestoreBeliefResponse;
  purgeBelief(request: PurgeBeliefRequest): PurgeBeliefResponse;
}
