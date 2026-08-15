import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'

const THEME_KEY = 'tasker.theme'

/** What the OS is asking for right now. */
function systemTheme(): 'light' | 'dark' {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/**
 * Writes the resolved theme to the root element.
 *
 * "System" is resolved here rather than in CSS so the stylesheet has exactly one
 * dark block. Two blocks — one per media query, one per attribute — is two
 * copies of every dark token, and the second copy is the one nobody updates.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme === 'system' ? systemTheme() : theme
}

/** The stored choice, or `system` when there is none or it is unreadable. */
export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  } catch {
    // Private browsing and blocked storage both throw here. A theme is not
    // worth failing to start over.
    return 'system'
  }
}

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
  theme: Theme
  toggleSidebar: () => void
  setSidebarOpen: (isOpen: boolean) => void
  setActivePageTitle: (title: string) => void
  setActiveOrgId: (id: string) => void
  setActiveProjectId: (id: string) => void
  setSearchOpen: (isOpen: boolean) => void
  toggleSearch: () => void
  setTheme: (theme: Theme) => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarOpen: false,
  activePageTitle: 'Dashboard Overview',
  activeOrgId: '',
  activeProjectId: '',
  searchOpen: false,
  theme: loadTheme(),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (isOpen) => set({ sidebarOpen: isOpen }),
  setActivePageTitle: (title) => set({ activePageTitle: title }),
  setActiveOrgId: (id) => set({ activeOrgId: id }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  setSearchOpen: (isOpen) => set({ searchOpen: isOpen }),
  toggleSearch: () => set((state) => ({ searchOpen: !state.searchOpen })),
  setTheme: (theme) => {
    applyTheme(theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // The choice still applies for this session; it just will not survive a
      // reload. Better than refusing to change the theme at all.
    }
    set({ theme })
  },
}))
