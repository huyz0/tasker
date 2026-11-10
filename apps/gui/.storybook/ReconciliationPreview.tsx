import { MemoryRouter } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { transport } from '../src/lib/connectTransport';
import { AttentionScreen } from '../src/features/Attention/AttentionScreen';
import { TaskInputRequests } from '../src/features/Tasks/InputRequests';
import { TaskApprovals } from '../src/features/Tasks/Approvals';
import { ReviewerPicker } from '../src/features/Tasks/ReviewerPicker';
import { AssigneePicker } from '../src/features/Tasks/AssigneePicker';
import type { SourceActionKind } from './reconciliationFixture';
const client = createClient(TaskService, transport);
function AssignmentContext() {
  const task = useQuery({ queryKey: ['task', 'task-storybook'], queryFn: async () => (await client.getTask({ taskId: 'task-storybook' })).task });
  return <AssigneePicker taskId="task-storybook" orgId="org-storybook" assignees={task.data?.assignees ?? []} />;
}
interface ReconciliationPreviewProps { kind: SourceActionKind; }
/** Assembles existing controls beside the reader to demonstrate settlement. */
export function ReconciliationPreview({ kind }: ReconciliationPreviewProps) {
  return <MemoryRouter initialEntries={[`/attention?org=org-storybook&project=project-storybook&kind=${kind}`]}>
    <div className="flex flex-col gap-6"><AttentionScreen />
      <section aria-label="Existing task controls" className="rounded-lg border bg-surface-panel p-panel">
        <h2 className="mb-3 type-section-title">Task detail · Inspect release evidence</h2>
        {kind === 'question' ? <TaskInputRequests taskId="task-storybook" /> : kind === 'approval' ? <TaskApprovals taskId="task-storybook" /> : kind === 'review'
          ? <ReviewerPicker taskId="task-storybook" orgId="org-storybook" /> : <AssignmentContext />}
      </section>
    </div>
  </MemoryRouter>;
}
