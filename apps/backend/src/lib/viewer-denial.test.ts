import { describe, it, expect, beforeAll } from 'bun:test';
import { ConnectError, Code } from '@connectrpc/connect';
import { setupIntegrationTest, makeAuthContext } from '../test/setup';
import * as schema from '../db/schema.sqlite';

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

/**
 * Exhaustive proof that `viewer` cannot write. See ADR-0006.
 *
 * The rule is **deny by default**: every method on every handler must either
 * appear in READS below, or reject a viewer with PermissionDenied. A method
 * that is in neither state fails the suite with a message naming it.
 *
 * That inversion is the whole point. A convention that each mutating handler
 * "should call assertOrgWriter" decays the first time someone adds an endpoint
 * in a hurry. This test makes the omission a build failure, and makes the
 * allowlist the single place where "a viewer may call this" has to be written
 * down and reviewed.
 *
 * When you add an RPC and this fails, do not add it to READS to make the red go
 * away. Add `assertOrgWriter` to the handler. READS is for genuine reads.
 */

/** Methods a viewer is *supposed* to reach. Everything else must deny. */
const READS: Record<string, string[]> = {
  orgs: ['listOrgs', 'listOrgMembers'],
  projects: ['getProject', 'listProjects'],
  projectTemplates: ['getTemplate', 'listTemplates'],
  tasks: ['getTaskType', 'listTaskTypes'],
  taskManagement: ['listTasks', 'listTaskReviewers'],
  taskNotes: ['listTaskNotes'],
  agents: ['listAgentRoles', 'listAgents'],
  artifacts: ['listFolders', 'listArtifacts', 'listTaskArtifactLinks'],
  comments: ['listComments'],
  labels: ['listLabels', 'listEntityLabels'],
  repositories: ['listRepositoryLinks', 'listPullRequests', 'listBuilds', 'listDeployments'],
  health: ['ping'],
  auth: ['getIdentity'],
};

/**
 * Not org-scoped, so there is no org whose viewer role could apply.
 * `seedOrg` creates a *new* organization: being a viewer of org A has no
 * bearing on whether you may found org B, and denying it would lock a
 * viewer-only account out of ever owning anything.
 */
const NOT_ORG_SCOPED: Record<string, string[]> = {
  orgs: ['seedOrg'],
};

const ids = {
  org: 'org-viewer-sweep',
  otherOrg: 'org-viewer-sweep-other',
  viewer: 'user-viewer-sweep',
  template: 'tmpl-viewer-sweep',
  project: 'proj-viewer-sweep',
  task: 'task-viewer-sweep',
  taskType: 'tt-viewer-sweep',
  taskStatus: 'ts-viewer-sweep',
  folder: 'fld-viewer-sweep',
  artifact: 'art-viewer-sweep',
  comment: 'cmt-viewer-sweep',
  label: 'lbl-viewer-sweep',
  agentRole: 'arole-viewer-sweep',
  agent: 'agt-viewer-sweep',
  note: 'note-viewer-sweep',
  repoLink: 'repo-viewer-sweep',
  invitation: 'inv-viewer-sweep',
  apiToken: 'tok-viewer-sweep',
};

/**
 * One request per mutating method, carrying ids that genuinely resolve.
 *
 * Bogus ids would be worse than useless here: handlers resolve the org through
 * `getTaskOrgId` and friends *before* checking permission, so an unknown id
 * returns NotFound and the test would pass while proving nothing about
 * authorization.
 */
