import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderScoped } from '../test/renderScoped';
import { useUrlEnum } from './useUrlEnum';

/**
 * The contract three screens depend on (M28-T05): a screen-local parameter
 * that falls back rather than breaking, and that shares the query string with
 * scope instead of overwriting it.
 */

const TABS = ['organizations', 'tasks', 'agents'] as const;
type Tab = (typeof TABS)[number];

function TabReader({ next }: { next?: Tab }) {
  const [tab, setTab] = useUrlEnum<Tab>('tab', TABS, 'organizations');
  return (
    <>
      <p>{`tab=${tab}`}</p>
      <button onClick={() => setTab(next ?? 'tasks')}>set</button>
    </>
  );
}

describe('useUrlEnum', () => {
  it('reads a recognised value out of the query string', () => {
    renderScoped(<TabReader />, { paths: ['/bin'], initialEntry: '/bin?tab=agents' });
    expect(screen.getByText('tab=agents')).toBeInTheDocument();
  });

  it('falls back to the default when the key is absent', () => {
    renderScoped(<TabReader />, { paths: ['/bin'], initialEntry: '/bin' });
    expect(screen.getByText('tab=organizations')).toBeInTheDocument();
  });

  it('falls back to the default when the value is not one it knows', () => {
    // A URL outlives the values a screen recognises. Rendering nothing for a
    // stale one is the failure this guards.
    renderScoped(<TabReader />, { paths: ['/bin'], initialEntry: '/bin?tab=nonsense' });
    expect(screen.getByText('tab=organizations')).toBeInTheDocument();
  });

  it('writes the chosen value into the URL', () => {
    const { location } = renderScoped(<TabReader />, { paths: ['/bin'], initialEntry: '/bin' });
    fireEvent.click(screen.getByRole('button', { name: 'set' }));
    expect(location.url).toBe('/bin?tab=tasks');
    expect(screen.getByText('tab=tasks')).toBeInTheDocument();
  });

  it('leaves scope alone when it writes', () => {
    const { location } = renderScoped(<TabReader />, {
      paths: ['/bin'], initialEntry: '/bin?org=o1&project=p1',
    });
    fireEvent.click(screen.getByRole('button', { name: 'set' }));
    expect(location.search).toContain('org=o1');
    expect(location.search).toContain('project=p1');
    expect(location.search).toContain('tab=tasks');
  });
});
