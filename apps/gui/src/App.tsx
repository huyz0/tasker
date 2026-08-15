import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { OrganizationsDashboard } from './features/Organizations';
import { ProjectsWizard } from './features/Projects';
import { TasksWorkbench } from './features/Tasks';
import { AgentsDashboard } from './features/Agents';
import { ArtifactsBrowser } from './features/Artifacts';
import { LabelsManager } from './features/Labels';
import { TaskTypesEditor } from './features/TaskTypes';
import { BinDashboard } from './features/Bin';
import { Dashboard } from './pages/Dashboard';
import { SystemHealthPage } from './pages/SystemHealth';
import { OAuthCallback } from './pages/OAuthCallback';
import { NotFound } from './pages/NotFound';
import LoginPage from './pages/Login';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <AppShell>
              <Routes>
                <Route path="/" element={<Dashboard />} />
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
                <Route path="/bin" element={<BinDashboard />} />
                <Route path="/settings" element={<SystemHealthPage />} />
                <Route path="/oauth/callback" element={<OAuthCallback />} />
                {/* Catch-all inside the shell: an unknown URL gets a Not Found
                    view with a route back, never an empty content area. */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