const REQUESTS: Record<string, Record<string, unknown>> = {
  orgs: {
    updateOrg: { orgId: ids.org, name: 'Renamed' },
    removeOrgMember: { orgId: ids.org, userId: 'someone-else' },
    updateOrgMemberRole: { orgId: ids.org, userId: 'someone-else', role: 'admin' },
    inviteUser: { orgId: ids.org, email: 'x@test.local' },
    archiveOrg: { orgId: ids.org },
    restoreOrg: { orgId: ids.org },
    purgeOrg: { orgId: ids.org },
    setOrgRetentionDays: { orgId: ids.org, binRetentionDays: 30 },
    // Both are admin-gated (M03-T12), so a viewer is denied - they belong here
    // rather than in READS even though listInvitations only reads. READS means
    // "a viewer may call this", not "this method does not write".
    listInvitations: { orgId: ids.org },
    revokeInvitation: { invitationId: ids.invitation },
  },
  projects: {
    createProject: { orgId: ids.org, templateId: ids.template, name: 'P', ownerId: ids.viewer },
    updateProject: { projectId: ids.project, name: 'P2' },
    archiveProject: { projectId: ids.project },
    restoreProject: { projectId: ids.project },
    purgeProject: { projectId: ids.project },
  },
  projectTemplates: {
    createTemplate: { orgId: ids.org, name: 'T' },
    updateTemplate: { id: ids.template, name: 'T2' },
  },
  tasks: {
    createTaskType: { orgId: ids.org, name: 'TT' },
    updateTaskType: { id: ids.taskType, name: 'TT2' },
    createTaskStatus: { taskTypeId: ids.taskType, name: 'open' },
    createTaskStatusTransition: { taskTypeId: ids.taskType, fromStatusId: ids.taskStatus, toStatusId: ids.taskStatus },
    deleteTaskStatusTransition: { transitionId: 'tstr-viewer-sweep', taskTypeId: ids.taskType },
    reorderTaskStatuses: { taskTypeId: ids.taskType, statusIds: [ids.taskStatus] },
  },
  taskManagement: {
    createTask: { projectId: ids.project, title: 'T', taskTypeId: ids.taskType },
    assignTask: { taskId: ids.task, userId: ids.viewer },
    unassignTask: { taskId: ids.task, userId: ids.viewer },
    addTaskReviewer: { taskId: ids.task, userId: ids.viewer },
    removeTaskReviewer: { taskId: ids.task, userId: ids.viewer },
    updateTask: { taskId: ids.task, title: 'T2' },
    updateTaskStatus: { taskId: ids.task, status: 'done' },
    deleteTask: { taskId: ids.task },
    restoreTask: { taskId: ids.task },
    purgeTask: { taskId: ids.task },
  },
  taskNotes: {
    createTaskNote: { taskId: ids.task, agentId: ids.agent, content: 'n' },
    updateTaskNote: { taskNoteId: ids.note, content: 'n2' },
    deleteTaskNote: { taskNoteId: ids.note },
  },
  agents: {
    createAgentRole: { orgId: ids.org, name: 'R', systemPrompt: 'p', capabilities: '[]' },
    updateAgentRole: { id: ids.agentRole, name: 'R2' },
    createAgent: { orgId: ids.org, agentRoleId: ids.agentRole, name: 'A' },
    updateAgent: { agentId: ids.agent, name: 'A2' },
    archiveAgent: { agentId: ids.agent },
    restoreAgent: { agentId: ids.agent },
    purgeAgent: { agentId: ids.agent },
    // Admin-gated, so a viewer is denied - including listAgentTokens, which is
    // a read but not a viewer-allowed one. Who holds a credential, and its
    // prefix and last use, is administrative information (M04-T05).
    createAgentToken: { agentId: ids.agent, name: 'T', scopes: ['tasks:read'] },
    listAgentTokens: { agentId: ids.agent },
    revokeAgentToken: { tokenId: ids.apiToken },
  },
  artifacts: {
    createFolder: { projectId: ids.project, name: 'F' },
    updateFolder: { folderId: ids.folder, name: 'F2' },
    createArtifact: { folderId: ids.folder, name: 'A', content: 'c' },
    updateArtifactContent: { artifactId: ids.artifact, content: 'c2' },
    linkTaskArtifact: { taskId: ids.task, artifactId: ids.artifact },
    unlinkTaskArtifact: { taskId: ids.task, artifactId: ids.artifact },
    archiveArtifact: { artifactId: ids.artifact },
    restoreArtifact: { artifactId: ids.artifact },
    archiveFolder: { folderId: ids.folder },
    restoreFolder: { folderId: ids.folder },
    purgeArtifact: { artifactId: ids.artifact },
    purgeFolder: { folderId: ids.folder },
  },
  comments: {
    createComment: { entityId: ids.task, entityType: 'task', content: 'c' },
    updateComment: { commentId: ids.comment, content: 'c2' },
    deleteComment: { commentId: ids.comment },
  },
  labels: {
    createLabel: { orgId: ids.org, name: 'L' },
    updateLabel: { labelId: ids.label, name: 'L2' },
    attachLabel: { labelId: ids.label, entityId: ids.task, entityType: 'task' },
    detachLabel: { labelId: ids.label, entityId: ids.task, entityType: 'task' },
  },
  repositories: {
    addRepositoryLink: { projectId: ids.project, provider: 'github', remoteName: 'o/r', apiToken: 't' },
    removeRepositoryLink: { repositoryLinkId: ids.repoLink },
    syncPullRequests: { projectId: ids.project },
  },
};

