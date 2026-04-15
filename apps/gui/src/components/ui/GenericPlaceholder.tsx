import { useEffect } from 'react';
import { useLayoutStore, type LayoutState } from '../../store/layout';

export function GenericPlaceholder({ title, description }: { title: string, description: string }) {
  const setActivePageTitle = useLayoutStore((s: LayoutState) => s.setActivePageTitle);
  useEffect(() => setActivePageTitle(title), [title, setActivePageTitle]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="p-12 border rounded-lg bg-card text-muted-foreground flex items-center justify-center border-dashed">
        <p>{title} module placeholder area.</p>
      </div>
    </div>
  );
}
