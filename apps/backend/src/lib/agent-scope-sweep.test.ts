import { describe, it, expect, beforeAll } from 'bun:test';
import { createContextValues, ConnectError, Code } from '@connectrpc/connect';
import { setupIntegrationTest } from '../test/setup';
import * as schema from '../db/schema.sqlite';
import { currentPrincipalKey, type Principal } from '../modules/auth/session';
import { AGENT_RPC_SCOPES, AGENT_SCOPES } from './scopes';

import { createOrgsHandler } from '../modules/orgs/orgs.handler';
import { createProjectsHandler, createProjectTemplatesHandler } from '../modules/projects/projects.handler';
import { createTasksHandler, createTaskManagementHandler } from '../modules/tasks/tasks.handler';
import { createTaskNotesHandler } from '../modules/tasks/task_notes.handler';
import { createAgentsHandler } from '../modules/agents/agents.handler';
import { createArtifactsHandler } from '../modules/artifacts/artifacts.handler';
import { createCommentsHandler } from '../modules/comments/comments.handler';
import { createLabelsHandler } from '../modules/labels/labels.handler';
import { createRepositoriesHandler } from '../modules/repositories/repositories.handler';
import { createHealthHandler } from '../modules/health/health.handler';
import { createAuthHandler } from '../modules/auth/auth.handler';
import createSearchHandler from '../modules/search/search.handler';

/**
 * Deny-by-default for agent tokens, the sibling of `viewer-denial.test.ts`.
 *
 * Every method on every handler must either appear in `AGENT_RPC_SCOPES` or
 * refuse an agent principal. A method in neither state fails this suite by
 * name. The point of the inversion is that adding an endpoint cannot silently
 * expose it to every token in the system — the omission is a build failure, and
 * the map is the single reviewable place where "an agent may call this" is
 * written down.
 *
 * When this fails on a new RPC, decide whether agents should reach it. If not,
 * leave it out and make sure it uses `requireUser`. Do not add it to the map to
 * make the red go away.
 */

/** Handlers agents may never reach at all, whatever scopes they hold. */
const NO_AGENT_ACCESS = ['orgs', 'auth', 'search'];

/** Unauthenticated, so there is no principal for a scope to apply to. */
const PUBLIC: Record<string, string[]> = { health: ['ping'] };

const ids = {
  org: 'org-scope-sweep',
  user: 'user-scope-sweep',
  agent: 'agent-scope-sweep',
  agentRole: 'arole-scope-sweep',
  template: 'tmpl-scope-sweep',
  project: 'proj-scope-sweep',
  task: 'task-scope-sweep',
  folder: 'fld-scope-sweep',
  artifact: 'art-scope-sweep',
  comment: 'cmt-scope-sweep',
  note: 'note-scope-sweep',
  label: 'lbl-scope-sweep',
  repoLink: 'repo-scope-sweep',
  token: 'tok-scope-sweep',
  taskType: 'tt-scope-sweep',
  taskStatus: 'tstat-scope-sweep',
};