let handlers: Record<string, any>;

beforeAll(async () => {
  const { db, nc } = await setupIntegrationTest();
  const now = new Date();

  await db.insert(schema.organizations).values([
    { id: ids.org, name: 'Sweep Org', slug: ids.org, createdAt: now },
    { id: ids.otherOrg, name: 'Other Org', slug: ids.otherOrg, createdAt: now },
  ]);
  await db.insert(schema.users).values([
    { id: ids.viewer, email: `${ids.viewer}@test.local`, createdAt: now },
    { id: 'someone-else', email: 'someone-else@test.local', createdAt: now },
  ]);
  // The caller under test: a genuine member of the org, holding `viewer`.
  // Not a stranger — a stranger would be denied by the membership check alone
  // and would prove nothing about the role.
  await db.insert(schema.organizationMembers).values([
    { orgId: ids.org, userId: ids.viewer, role: 'viewer', joinedAt: now },
    { orgId: ids.org, userId: 'someone-else', role: 'member', joinedAt: now },
  ]);

  await db.insert(schema.projectTemplates).values({ id: ids.template, orgId: ids.org, name: 'T', createdAt: now });
  await db.insert(schema.projects).values({
    id: ids.project, orgId: ids.org, templateId: ids.template, ownerId: 'someone-else', name: 'P', createdAt: now,
  });
  await db.insert(schema.taskTypes).values({ id: ids.taskType, orgId: ids.org, name: 'TT', createdAt: now });
  await db.insert(schema.taskStatuses).values({ id: ids.taskStatus, taskTypeId: ids.taskType, name: 'todo' });
  await db.insert(schema.tasks).values({
    id: ids.task, projectId: ids.project, title: 'T', status: 'todo', createdAt: now,
  });
  await db.insert(schema.folders).values({ id: ids.folder, projectId: ids.project, name: 'F', createdAt: now });
  await db.insert(schema.artifacts).values({ id: ids.artifact, folderId: ids.folder, name: 'A', createdAt: now });
  await db.insert(schema.comments).values({
    id: ids.comment, entityId: ids.task, entityType: 'task', userId: 'someone-else', content: 'c', createdAt: now,
  });
  await db.insert(schema.labels).values({ id: ids.label, orgId: ids.org, name: 'L', createdAt: now });
  await db.insert(schema.agentRoles).values({
    id: ids.agentRole, orgId: ids.org, name: 'R', systemPrompt: 'p', capabilities: '[]', createdAt: now,
  });
  await db.insert(schema.agents).values({
    id: ids.agent, orgId: ids.org, agentRoleId: ids.agentRole, name: 'A', createdAt: now,
  });
  await db.insert(schema.taskNotes).values({
    id: ids.note, taskId: ids.task, agentId: ids.agent, content: 'n', createdAt: now,
  });
  // A real token row, so revokeAgentToken reaches its authorization check
  // instead of stopping at NotFound - otherwise the sweep would be asserting
  // that a viewer cannot revoke a token nobody has, which is not the claim.
  await db.insert(schema.apiTokens).values({
    id: ids.apiToken, orgId: ids.org, agentId: ids.agent, name: 'T',
    tokenPrefix: 'tskr_sweep', tokenHash: 'hash-viewer-sweep',
    scopes: '["tasks:read"]', createdBy: ids.viewer, createdAt: now,
    expiresAt: new Date(now.getTime() + 86400000),
  });
  await db.insert(schema.repositoryLinks).values({
    id: ids.repoLink, projectId: ids.project, provider: 'github', remoteName: 'o/r',
    accessTokenEncrypted: 'x', createdAt: now,
  });
  await db.insert(schema.invitations).values({
    id: ids.invitation, orgId: ids.org, email: 'invited@test.local',
    invitedBy: 'someone-else', role: 'member', createdAt: now,
  });

  handlers = {
    orgs: createOrgsHandler(db, nc),
    projects: createProjectsHandler(db, nc),
    projectTemplates: createProjectTemplatesHandler(db, nc),
    tasks: createTasksHandler(db, nc),
    taskManagement: createTaskManagementHandler(db, nc),
    taskNotes: createTaskNotesHandler(db, nc),
    agents: createAgentsHandler(db, nc),
    artifacts: createArtifactsHandler(db, nc),
    comments: createCommentsHandler(db, nc),
    labels: createLabelsHandler(db, nc),
    repositories: createRepositoriesHandler(db, nc),
    health: createHealthHandler(db, nc),
    auth: createAuthHandler(db, nc),
  };
});

