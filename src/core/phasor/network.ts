import { UnionFind, type WireInput } from '../circuit/nets';
import type { TerminalId } from '../types';
import { cAbs, cAdd, cSub, cZero, type Complex } from './complex';

export interface PhasorEdge {
  id: string;
  /** Positive-reference terminal: V(a) - V(b) = emf */
  a: TerminalId;
  /** Negative-reference terminal: V(a) - V(b) = emf */
  b: TerminalId;
  emf: Complex;
  label?: string;
}

export interface PhasorLoopFault {
  edgeId: string;
  loopEmf: Complex;
  loopEmfMag: number;
  netA: number;
  netB: number;
}

export interface PhasorNetworkSolution {
  terminalToNet: Map<TerminalId, number>;
  netToComponent: Map<number, number>;
  netPotentials: Map<number, Complex>;
  loopFaults: PhasorLoopFault[];
  hasLoopFault: boolean;
  maxLoopEmfV: number;
}

export interface TerminalVoltageMeasurement {
  connected: boolean;
  phasor: Complex;
  magnitude: number;
}

function extractPair(w: WireInput): [TerminalId, TerminalId] {
  return Array.isArray(w) ? w : [w.a, w.b];
}

/**
 * Pure phasor network solver:
 * - Builds galvanic nets from wires + internal links via Union-Find.
 * - Models windings as complex EMF edges V(a) - V(b) = emf.
 * - Solves node potentials per connected component via BFS spanning tree.
 * - Checks every non-tree edge for KVL loop consistency (nonzero loop EMF = short fault).
 */
export function solvePhasorNetwork(
  terminals: readonly TerminalId[],
  edges: readonly PhasorEdge[],
  wires: readonly WireInput[],
  internalLinks: readonly [TerminalId, TerminalId][] = [],
  loopToleranceV = 1e-2,
): PhasorNetworkSolution {
  const uf = new UnionFind();
  for (const t of terminals) uf.add(t);
  for (const e of edges) {
    uf.add(e.a);
    uf.add(e.b);
  }
  for (const [a, b] of internalLinks) uf.union(a, b);
  for (const w of wires) {
    const [a, b] = extractPair(w);
    if (a !== b) uf.union(a, b);
  }

  // Assign stable deterministic net IDs
  const rootToNet = new Map<string, number>();
  const terminalToNet = new Map<TerminalId, number>();
  const allTerms = new Set<TerminalId>(terminals);
  for (const e of edges) {
    allTerms.add(e.a);
    allTerms.add(e.b);
  }
  for (const w of wires) {
    const [a, b] = extractPair(w);
    allTerms.add(a);
    allTerms.add(b);
  }

  let nextNetId = 0;
  for (const t of Array.from(allTerms).sort()) {
    const root = uf.find(t);
    let netId = rootToNet.get(root);
    if (netId === undefined) {
      netId = nextNetId++;
      rootToNet.set(root, netId);
    }
    terminalToNet.set(t, netId);
  }

  interface AdjItem {
    toNet: number;
    /** Potential delta added when stepping from current net to toNet: V(toNet) = V(cur) + delta */
    delta: Complex;
    edge: PhasorEdge;
  }

  const adj = new Map<number, AdjItem[]>();
  for (let i = 0; i < nextNetId; i++) adj.set(i, []);

  const loopFaults: PhasorLoopFault[] = [];

  for (const edge of edges) {
    const netA = terminalToNet.get(edge.a)!;
    const netB = terminalToNet.get(edge.b)!;
    if (netA === netB) {
      const mag = cAbs(edge.emf);
      if (mag > loopToleranceV) {
        loopFaults.push({
          edgeId: edge.id,
          loopEmf: edge.emf,
          loopEmfMag: mag,
          netA,
          netB,
        });
      }
      continue;
    }

    // V(a) - V(b) = emf => V(b) = V(a) - emf, V(a) = V(b) + emf
    adj.get(netA)!.push({
      toNet: netB,
      delta: { re: -edge.emf.re, im: -edge.emf.im },
      edge,
    });
    adj.get(netB)!.push({
      toNet: netA,
      delta: edge.emf,
      edge,
    });
  }

  const netToComponent = new Map<number, number>();
  const netPotentials = new Map<number, Complex>();
  const visitedEdges = new Set<string>();
  let compId = 0;

  for (let startNet = 0; startNet < nextNetId; startNet++) {
    if (netToComponent.has(startNet)) continue;
    const queue: number[] = [startNet];
    netToComponent.set(startNet, compId);
    netPotentials.set(startNet, cZero);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const curV = netPotentials.get(cur)!;
      for (const item of adj.get(cur) ?? []) {
        if (!netToComponent.has(item.toNet)) {
          visitedEdges.add(item.edge.id);
          netToComponent.set(item.toNet, compId);
          netPotentials.set(item.toNet, cAdd(curV, item.delta));
          queue.push(item.toNet);
        } else if (!visitedEdges.has(item.edge.id)) {
          visitedEdges.add(item.edge.id);
          const expectedToV = cAdd(curV, item.delta);
          const actualToV = netPotentials.get(item.toNet)!;
          const loopErr = cSub(expectedToV, actualToV);
          const errMag = cAbs(loopErr);
          if (errMag > loopToleranceV) {
            loopFaults.push({
              edgeId: item.edge.id,
              loopEmf: loopErr,
              loopEmfMag: errMag,
              netA: cur,
              netB: item.toNet,
            });
          }
        }
      }
    }

    compId += 1;
  }

  const maxLoopEmfV = loopFaults.reduce(
    (max, f) => Math.max(max, f.loopEmfMag),
    0,
  );

  return {
    terminalToNet,
    netToComponent,
    netPotentials,
    loopFaults,
    hasLoopFault: loopFaults.length > 0,
    maxLoopEmfV,
  };
}

/**
 * Measures V(tA) - V(tB) in a solved phasor network.
 * Floating terminals (in different connected components) return 0 V (no deflection).
 */
export function measureTerminalVoltage(
  solution: PhasorNetworkSolution,
  tA: TerminalId,
  tB: TerminalId,
): TerminalVoltageMeasurement {
  const netA = solution.terminalToNet.get(tA);
  const netB = solution.terminalToNet.get(tB);
  if (netA === undefined || netB === undefined) {
    return { connected: false, phasor: cZero, magnitude: 0 };
  }
  const compA = solution.netToComponent.get(netA);
  const compB = solution.netToComponent.get(netB);
  if (compA === undefined || compB === undefined || compA !== compB) {
    return { connected: false, phasor: cZero, magnitude: 0 };
  }
  const vA = solution.netPotentials.get(netA) ?? cZero;
  const vB = solution.netPotentials.get(netB) ?? cZero;
  const diff = cSub(vA, vB);
  return {
    connected: true,
    phasor: diff,
    magnitude: cAbs(diff),
  };
}