/** One sample request per method, enough to reach the authorization check. */
const REQUESTS: Record<string, Record<string, unknown>> = {
  orgs: {
    listOrgs: {},
    seedOrg: { name: 'X', slug: 'x-scope-sweep' },
    updateOrg: { orgId: ids.org, name: 'X' },
    listInvitations: { orgId: ids.org },
    revokeInvitation: { invitationId: 'inv-x' },
    listOrgMembers: { orgId: ids.org },
    removeOrgMember: { orgId: ids.org, userId: ids.user },
    updateOrgMemberRole: { orgId: ids.org, userId: ids.user, role: 'admin' },
    inviteUser: { orgId: ids.org, email: 'x@test.local' },
    archiveOrg: { orgId: ids.org },
    restoreOrg: { orgId: ids.org },
    purgeOrg: { orgId: ids.org },
    setOrgRetentionDays: { orgId: ids.org, binRetentionDays: 5 },
  },
  auth: { getIdentity: {} },
  // Registered through a router rather than as a handler factory, which is why
  // it was absent from this sweep and from viewer-denial's until M04-T12 went
  // looking. It is closed to agents today only because it still calls
  // requireUser; nothing would have caught a future migration.
  search: { universalSearch: { orgId: ids.org, query: 'x' } },
  projects: {
    getProject: { id: ids.project },
    listProjects: { orgId: ids.org },
    createProject: { orgId: ids.org, templateId: ids.template, name: 'P', key: 'PK' },
    updateProject: { projectId: ids.project, name: 'P2' },
    archiveProject: { projectId: ids.project },
    restoreProject: { projectId: ids.project },
    purgeProject: { projectId: ids.project },
  },
  projectTemplates: {
    getTemplate: { id: ids.template },
    listTemplates: { orgId: ids.org },
    createTemplate: { orgId: ids.org, name: 'T' },
    updateTemplate: { id: ids.template, name: 'T2' },
  },
  tasks: {
    getTaskType: { id: ids.taskType },
    listTaskTypes: { orgId: ids.org },
    createTaskType: { orgId: ids.org, projectId: ids.project, name: 'TT' },
    updateTaskType: { id: ids.taskType, name: 'TT2' },
    createTaskStatus: { taskTypeId: ids.taskType, name: 'S' },
    createTaskStatusTransition: { taskTypeId: ids.taskType, fromStatusId: ids.taskStatus, toStatusId: ids.taskStatus },
  },
  taskManagement: {
    createTask: { projectId: ids.project, title: 'T' },
    listTasks: { projectId: ids.project },
    assignTask: { taskId: ids.task, agentId: ids.agent },
    unassignTask: { taskId: ids.task, agentId: ids.agent },
    addTaskReviewer: { taskId: ids.task, userId: ids.user },
    removeTaskReviewer: { taskId: ids.task, userId: ids.user },
    listTaskReviewers: { taskId: ids.task },
    updateTask: { taskId: ids.task, title: 'T2' },
    updateTaskStatus: { taskId: ids.task, status: 'done' },
    deleteTask: { taskId: ids.task },
    restoreTask: { taskId: ids.task },
    purgeTask: { taskId: ids.task },
  },
  taskNotes: {
    listTaskNotes: { taskId: ids.task },
    createTaskNote: { taskId: ids.task, content: 'n' },
    updateTaskNote: { taskNoteId: ids.note, content: 'n2' },
    deleteTaskNote: { taskNoteId: ids.note },
  },
  comments: {
    listComments: { entityId: ids.task, entityType: 'task' },
    createComment: { entityId: ids.task, entityType: 'task', content: 'c' },
    updateComment: { commentId: ids.comment, content: 'c2' },
    deleteComment: { commentId: ids.comment },
  },
  agents: {
    listAgents: { orgId: ids.org },
    listAgentRoles: { orgId: ids.org },
    createAgentRole: { orgId: ids.org, name: 'R', systemPrompt: 'p', capabilities: '[]' },
    updateAgentRole: { id: ids.agentRole, name: 'R2' },
    createAgent: { orgId: ids.org, agentRoleId: ids.agentRole, name: 'A' },
    updateAgent: { agentId: ids.agent, name: 'A2' },
    archiveAgent: { agentId: ids.agent },
    restoreAgent: { agentId: ids.agent },
    purgeAgent: { agentId: ids.agent },
    createAgentToken: { agentId: ids.agent, name: 'T', scopes: ['tasks:read'] },
    listAgentTokens: { agentId: ids.agent },
    revokeAgentToken: { tokenId: ids.token },
  },
  artifacts: {
    listFolders: { projectId: ids.project },
    listArtifacts: { folderId: ids.folder },
    createFolder: { projectId: ids.project, name: 'F' },
    updateFolder: { folderId: ids.folder, name: 'F2' },
    createArtifact: { folderId: ids.folder, name: 'A' },
    updateArtifactContent: { artifactId: ids.artifact, content: 'x' },
    linkTaskArtifact: { taskId: ids.task, artifactId: ids.artifact },
    archiveArtifact: { artifactId: ids.artifact },
    restoreArtifact: { artifactId: ids.artifact },
    archiveFolder: { folderId: ids.folder },
    restoreFolder: { folderId: ids.folder },
    purgeArtifact: { artifactId: ids.artifact },
    purgeFolder: { folderId: ids.folder },
  },
  labels: {
    listLabels: { orgId: ids.org },
    listEntityLabels: { entityId: ids.task, entityType: 'task' },
    createLabel: { orgId: ids.org, name: 'L', color: '#fff' },
    updateLabel: { labelId: ids.label, name: 'L2' },
    attachLabel: { labelId: ids.label, entityId: ids.task, entityType: 'task' },
    detachLabel: { labelId: ids.label, entityId: ids.task, entityType: 'task' },
  },
  repositories: {
    listRepositoryLinks: { projectId: ids.project },
    listPullRequests: { repositoryLinkId: ids.repoLink },
    listBuilds: { repositoryLinkId: ids.repoLink },
    listDeployments: { repositoryLinkId: ids.repoLink },
    addRepositoryLink: { projectId: ids.project, provider: 'github', remoteName: 'o/r', accessToken: 't' },
    removeRepositoryLink: { repositoryLinkId: ids.repoLink },
    syncPullRequests: { repositoryLinkId: ids.repoLink },
  },
  health: { ping: {} },
};

