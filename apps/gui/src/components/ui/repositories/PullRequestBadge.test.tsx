import { render, screen } from '@testing-library/react';
import { expect, test, describe } from 'vitest';
import { PullRequestBadge } from './PullRequestBadge';

describe('PullRequestBadge', () => {
  test('renders open PR badge correctly', () => {
    const pr = {
      remotePrId: '123',
      title: 'Fix auth bug',
      status: 'open',
      url: 'http://github.com/123'
    };
    render(<PullRequestBadge pr={pr} />);
    expect(screen.getByText('123')).toBeDefined();
    expect(screen.getByTitle('Fix auth bug')).toBeDefined();
  });

  test('renders merged PR badge correctly', () => {
    const pr = {
      remotePrId: '456',
      title: 'Add new feature',
      status: 'merged',
      url: 'http://github.com/456'
    };
    render(<PullRequestBadge pr={pr} />);
    expect(screen.getByText('456')).toBeDefined();
  });

  test('renders closed PR badge correctly', () => {
    const pr = { remotePrId: '789', title: 'Drop feature', status: 'closed', url: 'http://github.com/789' };
    render(<PullRequestBadge pr={pr} />);
    expect(screen.getByText('789')).toBeDefined();
  });

  test('renders a fallback icon for an unknown status', () => {
    const pr = { remotePrId: '1', title: 'Draft', status: 'draft', url: 'http://github.com/1' };
    render(<PullRequestBadge pr={pr} />);
    expect(screen.getByText('1')).toBeDefined();
  });
});
