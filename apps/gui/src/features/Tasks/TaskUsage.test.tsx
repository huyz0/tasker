import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { UsageTotalsSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { TaskUsage } from './TaskUsage';

describe('TaskUsage (M40)', () => {
  it('says when nothing was reported', () => {
    render(<TaskUsage />);
    expect(screen.getByText('No agent has reported usage for this task.')).toBeInTheDocument();
    render(<TaskUsage usage={create(UsageTotalsSchema, {})} />);
    expect(screen.getAllByText('No agent has reported usage for this task.')).toHaveLength(2);
  });

  it('shows cost, tokens and how many reports', () => {
    render(<TaskUsage usage={create(UsageTotalsSchema, { inputTokens: 120000n, outputTokens: 3400n, costMicros: 1_515_000n, reports: 3n })} />);
    const dl = screen.getByLabelText('Usage and cost');
    expect(within(dl).getByText('$1.515')).toBeInTheDocument();
    expect(within(dl).getByText('120,000')).toBeInTheDocument();
    expect(within(dl).getByText('3,400')).toBeInTheDocument();
    expect(within(dl).getByText('3')).toBeInTheDocument();
  });
});
