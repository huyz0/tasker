import "@typespec/protobuf";

using TypeSpec.Protobuf;

@package({
  name: "tasker.health.v1"
})
@TypeSpec.service(#{
  title: "Health Service"
})
namespace Tasker.Health.V1;

model PingRequest {}

model PingResponse {
  @field(1) message: string;
  @field(2) dbStatus: string;
}

op ping(request: PingRequest): PingResponse;
