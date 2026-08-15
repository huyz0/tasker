import {
  Building2,
  FolderKanban,
  CheckSquare,
  Bot,
  FileBox,
  LayoutDashboard,
  Menu,
  Activity,
  Trash2,
  Tag,
  Workflow,
  LogOut
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLayoutStore } from '../../store/layout';
import { GlobalSearch, GlobalSearchTrigger } from './GlobalSearch';
import { ThemeToggle } from './ThemeToggle';
import { useFocusTrap } from '../ui/useFocusTrap';
import { CurrentUser } from './CurrentUser';
import { OrgProjectSwitcher } from './OrgProjectSwitcher';
import { logout } from '../../lib/authSession';

const NAVIGATION_ITEMS = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Organizations', path: '/organizations', icon: Building2 },
  { name: 'Projects', path: '/projects', icon: FolderKanban },
  { name: 'Tasks', path: '/tasks', icon: CheckSquare },
  { name: 'AI Agents', path: '/agents', icon: Bot },
  { name: 'Artifacts', path: '/artifacts', icon: FileBox },
  { name: 'Task Types', path: '/task-types', icon: Workflow },
  { name: 'Labels', path: '/labels', icon: Tag },
  { name: 'Bin', path: '/bin', icon: Trash2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, toggleSidebar } = useLayoutStore();
  const setSidebarOpen = useLayoutStore((s) => s.setSidebarOpen);
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLElement | null>(null);

  // On mobile the open sidebar covers the page, so it is modal in every sense
  // except the markup — trapped, escapable, and dismissed by a tap outside.
  // The same hook the Dialog uses, rather than a second implementation
  // (ADR-0009).
  useFocusTrap(sidebarRef, sidebarOpen, () => setSidebarOpen(false));

  // Navigating with the drawer open used to leave it covering the page that had
  // just loaded behind it.
  useEffect(() => {
    setSidebarOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row bg-background">
      {/* Mobile Header Menu */}
      <header className="sticky top-0 z-30 flex justify-between h-14 items-center border-b bg-card px-4 md:hidden">
        <div className="flex items-center gap-4">
          <button onClick={toggleSidebar} className="inline-flex items-center justify-center rounded-md p-2 hover:bg-accent text-foreground">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle Sidebar</span>
          </button>
          <div className="font-semibold text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Tasker
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GlobalSearchTrigger />
          <ThemeToggle />
          <CurrentUser />
        </div>
      </header>

      {/* The backdrop exists only while the drawer is open, and only below the
          md breakpoint where the drawer is an overlay rather than a column. */}
      {sidebarOpen && (
        <div
          data-testid="sidebar-backdrop"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        ref={sidebarRef}
        data-focus-trap={sidebarOpen ? 'on' : undefined}
        tabIndex={-1}
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r bg-card transition-transform md:relative md:translate-x-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-14 items-center px-6 border-b md:h-[60px] font-semibold text-lg gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Tasker
          </div>
          <div className="hidden md:flex flex-col gap-3 px-4 py-3 border-b">
            <GlobalSearchTrigger />
            {/* The header above is `md:hidden`, so a desktop user would never
                have seen the toggle if it only lived there. */}
            <ThemeToggle />
          </div>
          <OrgProjectSwitcher />
          <nav className="flex-1 space-y-1 p-4">
            {NAVIGATION_ITEMS.map((item) => {
              const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link 
                  key={item.name}
                  to={item.path}
                  // On the click as well as on the path change: tapping the link
                  // for the page you are already on navigates nowhere, so the
                  // pathname effect never fires and the drawer stayed open over
                  // it (M06-T10).
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                    isActive 
                      ? 'bg-primary/10 text-primary font-medium' 
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <item.icon className={`h-4 w-4 ${isActive ? 'text-primary' : ''}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t/50 mt-auto">
             <div className="flex items-center justify-between gap-3 py-2 px-3 text-sm text-muted-foreground">
                {/* Was a hardcoded "Tuong Nguyen / Admin" - the same name and
                    the same role for every account that ever signed in. */}
                <CurrentUser />
                <button
                  onClick={handleLogout}
                  aria-label="Log out"
                  className="rounded-md p-1.5 hover:bg-accent hover:text-accent-foreground"
                >
                  <LogOut className="h-4 w-4" />
                </button>
             </div>
             <div className="px-3 pb-1 text-xs text-muted-foreground/70 font-mono">
               build {__BUILD_SHA__.slice(0, 7)}
             </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 lg:p-12 overflow-x-hidden">
        {children}
      </main>

      {/* Mounted once, for both triggers. Rendering it beside each trigger is
          how ⌘K came to open two stacked modal dialogs (M06-T03). */}
      <GlobalSearch />
    </div>
  );
}
