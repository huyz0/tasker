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
}
model ListOrgsResponse {
  @field(1) organizations: Organization[];
  @field(2) page?: PageResponse;
}

model SeedOrgRequest {
  @field(1) name: string;
  @field(2) slug: string;
}
model SeedOrgResponse {
  @field(1) organization: Organization;
}

interface OrgService {
  listOrgs(request: ListOrgsRequest): ListOrgsResponse;
  seedOrg(request: SeedOrgRequest): SeedOrgResponse;

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

interface ProjectTemplateService {
  getTemplate(request: GetProjectTemplateRequest): GetProjectTemplateResponse;
  createTemplate(
    request: CreateProjectTemplateRequest,
  ): CreateProjectTemplateResponse;
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
}

model ListProjectsResponse {
  @field(1) projects: Project[];
  @field(2) page?: PageResponse;
}

interface ProjectService {
  getProject(request: GetProjectRequest): GetProjectResponse;
  createProject(request: CreateProjectRequest): CreateProjectResponse;
  listProjects(request: ListProjectsRequest): ListProjectsResponse;
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

model CreateAgentRequest {
  @field(1) orgId: string;
  @field(2) agentRoleId: string;
  @field(3) name: string;
}

model CreateAgentResponse {
  @field(1) agent: Agent;
}

interface AgentService {
  createAgentRole(request: CreateAgentRoleRequest): CreateAgentRoleResponse;
  createAgent(request: CreateAgentRequest): CreateAgentResponse;
}

// ==== Task Models ====

model Task {
  @field(1) id: string;
  @field(2) projectId: string;
  @field(3) title: string;
  @field(4) status: string;
  @field(5) description: string;
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
}

model ListTasksResponse {
  @field(1) tasks: Task[];
  @field(2) page?: PageResponse;
}

interface TaskService {
  createTask(request: CreateTaskRequest): CreateTaskResponse;
  assignTask(request: AssignTaskRequest): AssignTaskResponse;
  listTasks(request: ListTasksRequest): ListTasksResponse;
}

// ==== Artifacts ====

model Folder {
  @field(1) id: string;
  @field(2) projectId: string;
  @field(3) parentId: string;
  @field(4) name: string;
}

model Artifact {
  @field(1) id: string;
  @field(2) folderId: string;
  @field(3) name: string;
  @field(4) description: string;
  @field(5) content: string;
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
}

model ListArtifactsResponse {
  @field(1) artifacts: Artifact[];
  @field(2) page?: PageResponse;
}

model ListFoldersRequest {
  @field(1) projectId: string;
  @field(2) page?: PageRequest;
}

model ListFoldersResponse {
  @field(1) folders: Folder[];
  @field(2) page?: PageResponse;
}

interface ArtifactService {
  createFolder(request: CreateFolderRequest): CreateFolderResponse;
  createArtifact(request: CreateArtifactRequest): CreateArtifactResponse;
  linkTaskArtifact(request: LinkTaskArtifactRequest): LinkTaskArtifactResponse;
  listArtifacts(request: ListArtifactsRequest): ListArtifactsResponse;
  listFolders(request: ListFoldersRequest): ListFoldersResponse;
}

// ==== Comments ====

model Comment {
  @field(1) id: string;
  @field(2) entityId: string;
  @field(3) entityType: string;
  @field(4) userId: string;
  @field(5) agentId: string;
  @field(6) content: string;
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

interface RepositoryService {
  addRepositoryLink(
    request: AddRepositoryLinkRequest,
  ): AddRepositoryLinkResponse;
  listRepositoryLinks(
    request: ListRepositoryLinksRequest,
  ): ListRepositoryLinksResponse;
  syncPullRequests(request: SyncPullRequestsRequest): SyncPullRequestsResponse;
}
