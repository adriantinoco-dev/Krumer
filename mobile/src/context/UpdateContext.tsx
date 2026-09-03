import React, { createContext, useContext } from 'react';
import { useAppUpdate, type UseAppUpdateReturn } from '../hooks/useAppUpdate';

const UpdateContext = createContext<UseAppUpdateReturn | null>(null);

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const update = useAppUpdate();
  return <UpdateContext.Provider value={update}>{children}</UpdateContext.Provider>;
}

export function useUpdate(): UseAppUpdateReturn {
  const ctx = useContext(UpdateContext);
  if (!ctx) {
    throw new Error('useUpdate must be used within an UpdateProvider');
  }
  return ctx;
}
