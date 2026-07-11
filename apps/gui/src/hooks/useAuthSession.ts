import { useQuery } from '@tanstack/react-query';
import { fetchAuthSession } from '../lib/authSession';

export function useAuthSession() {
  const query = useQuery({
    queryKey: ['authSession'],
    queryFn: fetchAuthSession,
    staleTime: 60_000,
  });

  return {
    isLoading: query.isLoading,
    authenticated: query.data?.authenticated ?? false,
    userId: query.data?.userId ?? null,
  };
}
