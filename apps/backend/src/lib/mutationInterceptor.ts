import { Code, ConnectError, type Interceptor } from '@connectrpc/connect';
import { transactionalOperation } from '../db/access';
import type { Lifecycle } from './lifecycle';

// Explicit service+method inventory: unknown unary methods fail safe into a
// unit. A Get/List prefix is not a guarantee that a future method is read-only.
const READS: Record<string, readonly string[]> = {
  HealthService: ['Ping'],
  AuthService: ['GetIdentity', 'ListLinkedIdentities'],
  OrgService: ['ListOrgs', 'ListInvitations', 'ListOrgMembers'],
  TaskTypeService: ['GetTaskType', 'ListTaskTypes'],
  ProjectTemplateService: ['GetTemplate', 'ListTemplates'],
  ProjectService: ['GetProject', 'ListProjects'],
  AgentService: ['ListAgentRoles', 'ListAgents', 'ListAgentTokens'],
  TaskService: ['ListMyTasks', 'GetTask', 'ListTasks', 'ListTaskReviewers', 'ListTaskLinks', 'GetInputRequest', 'ListInputRequests', 'GetTransitionApproval', 'ListTransitionApprovals', 'ListUsageRecords', 'GetTaskDigest', 'ListCompactionCandidates'],
  ArtifactService: ['ListTaskArtifactLinks', 'ListArtifacts', 'GetArtifact', 'GetArtifactContent', 'ListFolders'],
  CommentService: ['ListComments'],
  TaskNoteService: ['ListTaskNotes', 'ListHandoffNotes'],
  LabelService: ['ListLabels', 'ListEntityLabels'],
  RepositoryService: ['ListRepositoryLinks', 'ListPullRequests', 'ListBuilds', 'ListDeployments'],
  SearchService: ['UniversalSearch'],
  DashboardService: ['GetDashboard'],
  ReportService: ['GetReportExceptions', 'GetReportTrends', 'GetUsageReport'],
  TeamService: ['ListTeams', 'ListTeamMembers'],
  RoleService: ['ListPermissions', 'ListRoles', 'ListGrants'],
  MemoryService: ['GetBelief', 'ListBeliefs', 'SearchBeliefs', 'ListBeliefRelations', 'ListBeliefPromotions'],
  AuditService: ['ListAuditEvents'],
  NotificationService: ['ListNotifications', 'GetUnreadNotificationCount'],
  WebhookService: ['ListWebhooks', 'ListWebhookDeliveries'],
  WorkflowService: ['GetWorkflowTemplate', 'ListWorkflowTemplates'],
  ScheduleService: ['GetSchedule', 'ListSchedules', 'ListScheduleRuns'],
  SavedViewService: ['GetSavedView', 'ListSavedViews'],
};

// These handlers explicitly own narrow units after external preparation or
// around schedule admission/execution; an outer unit would hold SQL locks over I/O
// or establish a snapshot before schedule mutation locking reads. Approval
// decisions commit an intentional stale closure before presenting its RPC error.
const LOCAL_UNITS: Record<string, readonly string[]> = {
  TaskService: ['DecideTransitionApproval'],
  RepositoryService: ['AddRepositoryLink', 'SyncPullRequests'],
  ScheduleService: ['CreateSchedule', 'UpdateSchedule', 'DeleteSchedule', 'RunSchedule'],
};

export function createMutationInterceptor(db: any, lifecycle?: Lifecycle): Interceptor {
  return next => async req => {
    if (lifecycle?.readiness().state === 'draining') throw new ConnectError('server is shutting down', Code.Unavailable);
    if (req.stream) return next(req);
    const service = req.method.parent.typeName.split('.').at(-1)!;
    const name = req.method.name;
    const invoke = () => READS[service]?.includes(name) || LOCAL_UNITS[service]?.includes(name)
      ? next(req)
      : transactionalOperation(db, () => next(req))();
    // Connect's Node adapter returns void. Track the actual handler promise,
    // including read/external-I/O handlers, so drain awaits real unary work.
    return lifecycle ? lifecycle.track(invoke) : invoke();
  };
}
