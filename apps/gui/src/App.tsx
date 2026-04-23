import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { OrganizationsDashboard } from './features/Organizations';
import { ProjectsWizard } from './features/Projects';
import { TasksWorkbench } from './features/Tasks';
import { AgentsDashboard } from './features/Agents';
import { ArtifactsBrowser } from './features/Artifacts';
import { DashboardPlaceholder } from './pages/Dashboard';
import { GenericPlaceholder } from './components/ui/GenericPlaceholder';
import { OAuthCallback } from './pages/OAuthCallback';

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPlaceholder />} />
        <Route path="/organizations" element={<OrganizationsDashboard />} />
        <Route path="/projects" element={<ProjectsWizard />} />
        <Route path="/tasks" element={<TasksWorkbench />} />
        <Route path="/agents" element={<AgentsDashboard />} />
        <Route path="/artifacts" element={<ArtifactsBrowser />} />
        <Route path="/settings" element={<GenericPlaceholder title="Settings" description="Global application preferences." />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
      </Routes>
    </AppShell>
  );
}

export default App;
