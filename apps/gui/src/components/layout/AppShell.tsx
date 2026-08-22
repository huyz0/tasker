import {
  BarChart3,
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
  Settings,
  ShieldCheck,
  Users,
  Brain,
  Handshake,
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
import { LiveStatusIndicator } from './LiveStatusIndicator';
import { useLiveEvents } from '../../hooks/useLiveEvents';
import { logout } from '../../lib/authSession';

// Ten routes, flat, in table-creation order, used to read as an admin
// panel's model list rather than an app someone works in all day — Labels,
// Task Types, Bin and Organizations sat at the exact same visual weight as
// Tasks, which is what a person actually opens this for. Two groups instead:
// what you touch daily, and what you set up once and rarely revisit.
const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      { name: 'Reports', path: '/reports', icon: BarChart3 },
      { name: 'Projects', path: '/projects', icon: FolderKanban },
      { name: 'Tasks', path: '/tasks', icon: CheckSquare },
      { name: 'AI Agents', path: '/agents', icon: Bot },
      { name: 'Artifacts', path: '/artifacts', icon: FileBox },
      { name: 'Memory', path: '/memory', icon: Brain },
      { name: 'Handoffs', path: '/handoffs', icon: Handshake },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { name: 'Task Types', path: '/task-types', icon: Workflow },
      { name: 'Labels', path: '/labels', icon: Tag },
      { name: 'Organizations', path: '/organizations', icon: Building2 },
      { name: 'Teams', path: '/teams', icon: Users },
      { name: 'Roles', path: '/roles', icon: ShieldCheck },
      { name: 'Bin', path: '/bin', icon: Trash2 },
      // System Health lives here now. `/settings` was routable but unlinked,
      // so moving backend telemetry off the dashboard would otherwise have
      // hidden it behind a URL nobody types.
      { name: 'Settings', path: '/settings', icon: Settings },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, toggleSidebar } = useLayoutStore();
  const setSidebarOpen = useLayoutStore((s) => s.setSidebarOpen);
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLElement | null>(null);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);

  // One subscription for the whole app, held at the only component guaranteed
  // to be mounted for the session's lifetime. Per-screen subscriptions would
  // mean a stream opening and closing on every navigation, and N streams open
  // whenever two screens are mounted at once.
  const { status: liveStatus } = useLiveEvents({ orgId: activeOrgId, projectId: activeProjectId });

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
      <header className="sticky top-0 z-header flex justify-between h-14 items-center border-b bg-card px-4 md:hidden">
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
        {/* min-w-0 so this group can shrink rather than forcing the document
            wider than the viewport; the trigger is icon-only here (see
            GlobalSearchTrigger's own note on the 375px budget). */}
        <div className="flex items-center gap-2 min-w-0">
          <LiveStatusIndicator status={liveStatus} />
          <GlobalSearchTrigger compact />
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
          className="fixed inset-0 z-header bg-background/80 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        ref={sidebarRef}
        data-focus-trap={sidebarOpen ? 'on' : undefined}
        tabIndex={-1}
        className={`fixed inset-y-0 left-0 z-drawer w-sidebar border-r bg-card transition-transform md:relative md:translate-x-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-full flex-col">
          {/* Was `h-14 md:h-[60px]` — two different "header height" values
              with nothing distinguishing why, the second an arbitrary escape
              hatch for a number 4px off the first. The two are never visible
              at once (this one is hidden below `md:`, the header above is
              `md:hidden`), so nothing broke — but a design system with two
              unreconciled answers to "how tall is the header" is still wrong,
              just quietly. One value, Tailwind's own `h-14`, everywhere. */}
          <div className="flex h-14 items-center px-6 border-b font-semibold text-lg gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Tasker
          </div>
          <div className="hidden md:flex flex-col gap-3 px-4 py-3 border-b">
            <GlobalSearchTrigger />
            <LiveStatusIndicator status={liveStatus} />
            {/* The header above is `md:hidden`, so a desktop user would never
                have seen the toggle if it only lived there. */}
            <ThemeToggle />
          </div>
          <OrgProjectSwitcher />
          <nav className="flex-1 space-y-4 overflow-y-auto scrollbar-thin p-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} role="group" aria-labelledby={`nav-group-${group.label}`}>
                <div
                  id={`nav-group-${group.label}`}
                  className="px-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide"
                >
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
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
                            ? 'bg-primary-subtle text-primary-subtle-foreground font-medium'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                      >
                        <item.icon className={`h-4 w-4 ${isActive ? 'text-primary' : ''}`} />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          {/* This carried an opacity modifier on the border-width utility,
              which Tailwind never generates — so the sidebar footer had no top
              border at all. The opacity belongs on the colour (M06-T12). */}
          <div className="p-4 border-t border-border/50 mt-auto">
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
             <div className="px-3 pb-1 text-xs text-muted-foreground font-mono">
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
