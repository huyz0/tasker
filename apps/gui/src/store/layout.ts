import { create } from 'zustand'

export interface LayoutState {
  sidebarOpen: boolean
  activePageTitle: string
  activeOrgId: string
  activeProjectId: string
  toggleSidebar: () => void
  setSidebarOpen: (isOpen: boolean) => void
  setActivePageTitle: (title: string) => void
  setActiveOrgId: (id: string) => void
  setActiveProjectId: (id: string) => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarOpen: false,
  activePageTitle: 'Dashboard Overview',
  activeOrgId: 'org-1', // Default mock until multi-tenant switcher implemented
  activeProjectId: 'p-mock-1', // Default mock until project switcher implemented
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (isOpen) => set({ sidebarOpen: isOpen }),
  setActivePageTitle: (title) => set({ activePageTitle: title }),
  setActiveOrgId: (id) => set({ activeOrgId: id }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
}))
