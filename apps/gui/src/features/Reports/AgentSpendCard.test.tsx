import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { ReportService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { AgentSpendCard } from './AgentSpendCard';

const day = (key: string, costMicros: string, reports: string) => ({ key, label: key, inputTokens: '0', outputTokens: '0', costMicros, reports });

describe('AgentSpendCard (M40)', () => {
  it('shows the window total, a bar per day and spend by agent', async () => {
    const requests: any[] = [];
    mockRpc(ReportService, 'GetUsageReport', (body) => {
      requests.push(body);
      return {
        totals: { inputTokens: '5000', outputTokens: '700', costMicros: '1515000', reports: '3' },
        byAgent: [
          { key: 'a1', label: 'Coder', inputTokens: '4000', outputTokens: '500', costMicros: '1500000', reports: '2' },
          { key: '', label: 'People', inputTokens: '1000', outputTokens: '200', costMicros: '15000', reports: '1' },
        ],
        byProject: [],
        byDay: [day('2026-10-01', '0', '0'), day('2026-10-02', '1515000', '3')],
        since: '2026-10-01T00:00:00.000Z',
      };
    });
    renderScoped(<AgentSpendCard projectId="p1" windowDays={7} />);
    expect(await screen.findByText('$1.515')).toBeInTheDocument();
    expect(requests[0]).toMatchObject({ projectId: 'p1', days: 7 });
    expect(screen.getByText(/5,000 input \/ 700 output tokens · 3 reports/)).toBeInTheDocument();
    const bars = screen.getByRole('img', { name: 'Daily spend over 2 days' });
    expect(bars.children).toHaveLength(2);
    expect(bars.children[1]).toHaveAttribute('title', '2026-10-02: $1.515 (3 reports)');
    expect(bars.children[0]).toHaveStyle({ height: '0%' });
    expect(bars.children[1]).toHaveStyle({ height: '100%' });
    const rows = within(screen.getByRole('table', { name: 'Spend by agent' })).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Coder$1.504,5002');
    expect(rows[2]).toHaveTextContent('People$0.0151,2001');
  });

  it('says when nothing was reported', async () => {
    mockRpc(ReportService, 'GetUsageReport', { totals: { reports: '0' }, byAgent: [], byProject: [], byDay: [], since: '' });
    renderScoped(<AgentSpendCard projectId="p1" windowDays={30} />);
    expect(await screen.findByText('No agent reported usage in this window.')).toBeInTheDocument();
  });

  it('shows a failed load with a way to retry', async () => {
    mockRpcError(ReportService, 'GetUsageReport', 'unavailable', 'down');
    renderScoped(<AgentSpendCard projectId="p1" windowDays={30} />);
    expect(await screen.findByText(/Could not load agent spend/)).toBeInTheDocument();
  });
});
