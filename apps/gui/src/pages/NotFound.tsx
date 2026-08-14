import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useLayoutStore, type LayoutState } from '../store/layout';

/**
 * Catch-all view for URLs the shell has no route for. Without it an unknown
 * path renders an empty content area, which reads as a broken application
 * rather than a wrong address.
 */
export function NotFound() {
  const setActivePageTitle = useLayoutStore((s: LayoutState) => s.setActivePageTitle);
  const { pathname } = useLocation();
  useEffect(() => setActivePageTitle('Not Found'), [setActivePageTitle]);

  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-center py-20">
      <Compass className="w-10 h-10 text-muted-foreground opacity-50" />
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground mt-1">
          Nothing lives at <code className="font-mono text-foreground">{pathname}</code>.
        </p>
      </div>
      <Link
        to="/"
        className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
