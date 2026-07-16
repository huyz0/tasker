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

interface AuthService {
  getIdentity(request: GetIdentityRequest): GetIdentityResponse;
}

model ListOrgsRequest {
  @field(1) page?: PageRequest;
  @field(2) onlyDeleted?: boolean;
}
model ListOrgsResponse {
  @field(1) organizations: Organization[];
  @field(2) page?: PageResponse;
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

model ListOrgMembersRequest {
  @field(1) orgId: string;
  @field(2) page?: PageRequest;
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
  listOrgMembers(request: ListOrgMembersRequest): ListOrgMembersResponse;
  removeOrgMember(request: RemoveOrgMemberRequest): RemoveOrgMemberResponse;
}

model InviteUserRequest {
  @field(1) orgId: string;
  @field(2) email: string;
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
}

// ==== Project Models ====

model ProjectTemplate {
  @field(1) id: string;
  @field(2) orgId: string;
  @field(3) name: string;
  @field(4) description: string;
  @field(5) rootTaskTypeId?: string;
}

model Project {
  @field(1) id: string;
  @field(2) orgId: string;
  @field(3) templateId: string;
  @field(4) name: string;
  @field(5) ownerId: string;
  @field(6) deletedAt?: string;
  @field(7) key: string;
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
}

model Agent {
  @field(1) id: string;
  @field(2) orgId: string;
  @field(3) agentRoleId: string;
  @field(4) name: string;
  @field(5) deletedAt?: string;
}

// ==== Agent Services ====

model CreateAgentRoleRequest {
  @field(1) name: string;
  @field(2) systemPrompt: string;
  @field(3) capabilities: string;
}

model CreateAgentRoleResponse {
  @field(1) role: AgentRole;
}

model ListAgentRolesRequest {
  @field(1) page?: PageRequest;
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
}

// ==== Task Models ====

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
}

// ==== Task Services ====

model CreateTaskRequest {
  @field(1) projectId: string;
  @field(2) title: string;
  @field(3) status: string;
  @field(4) description: string;
  @field(5) taskTypeId?: string;
}

model CreateTaskResponse {
  @field(1) task: Task;
}

model AssignTaskRequest {
  @field(1) taskId: string;
  @field(2) agentId: string;
  @field(3) userId: string;
}

model AssignTaskResponse {
  @field(1) success: boolean;
}

model TaskReviewer {
  @field(1) id: string;
  @field(2) taskId: string;
  @field(3) userId: string;
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

model ListTasksRequest {
  @field(1) projectId: string;
  @field(2) page?: PageRequest;
  @field(3) onlyDeleted?: boolean;
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
}

model Artifact {
  @field(1) id: string;
  @field(2) folderId: string;
  @field(3) name: string;
  @field(4) description: string;
  @field(5) content: string;
  @field(6) deletedAt?: string;
  @field(7) contentType: string;
}

model TaskArtifactLink {
  @field(1) id: string;
  @field(2) taskId: string;
  @field(3) artifactId: string;
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

model ListArtifactsRequest {
  @field(1) folderId: string;
  @field(2) page?: PageRequest;
  @field(3) onlyDeleted?: boolean;
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
  listArtifacts(request: ListArtifactsRequest): ListArtifactsResponse;
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

model CreateCommentRequest {
  @field(1) entityId: string;
  @field(2) entityType: string;
  @field(3) userId: string; // Optional
  @field(4) agentId: string; // Optional
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

model UpdateCommentRequest {
  @field(1) commentId: string;
  @field(2) content: string;

  // Caller's userId/agentId, used to authorize that only the original author
  // may edit or delete a comment - same attribution pattern as createComment.
  @field(3) userId: string; // Optional

  @field(4) agentId: string; // Optional
}
model UpdateCommentResponse {
  @field(1) comment: Comment;
}

model DeleteCommentRequest {
  @field(1) commentId: string;
  @field(2) userId: string; // Optional
  @field(3) agentId: string; // Optional
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
}

model CreateTaskNoteRequest {
  @field(1) taskId: string;
  @field(2) agentId: string;
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

model SearchResult {
  @field(1) id: string;
  @field(2) type: string; // "task" | "artifact"
  @field(3) title: string;
  @field(4) snippet: string;
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
