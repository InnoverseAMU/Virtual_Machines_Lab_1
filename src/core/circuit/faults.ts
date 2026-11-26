import { deriveTransformerLoadConnectionState } from '../physics/models/transformerLoad';
import type {
  ConnectionState,
  FaultClause,
  FaultPattern,
  NetGraphLike,
} from '../types';

function matchesClause(clause: FaultClause, graph: NetGraphLike): boolean {
  if (clause.connected) {
    for (const [a, b] of clause.connected) {
      if (!graph.areConnected(a, b)) return false;
    }
  }
  if (clause.notConnected) {
    for (const [a, b] of clause.notConnected) {
      if (graph.areConnected(a, b)) return false;
    }
  }
  if (clause.anyConnected && clause.anyConnected.length > 0) {
    const anyHit = clause.anyConnected.some(([a, b]) => graph.areConnected(a, b));
    if (!anyHit) return false;
  }
  return true;
}

export function matchFaultPatterns(
  faultPatterns: FaultPattern[],
  graph: NetGraphLike,
): FaultPattern[] {
  return faultPatterns.filter((pattern) => {
    if (!matchesClause(pattern.match, graph)) return false;
    if (pattern.match.anyGroup && pattern.match.anyGroup.length > 0) {
      return pattern.match.anyGroup.some((group) => matchesClause(group, graph));
    }
    return true;
  });
}

/**
 * Legacy/convenience alias delegating to the transformerLoad model's deriveConnectionState.
 */
export function deriveConnectionState(
  graph: NetGraphLike,
  faults: FaultPattern[],
  supplyOn: boolean,
): ConnectionState {
  return deriveTransformerLoadConnectionState(graph, faults, supplyOn);
}
