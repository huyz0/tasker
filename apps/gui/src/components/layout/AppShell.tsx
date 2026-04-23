import { 
  Building2, 
  FolderKanban, 
  CheckSquare, 
  Bot, 
  FileBox, 
  LayoutDashboard, 
  Menu,
  Activity,
  UserCircle
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useLayoutStore } from '../../store/layout';
import { GlobalSearch } from './GlobalSearch';

const NAVIGATION_ITEMS = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Organizations', path: '/organizations', icon: Building2 },
  { name: 'Projects', path: '/projects', icon: FolderKanban },
  { name: 'Tasks', path: '/tasks', icon: CheckSquare },
  { name: 'AI Agents', path: '/agents', icon: Bot },
  { name: 'Artifacts', path: '/artifacts', icon: FileBox },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, toggleSidebar } = useLayoutStore();
  const location = useLocation();

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
          <GlobalSearch />
          <UserCircle className="h-6 w-6 text-muted-foreground" />
        </div>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 border-r bg-card transition-transform md:relative md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-full flex-col">
          <div className="flex h-14 items-center justify-between px-6 border-b md:h-[60px] font-semibold text-lg gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Tasker
            </div>
            <div className="hidden md:flex flex-1 justify-end ml-4">
               <GlobalSearch />
            </div>
          </div>
          <nav className="flex-1 space-y-1 p-4">
            {NAVIGATION_ITEMS.map((item) => {
              const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link 
                  key={item.name}
                  to={item.path} 
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
             <div className="flex items-center gap-3 py-2 px-3 text-sm text-muted-foreground">
                <UserCircle className="h-6 w-6" />
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">Tuong Nguyen</span>
                  <span className="text-xs">Admin</span>
                </div>
             </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 lg:p-12 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
