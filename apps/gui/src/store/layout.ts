import { create } from 'zustand'

export interface LayoutState {
  sidebarOpen: boolean
  activePageTitle: string
  toggleSidebar: () => void
  setSidebarOpen: (isOpen: boolean) => void
  setActivePageTitle: (title: string) => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarOpen: false,
  activePageTitle: 'Dashboard Overview',
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (isOpen) => set({ sidebarOpen: isOpen }),
  setActivePageTitle: (title) => set({ activePageTitle: title }),
}))
