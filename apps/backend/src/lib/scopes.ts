/**
 * The fixed scope vocabulary from ADR-0008.
 *
 * Closed on purpose. Fine-grained, per-RPC permissions are M10's job, designed
 * against a real policy model; shipping a sprawling vocabulary now would mean
 * either migrating every issued token when M10 lands or carrying two systems.
 *
 * No scope grants organization administration. Org mutations, AuthService and
 * token issuance itself are refused to agent principals categorically rather
 * than by omitting a scope from a token — an agent that could mint tokens or
 * add members would escape every other limit here.
 */
export const AGENT_SCOPES = [
  'tasks:read',
  'tasks:write',
  'comments:write',
  'artifacts:read',
  'artifacts:write',
  'projects:read',
  'agents:read',
  'repos:read',
] as const;

// A type alias and an isAgentScope guard belong here too, but M04-T07 is what
// will need them. knip fails the build on an export nothing imports, which is
// the right trade: they arrive with their first caller.

/**
 * Which scope each RPC requires of an agent, keyed by handler then method.
 *
 * **Absence means denial.** A method not listed here cannot be called with a
 * token at all, no matter what scopes it holds — `agent-scope-sweep.test.ts`
 * enumerates every method on every handler and fails naming any that is neither
 * listed nor refusing an agent. So a new endpoint is closed to agents until
 * someone writes it down, rather than open until someone remembers to close it.
 * Same inversion as M03's viewer sweep.
 *
 * What is deliberately absent: everything destructive (archive, restore, purge,
 * deleteTask), all organization and membership administration, and token
 * issuance itself. An agent that could purge a project or mint a credential
 * escapes every other limit here (ADR-0008).
 */
export const AGENT_RPC_SCOPES: Record<string, Record<string, string>> = {
  // Keyed by handler factory, not by subject: task *types* and task
  // *management* are two handlers, and putting a method under the wrong key
  // silently leaves it unmapped. The sweep caught exactly that here.
  tasks: {
    getTaskType: 'tasks:read',
    listTaskTypes: 'tasks:read',
  },
  taskManagement: {
    listTasks: 'tasks:read',
    listTaskReviewers: 'tasks:read',
    createTask: 'tasks:write',
    updateTask: 'tasks:write',
    updateTaskStatus: 'tasks:write',
    // assignTask and unassignTask are deliberately absent. Deciding which
    // worker picks up a piece of work is an orchestration decision, and a token
    // that can reassign work to itself is a token that can help itself to any
    // task in the organization - or take itself off one it was given. Revisit
    // with M10, which owns delegation.
  },
  taskNotes: {
    listTaskNotes: 'tasks:read',
    createTaskNote: 'comments:write',
    updateTaskNote: 'comments:write',
    deleteTaskNote: 'comments:write',
  },
  comments: {
    listComments: 'tasks:read',
    createComment: 'comments:write',
    updateComment: 'comments:write',
    deleteComment: 'comments:write',
  },
  artifacts: {
    listFolders: 'artifacts:read',
    listArtifacts: 'artifacts:read',
    createFolder: 'artifacts:write',
    updateFolder: 'artifacts:write',
    createArtifact: 'artifacts:write',
    updateArtifactContent: 'artifacts:write',
    linkTaskArtifact: 'artifacts:write',
    listTaskArtifactLinks: 'artifacts:read',
    // unlinkTaskArtifact is deliberately absent. An agent that can detach its
    // own output from the task it was given can hide the work; the same
    // argument that keeps unassignTask closed.
  },
  projects: {
    getProject: 'projects:read',
    listProjects: 'projects:read',
  },
  projectTemplates: {
    getTemplate: 'projects:read',
    listTemplates: 'projects:read',
  },
  labels: {
    listLabels: 'projects:read',
    listEntityLabels: 'projects:read',
  },
  agents: {
    listAgents: 'agents:read',
    listAgentRoles: 'agents:read',
  },
  repositories: {
    listRepositoryLinks: 'repos:read',
    listPullRequests: 'repos:read',
    listBuilds: 'repos:read',
    listDeployments: 'repos:read',
  },
};
