import { createContext, useContext } from 'react';
import type { TerminalId } from '../core/types';

export const NetHighlightContext = createContext<Set<TerminalId> | null>(null);

export function useHighlightedNetTerminals(): Set<TerminalId> | null {
  return useContext(NetHighlightContext);
}
