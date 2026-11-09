import { useState, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** A fresh network cache per story; local fixture providers may override it. */
export function PreviewProviders({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
