import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore } from './layout';

describe('useLayoutStore', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      sidebarOpen: false,
      activePageTitle: 'Dashboard Overview',
      activeOrgId: '',
      activeProjectId: '',
    });
  });

  it('toggles the sidebar open state', () => {
    expect(useLayoutStore.getState().sidebarOpen).toBe(false);
    useLayoutStore.getState().toggleSidebar();
    expect(useLayoutStore.getState().sidebarOpen).toBe(true);
    useLayoutStore.getState().toggleSidebar();
    expect(useLayoutStore.getState().sidebarOpen).toBe(false);
  });

  it('sets the sidebar open state directly', () => {
    useLayoutStore.getState().setSidebarOpen(true);
    expect(useLayoutStore.getState().sidebarOpen).toBe(true);
  });

  it('sets the active page title', () => {
    useLayoutStore.getState().setActivePageTitle('Tasks');
    expect(useLayoutStore.getState().activePageTitle).toBe('Tasks');
  });

  it('sets the active org id', () => {
    useLayoutStore.getState().setActiveOrgId('org-1');
    expect(useLayoutStore.getState().activeOrgId).toBe('org-1');
  });

  it('sets the active project id', () => {
    useLayoutStore.getState().setActiveProjectId('proj-1');
    expect(useLayoutStore.getState().activeProjectId).toBe('proj-1');
  });
});