let handlers: Record<string, any>;

/** A token holding every scope. If it is still refused, the refusal is not about scopes. */
const allScopes = (): Principal => ({
  kind: 'agent',
  agentId: ids.agent,
  orgId: ids.org,
  tokenId: ids.token,
  scopes: [...AGENT_SCOPES],
});

const ctxFor = (principal: Principal) => {
  const values = createContextValues();
  values.set(currentPrincipalKey, principal);
  return { values } as any;
};

beforeAll(async () => {
  const { db } = await setupIntegrationTest();
  const now = new Date();
  await db.insert(schema.organizations).values({ id: ids.org, name: 'O', slug: ids.org, createdAt: now });
  await db.insert(schema.users).values({ id: ids.user, email: 'u@scope.test', name: 'U', createdAt: now });
  await db.insert(schema.organizationMembers).values({ orgId: ids.org, userId: ids.user, role: 'admin', joinedAt: now });
  await db.insert(schema.agentRoles).values({ id: ids.agentRole, orgId: ids.org, name: 'R', systemPrompt: 'p', capabilities: '[]', createdAt: now });
  await db.insert(schema.agents).values({ id: ids.agent, orgId: ids.org, agentRoleId: ids.agentRole, name: 'A', createdAt: now });
  await db.insert(schema.projectTemplates).values({ id: ids.template, orgId: ids.org, name: 'T', createdAt: now });
  await db.insert(schema.projects).values({ id: ids.project, orgId: ids.org, templateId: ids.template, ownerId: ids.user, name: 'P', key: 'PS', createdAt: now });
  await db.insert(schema.taskTypes).values({ id: ids.taskType, orgId: ids.org, projectId: ids.project, name: 'TT', createdAt: now });
  await db.insert(schema.taskStatuses).values({ id: ids.taskStatus, taskTypeId: ids.taskType, name: 'todo' });
  await db.insert(schema.tasks).values({ id: ids.task, projectId: ids.project, title: 'T', status: 'todo', createdAt: now });
  await db.insert(schema.folders).values({ id: ids.folder, projectId: ids.project, name: 'F', createdAt: now });
  await db.insert(schema.artifacts).values({ id: ids.artifact, folderId: ids.folder, name: 'A', createdAt: now });
  await db.insert(schema.comments).values({ id: ids.comment, entityId: ids.task, entityType: 'task', agentId: ids.agent, content: 'c', createdAt: now });
  await db.insert(schema.taskNotes).values({ id: ids.note, taskId: ids.task, agentId: ids.agent, content: 'n', createdAt: now });
  await db.insert(schema.labels).values({ id: ids.label, orgId: ids.org, name: 'L', color: '#fff', createdAt: now });
  await db.insert(schema.repositoryLinks).values({ id: ids.repoLink, projectId: ids.project, provider: 'github', remoteName: 'o/r', accessTokenEncrypted: 'x', createdAt: now });

  handlers = {
    orgs: createOrgsHandler(db, null),
    auth: createAuthHandler(db),
    projects: createProjectsHandler(db, null),
    projectTemplates: createProjectTemplatesHandler(db, null),
    tasks: createTasksHandler(db, null),
    taskManagement: createTaskManagementHandler(db, null),
    taskNotes: createTaskNotesHandler(db, null),
    comments: createCommentsHandler(db, null),
    agents: createAgentsHandler(db, null),
    artifacts: createArtifactsHandler(db, null),
    labels: createLabelsHandler(db, null),
    repositories: createRepositoriesHandler(db, null),
    health: createHealthHandler(db, null),
    // createSearchHandler takes a ConnectRouter and registers onto it, so the
    // methods are recovered from a stub router rather than from a return value.
    search: (() => {
      const captured: Record<string, any> = {};
      createSearchHandler({ service: (_svc: unknown, impl: Record<string, any>) => Object.assign(captured, impl) } as any, db);
      return captured;
    })(),
  };
});

