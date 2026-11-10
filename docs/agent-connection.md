# Register an agent and connect a worker

Registering creates an identity for a worker you run in your own environment.
Tasker does not start or host that process. An organization administrator issues
its API token; the worker's requests are attributed to that identity.

## Register the identity

Open **AI Agents** in the intended organization and choose **Register agent**.
Enter its name and select a role. If no role exists, **Create a role** opens the
role form while preserving the agent name. A role describes instructions and
capabilities; token scopes determine API access.

Registration opens **Connect [agent name]** above the list. Existing agents use
**Tokens** to open that same section. Registration alone does not create a token
or establish an external connection.

## Issue and save the credential

Choose **New token**, name its purpose, and explicitly select only the scopes the
worker needs. No scopes are selected automatically.

| Work | Relevant scopes |
| --- | --- |
| Read task context | `tasks:read` |
| Claim, update and release tasks | `tasks:read`, `tasks:write` |
| Record task notes or comments | `comments:write`, plus `tasks:read` to inspect context |
| Discover projects | `projects:read` |
| Read reported artifact content | `artifacts:read` |
| Use shared memory | `memory:read` and, when needed, `memory:write` |
| Receive live events | `events:read` plus read scopes for the desired data |

Leave expiry blank for 90 days, or choose 1–365 whole days. A token is bound to
its agent's organization. An optional project in copied configuration selects a
CLI default context; it does not make the token project-restricted.

**Save this token** reveals the secret once. **Copy token** and **Copy
configuration** are explicit actions; configuration copying includes the secret.
The visible configuration preview uses `<TOKEN>` instead. Treat copied
configuration as a secret and keep it out of Git and shared logs.

Closing, leaving, replacing the token, changing account/organization/agent or
confirmed sign-out loses this copy. Canceling a pending creation cannot undo a
server write that already completed. The token's metadata remains manageable;
revoke and replace a lost credential. Its secret cannot be recovered. A temporary
metadata refresh failure preserves the current copy, while confirmed loss of
administration access retires it.

## Configure the external client

Install the [Tasker CLI](../apps/cli/README.md) where the worker runs. Choose **Shell** for environment
variables or **MCP stdio** for a client that launches `tasker mcp`. Copied settings
include the configured API, organization and optional current project.

From that environment, check the identity:

```bash
tasker auth whoami
```

For MCP, call `whoami` first, then `get_task` for an authorized task. With
`comments:write`, `add_task_note` records a note under this agent. Claiming work
also needs `tasks:write`. See [MCP clients](mcp.md) for HTTP/stdio configuration
and [agent integration](agent-integration.md) for the complete work loop.

The worker must be able to reach the copied endpoint. `localhost` refers to the
machine running that client; it is suitable when the backend is on that machine.
For remote workers, use a reachable deployment endpoint.

## Verify this exact token

**Verify token** makes a fresh identity request with that newly issued bearer,
without the administrator's browser cookie. Success requires the returned agent,
organization, token identity and scopes to match. The result shows the actual
identity and request completion time.

**Token verified at** records one successful API authentication request. It does
not establish that the external worker is running or that the credential remains
valid afterward. Verification itself updates recorded token last-use metadata.
A failed retry clears the current verification result; the one-time copy remains
available for saving or retry unless it is dismissed or access is lost.

| Result | Next step |
| --- | --- |
| Token refused | Check expiry/revocation and issue a replacement when needed. |
| Could not reach the API | Check the endpoint, connectivity, TLS/mixed content, CORS and redirects, then retry. |
| Different identity | Check the deployment and issue the intended agent credential; a human session response cannot verify it. |
| Token administration unavailable | Check current administrator access and use **Retry tokens**. Cached rows do not restore denied controls. |
| Lost secret | Revoke its metadata row and issue a new token. |

Revocation blocks subsequent API use. It does not terminate an external process.

## Configure the GUI's API destination

The GUI uses one build-time destination for ordinary API requests, verification
and generated worker configuration:

- With no override, development uses `http://localhost:8080`.
- With no override, a production build uses its serving HTTP(S) origin.
- Set `VITE_BACKEND_URL` before building when the API is separate or needs a
  path prefix, for example `https://api.example.com/tasker`.

The override must be an absolute HTTP(S) URL without embedded credentials, query
or fragment. Trailing slashes are normalized and an API path prefix is preserved.
It is deployment configuration, not an editable destination for probing a token.
Invalid explicit settings fail before the build emits client assets, with a
sanitized configuration error. Runtime origin validation uses the same rules.

For separate GUI/API origins, include the GUI's exact origin in the backend's
`CORS_ALLOWED_ORIGINS`. The API permits the `Authorization` preflight header for
those already-allowed origins. Use an HTTPS API with an HTTPS GUI to avoid browser
mixed-content blocking. Rebuild the GUI when changing its destination.
