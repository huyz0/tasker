import { useEffect } from 'react';
import { useLayoutStore } from '../../store/layout';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';

export function ArtifactsBrowser() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  useEffect(() => setActivePageTitle('Artifacts'), [setActivePageTitle]);

  const rawMarkdown = `
# Environment Variables

## Project Alpha (v3.1.2)
Deployment configuration for production environment.

### Database Settings
* \`DB_HOST\`: \`prod-db.tasker.internal\`
* \`DB_PORT\`: \`5432\`
* \`DB_NAME\`: \`tasker_prod\`

### API Configuration
\`\`\`json
{
  "API_URL": "https://api.alpha.tasker.com",
  "TIMEOUT_MS": 5000
}
\`\`\`
  `;

  return (
    <div className="flex h-full gap-6">
      {/* File Tree Left Sidebar */}
      <div className="w-64 flex-shrink-0 flex flex-col bg-card border rounded-lg overflow-hidden shadow-sm">
        <div className="p-3 border-b text-sm font-semibold">
          Artifacts Explorer
        </div>
        <div className="p-2 space-y-1 text-sm overflow-y-auto">
          {/* Mock Tree */}
          <div className="px-2 py-1 hover:bg-muted font-medium cursor-pointer flex items-center gap-2"><span>📂</span> Projects</div>
          <div className="px-2 py-1 pl-6 hover:bg-muted font-medium cursor-pointer flex items-center gap-2"><span>📂</span> Project Alpha</div>
          <div className="px-2 py-1 pl-10 hover:bg-muted cursor-pointer flex items-center gap-2"><span>📂</span> deployments</div>
          <div className="px-2 py-1 pl-14 hover:bg-muted cursor-pointer flex items-center gap-2 bg-muted text-primary font-medium rounded-sm"><span>📄</span> env-vars.md</div>
          <div className="px-2 py-1 pl-14 hover:bg-muted cursor-pointer flex items-center gap-2 text-muted-foreground mr-1"><span>📄</span> setup.sql</div>
          <div className="px-2 py-1 pl-6 hover:bg-muted font-medium cursor-pointer flex items-center gap-2"><span>📂</span> Project Beta</div>
          <div className="px-2 py-1 hover:bg-muted font-medium cursor-pointer flex items-center gap-2"><span>📂</span> Scripts</div>
        </div>
      </div>

      {/* Editor Main Content */}
      <div className="flex-1 flex flex-col bg-card border rounded-lg overflow-hidden shadow-sm">
        <div className="flex bg-muted/30 border-b overflow-x-auto text-sm">
           <div className="px-4 py-2 border-r bg-card border-t border-t-primary cursor-pointer flex items-center gap-2"><span className="text-blue-500 font-bold text-xs">M</span> env-vars.md</div>
           <div className="px-4 py-2 border-r text-muted-foreground cursor-pointer flex items-center gap-2 hover:bg-card">setup.sql</div>
        </div>
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar prose prose-sm dark:prose-invert max-w-none">
           <MarkdownRenderer content={rawMarkdown} />
        </div>
      </div>
    </div>
  );
}