const methodsOf = (h: any) => Object.keys(h).filter((k) => typeof h[k] === 'function');

describe('viewer is read-only across every handler', () => {
  it('covers every handler method — no method is silently unclassified', () => {
    const unclassified: string[] = [];
    for (const [name, handler] of Object.entries(handlers)) {
      for (const method of methodsOf(handler)) {
        const classified =
          READS[name]?.includes(method) ||
          NOT_ORG_SCOPED[name]?.includes(method) ||
          REQUESTS[name]?.[method] !== undefined;
        if (!classified) unclassified.push(`${name}.${method}`);
      }
    }
    expect(
      unclassified,
      `These handler methods are neither declared reads nor exercised as writes. ` +
        `Add assertOrgWriter to the handler and a request here — do not add them to READS ` +
        `unless a viewer genuinely may call them.`,
    ).toEqual([]);
  });

  // One case per mutating method, generated from the table, so a failure names
  // the endpoint rather than the loop.
  for (const [handlerName, requests] of Object.entries(REQUESTS)) {
    for (const method of Object.keys(requests)) {
      it(`denies viewer: ${handlerName}.${method}`, async () => {
        const ctx = makeAuthContext(ids.viewer);
        let thrown: unknown;
        try {
          await handlers[handlerName][method](requests[method], ctx);
        } catch (e) {
          thrown = e;
        }

        expect(thrown, `${handlerName}.${method} did not reject a viewer at all`).toBeDefined();
        expect(thrown).toBeInstanceOf(ConnectError);
        const code = (thrown as ConnectError).code;
        // NotFound would mean the fixture id did not resolve and the handler
        // never reached its permission check — a green test proving nothing.
        expect(
          code,
          `${handlerName}.${method} threw ${Code[code]}, not PermissionDenied. ` +
            `NotFound usually means the fixture id is wrong, so the authorization ` +
            `check was never reached.`,
        ).toBe(Code.PermissionDenied);
      });
    }
  }

  it('allows the same viewer to read', async () => {
    const ctx = makeAuthContext(ids.viewer);
    await expect(handlers.orgs.listOrgMembers({ orgId: ids.org }, ctx)).resolves.toBeDefined();
    await expect(handlers.projects.listProjects({ orgId: ids.org }, ctx)).resolves.toBeDefined();
  });

  /**
   * Positive control. Without it, an `assertOrgWriter` that denied *everyone*
   * would make all 59 denial cases above pass — the suite would be green and
   * the product would be broken. This is the test that distinguishes "viewer
   * cannot write" from "nobody can write".
   */
  it('still allows a member to write', async () => {
    const ctx = makeAuthContext('someone-else'); // seeded with role 'member'
    await expect(handlers.labels.createLabel({ orgId: ids.org, name: 'member-made' }, ctx)).resolves.toBeDefined();
    await expect(
      handlers.comments.createComment({ entityId: ids.task, entityType: 'task', content: 'ok' }, ctx),
    ).resolves.toBeDefined();
    await expect(
      handlers.artifacts.createFolder({ projectId: ids.project, name: 'member-folder' }, ctx),
    ).resolves.toBeDefined();
  });
});
