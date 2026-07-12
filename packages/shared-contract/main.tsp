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

interface OrgService {
  listOrgs(request: ListOrgsRequest): ListOrgsResponse;
  seedOrg(request: SeedOrgRequest): SeedOrgResponse;
  archiveOrg(request: ArchiveOrgRequest): ArchiveOrgResponse;
  restoreOrg(request: RestoreOrgRequest): RestoreOrgResponse;
  purgeOrg(request: PurgeOrgRequest): PurgeOrgResponse;
  setOrgRetentionDays(
    request: SetOrgRetentionDaysRequest,
  ): SetOrgRetentionDaysResponse;

  inviteUser(request: InviteUserRequest): InviteUserResponse;
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
}
model CreateTaskTypeResponse {
  @field(1) taskType: TaskType;
}

interface TaskTypeService {
  getTaskType(request: GetTaskTypeRequest): GetTaskTypeResponse;
  createTaskType(request: CreateTaskTypeRequest): CreateTaskTypeResponse;
}

// ==== Project Models ====

model ProjectTemplate {
  @field(1) id: string;
  @field(2) orgId: string;
  @field(3) name: string;
  @field(4) description: string;
}

model Project {
  @field(1) id: string;
  @field(2) orgId: string;
  @field(3) templateId: string;
  @field(4) name: string;
  @field(5) ownerId: string;
  @field(6) deletedAt?: string;
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

interface ProjectTemplateService {
  getTemplate(request: GetProjectTemplateRequest): GetProjectTemplateResponse;
  createTemplate(
    request: CreateProjectTemplateRequest,
  ): CreateProjectTemplateResponse;
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

interface ProjectService {
  getProject(request: GetProjectRequest): GetProjectResponse;
  createProject(request: CreateProjectRequest): CreateProjectResponse;
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

model ListAgentRolesRequest {}
model ListAgentRolesResponse {
  @field(1) roles: AgentRole[];
}

model CreateAgentRequest {
  @field(1) orgId: string;
  @field(2) agentRoleId: string;
  @field(3) name: string;
}

model CreateAgentResponse {
  @field(1) agent: Agent;
}

model ListAgentsRequest {
  @field(1) orgId: string;
  @field(2) onlyDeleted?: boolean;
}

model ListAgentsResponse {
  @field(1) agents: Agent[];
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
  listAgentRoles(request: ListAgentRolesRequest): ListAgentRolesResponse;
  createAgent(request: CreateAgentRequest): CreateAgentResponse;
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
}

// ==== Task Services ====

model CreateTaskRequest {
  @field(1) projectId: string;
  @field(2) title: string;
  @field(3) status: string;
  @field(4) description: string;
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
  updateTaskStatus(request: UpdateTaskStatusRequest): UpdateTaskStatusResponse;
  deleteTask(request: DeleteTaskRequest): DeleteTaskResponse;
  restoreTask(request: RestoreTaskRequest): RestoreTaskResponse;
  purgeTask(request: PurgeTaskRequest): PurgeTaskResponse;
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

model CreateArtifactRequest {
  @field(1) folderId: string;
  @field(2) name: string;
  @field(3) description: string;
  @field(4) content: string;
}
model CreateArtifactResponse {
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
  createArtifact(request: CreateArtifactRequest): CreateArtifactResponse;
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

interface CommentService {
  createComment(request: CreateCommentRequest): CreateCommentResponse;
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

interface TaskNoteService {
  createTaskNote(request: CreateTaskNoteRequest): CreateTaskNoteResponse;
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
}
model ListLabelsResponse {
  @field(1) labels: Label[];
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

interface LabelService {
  createLabel(request: CreateLabelRequest): CreateLabelResponse;
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
  @field(4) oauthCode: string; // Will be exchanged for access token
}
model AddRepositoryLinkResponse {
  @field(1) link: RepositoryLink;
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
