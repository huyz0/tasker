import { useEffect } from 'react';
import { useScopedTo } from '../hooks/useScope';
import { Link, useLocation } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { useLayoutStore, type LayoutState } from '../store/layout';

/**
 * Catch-all view for URLs the shell has no route for. Without it an unknown
 * path renders an empty content area, which reads as a broken application
 * rather than a wrong address.
 */
export function NotFound() {
  const scopedTo = useScopedTo();
  const setActivePageTitle = useLayoutStore((s: LayoutState) => s.setActivePageTitle);
  const { pathname } = useLocation();
  useEffect(() => setActivePageTitle('Not Found'), [setActivePageTitle]);

  // The same header as every other screen: a centred variant with its own
  // icon made the one page you reach by mistake look like a different app.
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Page not found"
        description={<>Nothing lives at <code className="font-mono text-foreground break-all">{pathname}</code>.</>}
        actions={
          <Link
            to={scopedTo('/')}
            className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