const methodsOf = (h: any) => Object.keys(h).filter((k) => typeof h[k] === 'function');

describe('agents are denied by default across every handler', () => {
  it('covers every handler method — no method is silently unclassified', () => {
    const missing: string[] = [];
    for (const [name, handler] of Object.entries(handlers)) {
      for (const method of methodsOf(handler)) {
        const mapped = AGENT_RPC_SCOPES[name]?.[method];
        const isPublic = PUBLIC[name]?.includes(method);
        const sample = REQUESTS[name]?.[method];
        if (!mapped && !isPublic && sample === undefined) {
          missing.push(`${name}.${method}`);
        }
      }
    }
    expect(missing, `unclassified: ${missing.join(', ')} — add a sample request (denied) or an AGENT_RPC_SCOPES entry (allowed)`).toEqual([]);
  });

  it('every scope in AGENT_RPC_SCOPES is one the vocabulary defines', () => {
    // A map entry naming a scope no token can hold would deny silently and read
    // as though it allowed.
    const bad: string[] = [];
    for (const [name, methods] of Object.entries(AGENT_RPC_SCOPES)) {
      for (const [method, scope] of Object.entries(methods)) {
        if (!(AGENT_SCOPES as readonly string[]).includes(scope)) bad.push(`${name}.${method} -> ${scope}`);
      }
    }
    expect(bad).toEqual([]);
  });

  for (const handlerName of NO_AGENT_ACCESS) {
    it(`refuses every method on ${handlerName} to a token holding every scope`, async () => {
      const survivors: string[] = [];
      for (const [method, req] of Object.entries(REQUESTS[handlerName] ?? {})) {
        try {
          await handlers[handlerName][method](req, ctxFor(allScopes()));
          survivors.push(method);
        } catch (e) {
          if (!(e instanceof ConnectError) || e.code !== Code.PermissionDenied) survivors.push(`${method} (${(e as Error).message})`);
        }
      }
      expect(survivors).toEqual([]);
    });
  }
});

describe('unmapped methods refuse an agent even with every scope', () => {
  it('denies each one', async () => {
    const survivors: string[] = [];
    for (const [name, handler] of Object.entries(handlers)) {
      if (NO_AGENT_ACCESS.includes(name) || name === 'health') continue;
      for (const method of methodsOf(handler)) {
        if (AGENT_RPC_SCOPES[name]?.[method]) continue;
        const req = REQUESTS[name]?.[method];
        if (req === undefined) continue; // reported by the completeness test
        try {
          await handler[method](req, ctxFor(allScopes()));
          survivors.push(`${name}.${method}`);
        } catch {
          // Any rejection is acceptable here: the method is closed to agents,
          // and which error it picks is the handler's business.
        }
      }
    }
    expect(survivors, `reachable by a token despite being unmapped: ${survivors.join(', ')}`).toEqual([]);
  });
});

describe('a mapped method checks the specific scope it names', () => {
  it('refuses a token holding every scope except the one required', async () => {
    const failures: string[] = [];
    for (const [name, methods] of Object.entries(AGENT_RPC_SCOPES)) {
      for (const [method, required] of Object.entries(methods)) {
        const req = REQUESTS[name]?.[method];
        if (req === undefined) continue;
        const principal: Principal = {
          ...allScopes(),
          scopes: AGENT_SCOPES.filter((s) => s !== required),
        } as Principal;
        try {
          await handlers[name][method](req, ctxFor(principal));
          failures.push(`${name}.${method} allowed without ${required}`);
        } catch (e) {
          if (e instanceof ConnectError && e.code !== Code.PermissionDenied) {
            failures.push(`${name}.${method} threw ${e.code} not permission_denied`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
