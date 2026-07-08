/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react';
import type { HandleId } from './DiagramNode';

export interface DiagramInteraction {
  onHandleDelete: (nodeId: string, handleId: HandleId) => void;
  readOnly: boolean;
}

const Ctx = createContext<DiagramInteraction | null>(null);

export function DiagramInteractionProvider({ value, children }: { value: DiagramInteraction; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDiagramInteraction(): DiagramInteraction {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return { onHandleDelete: () => {}, readOnly: false };
  }
  return ctx;
}
