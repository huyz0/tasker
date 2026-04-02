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

model ListOrgsRequest {}
model ListOrgsResponse {
  @field(1) organizations: Organization[];
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
