import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// Every screen is loaded on demand rather than bundled into the initial
// chunk (moon:gui:build was flagging a single >900kB chunk containing all
// fifteen-plus screens at once, most of which a given session never visits).
// One dynamic import() per screen gives each its own chunk; Rollup already
// factors out whatever two or more of them share (health_pb, react-query,
// etc.) into its own common chunk automatically, so nothing here needs a
// manualChunks config to get that. `RichMarkdownEditor` established this
// same lazy/Suspense pattern for a single component (M23); this applies it
// at the route level, to every screen.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const SystemHealthPage = lazy(() => import('./pages/SystemHealth').then((m) => ({ default: m.SystemHealthPage })));
const OAuthCallback = lazy(() => import('./pages/OAuthCallback').then((m) => ({ default: m.OAuthCallback })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));
const LoginPage = lazy(() => import('./pages/Login'));
const RegisterPage = lazy(() => import('./pages/Register'));
const OrganizationsDashboard = lazy(() => import('./features/Organizations').then((m) => ({ default: m.OrganizationsDashboard })));
const ProjectsWizard = lazy(() => import('./features/Projects').then((m) => ({ default: m.ProjectsWizard })));
const TasksWorkbench = lazy(() => import('./features/Tasks').then((m) => ({ default: m.TasksWorkbench })));
const AgentsDashboard = lazy(() => import('./features/Agents').then((m) => ({ default: m.AgentsDashboard })));
const ArtifactsBrowser = lazy(() => import('./features/Artifacts').then((m) => ({ default: m.ArtifactsBrowser })));
const LabelsManager = lazy(() => import('./features/Labels').then((m) => ({ default: m.LabelsManager })));
const RolesManager = lazy(() => import('./features/Roles').then((m) => ({ default: m.RolesManager })));
const TeamsManager = lazy(() => import('./features/Teams').then((m) => ({ default: m.TeamsManager })));
const MemoryExplorer = lazy(() => import('./features/Memory').then((m) => ({ default: m.MemoryExplorer })));
const HandoffsScreen = lazy(() => import('./features/Handoffs').then((m) => ({ default: m.HandoffsScreen })));
const TaskTypesEditor = lazy(() => import('./features/TaskTypes').then((m) => ({ default: m.TaskTypesEditor })));
const BinDashboard = lazy(() => import('./features/Bin').then((m) => ({ default: m.BinDashboard })));
const ReportsScreen = lazy(() => import('./features/Reports').then((m) => ({ default: m.ReportsScreen })));

// A minimal, wordless placeholder rather than a skeleton per-screen: with
// route-level code-splitting the chunk is typically already cached after
// the first visit to a screen, so this is seen rarely and briefly - not
// worth a bespoke loading state per route.
function RouteFallback() {
  return (
    <div role="status" aria-label="Loading" className="flex items-center justify-center h-full p-12 text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <AppShell>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/reports" element={<ReportsScreen />} />
                    <Route path="/organizations" element={<OrganizationsDashboard />} />
                    <Route path="/projects" element={<ProjectsWizard />} />
                    <Route path="/tasks" element={<TasksWorkbench />} />
                    {/* The open task is part of the URL, not local state, so a
                        direct link or a reload reopens the same detail view. */}
                    <Route path="/tasks/:taskId" element={<TasksWorkbench />} />
                    <Route path="/agents" element={<AgentsDashboard />} />
                    <Route path="/artifacts" element={<ArtifactsBrowser />} />
                    <Route path="/artifacts/:artifactId" element={<ArtifactsBrowser />} />
                    <Route path="/task-types" element={<TaskTypesEditor />} />
                    <Route path="/labels" element={<LabelsManager />} />
                    <Route path="/roles" element={<RolesManager />} />
                    <Route path="/teams" element={<TeamsManager />} />
                    <Route path="/memory" element={<MemoryExplorer />} />
                    {/* The selected belief is part of the URL for the same reason
                        the open task is (see /tasks/:taskId above): a direct link
                        or a reload reopens the same belief. */}
                    <Route path="/memory/:beliefId" element={<MemoryExplorer />} />
                    <Route path="/handoffs" element={<HandoffsScreen />} />
                    <Route path="/bin" element={<BinDashboard />} />
                    <Route path="/settings" element={<SystemHealthPage />} />
                    <Route path="/oauth/callback" element={<OAuthCallback />} />
                    {/* Catch-all inside the shell: an unknown URL gets a Not Found
                        view with a route back, never an empty content area. */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </AppShell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

export default App;
