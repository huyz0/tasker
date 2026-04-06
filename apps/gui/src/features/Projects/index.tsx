import { useEffect } from 'react';
import { useLayoutStore } from '../../store/layout';

export function ProjectsWizard() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  useEffect(() => setActivePageTitle('Projects'), [setActivePageTitle]);

  const templates = [
    { name: 'Software Development', description: 'Agile Scrum setup' },
    { name: 'Marketing Campaign', description: 'Launch plan framework' },
    { name: 'Onboarding Checklist', description: 'HR focus' }
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
        <p className="text-muted-foreground mt-1">Manage derived project templates and ownership.</p>
      </div>
      
      <div className="mb-4">
        <button className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors">
          + New Project
        </button>
      </div>

      <h2 className="text-xl font-medium mt-4">Start from a Template</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {templates.map(t => (
          <div key={t.name} className="border rounded-lg bg-card p-6 shadow-sm hover:border-primary cursor-pointer transition-all">
             <div className="w-10 h-10 mb-4 rounded bg-primary/10 flex items-center justify-center text-primary text-xl">
               📦
             </div>
             <h3 className="font-semibold text-lg">{t.name}</h3>
             <p className="text-sm text-muted-foreground mt-1 mb-4">{t.description}</p>
             <button className="w-full px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors">Use Template</button>
          </div>
        ))}
      </div>
    </div>
  );
}
