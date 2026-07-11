import React, { createContext, useContext, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../../lib/connectTransport';
import { LabelService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';

const labelClient = createClient(LabelService, transport);

export interface LabelData {
  id: string;
  orgId?: string;
  name: string;
  color?: string;
}

export interface LabelState {
  attached: LabelData[];
  available: LabelData[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export interface LabelActions {
  attachLabel: (labelId: string) => Promise<void>;
  detachLabel: (labelId: string) => Promise<void>;
  createLabel: (name: string, color?: string) => Promise<void>;
}

export interface LabelContextValue {
  state: LabelState;
  actions: LabelActions;
}

const LabelContext = createContext<LabelContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useLabels(): LabelContextValue {
  const context = useContext(LabelContext);
  if (!context) {
    throw new Error('useLabels must be used within a LabelProvider');
  }
  return context;
}

interface LabelProviderProps {
  entityId: string;
  entityType: 'task' | 'artifact';
  orgId: string;
  children: React.ReactNode;
}

export function LabelProvider({ entityId, entityType, orgId, children }: LabelProviderProps) {
  const queryClient = useQueryClient();
  const attachedKey = ['entityLabels', entityType, entityId];
  const availableKey = ['labels', orgId];

  const { data: attached, isLoading: isLoadingAttached } = useQuery({
    queryKey: attachedKey,
    queryFn: async () => {
      const resp = await labelClient.listEntityLabels({ entityId, entityType });
      return resp.labels;
    },
  });

  const { data: available, isLoading: isLoadingAvailable } = useQuery({
    queryKey: availableKey,
    queryFn: async () => {
      if (!orgId) return [];
      const resp = await labelClient.listLabels({ orgId });
      return resp.labels;
    },
    enabled: !!orgId,
  });

  const attachMutation = useMutation({
    mutationFn: async (labelId: string) => {
      await labelClient.attachLabel({ entityId, entityType, labelId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: attachedKey }),
  });

  const detachMutation = useMutation({
    mutationFn: async (labelId: string) => {
      await labelClient.detachLabel({ entityId, entityType, labelId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: attachedKey }),
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) => {
      const resp = await labelClient.createLabel({ orgId, name, color: color ?? '' });
      return resp.label;
    },
    onSuccess: (label) => {
      queryClient.invalidateQueries({ queryKey: availableKey });
      if (label) attachMutation.mutate(label.id);
    },
  });

  const value = useMemo<LabelContextValue>(() => ({
    state: {
      attached: attached ?? [],
      available: available ?? [],
      isLoading: isLoadingAttached || isLoadingAvailable || attachMutation.isPending || detachMutation.isPending || createMutation.isPending,
      isError: attachMutation.isError || detachMutation.isError || createMutation.isError,
      error: (attachMutation.error || detachMutation.error || createMutation.error) as Error | null,
    },
    actions: {
      attachLabel: async (labelId: string) => {
        await attachMutation.mutateAsync(labelId);
      },
      detachLabel: async (labelId: string) => {
        await detachMutation.mutateAsync(labelId);
      },
      createLabel: async (name: string, color?: string) => {
        await createMutation.mutateAsync({ name, color });
      },
    },
  }), [attached, available, isLoadingAttached, isLoadingAvailable, attachMutation, detachMutation, createMutation]);

  return (
    <LabelContext.Provider value={value}>
      {children}
    </LabelContext.Provider>
  );
}
