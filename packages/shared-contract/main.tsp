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
}
