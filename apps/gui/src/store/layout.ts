import { create } from 'zustand'

export interface LayoutState {
  sidebarOpen: boolean
  activePageTitle: string
  activeOrgId: string
  activeProjectId: string
  /**
   * The search palette is one dialog with two triggers (the header on desktop,
   * the sidebar on mobile). It lived in each trigger's own state until M06-T03,
   * so ⌘K opened *both* — two modal dialogs stacked, each with its own focus
   * trap, which only became visible once they declared `aria-modal`.
   */
  searchOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (isOpen: boolean) => void
  setActivePageTitle: (title: string) => void
  setActiveOrgId: (id: string) => void
  setActiveProjectId: (id: string) => void
  setSearchOpen: (isOpen: boolean) => void
  toggleSearch: () => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarOpen: false,
  activePageTitle: 'Dashboard Overview',
  activeOrgId: '',
  activeProjectId: '',
  searchOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (isOpen) => set({ sidebarOpen: isOpen }),
  setActivePageTitle: (title) => set({ activePageTitle: title }),
  setActiveOrgId: (id) => set({ activeOrgId: id }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  setSearchOpen: (isOpen) => set({ searchOpen: isOpen }),
  toggleSearch: () => set((state) => ({ searchOpen: !state.searchOpen })),
}))
