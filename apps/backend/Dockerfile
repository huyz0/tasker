# The backend as a container image (M11-T06).
#
# Two stages. The builder has the whole monorepo and the toolchain; the runtime
# has one compiled binary and nothing else — no Bun, no node_modules, no source,
# no package manager. That is not only about size: an image with no interpreter
# and no shell package manager is an image where a remote-code-execution bug has
# very little left to execute.
#
# Built from the repository root, not from this directory:
#   docker build -f apps/backend/Dockerfile -t tasker-backend .
# The backend imports the generated contract out of `packages/shared-contract`,
# so a context narrowed to `apps/backend` cannot see half of what it compiles.

# ---------------------------------------------------------------- build stage
FROM oven/bun:1.3-alpine AS builder
WORKDIR /src

# `better-sqlite3` arrives transitively (drizzle-kit) and compiles a native
# addon on install. Nothing here uses it — the runtime driver is `bun:sqlite` —
# but the install fails without a toolchain, and skipping install scripts
# wholesale would skip every other package's too. Builder stage only; none of
# this reaches the runtime image.
RUN apk add --no-cache python3 make g++

# Manifests and the lockfile first, so a source-only change reuses the cached
# install layer. The root manifest has to come too: `apps/backend` depends on
# `shared-contract@workspace:*`, which only resolves from the workspace root —
# without it, `bun install` fails with "Workspace dependency not found".
COPY package.json bun.lock ./
COPY packages/shared-contract/package.json packages/shared-contract/
COPY apps/backend/package.json apps/backend/
COPY apps/gui/package.json apps/gui/
RUN bun install --frozen-lockfile

COPY packages/shared-contract packages/shared-contract
COPY apps/gui apps/gui
COPY apps/backend apps/backend

# The GUI is compiled into the binary (M09-T02), so it has to exist first.
RUN cd apps/gui && bun run build

WORKDIR /src/apps/backend
ARG GIT_SHA=dev
ENV GIT_SHA=${GIT_SHA}
RUN bun run scripts/bundle-gui.ts \
 && bun build --compile --minify --sourcemap --outfile /out/tasker src/index.ts \
 && bun build --compile --minify --sourcemap --outfile /out/tasker-consumer src/consumers/index.ts \
 && bun run scripts/bundle-gui.ts --reset

# -------------------------------------------------------------- runtime stage
# Alpine rather than `scratch`: the binary is dynamically linked against musl,
# and a health check needs *something* to run. `wget` comes from busybox; the
# C++ runtime is the one real addition, and it is not optional — a Bun binary
# links `libstdc++` and `libgcc`, and without them the image starts and
# immediately dies on "Error loading shared library libstdc++.so.6", which is a
# uniquely unhelpful way to discover a base image is too small.
FROM alpine:3.20
RUN apk add --no-cache libstdc++ libgcc

# A fixed uid, so a volume mounted from the host has predictable ownership
# rather than whatever the next base image happens to allocate.
RUN addgroup -g 10001 -S tasker && adduser -u 10001 -S -G tasker tasker

COPY --from=builder /out/tasker /usr/local/bin/tasker
COPY --from=builder /out/tasker-consumer /usr/local/bin/tasker-consumer

# The working directory the binary writes its SQLite file into when standalone.
# Owned by the runtime user, because the process never runs as root.
WORKDIR /data
RUN chown tasker:tasker /data

USER tasker
EXPOSE 8080

ENV PORT=8080 \
    NODE_ENV=production

# Liveness, not readiness (M11-T08): a container that is draining is healthy,
# and `docker` would restart it if this said otherwise. Readiness is `/readyz`,
# for whatever is routing traffic.
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["tasker"]
