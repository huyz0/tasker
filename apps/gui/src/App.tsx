import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { OrganizationsDashboard } from './features/Organizations';
import { ProjectsWizard } from './features/Projects';
import { TasksWorkbench } from './features/Tasks';
import { AgentsDashboard } from './features/Agents';
import { ArtifactsBrowser } from './features/Artifacts';
import { LabelsManager } from './features/Labels';
import { BinDashboard } from './features/Bin';
import { Dashboard } from './pages/Dashboard';
import { GenericPlaceholder } from './components/ui/GenericPlaceholder';
import { OAuthCallback } from './pages/OAuthCallback';
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
                <Route path="/agents" element={<AgentsDashboard />} />
                <Route path="/artifacts" element={<ArtifactsBrowser />} />
                <Route path="/labels" element={<LabelsManager />} />
                <Route path="/bin" element={<BinDashboard />} />
                <Route path="/settings" element={<GenericPlaceholder title="Settings" description="Global application preferences." />} />
                <Route path="/oauth/callback" element={<OAuthCallback />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
